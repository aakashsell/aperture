# Aperture — make it easy to build, test, and deploy

.PHONY: all build dev test migrate migrate-down clean

# ─── Compose ─────────────────────────────────────────────
COMPOSE_DEV = docker compose -f docker/docker-compose.yml -f docker/docker-compose.override.yml
COMPOSE_PROD = docker compose -f docker/docker-compose.yml

all: build

build:
	$(COMPOSE_DEV) build

dev:
	$(COMPOSE_DEV) up --build

dev-detached:
	$(COMPOSE_DEV) up --build -d

logs:
	$(COMPOSE_DEV) logs -f

stop:
	$(COMPOSE_DEV) down

# ─── Database ────────────────────────────────────────────
migrate:
	$(COMPOSE_DEV) run --rm migrate

migrate-down:
	$(COMPOSE_DEV) run --rm migrate down

seed:
	$(COMPOSE_DEV) run --rm api ./scripts/seed.sh

# ─── Testing ─────────────────────────────────────────────
test:
	go test ./services/api/...

test-worker:
	cd services/worker && python -m pytest

test-sdk:
	cd sdks/ts && npm test

test-integration:
	$(COMPOSE_DEV) -f docker/docker-compose.test.yml up --abort-on-container-exit

# ─── Code quality ────────────────────────────────────────
lint-api:
	cd services/api && go vet ./...

fmt-api:
	cd services/api && gofmt -w .

# ─── Single-service rebuilds (zero-downtime friendly) ────
rebuild-api:
	$(COMPOSE_DEV) up --build -d api

rebuild-worker:
	$(COMPOSE_DEV) up --build -d worker

rebuild-web:
	$(COMPOSE_DEV) up --build -d web

# ─── Clean ───────────────────────────────────────────────
clean:
	$(COMPOSE_DEV) down -v
	docker system prune -f
