# Aperture — make it easy to build, test, and deploy

.PHONY: all build ensure-dev-env dev dev-detached logs stop test test-integration test-integration-clean test-api lint-api fmt-api clean rebuild-api rebuild-worker rebuild-web

# ─── Compose ─────────────────────────────────────────────
COMPOSE_DEV = docker compose -f docker/docker-compose.yml -f docker/docker-compose.override.yml
TEST_DB_PASSWORD = $(shell python3 -c 'import secrets; print(secrets.token_hex(24))')
TEST_JWT_SECRET = $(shell python3 -c 'import secrets; print(secrets.token_hex(32))')
COMPOSE_TEST = APERTURE_TEST_DB_PASSWORD=$(TEST_DB_PASSWORD) APERTURE_TEST_JWT_SECRET=$(TEST_JWT_SECRET) docker compose -f docker/docker-compose.test.yml

all: build

build: ensure-dev-env
	$(COMPOSE_DEV) build

dev:
	$(MAKE) ensure-dev-env
	$(COMPOSE_DEV) up --build

dev-detached:
	$(MAKE) ensure-dev-env
	$(COMPOSE_DEV) up --build -d

ensure-dev-env:
	@if ! grep -q '^APERTURE_DEV_DB_PASSWORD=' .env 2>/dev/null; then printf 'APERTURE_DEV_DB_PASSWORD=%s\n' "$$(python3 -c 'import secrets; print(secrets.token_hex(24))')" >> .env; fi
	@if ! grep -q '^APERTURE_DEV_JWT_SECRET=' .env 2>/dev/null; then printf 'APERTURE_DEV_JWT_SECRET=%s\n' "$$(python3 -c 'import secrets; print(secrets.token_hex(32))')" >> .env; fi

logs: ensure-dev-env
	$(COMPOSE_DEV) logs -f

stop: ensure-dev-env
	$(COMPOSE_DEV) down

# ─── Database ────────────────────────────────────────────
migrate:
	$(MAKE) ensure-dev-env
	$(COMPOSE_DEV) run --rm migrate

# ─── Testing ─────────────────────────────────────────────
test: test-integration

test-api:
	cd services/api && go test ./...

test-integration:
	$(COMPOSE_TEST) up --build --exit-code-from test-runner

test-integration-clean:
	$(COMPOSE_TEST) down -v

# ─── Code quality ────────────────────────────────────────
lint-api:
	cd services/api && go vet ./...

fmt-api:
	cd services/api && gofmt -w .

# ─── Single-service rebuilds ─────────────────────────────
rebuild-api:
	$(MAKE) ensure-dev-env
	$(COMPOSE_DEV) up --build -d api

rebuild-worker:
	$(MAKE) ensure-dev-env
	$(COMPOSE_DEV) up --build -d worker

rebuild-web:
	$(MAKE) ensure-dev-env
	$(COMPOSE_DEV) up --build -d web

# ─── Clean ───────────────────────────────────────────────
clean: ensure-dev-env
	$(COMPOSE_DEV) down -v
	$(COMPOSE_TEST) down -v 2>/dev/null || true
	docker system prune -f
