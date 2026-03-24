FROM node:20-slim AS base
RUN npm install -g pnpm

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/persona/package.json ./packages/persona/
COPY packages/safety/package.json ./packages/safety/
RUN pnpm install --frozen-lockfile

FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY . .
RUN pnpm --filter api exec prisma generate
RUN pnpm --filter api build

FROM node:20-slim AS runner
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/apps/api/package.json ./apps/api/
RUN ln -s /app/apps/api/dist/packages/safety/src /app/node_modules/safety
RUN ln -s /app/apps/api/dist/packages/persona/src /app/node_modules/persona
EXPOSE 3000
CMD ["node", "apps/api/dist/apps/api/src/server.js"]
