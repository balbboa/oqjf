import type { FastifyInstance } from 'fastify';
import { env } from '../../core/config/env.js';
import { verifyMetaSignature, handleWebhookPayload } from './webhook.handler.js';
import type { MetaWebhookPayload } from './whatsapp.types.js';

export async function webhookRoutes(app: FastifyInstance): Promise<void> {
  // GET: Meta webhook verification challenge
  app.get('/webhook/whatsapp', async (req, reply) => {
    const query = req.query as Record<string, string>;
    if (
      query['hub.mode'] === 'subscribe' &&
      query['hub.verify_token'] === env.META_VERIFY_TOKEN
    ) {
      return reply.send(query['hub.challenge']);
    }
    return reply.status(403).send('Forbidden');
  });

  // POST: Receive messages from Meta
  app.post<{ Body: MetaWebhookPayload }>('/webhook/whatsapp', async (req, reply) => {
    // Reply 200 immediately — Meta requires response within 20s
    // Must reply before processing to avoid Meta retrying
    reply.status(200).send('OK');

    // Entry log — LGPD safe (no content), first signal that a request reached the server
    app.log.info({ method: 'POST', path: '/webhook/whatsapp' }, 'Webhook request received');

    // Verify HMAC signature
    const signature = (req.headers['x-hub-signature-256'] as string) ?? '';
    const rawBody = (req as unknown as { rawBody?: string }).rawBody ?? JSON.stringify(req.body);

    if (!verifyMetaSignature(rawBody, signature)) {
      app.log.warn(
        { signaturePresent: !!signature, bodyLength: rawBody.length },
        'Invalid Meta signature — ignoring payload',
      );
      return;
    }

    app.log.info('Webhook signature verified, processing payload');

    // Process asynchronously (webhook already replied 200)
    await handleWebhookPayload(req.body).catch(err => {
      app.log.error(err, 'Unhandled error in webhook payload processing');
    });
  });
}
