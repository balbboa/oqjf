import { redis } from '../../core/cache/redis.js';
import { logger } from '../../core/logger/logger.js';

const USER_RATE_LIMIT_MAX = 10;
const USER_RATE_LIMIT_WINDOW_SEC = 300; // 5 minutes
const CHECKOUT_COOLDOWN_SEC = 1800;     // 30 minutes

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export class ComplianceService {
  /**
   * Per-user rate limit: max 10 messages per 5-minute window.
   * Uses Redis INCR + EXPIRE. Silent drop on violation (no response to user
   * avoids feedback loops that reward spam behavior).
   */
  async checkUserRateLimit(whatsappId: string): Promise<RateLimitResult> {
    const key = `ratelimit:user:${whatsappId}`;
    const count = await redis.incr(key);

    if (count === 1) {
      // First message in window — set TTL atomically after increment
      await redis.expire(key, USER_RATE_LIMIT_WINDOW_SEC);
    }

    const ttl = await redis.ttl(key);

    if (count > USER_RATE_LIMIT_MAX) {
      logger.warn({ whatsappId, count }, 'Per-user rate limit exceeded');
      return { allowed: false, remaining: 0, retryAfterSeconds: ttl };
    }

    return {
      allowed: true,
      remaining: USER_RATE_LIMIT_MAX - count,
      retryAfterSeconds: 0,
    };
  }

  /**
   * Checkout URL cooldown: prevent sending the checkout URL more than once
   * per 30 minutes per user. Uses SET NX EX — same primitive as idempotency keys.
   * Returns true if the URL may be sent (and sets the cooldown), false if on cooldown.
   */
  async canSendCheckout(userId: string): Promise<boolean> {
    const key = `checkout_sent:${userId}`;
    const result = await redis.set(key, '1', 'EX', CHECKOUT_COOLDOWN_SEC, 'NX');
    return result !== null; // null = key already existed (cooldown active)
  }

  /**
   * Check if user is blocked from receiving outbound messages.
   * Foundation for future anti-abuse blocking (e.g., flagged for TOS violations).
   * Returns true if the user CAN receive messages.
   */
  async checkCanSendToUser(whatsappId: string): Promise<boolean> {
    const key = `outbound_blocked:${whatsappId}`;
    const blocked = await redis.exists(key);
    return blocked === 0;
  }

  /**
   * Record that a message was sent to a user for anti-spam tracking.
   * Daily counter per user; expires after 24h.
   */
  async recordMessageSent(whatsappId: string): Promise<void> {
    const key = `outbound_count:${whatsappId}:${new Date().toISOString().slice(0, 10)}`;
    await redis.incr(key);
    await redis.expire(key, 86400);
  }
}
