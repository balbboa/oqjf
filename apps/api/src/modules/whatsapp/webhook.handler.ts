import { createHmac } from 'crypto';
import { env } from '../../core/config/env.js';
import { logger } from '../../core/logger/logger.js';
import { processMessage } from '../pipeline/message.pipeline.js';
import type { MetaWebhookPayload } from './whatsapp.types.js';

export function verifyMetaSignature(body: string, signature: string): boolean {
  const expected = createHmac('sha256', env.META_APP_SECRET)
    .update(body)
    .digest('hex');
  return `sha256=${expected}` === signature;
}

export async function handleWebhookPayload(payload: MetaWebhookPayload): Promise<void> {
  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      if (change.field !== 'messages') continue;

      const { messages, contacts } = change.value;
      if (!messages || !contacts) continue;

      for (const message of messages) {
        const contact = contacts.find(c => c.wa_id === message.from);
        if (!contact) continue;

        await processMessage(message, contact).catch(err => {
          logger.error({ err, messageId: message.id }, 'Failed to process message');
        });
      }
    }
  }
}
