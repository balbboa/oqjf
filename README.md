# O Que Jesus Faria? (OQJF)

A WhatsApp chatbot that responds to messages in the voice of Jesus, built with a freemium model. Users get 30 free messages before being prompted to subscribe via Stripe. A keyword-based safety layer detects crisis situations and redirects users to mental health resources (CVV 188) before any AI call is made.

---

## Table of Contents

- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Local Development](#local-development)
- [Environment Variables](#environment-variables)
- [Database](#database)
- [Running Tests](#running-tests)
- [WhatsApp Webhook Setup](#whatsapp-webhook-setup)
- [Stripe Setup](#stripe-setup)
- [Safety Architecture](#safety-architecture)
- [Freemium Logic](#freemium-logic)
- [AI Pipeline](#ai-pipeline)
- [Cost Tracking](#cost-tracking)
- [LGPD Compliance](#lgpd-compliance)
- [Make Commands](#make-commands)

---

## Architecture

```
pnpm monorepo
├── apps/api          — Fastify HTTP server (entry point)
├── packages/safety   — Crisis detection (no LLM, pure keyword matching)
└── packages/persona  — Jesus system prompt + anti-jailbreak validation
```

**Message flow:**

```
WhatsApp → POST /webhook/whatsapp
              │
              ├─ 1. HMAC-SHA256 signature verification
              ├─ 2. 200 OK immediately (Meta requires fast response)
              ├─ 3. Redis idempotency check (24h TTL)
              ├─ 4. Crisis detection (SafetyService) ← runs BEFORE paywall
              ├─ 5. Onboarding / consent check
              ├─ 6. Freemium gate (30 free messages)
              ├─ 7. Fetch conversation history (last 30 messages)
              ├─ 8. Save user message to DB
              ├─ 9. Generate AI response (Gemini Flash-Lite → Flash → fallback)
              ├─ 10. Save AI response + tokens + cost to DB
              └─ 11. Send reply via Meta Cloud API
```

---

## Project Structure

```
oqjf/
├── apps/
│   └── api/
│       ├── prisma/
│       │   ├── migrations/
│       │   ├── schema.prisma
│       │   └── seed.ts
│       ├── src/
│       │   ├── core/
│       │   │   ├── cache/redis.ts          — ioRedis singleton
│       │   │   ├── config/env.ts           — Zod env validation + dotenv loader
│       │   │   ├── db/prisma.ts            — PrismaClient singleton
│       │   │   └── logger/logger.ts        — Pino (LGPD redaction)
│       │   ├── modules/
│       │   │   ├── ai/
│       │   │   │   ├── gemini.client.ts    — @google/genai wrapper + cost calc
│       │   │   │   └── orchestrator.ts     — Safety → Gemini → validation
│       │   │   ├── billing/
│       │   │   │   ├── billing.routes.ts   — /billing/checkout, /webhook/stripe
│       │   │   │   └── billing.service.ts  — Stripe Checkout + webhook idempotency
│       │   │   ├── pipeline/
│       │   │   │   └── message.pipeline.ts — Full end-to-end message processing
│       │   │   ├── users/
│       │   │   │   └── user.service.ts     — Upsert + freemium gate
│       │   │   └── whatsapp/
│       │   │       ├── onboarding.service.ts
│       │   │       ├── sender.service.ts   — Chunked sending + retry
│       │   │       ├── webhook.handler.ts  — HMAC verify + payload extraction
│       │   │       ├── webhook.routes.ts   — GET/POST /webhook/whatsapp
│       │   │       └── whatsapp.types.ts
│       │   ├── app.ts                      — Fastify factory, plugins, routes
│       │   └── server.ts                   — Entry point, graceful shutdown
│       ├── tests/
│       │   ├── integration/                — (placeholder)
│       │   └── unit/
│       │       ├── env.test.ts
│       │       ├── gemini.client.test.ts
│       │       ├── message-gate.test.ts
│       │       ├── onboarding.test.ts
│       │       ├── orchestrator.test.ts
│       │       └── safety.test.ts
│       ├── .env                            — Local secrets (git-ignored)
│       ├── package.json
│       ├── tsconfig.json
│       └── vitest.config.ts
├── packages/
│   ├── persona/
│   │   └── src/
│   │       ├── index.ts
│   │       └── jesus-prompt.ts             — buildSystemPrompt() + validatePersonaOutput()
│   └── safety/
│       └── src/
│           ├── index.ts
│           ├── safety.service.ts           — detectCrisis() + detectInappropriateRequest()
│           └── safety.types.ts
├── infrastructure/
│   └── docker-compose.yml                  — postgres:16, redis:7, adminer
├── .env.example
├── .gitignore
├── Makefile
├── package.json                            — Monorepo root scripts
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20 + TypeScript 5 (strict, module: Node16) |
| Web framework | Fastify 4 |
| Database | PostgreSQL 16 + Prisma 5 |
| Cache / Idempotency | Redis 7 + ioredis |
| AI | Google Gemini API (`@google/genai`) |
| Payments | Stripe |
| Messaging | Meta WhatsApp Cloud API v21.0 |
| Logging | Pino |
| Testing | Vitest |
| Package manager | pnpm (workspaces) |
| Containerization | Docker Compose |

---

## Prerequisites

- Node.js 20+
- pnpm 9+
- Docker + Docker Compose

---

## Local Development

```bash
# 1. Install dependencies
pnpm install

# 2. Start PostgreSQL + Redis
make docker-up

# 3. Copy and fill environment variables
cp .env.example apps/api/.env
# Edit apps/api/.env with real credentials (see Environment Variables below)

# 4. Run database migrations
make migrate
# When prompted for migration name, enter: init

# 5. Start the dev server
make dev
# Server starts at http://localhost:3000

# 6. Verify
curl http://localhost:3000/health
```

**Adminer** (database UI) is available at http://localhost:8080.
- System: PostgreSQL
- Server: postgres
- Username: oqjf
- Password: oqjf
- Database: oqjf

---

## Environment Variables

Copy `.env.example` to `apps/api/.env` and fill in the values.

```bash
# ── App ──────────────────────────────────────────────────────────
NODE_ENV=development
PORT=3000
API_URL=http://localhost:3000          # Public base URL (used in checkout redirects)

# ── Database ─────────────────────────────────────────────────────
DATABASE_URL=postgresql://oqjf:oqjf@localhost:5432/oqjf

# ── Redis ────────────────────────────────────────────────────────
REDIS_URL=redis://localhost:6379

# ── WhatsApp / Meta ──────────────────────────────────────────────
META_VERIFY_TOKEN=                     # Any string — must match what you set at Meta
META_APP_SECRET=                       # App Settings → Basic → App Secret
META_ACCESS_TOKEN=                     # Temporary or permanent access token
META_PHONE_NUMBER_ID=                  # WhatsApp → Phone Numbers → Phone Number ID

# ── Google Gemini ─────────────────────────────────────────────────
GEMINI_API_KEY=                        # console.cloud.google.com — billing must be active
GEMINI_PRIMARY_MODEL=gemini-2.5-flash-lite
GEMINI_FALLBACK_MODEL=gemini-2.5-flash
GEMINI_MAX_OUTPUT_TOKENS=500
GEMINI_TEMPERATURE=0.85
GEMINI_DAILY_BUDGET_USD_CENTS=500      # 5 USD/day soft cap

# ── Stripe ───────────────────────────────────────────────────────
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...        # From Stripe dashboard → Webhooks → Signing secret
STRIPE_PRICE_ID=price_...             # Recurring price ID for the subscription
CHECKOUT_SUCCESS_URL=http://localhost:3000/billing/success
CHECKOUT_CANCEL_URL=https://wa.me/YOUR_NUMBER

# ── Freemium ─────────────────────────────────────────────────────
FREE_MESSAGES_LIMIT=30

# ── Safety ───────────────────────────────────────────────────────
SAFETY_MODULE_ENABLED=true             # MUST be true in production — app won't start if false
CVV_NUMBER=188                         # Brazilian mental health crisis hotline

# ── Alerts (optional) ────────────────────────────────────────────
DISCORD_WEBHOOK_URL=                   # Post alerts to a Discord channel
```

> **Never commit `apps/api/.env`.** It is listed in `.gitignore`.

---

## Database

### Schema overview

| Model | Purpose |
|---|---|
| `User` | WhatsApp user, freemium counters, crisis flag, Stripe customer |
| `Message` | Conversation history with token counts and cost per message |
| `Memory` | Key/value store for user context passed to the AI |
| `Subscription` | Stripe subscription lifecycle |
| `SafetyEvent` | Audit log of all safety interventions |
| `DailyCostSummary` | Aggregated token usage and cost per day |

### Commands

```bash
make migrate       # Run pending migrations (prisma migrate dev)
pnpm db:generate   # Regenerate Prisma client after schema changes
pnpm db:seed       # Seed initial data
```

---

## Running Tests

```bash
make test               # All tests
pnpm test:unit          # Unit tests only
pnpm test:integration   # Integration tests only
```

Tests use Vitest. The unit test suite covers:

- `env.test.ts` — Zod schema validation, production safety guard
- `safety.test.ts` — Crisis keyword detection at all severity levels
- `gemini.client.test.ts` — Gemini API client, cost calculation, safety block handling
- `orchestrator.test.ts` — Full AI pipeline, fallback, persona validation
- `onboarding.test.ts` — First-message consent flow
- `message-gate.test.ts` — Freemium counter, premium bypass, crisis bypass

---

## WhatsApp Webhook Setup

### 1. Expose your local server

```bash
# Option A — serveo.net (no install)
ssh -o StrictHostKeyChecking=no -R 80:localhost:3000 serveo.net

# Option B — localhost.run
ssh -R 80:localhost:3000 localhost.run
```

Copy the public HTTPS URL from the output.

### 2. Verify the webhook challenge works

```bash
curl "https://YOUR_TUNNEL_URL/webhook/whatsapp\
?hub.mode=subscribe\
&hub.verify_token=YOUR_META_VERIFY_TOKEN\
&hub.challenge=test123"
# Expected output: test123
```

### 3. Configure in Meta Developer Console

1. Go to **Meta Developer Console → WhatsApp → Configuration → Webhooks**
2. Click **Edit**
3. Set:
   - **Callback URL**: `https://YOUR_TUNNEL_URL/webhook/whatsapp`
   - **Verify Token**: value of `META_VERIFY_TOKEN` in your `.env`
4. Click **Verify and Save**
5. Click **Manage** next to Webhooks and subscribe to the **`messages`** field

After this, messages sent to your test number will be delivered to your server.

---

## Stripe Setup

### 1. Create a product and price

In the Stripe dashboard, create a recurring subscription product and copy the **Price ID** (`price_...`) into `STRIPE_PRICE_ID`.

### 2. Configure the webhook

1. Go to **Stripe Dashboard → Developers → Webhooks → Add endpoint**
2. URL: `https://YOUR_DOMAIN/webhook/stripe`
3. Events to listen for:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Copy the **Signing secret** (`whsec_...`) into `STRIPE_WEBHOOK_SECRET`

### 3. Local testing with Stripe CLI

```bash
stripe listen --forward-to localhost:3000/webhook/stripe
```

---

## Safety Architecture

The `packages/safety` package is a **pure TypeScript module with zero external dependencies**. It never calls any LLM or external API.

### Crisis detection (`detectCrisis`)

Keyword-based detection with three severity levels:

| Level | Action |
|---|---|
| `high` | Immediate hardcoded CVV 188 response. Gemini is **never called**. User is flagged in DB. |
| `medium` | Support message + CVV reference. Gemini is **never called**. |
| `low` | Empathetic response with professional referral. |
| `none` | Normal flow proceeds. |

**Crisis-flagged users bypass the freemium paywall permanently.** A user in crisis will never see a payment prompt.

### Inappropriate request detection (`detectInappropriateRequest`)

Catches:
- Jailbreak / prompt injection attempts
- Requests for medical, legal, or financial advice
- Requests to break the Jesus persona

### Production guard

The app **refuses to start** if `SAFETY_MODULE_ENABLED=false` in a production environment:

```
Error: SAFETY_MODULE_ENABLED must be true in production
```

---

## Freemium Logic

Users get `FREE_MESSAGES_LIMIT` (default: 30) free messages.

| Condition | Behavior |
|---|---|
| Free messages remaining | Allow. Show warning at message 25. |
| Last free message | Allow. Notify user this is the last one. |
| Limit reached + not premium | Block. Send Stripe Checkout URL. |
| User is premium | Always allow. |
| User has crisis flag | Always allow. Never show paywall. |

---

## AI Pipeline

Located in `apps/api/src/modules/ai/orchestrator.ts`.

```
1. SafetyService.detectCrisis()             → hardcoded response if high/medium
2. SafetyService.detectInappropriateRequest() → redirection response if matched
3. buildSystemPrompt(memories, timestamp)    → persona package
4. Gemini Flash-Lite (primary model)
   └─ If SAFETY finish reason → safetyBlocked response
   └─ If error / fallback needed → Gemini Flash
       └─ If error → hardcoded fallback (John 14:18)
5. validatePersonaOutput(text)              → retry once if jailbreak detected
6. Return response text + tokens + cost
```

**Conversation history**: last 30 messages are sent to Gemini. The `ASSISTANT` role is converted to `model` (Gemini's required format). The system prompt is passed as `systemInstruction`, not as a history entry.

---

## Cost Tracking

Every AI response records:
- `inputTokens` and `outputTokens` on the `Message` row
- `costUsdMicro` (integer, micro-USD — no floating point)
- `DailyCostSummary` is upserted after each response

**Pricing used:**

| Model | Input | Output |
|---|---|---|
| `gemini-2.5-flash-lite` | $0.10 / MTok | $0.40 / MTok |
| `gemini-2.5-flash` | $0.30 / MTok | $2.50 / MTok |

The `GEMINI_DAILY_BUDGET_USD_CENTS` variable is available for a soft spending cap (enforced at application level).

---

## LGPD Compliance

The Pino logger is configured to **redact user message content** from all log output:

```
redact: ['message.content', 'userMessage', '*.content']
```

User messages are stored in the database but never appear in application logs or error traces.

---

## Make Commands

```bash
make install      # pnpm install
make dev          # Start dev server (tsx watch)
make build        # Compile TypeScript
make test         # Run Vitest
make lint         # TypeScript typecheck (tsc --noEmit)
make migrate      # prisma migrate dev
make seed         # prisma db seed
make docker-up    # Start postgres + redis + adminer
make docker-down  # Stop all containers
```
