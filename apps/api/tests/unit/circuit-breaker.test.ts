import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRedis = {
  exists: vi.fn(),
  del: vi.fn(),
  incr: vi.fn(),
  expire: vi.fn(),
  set: vi.fn(),
};

vi.mock('../../src/core/cache/redis.js', () => ({ redis: mockRedis }));
vi.mock('../../src/core/logger/logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe('Gemini circuit breaker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('throws immediately when circuit is open (CB_OPEN_KEY exists)', async () => {
    mockRedis.exists.mockResolvedValueOnce(1); // circuit open
    const { callGemini } = await import('../../src/modules/ai/gemini.client.js');
    await expect(callGemini('sys', [], 'hello', false))
      .rejects.toThrow('Gemini circuit breaker is open');
  });

  it('calls recordCircuitSuccess (deletes failure counter) on successful API call', async () => {
    mockRedis.exists.mockResolvedValueOnce(0); // circuit closed
    mockRedis.del.mockResolvedValue(1);

    // Mock the Gemini module to return a successful response
    vi.doMock('@google/genai', () => ({
      GoogleGenAI: vi.fn().mockImplementation(() => ({
        chats: {
          create: vi.fn().mockReturnValue({
            sendMessage: vi.fn().mockResolvedValue({
              candidates: [{ finishReason: 'STOP' }],
              usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20 },
              text: 'Paz seja com você.',
            }),
          }),
        },
      })),
      HarmCategory: { HARM_CATEGORY_HARASSMENT: 'H', HARM_CATEGORY_HATE_SPEECH: 'H2', HARM_CATEGORY_SEXUALLY_EXPLICIT: 'H3', HARM_CATEGORY_DANGEROUS_CONTENT: 'H4' },
      HarmBlockThreshold: { BLOCK_MEDIUM_AND_ABOVE: 'M', BLOCK_LOW_AND_ABOVE: 'L' },
    }));

    const { callGemini } = await import('../../src/modules/ai/gemini.client.js');
    await callGemini('sys', [], 'hello', false);

    expect(mockRedis.del).toHaveBeenCalledWith('gemini:cb:failures');
  });

  it('increments failure counter and opens circuit after 5 failures', async () => {
    mockRedis.exists.mockResolvedValueOnce(0); // circuit closed
    mockRedis.incr.mockResolvedValueOnce(5);   // this is the 5th failure
    mockRedis.expire.mockResolvedValue(1);
    mockRedis.set.mockResolvedValue('OK');

    vi.doMock('@google/genai', () => ({
      GoogleGenAI: vi.fn().mockImplementation(() => ({
        chats: {
          create: vi.fn().mockReturnValue({
            sendMessage: vi.fn().mockRejectedValue(new Error('API unavailable')),
          }),
        },
      })),
      HarmCategory: { HARM_CATEGORY_HARASSMENT: 'H', HARM_CATEGORY_HATE_SPEECH: 'H2', HARM_CATEGORY_SEXUALLY_EXPLICIT: 'H3', HARM_CATEGORY_DANGEROUS_CONTENT: 'H4' },
      HarmBlockThreshold: { BLOCK_MEDIUM_AND_ABOVE: 'M', BLOCK_LOW_AND_ABOVE: 'L' },
    }));

    const { callGemini } = await import('../../src/modules/ai/gemini.client.js');
    await expect(callGemini('sys', [], 'hello', false)).rejects.toThrow('API unavailable');

    // Circuit should now be opened
    expect(mockRedis.set).toHaveBeenCalledWith('gemini:cb:open', '1', 'EX', 120);
  });

  it('increments failure counter but does NOT open circuit before threshold (< 5)', async () => {
    mockRedis.exists.mockResolvedValueOnce(0); // circuit closed
    mockRedis.incr.mockResolvedValueOnce(3);   // only 3rd failure
    mockRedis.expire.mockResolvedValue(1);

    vi.doMock('@google/genai', () => ({
      GoogleGenAI: vi.fn().mockImplementation(() => ({
        chats: {
          create: vi.fn().mockReturnValue({
            sendMessage: vi.fn().mockRejectedValue(new Error('Transient error')),
          }),
        },
      })),
      HarmCategory: { HARM_CATEGORY_HARASSMENT: 'H', HARM_CATEGORY_HATE_SPEECH: 'H2', HARM_CATEGORY_SEXUALLY_EXPLICIT: 'H3', HARM_CATEGORY_DANGEROUS_CONTENT: 'H4' },
      HarmBlockThreshold: { BLOCK_MEDIUM_AND_ABOVE: 'M', BLOCK_LOW_AND_ABOVE: 'L' },
    }));

    const { callGemini } = await import('../../src/modules/ai/gemini.client.js');
    await expect(callGemini('sys', [], 'hello', false)).rejects.toThrow('Transient error');

    // Circuit should NOT be opened for failures < threshold
    expect(mockRedis.set).not.toHaveBeenCalledWith(
      expect.stringContaining('open'), expect.anything(), expect.anything(), expect.anything(),
    );
  });
});
