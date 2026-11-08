.PHONY: dev build test test-frontend test-e2e verify check-size migrate seed lint lint-install fmt docker-up docker-down test-db test-db-down run stop reset clean \
	push setup-buildx demo-db lambda-build lambda-push tf-init tf-apply tf-destroy

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
REGISTRY := docker.io/lwts
IMAGE_NAME := $(REGISTRY)/$(APP_NAME)
# Source build metadata
SETTINGS := $(shell bash -c 'source settings.sh && echo "$$VERSION|$$COMMIT|$$DATE"')
VERSION := $(word 1,$(subst |, ,$(SETTINGS)))
BUILD_COMMIT := $(word 2,$(subst |, ,$(SETTINGS)))
BUILD_DATE := $(word 3,$(subst |, ,$(SETTINGS)))
PLATFORMS := linux/amd64,linux/arm64
BUILDER_NAME := $(APP_NAME)-multiarch-builder
LAMBDA_IMAGE := lwts-lambda:latest
LAMBDA_NAME ?= lwts-demo
AWS_REGION ?= us-west-2
TF_DIR := tf

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

demo-db: build
	@rm -f demo.db demo.db-wal demo.db-shm
	DB_URL="sqlite:///$(CURDIR)/demo.db" JWT_SECRET=x DEV=true $(BIN) migrate
	DB_URL="sqlite:///$(CURDIR)/demo.db" JWT_SECRET=x DEV=true $(BIN) user-create Demo demo@demo.com demo --role=owner
	DB_URL="sqlite:///$(CURDIR)/demo.db" JWT_SECRET=x DEV=true $(BIN) seed

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

# ── Docker (multi-arch) ─────────────────────────────────────

setup-buildx:
	@docker buildx inspect $(BUILDER_NAME) >/dev/null 2>&1 || \
		docker buildx create --name $(BUILDER_NAME) --platform $(PLATFORMS) --use
	@docker buildx inspect --bootstrap $(BUILDER_NAME)

push: setup-buildx
	docker buildx build \
		--platform $(PLATFORMS) \
		--build-arg VERSION=$(VERSION) \
		--build-arg COMMIT=$(BUILD_COMMIT) \
		--build-arg BUILD_DATE=$(BUILD_DATE) \
		--tag $(IMAGE_NAME):$(VERSION) \
		--tag $(IMAGE_NAME):latest \
		--push \
		.

# ── Lambda Demo (AWS) ────────────────────────────────────────

lambda-build: demo-db
	docker build -f Dockerfile.lambda --platform linux/arm64 \
		--build-arg VERSION=$(VERSION) \
		--build-arg COMMIT=$(BUILD_COMMIT) \
		--build-arg BUILD_DATE=$(BUILD_DATE) \
		-t $(LAMBDA_IMAGE) \
		.

lambda-push: lambda-build
	@set -e; \
	ECR_REPO="$$(terraform -chdir=$(TF_DIR) output -raw ecr_repo)"; \
	aws ecr get-login-password --region $(AWS_REGION) | docker login --username AWS --password-stdin "$$ECR_REPO"; \
	docker tag $(LAMBDA_IMAGE) "$$ECR_REPO:latest"; \
	docker push "$$ECR_REPO:latest"; \
	aws lambda update-function-code --function-name $(LAMBDA_NAME) --image-uri "$$ECR_REPO:latest" --region $(AWS_REGION); \
	aws lambda wait function-updated --function-name $(LAMBDA_NAME) --region $(AWS_REGION); \
	aws lambda update-function-url-config --function-name $(LAMBDA_NAME) --region $(AWS_REGION) --auth-type NONE --invoke-mode BUFFERED; \
	aws lambda remove-permission --function-name $(LAMBDA_NAME) --region $(AWS_REGION) --statement-id FunctionURLAllowPublicAccess >/dev/null 2>&1 || true; \
	aws lambda remove-permission --function-name $(LAMBDA_NAME) --region $(AWS_REGION) --statement-id FunctionURLAllowInvokeFunction >/dev/null 2>&1 || true; \
	aws lambda add-permission --function-name $(LAMBDA_NAME) --region $(AWS_REGION) --statement-id FunctionURLAllowPublicAccess --action lambda:InvokeFunctionUrl --principal "*" --function-url-auth-type NONE >/dev/null; \
	aws lambda add-permission --function-name $(LAMBDA_NAME) --region $(AWS_REGION) --statement-id FunctionURLAllowInvokeFunction --action lambda:InvokeFunction --principal "*" --invoked-via-function-url >/dev/null

tf-init:
	terraform -chdir=$(TF_DIR) init

tf-apply: tf-init
	terraform -chdir=$(TF_DIR) apply -auto-approve

tf-destroy: tf-init
	terraform -chdir=$(TF_DIR) destroy -auto-approve
