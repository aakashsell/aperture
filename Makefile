# Aperture — make it easy to build, test, and deploy

.PHONY: all build dev dev-detached logs stop test test-integration test-api lint-api fmt-api clean rebuild-api rebuild-worker rebuild-web

# ─── Compose ─────────────────────────────────────────────
COMPOSE_DEV = docker compose -f docker/docker-compose.yml -f docker/docker-compose.override.yml
COMPOSE_TEST = docker compose -f docker/docker-compose.test.yml

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

# ─── Testing ─────────────────────────────────────────────
test: test-integration

test-api:
	cd services/api && go test ./...

test-integration:
	$(COMPOSE_TEST) up --build --abort-on-container-exit

test-integration-clean:
	$(COMPOSE_TEST) down -v

# ─── Code quality ────────────────────────────────────────
lint-api:
	cd services/api && go vet ./...

fmt-api:
	cd services/api && gofmt -w .

# ─── Single-service rebuilds ─────────────────────────────
rebuild-api:
	$(COMPOSE_DEV) up --build -d api

rebuild-worker:
	$(COMPOSE_DEV) up --build -d worker

rebuild-web:
	$(COMPOSE_DEV) up --build -d web

# ─── Clean ───────────────────────────────────────────────
clean:
	$(COMPOSE_DEV) down -v
	$(COMPOSE_TEST) down -v 2>/dev/null || true
	docker system prune -f
