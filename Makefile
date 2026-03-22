.PHONY: dev build test lint migrate seed docker-up docker-down install

dev:
	fuser -k 3000/tcp || true
	pnpm dev

build:
	pnpm build

test:
	pnpm test

lint:
	pnpm typecheck

migrate:
	pnpm db:migrate

seed:
	pnpm db:seed

docker-up:
	docker compose -f infrastructure/docker-compose.yml up -d

docker-down:
	docker compose -f infrastructure/docker-compose.yml down

install:
	pnpm install
