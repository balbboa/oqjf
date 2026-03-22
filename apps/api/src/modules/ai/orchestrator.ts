import type { Message } from '@prisma/client';
import { MessageRole } from '@prisma/client';
import { SafetyService } from 'safety';
import { buildSystemPrompt, validatePersonaOutput } from 'persona';
import { callGemini, calculateCostMicroUsd, type GeminiMessage } from './gemini.client.js';
import { logger } from '../../core/logger/logger.js';
import { prisma } from '../../core/db/prisma.js';

const safetyService = new SafetyService();

export interface AIResponse {
  text: string;
  model: string;
  tokens: { input: number; output: number };
  costMicroUsd?: number;
}

const GEMINI_ERROR_FALLBACK =
  '"Não vos deixarei órfãos." (João 14:18)\n' +
  'Neste momento, minhas palavras não conseguem alcançar você como merecem.\n' +
  'Por favor, tente novamente em instantes. 🕊️';

export async function generateResponse(
  userId: string,
  userMessage: string,
  history: Message[],
): Promise<AIResponse> {
  // 1. Safety SEMPRE primeiro — antes do Gemini
  const crisisResult = await safetyService.detectCrisis(userMessage);
  if (crisisResult.level === 'high') {
    await prisma.safetyEvent.create({
      data: { userId, type: 'CRISIS_DETECTED', trigger: '[redacted]', action: 'hardcoded_response' },
    }).catch(() => {});
    return {
      text: safetyService.getHighCrisisResponse(),
      model: 'hardcoded',
      tokens: { input: 0, output: 0 },
    };
  }

  const isInappropriate = await safetyService.detectInappropriateRequest(userMessage);
  if (isInappropriate) {
    await prisma.safetyEvent.create({
      data: { userId, type: 'INAPPROPRIATE_REQUEST', trigger: '[redacted]', action: 'redirected' },
    }).catch(() => {});
    return {
      text: safetyService.getInappropriateRedirect(),
      model: 'hardcoded',
      tokens: { input: 0, output: 0 },
    };
  }

  // 2. Construir system prompt (parte estática antes → cache hits)
  const systemPrompt = buildSystemPrompt([], new Date().toISOString());

  // 3. Converter histórico para formato Gemini
  // CRÍTICO: ASSISTANT → 'model' (não 'assistant' — causa erro 400 na API Gemini)
  // Limitar a 30 mensagens
  const geminiHistory: GeminiMessage[] = history
    .slice(-30)
    .map(msg => ({
      role: msg.role === MessageRole.ASSISTANT ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));

  // 4. Chamar Gemini com fallback
  let response;
  try {
    response = await callGemini(systemPrompt, geminiHistory, userMessage, false);
  } catch (primaryError) {
    logger.warn({ primaryError, userId }, 'Flash-Lite falhou, tentando Flash');
    try {
      response = await callGemini(systemPrompt, geminiHistory, userMessage, true);
    } catch (fallbackError) {
      logger.error({ fallbackError, userId }, 'Ambos modelos Gemini falharam');
      return { text: GEMINI_ERROR_FALLBACK, model: 'hardcoded', tokens: { input: 0, output: 0 } };
    }
  }

  // 5. Tratar bloqueio de safety do Gemini
  if (response.safetyBlocked) {
    await prisma.safetyEvent.create({
      data: { userId, type: 'GEMINI_SAFETY_BLOCK', trigger: '[redacted]', action: 'fallback_response' },
    }).catch(() => {});
    return {
      text: safetyService.getGeminiSafetyBlockResponse(),
      model: response.modelUsed,
      tokens: { input: response.inputTokens, output: 0 },
    };
  }

  // 6. Validar persona (anti-jailbreak pós-geração)
  if (!validatePersonaOutput(response.text)) {
    logger.warn({ userId }, 'Persona break detected, retrying with reinforced prompt');
    await prisma.safetyEvent.create({
      data: { userId, type: 'PERSONA_BREAK_ATTEMPT', trigger: '[redacted]', action: 'retry_reinforced' },
    }).catch(() => {});
    try {
      response = await callGemini(
        systemPrompt + '\n\nIMPORTANTE: Responda EXCLUSIVAMENTE como a presença inspirada nos ensinamentos de Jesus.',
        geminiHistory,
        userMessage,
        false,
      );
    } catch {
      return { text: GEMINI_ERROR_FALLBACK, model: 'hardcoded', tokens: { input: 0, output: 0 } };
    }
  }

  const costMicroUsd = calculateCostMicroUsd(response.inputTokens, response.outputTokens, response.modelUsed);

  return {
    text: response.text,
    model: response.modelUsed,
    tokens: { input: response.inputTokens, output: response.outputTokens },
    costMicroUsd,
  };
}
