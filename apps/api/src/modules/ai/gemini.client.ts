import { env } from '../../core/config/env.js';
import { redis } from '../../core/cache/redis.js';
import { logger } from '../../core/logger/logger.js';

// @google/genai is ESM-only; use dynamic import to avoid CJS interop errors.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _genaiModule: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getModule(): Promise<any> {
  if (!_genaiModule) {
    _genaiModule = await import('@google/genai');
  }
  return _genaiModule;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _genai: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getGenAI(): Promise<any> {
  if (!_genai) {
    const mod = await getModule();
    _genai = new mod.GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  }
  return _genai;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getSafetySettings(): Promise<any[]> {
  const { HarmCategory, HarmBlockThreshold } = await getModule();
  return [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT,        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,       threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE    },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  ];
}

// ── Circuit Breaker (Redis-backed) ────────────────────────────────────────────
// Opens after CB_THRESHOLD consecutive failures. Stays open for CB_OPEN_TTL_SEC
// (2 minutes). When the key expires, the next request proceeds normally — if it
// fails again the counter starts fresh. This is simpler than HALF_OPEN and
// correct for this traffic volume.
const CB_FAILURE_KEY  = 'gemini:cb:failures';
const CB_OPEN_KEY     = 'gemini:cb:open';
const CB_THRESHOLD    = 5;
const CB_OPEN_TTL_SEC = 120; // 2 minutes

async function isCircuitOpen(): Promise<boolean> {
  return (await redis.exists(CB_OPEN_KEY)) === 1;
}

async function recordCircuitSuccess(): Promise<void> {
  await redis.del(CB_FAILURE_KEY);
}

async function recordCircuitFailure(): Promise<void> {
  const failures = await redis.incr(CB_FAILURE_KEY);
  // Counter TTL is 2× the open window so counting survives across the full window
  await redis.expire(CB_FAILURE_KEY, CB_OPEN_TTL_SEC * 2);

  if (failures >= CB_THRESHOLD) {
    await redis.set(CB_OPEN_KEY, '1', 'EX', CB_OPEN_TTL_SEC);
    logger.warn({ failures }, 'Gemini circuit breaker OPENED');
  }
}

export interface GeminiMessage {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
}

export interface GeminiResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
  modelUsed: string;
  finishReason: string;
  safetyBlocked: boolean;
}

export async function callGemini(
  systemPrompt: string,
  history: GeminiMessage[],
  userMessage: string,
  useFallback = false,
): Promise<GeminiResponse> {
  // Circuit breaker check — throws immediately if open; caller falls to hardcoded fallback
  if (await isCircuitOpen()) {
    throw new Error('Gemini circuit breaker is open');
  }

  const modelName = useFallback ? env.GEMINI_FALLBACK_MODEL : env.GEMINI_PRIMARY_MODEL;

  const genai = await getGenAI();
  const safetySettings = await getSafetySettings();

  const chat = genai.chats.create({
    model: modelName,
    config: {
      systemInstruction: systemPrompt, // SEMPRE via systemInstruction — nunca no histórico
      safetySettings,
      maxOutputTokens: env.GEMINI_MAX_OUTPUT_TOKENS,
      temperature: env.GEMINI_TEMPERATURE,
      topP: 0.95,
      topK: 40,
    },
    history,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let response: any;
  try {
    response = await chat.sendMessage({ message: userMessage });
    await recordCircuitSuccess();
  } catch (err) {
    await recordCircuitFailure();
    throw err;
  }

  const finishReason: string = response.candidates?.[0]?.finishReason ?? 'UNKNOWN';
  const safetyBlocked = finishReason === 'SAFETY';

  const inputTokens: number  = response.usageMetadata?.promptTokenCount    ?? 0;
  const outputTokens: number = response.usageMetadata?.candidatesTokenCount ?? 0;

  return {
    text: safetyBlocked ? '' : (response.text ?? ''),
    inputTokens,
    outputTokens,
    modelUsed: modelName,
    finishReason,
    safetyBlocked,
  };
}

// Custo em micro-USD (inteiro — nunca float no banco)
// Flash-Lite: $0.10/MTok input · $0.40/MTok output
// Flash:      $0.30/MTok input · $2.50/MTok output
export function calculateCostMicroUsd(
  inputTokens: number,
  outputTokens: number,
  model: string,
): number {
  const isLite = model.includes('lite');
  const inRate  = isLite ? 0.10 : 0.30;
  const outRate = isLite ? 0.40 : 2.50;
  return Math.round(
    (inputTokens * inRate + outputTokens * outRate) / 1_000_000 * 1_000_000,
  );
}
