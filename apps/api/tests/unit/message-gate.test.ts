import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/core/db/prisma.js', () => ({
  prisma: {
    user: {
      update: vi.fn().mockResolvedValue({}),
      findUniqueOrThrow: vi.fn(),
      upsert: vi.fn().mockResolvedValue({}),
    },
  },
}));

describe('checkAndConsumeMessage', () => {
  it('allows message for premium user regardless of message count', async () => {
    const { prisma } = await import('../../src/core/db/prisma.js');
    vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValueOnce({
      id: 'u1', isPremium: true, crisisFlag: false,
      freeMessagesUsed: 999, freeMessagesLimit: 30,
    } as never);
    const { checkAndConsumeMessage } = await import('../../src/modules/users/user.service.js');
    const result = await checkAndConsumeMessage('u1');
    expect(result.allowed).toBe(true);
  });

  it('always allows messages for user with crisisFlag=true (paywall never applies)', async () => {
    const { prisma } = await import('../../src/core/db/prisma.js');
    vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValueOnce({
      id: 'u1', isPremium: false, crisisFlag: true,
      freeMessagesUsed: 999, freeMessagesLimit: 30,
    } as never);
    const { checkAndConsumeMessage } = await import('../../src/modules/users/user.service.js');
    const result = await checkAndConsumeMessage('u1');
    // crise: paywall não se aplica — critical safety requirement
    expect(result.allowed).toBe(true);
  });

  it('blocks when free limit is reached', async () => {
    const { prisma } = await import('../../src/core/db/prisma.js');
    vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValueOnce({
      id: 'u1', isPremium: false, crisisFlag: false,
      freeMessagesUsed: 30, freeMessagesLimit: 30,
    } as never);
    const { checkAndConsumeMessage } = await import('../../src/modules/users/user.service.js');
    const result = await checkAndConsumeMessage('u1');
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('marks isLastFree on penultimate free message (msg 30 of 30 limit)', async () => {
    const { prisma } = await import('../../src/core/db/prisma.js');
    vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValueOnce({
      id: 'u1', isPremium: false, crisisFlag: false,
      freeMessagesUsed: 29, freeMessagesLimit: 30,
    } as never);
    const { checkAndConsumeMessage } = await import('../../src/modules/users/user.service.js');
    const result = await checkAndConsumeMessage('u1');
    expect(result.isLastFree).toBe(true);
    expect(result.allowed).toBe(true);
  });

  it('sets shouldWarnApproaching when 5 messages remain', async () => {
    const { prisma } = await import('../../src/core/db/prisma.js');
    vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValueOnce({
      id: 'u1', isPremium: false, crisisFlag: false,
      freeMessagesUsed: 25, freeMessagesLimit: 30,
    } as never);
    const { checkAndConsumeMessage } = await import('../../src/modules/users/user.service.js');
    const result = await checkAndConsumeMessage('u1');
    expect(result.shouldWarnApproaching).toBe(true);
    expect(result.allowed).toBe(true);
  });
});
