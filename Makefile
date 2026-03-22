.PHONY: dev build test lint migrate seed docker-up docker-down install tunnel tunnel-alt

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

tunnel:
	ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=30 -o ServerAliveCountMax=3 \
	    -R 80:localhost:3000 serveo.net

tunnel-alt:
	ssh -o StrictHostKeyChecking=no -R 80:localhost:3000 localhost.run
