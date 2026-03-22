import pino from 'pino';
import { env } from '../config/env.js';

const pinoOptions: pino.LoggerOptions = {
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  // NUNCA logar conteúdo de mensagens (LGPD)
  redact: ['message.content', 'userMessage', '*.content'],
};

if (env.NODE_ENV !== 'production') {
  pinoOptions.transport = { target: 'pino-pretty', options: { colorize: true } };
}

export const logger = pino(pinoOptions);
