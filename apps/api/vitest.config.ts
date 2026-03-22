import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    env: {
      NODE_ENV: 'test',
      PORT: '3000',
      DATABASE_URL: 'postgresql://test',
      REDIS_URL: 'redis://localhost',
      META_VERIFY_TOKEN: 'tok',
      META_APP_SECRET: 'sec',
      META_ACCESS_TOKEN: 'acc',
      META_PHONE_NUMBER_ID: 'pid',
      GEMINI_API_KEY: 'test-key',
      GEMINI_PRIMARY_MODEL: 'gemini-2.5-flash-lite',
      GEMINI_FALLBACK_MODEL: 'gemini-2.5-flash',
      GEMINI_MAX_OUTPUT_TOKENS: '500',
      GEMINI_TEMPERATURE: '0.85',
      GEMINI_DAILY_BUDGET_USD_CENTS: '500',
      STRIPE_SECRET_KEY: 'sk_test_x',
      STRIPE_WEBHOOK_SECRET: 'whsec_x',
      STRIPE_PRICE_ID: 'price_x',
      CHECKOUT_SUCCESS_URL: 'http://localhost/success',
      CHECKOUT_CANCEL_URL: 'http://localhost/cancel',
      FREE_MESSAGES_LIMIT: '30',
      SAFETY_MODULE_ENABLED: 'true',
      CVV_NUMBER: '188',
      API_URL: 'http://localhost:3000',
    },
  },
});
