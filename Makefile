.PHONY: dev build test test-frontend test-e2e verify check-size migrate seed lint lint-install fmt docker-up docker-down test-db test-db-down run stop reset clean

PORT ?= 8099
DB ?= sqlite:///tmp/lwts-e2e.db
DB_FILE = /tmp/lwts-e2e.db
BIN = bin/lwts
PID_FILE = /tmp/lwts-dev.pid

# Tooling
GOLANGCI_LINT_VERSION ?= v2.15.0
GOLANGCI_LINT ?= $(CURDIR)/bin/golangci-lint

# Docker
APP_NAME := lwts
# Source build metadata
SETTINGS := $(shell bash -c 'source settings.sh && echo "$$VERSION|$$COMMIT|$$DATE"')
VERSION := $(word 1,$(subst |, ,$(SETTINGS)))
BUILD_COMMIT := $(word 2,$(subst |, ,$(SETTINGS)))
BUILD_DATE := $(word 3,$(subst |, ,$(SETTINGS)))

export DB_URL = $(DB)
export PORT
export DEV = true
export JWT_SECRET ?= lwts-dev-secret
export LOG_LEVEL ?= info

# ── Development ──────────────────────────────────────────────

build:
	CGO_ENABLED=0 go build -ldflags="-s -w -X main.version=$(VERSION) -X main.commit=$(BUILD_COMMIT) -X main.buildDate=$(BUILD_DATE)" -o $(BIN) ./server/cmd

run: build stop
	@$(BIN) migrate
	@$(BIN) seed 2>/dev/null || true
	@$(BIN) user-create Admin admin@admin.dev admin --role=owner 2>/dev/null || true
	@$(BIN) reset-password admin@admin.dev admin 2>/dev/null
	@echo "Starting LWTS on http://localhost:$(PORT)"
	@echo "Login: admin@admin.dev / admin"
	@$(BIN) & echo $$! > $(PID_FILE)

stop:
	@if [ -f $(PID_FILE) ]; then \
		kill $$(cat $(PID_FILE)) 2>/dev/null || true; \
		rm -f $(PID_FILE); \
	fi
	@lsof -ti :$(PORT) 2>/dev/null | xargs kill -9 2>/dev/null || true

reset: stop
	@rm -f $(DB_FILE) $(DB_FILE)-wal $(DB_FILE)-shm
	@echo "Database wiped."

reset-run: reset
	@$(MAKE) build
	@$(BIN) migrate
	@echo "Starting fresh LWTS on http://localhost:$(PORT) — register your first account"
	@$(BIN) & echo $$! > $(PID_FILE)

dev:
	@echo "Starting dev server with air..."
	cd server && air

# ── Testing ──────────────────────────────────────────────────

test:
	go test -v -count=1 ./...

test-pg:
	DB_URL="postgres://lwts_test:lwts_test@localhost:5433/lwts_test?sslmode=disable" go test -v -count=1 -p=1 -tags=integration ./...

test-sqlite:
	@rm -f /tmp/lwts-test.db /tmp/lwts-test.db-wal /tmp/lwts-test.db-shm
	DB_URL="sqlite:///tmp/lwts-test.db" go test -v -count=1 -p=1 -tags=integration ./...

test-frontend:
	@[ -d node_modules ] || npm ci --silent
	node --test tests/frontend/*.test.js

# Fail on tracked source files over 500 lines (allowlist = existing exceptions).
check-size:
	@bash scripts/check-file-size.sh

# Local gate to run before merging a branch: everything that CI would check
# locally, without external services.
verify: build check-size lint
	go vet ./...
	go test -count=1 ./...
	@[ -d node_modules ] || npm ci --silent
	node --test tests/frontend/*.test.js
	@[ -d web/node_modules ] || npm --prefix web ci --silent
	npm --prefix web run build

# End-to-end (Playwright). Starts the disposable test server on :8044.
test-e2e:
	@[ -d node_modules ] || npm ci --silent
	npx playwright test

# Full pre-merge gate: static/unit checks plus browser E2E.
verify-full: verify test-e2e

test-all: test-pg test-sqlite test-frontend

# ── Database ─────────────────────────────────────────────────

migrate:
	go run ./server/cmd migrate

seed:
	go run ./server/cmd seed

clean:
	@rm -f $(DB_FILE) $(DB_FILE)-wal $(DB_FILE)-shm
	@rm -f $(BIN)
	@rm -f $(PID_FILE)
	@echo "Cleaned build artifacts and database."

# ── Docker ───────────────────────────────────────────────────

docker-up:
	docker compose up -d

docker-down:
	docker compose down

test-db:
	docker compose -f docker-compose.test.yml up -d

test-db-down:
	docker compose -f docker-compose.test.yml down

# ── Lint ─────────────────────────────────────────────────────

lint:
	@test -x $(GOLANGCI_LINT) || { echo "golangci-lint $(GOLANGCI_LINT_VERSION) not installed: run 'make lint-install'"; exit 1; }
	@v=$$($(GOLANGCI_LINT) --version | awk '{print $$4}'); \
	 [ "$$v" = "$(GOLANGCI_LINT_VERSION:v%=%)" ] || echo "warning: golangci-lint $$v != $(GOLANGCI_LINT_VERSION); run 'make lint-install'"
	@$(GOLANGCI_LINT) run ./...

lint-install:
	@mkdir -p bin
	curl -sSfL https://raw.githubusercontent.com/golangci/golangci-lint/HEAD/install.sh \
		| sh -s -- -b $(CURDIR)/bin $(GOLANGCI_LINT_VERSION)

fmt:
	@test -x $(GOLANGCI_LINT) || { echo "golangci-lint $(GOLANGCI_LINT_VERSION) not installed: run 'make lint-install'"; exit 1; }
	@$(GOLANGCI_LINT) fmt ./...
