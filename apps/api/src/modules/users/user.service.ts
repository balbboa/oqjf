import { prisma } from '../../core/db/prisma.js';
import { env } from '../../core/config/env.js';

export interface GateResult {
  allowed: boolean;
  remaining: number;
  isLastFree: boolean;
  shouldWarnApproaching: boolean;
}

export async function upsertUser(params: {
  whatsappId: string;
  whatsappName?: string;
}) {
  return prisma.user.upsert({
    where: { whatsappId: params.whatsappId },
    update: {
      whatsappName: params.whatsappName,
      lastMessageAt: new Date(),
    },
    create: {
      whatsappId: params.whatsappId,
      whatsappName: params.whatsappName,
      freeMessagesLimit: env.FREE_MESSAGES_LIMIT,
    },
  });
}

export async function checkAndConsumeMessage(userId: string): Promise<GateResult> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  // crise: paywall não se aplica — nunca bloquear usuário em crise
  if (user.isPremium || user.crisisFlag) {
    return { allowed: true, remaining: Infinity, isLastFree: false, shouldWarnApproaching: false };
  }

  const { freeMessagesUsed, freeMessagesLimit } = user;

  if (freeMessagesUsed >= freeMessagesLimit) {
    return { allowed: false, remaining: 0, isLastFree: false, shouldWarnApproaching: false };
  }

  // Consumir mensagem
  await prisma.user.update({
    where: { id: userId },
    data: { freeMessagesUsed: { increment: 1 } },
  });

  const remaining = freeMessagesLimit - freeMessagesUsed - 1;
  const isLastFree = remaining === 0;
  // Warn when user hits message 25 (5 remaining of 30 limit = freeMessagesUsed was 24 before increment)
  const shouldWarnApproaching = freeMessagesUsed === freeMessagesLimit - 5;

  return { allowed: true, remaining, isLastFree, shouldWarnApproaching };
}
