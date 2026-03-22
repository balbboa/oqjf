import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { webhookRoutes } from './modules/whatsapp/webhook.routes.js';
import { billingRoutes } from './modules/billing/billing.routes.js';
import { env } from './core/config/env.js';

export async function buildApp() {
  const app = Fastify({
    logger: env.NODE_ENV !== 'test',
  });

  // Capture raw body for HMAC signature verification (Meta + Stripe)
  // Must be set before body parsing
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    try {
      const parsed = JSON.parse(body as string);
      // Attach raw body string to request for signature verification
      (req as unknown as { rawBody: string }).rawBody = body as string;
      done(null, parsed);
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  // Security plugins
  await app.register(cors, { origin: false }); // No CORS — this is a webhook receiver
  await app.register(helmet);

  // Note: @fastify/rate-limit requires Redis store for distributed rate limiting.
  // For MVP, use in-memory rate limiting (no Redis dependency in rate-limit config).
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  // Routes
  await app.register(webhookRoutes);
  await app.register(billingRoutes);

  // Health check
  app.get('/health', async () => ({
    status: 'ok',
    version: process.env['npm_package_version'] ?? '0.1.0',
    uptime: Math.floor(process.uptime()),
  }));

  return app;
}
