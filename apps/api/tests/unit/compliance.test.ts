import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRedis = {
  incr: vi.fn(),
  expire: vi.fn(),
  ttl: vi.fn().mockResolvedValue(299),
  set: vi.fn(),
  exists: vi.fn(),
};

vi.mock('../../src/core/cache/redis.js', () => ({ redis: mockRedis }));
vi.mock('../../src/core/logger/logger.js', () => ({ logger: { warn: vi.fn() } }));

describe('ComplianceService', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('checkUserRateLimit', () => {
    it('allows message when under limit', async () => {
      mockRedis.incr.mockResolvedValueOnce(1);
      const { ComplianceService } = await import('../../src/modules/compliance/compliance.service.js');
      const svc = new ComplianceService();
      const result = await svc.checkUserRateLimit('+5511999999999');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9); // 10 max - 1 used
    });

    it('allows message at exactly the limit', async () => {
      mockRedis.incr.mockResolvedValueOnce(10);
      const { ComplianceService } = await import('../../src/modules/compliance/compliance.service.js');
      const svc = new ComplianceService();
      const result = await svc.checkUserRateLimit('+5511999999999');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(0);
    });

    it('blocks when count exceeds USER_RATE_LIMIT_MAX', async () => {
      mockRedis.incr.mockResolvedValueOnce(11);
      const { ComplianceService } = await import('../../src/modules/compliance/compliance.service.js');
      const svc = new ComplianceService();
      const result = await svc.checkUserRateLimit('+5511999999999');
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfterSeconds).toBe(299);
    });

    it('sets TTL only on the first message in window (count === 1)', async () => {
      mockRedis.incr.mockResolvedValueOnce(1);
      const { ComplianceService } = await import('../../src/modules/compliance/compliance.service.js');
      const svc = new ComplianceService();
      await svc.checkUserRateLimit('+5511999999999');
      expect(mockRedis.expire).toHaveBeenCalledWith('ratelimit:user:+5511999999999', 300);
    });

    it('does NOT set TTL on subsequent messages', async () => {
      mockRedis.incr.mockResolvedValueOnce(5);
      const { ComplianceService } = await import('../../src/modules/compliance/compliance.service.js');
      const svc = new ComplianceService();
      await svc.checkUserRateLimit('+5511999999999');
      expect(mockRedis.expire).not.toHaveBeenCalled();
    });
  });

  describe('canSendCheckout', () => {
    it('returns true on first call (key did not exist)', async () => {
      mockRedis.set.mockResolvedValueOnce('OK');
      const { ComplianceService } = await import('../../src/modules/compliance/compliance.service.js');
      const svc = new ComplianceService();
      expect(await svc.canSendCheckout('user-123')).toBe(true);
    });

    it('returns false when key already set (cooldown active)', async () => {
      mockRedis.set.mockResolvedValueOnce(null); // NX failed — key exists
      const { ComplianceService } = await import('../../src/modules/compliance/compliance.service.js');
      const svc = new ComplianceService();
      expect(await svc.canSendCheckout('user-123')).toBe(false);
    });

    it('uses SET NX EX with 30-minute TTL', async () => {
      mockRedis.set.mockResolvedValueOnce('OK');
      const { ComplianceService } = await import('../../src/modules/compliance/compliance.service.js');
      const svc = new ComplianceService();
      await svc.canSendCheckout('user-abc');
      expect(mockRedis.set).toHaveBeenCalledWith('checkout_sent:user-abc', '1', 'EX', 1800, 'NX');
    });
  });

  describe('checkCanSendToUser', () => {
    it('returns true when user is not blocked', async () => {
      mockRedis.exists.mockResolvedValueOnce(0);
      const { ComplianceService } = await import('../../src/modules/compliance/compliance.service.js');
      const svc = new ComplianceService();
      expect(await svc.checkCanSendToUser('+5511999999999')).toBe(true);
    });

    it('returns false when user is blocked', async () => {
      mockRedis.exists.mockResolvedValueOnce(1);
      const { ComplianceService } = await import('../../src/modules/compliance/compliance.service.js');
      const svc = new ComplianceService();
      expect(await svc.checkCanSendToUser('+5511999999999')).toBe(false);
    });
  });
});
