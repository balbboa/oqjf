import { prisma } from '../../core/db/prisma.js';
import { redis } from '../../core/cache/redis.js';
import { logger } from '../../core/logger/logger.js';
import { upsertUser, checkAndConsumeMessage } from '../users/user.service.js';
import { OnboardingService } from '../whatsapp/onboarding.service.js';
import { generateResponse } from '../ai/orchestrator.js';
import { sendText, sendTypingIndicator, markAsRead } from '../whatsapp/sender.service.js';
import { env } from '../../core/config/env.js';
import type { MetaMessage, MetaContact } from '../whatsapp/whatsapp.types.js';
import { SafetyService } from 'safety';

const onboarding = new OnboardingService();
const safetyService = new SafetyService();

export async function processMessage(
  message: MetaMessage,
  contact: MetaContact,
): Promise<void> {
  const whatsappId = message.from;
  const whatsappMessageId = message.id;

  // 1. Idempotência — Redis NX TTL 24h (Meta reenvia mensagens em caso de timeout)
  const alreadyProcessed = await redis.set(
    `msg:${whatsappMessageId}`,
    '1',
    'EX', 86400,
    'NX',
  );
  if (!alreadyProcessed) {
    logger.info({ whatsappMessageId }, 'Duplicate message, skipping');
    return;
  }

  // 2. Apenas mensagens de texto (MVP)
  if (message.type !== 'text' || !message.text?.body) {
    await sendText(
      whatsappId,
      'Neste momento, só consigo receber palavras escritas. Mas estou aqui para ouvi-lo(a). 🕊️',
    ).catch(() => {});
    return;
  }

  const userMessage = message.text.body.trim();

  // SAFETY FIRST — check before onboarding and paywall gates
  // A user in crisis must never receive a checkout URL
  const crisisCheck = await safetyService.detectCrisis(userMessage);
  if (crisisCheck.level === 'high') {
    await sendText(whatsappId, safetyService.getHighCrisisResponse());
    return;
  }

  // 3. Upsert user
  const user = await upsertUser({
    whatsappId,
    whatsappName: contact.profile.name,
  });

  // 4. Mark as read + typing indicator (best effort)
  await markAsRead(whatsappMessageId).catch(() => {});
  await sendTypingIndicator(whatsappId).catch(() => {});

  // 5. Onboarding obrigatório — DISCLAIMER antes de qualquer conversa
  if (!user.onboardingCompleted) {
    const isFirstMessage = user.freeMessagesUsed === 0 && !user.lastMessageAt;
    if (!onboarding.isConsent(userMessage)) {
      await sendText(
        whatsappId,
        isFirstMessage
          ? onboarding.getWelcomeMessage()
          : onboarding.getNonConsentResponse(),
      );
    } else {
      // Consentimento dado — marcar onboarding completo
      await prisma.user.update({
        where: { id: user.id },
        data: { onboardingCompleted: true },
      });
      await sendText(whatsappId, onboarding.getPostConsentGreeting());
    }
    return;
  }

  // 6. Gate de mensagens (freemium) — NUNCA bloquear usuário em crise
  const gate = await checkAndConsumeMessage(user.id);

  if (!gate.allowed) {
    const checkoutUrl = `${env.API_URL}/billing/checkout?userId=${user.id}`;
    await sendText(
      whatsappId,
      'Para continuarmos nossa jornada juntos, há um pequeno custo que torna este serviço possível.\n' +
      '_"O operário é digno do seu salário."_ (Lucas 10:7)\n\n' +
      `Acesse aqui para continuar: ${checkoutUrl} 🙏`,
    );
    return;
  }

  // 7. Buscar histórico (últimas 30 msgs para contexto) — antes de salvar a mensagem atual
  // para evitar que a mensagem do usuário seja enviada duas vezes ao Gemini
  const history = await prisma.message.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'asc' },
    take: 30,
  });

  // 7b. Salvar mensagem do usuário (conteúdo salvo apenas em DB — NUNCA logado)
  await prisma.message.create({
    data: {
      userId: user.id,
      role: 'USER',
      content: userMessage,
      whatsappId: whatsappMessageId,
    },
  });

  // 9. Gerar resposta via Gemini (orquestrador com safety-first + fallback)
  const aiResponse = await generateResponse(user.id, userMessage, history);

  // 10. Salvar resposta da IA + atualizar DailyCostSummary
  await Promise.all([
    prisma.message.create({
      data: {
        userId: user.id,
        role: 'ASSISTANT',
        content: aiResponse.text,
        inputTokens: aiResponse.tokens.input,
        outputTokens: aiResponse.tokens.output,
        costUsdMicro: aiResponse.costMicroUsd ?? 0,
        modelUsed: aiResponse.model,
      },
    }),
    aiResponse.costMicroUsd
      ? updateDailyCost(aiResponse.tokens.input, aiResponse.tokens.output, aiResponse.costMicroUsd)
      : Promise.resolve(),
  ]);

  // 11. Mensagens contextuais do gate (aviso de aproximação ou última free)
  let suffix = '';
  if (gate.isLastFree) {
    const checkoutUrl = `${env.API_URL}/billing/checkout?userId=${user.id}`;
    suffix = `\n\n_Esta foi sua última mensagem gratuita. Para continuarmos: ${checkoutUrl}_`;
  } else if (gate.shouldWarnApproaching) {
    suffix =
      '\n\n_Tenho apreciado nossa jornada juntos. Estamos chegando a um momento especial em breve._';
  }

  // 12. Enviar resposta ao usuário
  await sendText(whatsappId, aiResponse.text + suffix);

  logger.info({
    userId: user.id,
    model: aiResponse.model,
    inputTokens: aiResponse.tokens.input,
    outputTokens: aiResponse.tokens.output,
    costMicroUsd: aiResponse.costMicroUsd,
    // NEVER log userMessage or aiResponse.text content (LGPD)
  }, 'Message processed successfully');
}

async function updateDailyCost(
  inputTokens: number,
  outputTokens: number,
  costMicroUsd: number,
): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  await prisma.dailyCostSummary.upsert({
    where: { date: today },
    create: {
      date: today,
      inputTokens: BigInt(inputTokens),
      outputTokens: BigInt(outputTokens),
      totalRequests: 1,
      costUsdMicro: BigInt(costMicroUsd),
    },
    update: {
      inputTokens: { increment: BigInt(inputTokens) },
      outputTokens: { increment: BigInt(outputTokens) },
      totalRequests: { increment: 1 },
      costUsdMicro: { increment: BigInt(costMicroUsd) },
    },
  });
}
