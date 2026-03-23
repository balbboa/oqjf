import { env } from '../../core/config/env.js';
import { logger } from '../../core/logger/logger.js';

const BASE_URL = `https://graph.facebook.com/v21.0/${env.META_PHONE_NUMBER_ID}`;
const HEADERS = {
  'Authorization': `Bearer ${env.META_ACCESS_TOKEN}`,
  'Content-Type': 'application/json',
};

async function metaPost(endpoint: string, body: unknown, attempt = 1): Promise<void> {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const error = await res.text();

    // 401 = token expired or revoked — retrying won't fix it, fail fast
    if (res.status === 401) {
      logger.error(
        { status: 401 },
        'Meta API authentication failed — META_ACCESS_TOKEN is expired or invalid. ' +
        'Generate a new token at Meta Developer Console → WhatsApp → API Setup.',
      );
      throw new Error('Meta API 401: token expired or invalid');
    }

    if (attempt < 3) {
      await new Promise(r => setTimeout(r, attempt * 1000));
      return metaPost(endpoint, body, attempt + 1);
    }
    logger.error({ status: res.status, error }, 'Meta API error after retries');
    throw new Error(`Meta API error ${res.status}: ${error}`);
  }

  const responseText = await res.text();
  logger.info({ status: res.status, response: responseText }, 'Meta API success');
}

export async function markAsRead(messageId: string): Promise<void> {
  await metaPost('/messages', {
    messaging_product: 'whatsapp',
    status: 'read',
    message_id: messageId,
  });
}

export async function sendTypingIndicator(_to: string): Promise<void> {
  // WhatsApp Cloud API has no native typing indicator endpoint.
  // markAsRead is already called separately with the correct message ID.
}

// Meta webhook delivers Brazilian mobile numbers in 12-digit format (55 + DDD + 8 digits).
// The actual registered WhatsApp uses 13-digit format (55 + DDD + 9 + 8 digits).
// Expand before sending so the reply reaches the correct number.
function expandBrPhone(to: string): string {
  if (/^55\d{2}9\d{7}$/.test(to)) {
    return to.slice(0, 4) + '9' + to.slice(4);
  }
  return to;
}

export async function sendText(to: string, text: string): Promise<void> {
  const expandedTo = expandBrPhone(to);
  // Chunking: if text > 1000 chars, split into paragraphs with natural delay
  if (text.length <= 1000) {
    await metaPost('/messages', {
      messaging_product: 'whatsapp',
      to: expandedTo,
      type: 'text',
      text: { body: text },
    });
    return;
  }

  const chunks = splitIntoChunks(text, 900);
  for (let i = 0; i < chunks.length; i++) {
    await metaPost('/messages', {
      messaging_product: 'whatsapp',
      to: expandedTo,
      type: 'text',
      text: { body: chunks[i] },
    });
    if (i < chunks.length - 1) {
      // Natural delay between chunks (1-3s)
      await new Promise(r => setTimeout(r, 1000 + Math.random() * 2000));
    }
  }
}

function splitIntoChunks(text: string, maxLen: number): string[] {
  const chunks: string[] = [];
  const paragraphs = text.split('\n\n');
  let current = '';

  for (const p of paragraphs) {
    if ((current + '\n\n' + p).length > maxLen && current) {
      chunks.push(current.trim());
      current = p;
    } else {
      current = current ? current + '\n\n' + p : p;
    }
  }

  if (current) chunks.push(current.trim());
  return chunks.filter(c => c.length > 0);
}
