import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from '@google/genai';
import { env } from '../../core/config/env.js';

// Singleton — instanciar UMA VEZ
const genai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT,        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,       threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE    },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];

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
  const modelName = useFallback ? env.GEMINI_FALLBACK_MODEL : env.GEMINI_PRIMARY_MODEL;

  const model = genai.getGenerativeModel({
    model: modelName,
    systemInstruction: systemPrompt, // SEMPRE via systemInstruction — nunca no histórico
    safetySettings: SAFETY_SETTINGS,
    generationConfig: {
      maxOutputTokens: env.GEMINI_MAX_OUTPUT_TOKENS,
      temperature: env.GEMINI_TEMPERATURE,
      topP: 0.95,
      topK: 40,
    },
  });

  const chat = model.startChat({ history });
  const result = await chat.sendMessage(userMessage);
  const response = result.response;

  const finishReason = response.candidates?.[0]?.finishReason ?? 'UNKNOWN';
  const safetyBlocked = finishReason === 'SAFETY';

  const inputTokens  = response.usageMetadata?.promptTokenCount    ?? 0;
  const outputTokens = response.usageMetadata?.candidatesTokenCount ?? 0;

  return {
    text: safetyBlocked ? '' : response.text(),
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
