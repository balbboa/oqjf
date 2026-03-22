import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessageRole } from '@prisma/client';

// Mocks — must be before any imports of the module under test
vi.mock('../../src/modules/ai/gemini.client.js', () => ({
  callGemini: vi.fn().mockResolvedValue({
    text: 'Paz a você!',
    inputTokens: 1000,
    outputTokens: 50,
    modelUsed: 'gemini-2.5-flash-lite',
    finishReason: 'STOP',
    safetyBlocked: false,
  }),
  calculateCostMicroUsd: vi.fn().mockReturnValue(200),
}));

vi.mock('persona', () => ({
  buildSystemPrompt: vi.fn().mockReturnValue('system prompt'),
  validatePersonaOutput: vi.fn().mockReturnValue(true),
}));

vi.mock('../../src/core/db/prisma.js', () => ({
  prisma: {
    safetyEvent: {
      create: vi.fn().mockResolvedValue({}),
    },
  },
}));

vi.mock('../../src/core/logger/logger.js', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('safety', () => ({
  SafetyService: vi.fn().mockImplementation(() => ({
    detectCrisis: vi.fn().mockResolvedValue({ isCrisis: false, level: 'none', keywords: [] }),
    detectInappropriateRequest: vi.fn().mockResolvedValue(false),
    getHighCrisisResponse: vi.fn().mockReturnValue('HARDCODED CVV 188 RESPONSE'),
    getGeminiSafetyBlockResponse: vi.fn().mockReturnValue('Tente reformular sua mensagem. 🕊️'),
    getInappropriateRedirect: vi.fn().mockReturnValue('Busque um profissional especializado.'),
  })),
}));

describe('generateResponse', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns hardcoded CVV response for HIGH crisis — never calls Gemini', async () => {
    const { SafetyService } = await import('safety');
    // Override the detectCrisis mock for this test
    const mockSafetyInstance = {
      detectCrisis: vi.fn().mockResolvedValue({ isCrisis: true, level: 'high', keywords: ['me matar'] }),
      detectInappropriateRequest: vi.fn().mockResolvedValue(false),
      getHighCrisisResponse: vi.fn().mockReturnValue('Preciso pausar... CVV: 188 ...💙'),
      getGeminiSafetyBlockResponse: vi.fn(),
      getInappropriateRedirect: vi.fn(),
    };
    vi.mocked(SafetyService).mockImplementationOnce(() => mockSafetyInstance as never);
    vi.resetModules();

    const { callGemini } = await import('../../src/modules/ai/gemini.client.js');
    const { generateResponse } = await import('../../src/modules/ai/orchestrator.js');

    const result = await generateResponse('user1', 'vou me matar', []);
    expect(result.text).toContain('CVV');
    expect(result.text).toContain('188');
    // Gemini must NOT have been called
    expect(callGemini).not.toHaveBeenCalled();
    expect(result.model).toBe('hardcoded');
  });

  it('converts ASSISTANT role to model for Gemini history', async () => {
    const { callGemini } = await import('../../src/modules/ai/gemini.client.js');
    const { generateResponse } = await import('../../src/modules/ai/orchestrator.js');

    const history = [
      { role: MessageRole.USER, content: 'oi', id: '1', userId: 'u1', whatsappId: null,
        inputTokens: null, outputTokens: null, costUsdMicro: null, modelUsed: null,
        isCrisis: false, createdAt: new Date() },
      { role: MessageRole.ASSISTANT, content: 'Paz!', id: '2', userId: 'u1', whatsappId: null,
        inputTokens: null, outputTokens: null, costUsdMicro: null, modelUsed: null,
        isCrisis: false, createdAt: new Date() },
    ];

    await generateResponse('user1', 'como você está?', history);

    const callArgs = vi.mocked(callGemini).mock.calls[0];
    const geminiHistory = callArgs?.[1] ?? [];
    const assistantMsg = geminiHistory.find((m: { parts: Array<{ text: string }> }) => m.parts[0]?.text === 'Paz!');
    expect(assistantMsg?.role).toBe('model'); // NUNCA 'assistant'
  });

  it('handles Gemini safety block gracefully without exposing SAFETY', async () => {
    const { callGemini } = await import('../../src/modules/ai/gemini.client.js');
    vi.mocked(callGemini).mockResolvedValueOnce({
      text: '', inputTokens: 100, outputTokens: 0,
      modelUsed: 'gemini-2.5-flash-lite', finishReason: 'SAFETY', safetyBlocked: true,
    });
    const { generateResponse } = await import('../../src/modules/ai/orchestrator.js');
    const result = await generateResponse('user1', 'msg', []);
    expect(result.text).not.toContain('SAFETY');
    expect(result.text).not.toContain('blocked');
  });

  it('returns text and cost metadata on success', async () => {
    const { generateResponse } = await import('../../src/modules/ai/orchestrator.js');
    const result = await generateResponse('user1', 'oi', []);
    expect(result.text).toBe('Paz a você!');
    expect(result.tokens.input).toBe(1000);
    expect(result.tokens.output).toBe(50);
    expect(result.costMicroUsd).toBe(200);
  });
});
