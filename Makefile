.PHONY: help setup check-node env-setup install-all install-client install-server \
       migrate db-push db-reset db-studio generate \
       dev dev-client dev-server build start \
       test test-client test-server lint format typecheck \
       health status logs open \
       clean clean-deps clean-db clean-all \
       version info show-env check-deps update-deps \
       docker-build docker-run kill-ports restart quick-start

VERSION := $(shell cat VERSION 2>/dev/null || echo "2.0.0")
NODE_VERSION := $(shell node -v 2>/dev/null || echo "Not Found")
NPM_VERSION := $(shell npm -v 2>/dev/null || echo "Not Found")
SHELL := /bin/bash

# Colors for terminal output
RED := \033[0;31m
GREEN := \033[0;32m
YELLOW := \033[0;33m
BLUE := \033[0;34m
CYAN := \033[0;36m
MAGENTA := \033[0;35m
BOLD := \033[1m
NC := \033[0m # No Color

help: ## Show this help message
	@echo ""
	@echo "$(BOLD)$(CYAN)  YouTube Sync Player$(NC) $(MAGENTA)v$(VERSION)$(NC)"
	@echo "$(CYAN)  ═══════════════════════════════════$(NC)"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-18s$(NC) %s\n", $$1, $$2}'
	@echo ""
	@echo "  $(YELLOW)Node $(NODE_VERSION) | npm $(NPM_VERSION)$(NC)"
	@echo ""

# ============================================================================
# 🚀 Quick Start (Zero Intervention)
# ============================================================================

quick-start: ## 🚀 One command to rule them all: setup + run (zero intervention)
	@echo "$(BOLD)$(CYAN)🚀 YouTube Sync Player — Quick Start$(NC)"
	@echo "$(CYAN)═══════════════════════════════════════$(NC)"
	@$(MAKE) check-node
	@$(MAKE) env-setup
	@$(MAKE) install-all
	@echo ""
	@echo "$(GREEN)✓ Setup complete! Starting servers...$(NC)"
	@echo ""
	@$(MAKE) dev

# ============================================================================
# Setup & Installation Targets
# ============================================================================

setup: check-node env-setup install-all ## Complete setup: install deps, initialize everything
	@echo "$(GREEN)✓ Setup complete!$(NC)"

check-node: ## Check if Node.js and npm are installed
	@echo "$(BLUE)Checking Node.js and npm...$(NC)"
	@if ! command -v node &> /dev/null; then \
		echo "$(RED)✗ Node.js not found. Please install Node.js 20+$(NC)"; \
		exit 1; \
	fi
	@if ! command -v npm &> /dev/null; then \
		echo "$(RED)✗ npm not found. Please install npm$(NC)"; \
		exit 1; \
	fi
	@echo "$(GREEN)✓ Node.js $(NODE_VERSION)$(NC)"
	@echo "$(GREEN)✓ npm $(NPM_VERSION)$(NC)"

env-setup: ## Create .env files from templates (if they don't exist)
	@if [ ! -f client/.env.local ]; then \
		echo "$(BLUE)Creating client/.env.local...$(NC)"; \
		echo "NEXT_PUBLIC_SERVER_URL=http://localhost:4000" > client/.env.local; \
		echo "# NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_google_client_id" >> client/.env.local; \
		echo "$(GREEN)✓ Created client/.env.local$(NC)"; \
	else \
		echo "$(YELLOW)⏭ client/.env.local already exists$(NC)"; \
	fi
	@if [ ! -f server/.env ]; then \
		echo "$(BLUE)Creating server/.env...$(NC)"; \
		echo 'DATABASE_URL="file:./dev.db"' > server/.env; \
		echo "PORT=4000" >> server/.env; \
		echo "CLIENT_URL=http://localhost:3000" >> server/.env; \
		echo "$(GREEN)✓ Created server/.env$(NC)"; \
	else \
		echo "$(YELLOW)⏭ server/.env already exists$(NC)"; \
	fi

install-all: check-node ## Install dependencies for both client and server
	@echo "$(BLUE)Installing client dependencies...$(NC)"
	@cd client && npm install && cd ..
	@echo "$(GREEN)✓ Client dependencies installed$(NC)"
	@echo ""
	@echo "$(BLUE)Installing server dependencies...$(NC)"
	@cd server && npm install && cd ..
	@echo "$(GREEN)✓ Server dependencies installed$(NC)"

install-client: ## Install only client dependencies
	@echo "$(BLUE)Installing client dependencies...$(NC)"
	@cd client && npm install && cd ..
	@echo "$(GREEN)✓ Client dependencies installed$(NC)"

install-server: ## Install only server dependencies
	@echo "$(BLUE)Installing server dependencies...$(NC)"
	@cd server && npm install && cd ..
	@echo "$(GREEN)✓ Server dependencies installed$(NC)"

# ============================================================================
# Infrastructure Targets
# ============================================================================

redis-start: ## Start Redis container for file uploads and sync
	@echo "$(BLUE)Starting Redis...$(NC)"
	@docker compose up -d redis
	@echo "$(GREEN)✓ Redis started$(NC)"

redis-stop: ## Stop Redis container
	@echo "$(BLUE)Stopping Redis...$(NC)"
	@docker compose down
	@echo "$(GREEN)✓ Redis stopped$(NC)"

# ============================================================================
# Development Targets
# ============================================================================

dev: check-node ## Run both servers in development mode with hot reload
	@$(MAKE) env-setup
	@echo "$(BOLD)$(CYAN)Starting development servers...$(NC)"
	@echo "$(YELLOW)  Frontend: http://localhost:3000$(NC)"
	@echo "$(YELLOW)  Backend:  http://localhost:4000$(NC)"
	@echo ""
	@bash ./scripts/start-dev.sh

dev-client: check-node ## Run only client dev server
	@echo "$(BLUE)Starting client dev server...$(NC)"
	@echo "$(YELLOW)Frontend: http://localhost:3000$(NC)"
	@cd client && npm run dev

dev-server: check-node ## Run only server dev server
	@echo "$(BLUE)Starting server dev server...$(NC)"
	@echo "$(YELLOW)Backend: http://localhost:4000$(NC)"
	@cd server && npm run dev

# ============================================================================
# Production Targets
# ============================================================================

build: check-node ## Build both client and server for production
	@echo "$(BLUE)Building client...$(NC)"
	@cd client && npm run build && cd ..
	@echo "$(GREEN)✓ Client built$(NC)"
	@echo ""
	@echo "$(BLUE)Building server...$(NC)"
	@cd server && npm run build && cd ..
	@echo "$(GREEN)✓ Server built$(NC)"

start: build ## Start production servers
	@echo "$(BLUE)Starting production servers...$(NC)"
	@echo "$(YELLOW)Frontend: http://localhost:3000$(NC)"
	@echo "$(YELLOW)Backend:  http://localhost:4000$(NC)"
	@bash ./scripts/start-prod.sh

# ============================================================================
# Testing & Quality Targets
# ============================================================================

test: ## Run end-to-end tests
	@echo "$(BLUE)Running end-to-end tests...$(NC)"
	@bash ./test-application.sh

test-client: check-node ## Run client tests
	@echo "$(BLUE)Running client tests...$(NC)"
	@cd client && npm test && cd ..

test-server: check-node ## Run server tests
	@echo "$(BLUE)Running server tests...$(NC)"
	@cd server && npm test && cd ..

lint: ## Run linter on both client and server
	@echo "$(BLUE)Linting client...$(NC)"
	@cd client && npm run lint || true && cd ..
	@echo ""
	@echo "$(BLUE)Linting server...$(NC)"
	@cd server && npm run lint || true && cd ..

format: ## Format code with Prettier
	@echo "$(BLUE)Formatting code...$(NC)"
	@cd client && npx prettier --write "src/**/*.{ts,tsx}" || true && cd ..
	@cd server && npx prettier --write "src/**/*.ts" || true && cd ..
	@echo "$(GREEN)✓ Code formatted$(NC)"

typecheck: check-node ## Run TypeScript type checking
	@echo "$(BLUE)Typechecking client...$(NC)"
	@cd client && npx tsc --noEmit && cd ..
	@echo ""
	@echo "$(BLUE)Typechecking server...$(NC)"
	@cd server && npx tsc --noEmit && cd ..
	@echo "$(GREEN)✓ Typechecking completed$(NC)"

# ============================================================================
# Utility Targets
# ============================================================================

health: ## Check if both servers are running and healthy
	@echo "$(BLUE)Checking server health...$(NC)"
	@if curl -sf http://localhost:4000/health > /dev/null 2>&1; then \
		echo "$(GREEN)✓ Backend server is running (port 4000)$(NC)"; \
	else \
		echo "$(RED)✗ Backend server is not running$(NC)"; \
	fi
	@if curl -sf http://localhost:3000 > /dev/null 2>&1; then \
		echo "$(GREEN)✓ Frontend server is running (port 3000)$(NC)"; \
	else \
		echo "$(RED)✗ Frontend server is not running$(NC)"; \
	fi

status: ## Show processes running on ports 3000 and 4000
	@echo "$(BLUE)Processes on port 3000:$(NC)"
	@lsof -i :3000 2>/dev/null || echo "  $(YELLOW)No process on port 3000$(NC)"
	@echo ""
	@echo "$(BLUE)Processes on port 4000:$(NC)"
	@lsof -i :4000 2>/dev/null || echo "  $(YELLOW)No process on port 4000$(NC)"

open: ## Open the application in the default browser
	@echo "$(BLUE)Opening http://localhost:3000...$(NC)"
	@if command -v xdg-open &> /dev/null; then xdg-open http://localhost:3000; \
	elif command -v open &> /dev/null; then open http://localhost:3000; \
	elif command -v start &> /dev/null; then start http://localhost:3000; \
	else echo "$(YELLOW)Please open http://localhost:3000 in your browser$(NC)"; fi

logs: ## Show recent logs from servers
	@echo "$(BLUE)Server logs:$(NC)"
	@if [ -f /tmp/youtube-sync-server.log ]; then \
		tail -30 /tmp/youtube-sync-server.log; \
	else \
		echo "$(YELLOW)No server logs found$(NC)"; \
	fi
	@echo ""
	@echo "$(BLUE)Client logs:$(NC)"
	@if [ -f /tmp/youtube-sync-client.log ]; then \
		tail -30 /tmp/youtube-sync-client.log; \
	else \
		echo "$(YELLOW)No client logs found$(NC)"; \
	fi

clean: ## Clean all node_modules, builds, and caches
	@echo "$(BLUE)Cleaning up...$(NC)"
	@rm -rf client/node_modules client/.next client/dist
	@rm -rf server/node_modules server/dist
	@rm -rf server/prisma/dev.db server/prisma/dev.db-journal
	@rm -f /tmp/youtube-sync-server.log /tmp/youtube-sync-client.log
	@echo "$(GREEN)✓ Cleanup complete$(NC)"

clean-deps: ## Remove node_modules from both client and server
	@echo "$(BLUE)Removing node_modules...$(NC)"
	@rm -rf client/node_modules server/node_modules
	@echo "$(GREEN)✓ node_modules removed$(NC)"

clean-db: ## Remove local SQLite database
	@echo "$(BLUE)Removing local database...$(NC)"
	@rm -f server/prisma/dev.db server/prisma/dev.db-journal
	@echo "$(GREEN)✓ Database removed$(NC)"

clean-all: clean ## Deep clean: removes all generated files, builds, DB, and caches
	@echo "$(GREEN)✓ Full cleanup complete$(NC)"

# ============================================================================
# Dependency Management
# ============================================================================

check-deps: ## Verify all dependencies are installed
	@echo "$(BLUE)Checking client dependencies...$(NC)"
	@if [ -d client/node_modules ]; then \
		echo "$(GREEN)✓ Client node_modules exists$(NC)"; \
	else \
		echo "$(RED)✗ Client node_modules missing — run 'make install-all'$(NC)"; \
	fi
	@echo "$(BLUE)Checking server dependencies...$(NC)"
	@if [ -d server/node_modules ]; then \
		echo "$(GREEN)✓ Server node_modules exists$(NC)"; \
	else \
		echo "$(RED)✗ Server node_modules missing — run 'make install-all'$(NC)"; \
	fi

update-deps: ## Update dependencies to latest versions
	@echo "$(BLUE)Updating client dependencies...$(NC)"
	@cd client && npm update && cd ..
	@echo "$(GREEN)✓ Client dependencies updated$(NC)"
	@echo ""
	@echo "$(BLUE)Updating server dependencies...$(NC)"
	@cd server && npm update && cd ..
	@echo "$(GREEN)✓ Server dependencies updated$(NC)"

# ============================================================================
# Environment Information
# ============================================================================

show-env: ## Display current environment configuration
	@echo "$(BLUE)Client Environment:$(NC)"
	@cat client/.env.local 2>/dev/null || echo "$(YELLOW)client/.env.local not found$(NC)"
	@echo ""
	@echo "$(BLUE)Server Environment:$(NC)"
	@cat server/.env 2>/dev/null || echo "$(YELLOW)server/.env not found$(NC)"

version: ## Show version information
	@echo "$(BOLD)$(CYAN)YouTube Sync Player$(NC)"
	@echo "  Version: $(GREEN)$(VERSION)$(NC)"
	@echo "  Node.js: $(YELLOW)$(NODE_VERSION)$(NC)"
	@echo "  npm:     $(YELLOW)$(NPM_VERSION)$(NC)"

info: ## Show project information and quick reference
	@echo ""
	@echo "$(BOLD)$(CYAN)YouTube Sync Player$(NC) $(MAGENTA)v$(VERSION)$(NC)"
	@echo "$(CYAN)═══════════════════════════════════$(NC)"
	@echo ""
	@echo "$(BOLD)Quick Links:$(NC)"
	@echo "  Frontend: $(YELLOW)http://localhost:3000$(NC)"
	@echo "  Backend:  $(YELLOW)http://localhost:4000$(NC)"
	@echo "  Docs:     See README.md"
	@echo ""
	@echo "$(BOLD)Common Workflows:$(NC)"
	@echo "  $(GREEN)make quick-start$(NC)  — First-time setup + run"
	@echo "  $(GREEN)make dev$(NC)          — Start development servers"
	@echo "  $(GREEN)make build$(NC)        — Build for production"
	@echo "  $(GREEN)make test$(NC)         — Run tests"
	@echo "  $(GREEN)make clean$(NC)        — Clean all generated files"
	@echo "  $(GREEN)make restart$(NC)      — Kill and restart servers"
	@echo ""

# ============================================================================
# Deployment Targets
# ============================================================================

docker-build: ## Build Docker images using docker compose
	@echo "$(BLUE)Building Docker images...$(NC)"
	@docker compose build
	@echo "$(GREEN)✓ Docker images built$(NC)"

docker-run: ## Run application using docker compose
	@echo "$(BLUE)Starting application with Docker Compose...$(NC)"
	@docker compose up -d
	@echo "$(GREEN)✓ Application started (ports 3000, 4000)$(NC)"

# ============================================================================
# Emergency Targets
# ============================================================================

kill-ports: ## Kill processes on ports 3000 and 4000
	@echo "$(YELLOW)Killing processes on ports 3000 and 4000...$(NC)"
	@lsof -ti:3000 | xargs -r kill -9 2>/dev/null || true
	@lsof -ti:4000 | xargs -r kill -9 2>/dev/null || true
	@echo "$(GREEN)✓ Ports cleared$(NC)"

restart: kill-ports dev ## Kill and restart all servers

# ============================================================================
# Default Target
# ============================================================================

.DEFAULT_GOAL := help
