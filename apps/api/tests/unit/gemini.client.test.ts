import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSendMessage = vi.fn().mockResolvedValue({
  candidates: [{ finishReason: 'STOP' }],
  text: 'Paz a você, meu irmão.',
  usageMetadata: {
    promptTokenCount: 1200,
    candidatesTokenCount: 80,
  },
});

const mockCreateChat = vi.fn().mockReturnValue({ sendMessage: mockSendMessage });

// Mock @google/genai BEFORE imports
vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    chats: { create: mockCreateChat },
  })),
  HarmCategory: {
    HARM_CATEGORY_HARASSMENT: 'HARM_CATEGORY_HARASSMENT',
    HARM_CATEGORY_HATE_SPEECH: 'HARM_CATEGORY_HATE_SPEECH',
    HARM_CATEGORY_SEXUALLY_EXPLICIT: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
    HARM_CATEGORY_DANGEROUS_CONTENT: 'HARM_CATEGORY_DANGEROUS_CONTENT',
  },
  HarmBlockThreshold: {
    BLOCK_MEDIUM_AND_ABOVE: 'BLOCK_MEDIUM_AND_ABOVE',
    BLOCK_LOW_AND_ABOVE: 'BLOCK_LOW_AND_ABOVE',
  },
}));

describe('callGemini', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns text, tokens and modelUsed', async () => {
    const { callGemini } = await import('../../src/modules/ai/gemini.client.js');
    const result = await callGemini('system prompt', [], 'oi Jesus', false);
    expect(result.text).toBe('Paz a você, meu irmão.');
    expect(result.inputTokens).toBe(1200);
    expect(result.outputTokens).toBe(80);
    expect(result.safetyBlocked).toBe(false);
  });

  it('uses fallback model when useFallback=true', async () => {
    const { callGemini } = await import('../../src/modules/ai/gemini.client.js');
    const result = await callGemini('system prompt', [], 'oi', true);
    expect(result.modelUsed).toContain('flash');
  });

  it('detects safety block when finishReason is SAFETY', async () => {
    mockSendMessage.mockResolvedValueOnce({
      candidates: [{ finishReason: 'SAFETY' }],
      text: undefined,
      usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 0 },
    });
    const { callGemini } = await import('../../src/modules/ai/gemini.client.js');
    const result = await callGemini('system', [], 'msg', false);
    expect(result.safetyBlocked).toBe(true);
    expect(result.text).toBe('');
  });
});

describe('calculateCostMicroUsd', () => {
  it('calculates cost for Flash-Lite (no float errors)', async () => {
    const { calculateCostMicroUsd } = await import('../../src/modules/ai/gemini.client.js');
    // 1M input tokens @ $0.10/MTok = $0.10 = 100_000 micro-USD
    const cost = calculateCostMicroUsd(1_000_000, 0, 'gemini-2.5-flash-lite');
    expect(cost).toBe(100_000);
  });

  it('calculates cost for Flash output', async () => {
    const { calculateCostMicroUsd } = await import('../../src/modules/ai/gemini.client.js');
    // 1M output tokens @ $2.50/MTok = $2.50 = 2_500_000 micro-USD
    const cost = calculateCostMicroUsd(0, 1_000_000, 'gemini-2.5-flash');
    expect(cost).toBe(2_500_000);
  });
});
