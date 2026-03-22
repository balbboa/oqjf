import { config } from 'dotenv';
import { resolve } from 'path';
import { z } from 'zod';

// Load .env relative to the package root (apps/api/).
// Works in both CJS (tsx) and native ESM contexts.
config({ path: resolve(process.cwd(), '.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  API_URL: z.string().url(),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  META_VERIFY_TOKEN: z.string().min(1),
  META_APP_SECRET: z.string().min(1),
  META_ACCESS_TOKEN: z.string().min(1),
  META_PHONE_NUMBER_ID: z.string().min(1),

  GEMINI_API_KEY: z.string().min(1),
  GEMINI_PRIMARY_MODEL: z.string().default('gemini-2.5-flash-lite'),
  GEMINI_FALLBACK_MODEL: z.string().default('gemini-2.5-flash'),
  GEMINI_MAX_OUTPUT_TOKENS: z.coerce.number().default(500),
  GEMINI_TEMPERATURE: z.coerce.number().default(0.85),
  GEMINI_DAILY_BUDGET_USD_CENTS: z.coerce.number().default(500),

  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),
  STRIPE_PRICE_ID: z.string().min(1),
  CHECKOUT_SUCCESS_URL: z.string().url(),
  CHECKOUT_CANCEL_URL: z.string().min(1),

  FREE_MESSAGES_LIMIT: z.coerce.number().default(30),
  CONSENT_VERSION: z.string().default('1.0'),

  SAFETY_MODULE_ENABLED: z.enum(['true', 'false']).default('true').transform(v => v === 'true'),
  CVV_NUMBER: z.string().default('188'),

  DISCORD_WEBHOOK_URL: z.string().url().optional().or(z.literal('')),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(raw: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid environment variables:\n${result.error.toString()}`);
  }
  const env = result.data;
  // Garantir SafetyService ativo em produção
  if (env.NODE_ENV === 'production' && !env.SAFETY_MODULE_ENABLED) {
    throw new Error('SAFETY_MODULE_ENABLED must be true in production');
  }
  return env;
}

export const env = parseEnv(process.env as Record<string, string | undefined>);
