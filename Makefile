.PHONY: help setup install dev start build test clean format lint migrate db-push health logs

VERSION := $(shell cat VERSION)
NODE_VERSION := $(shell node -v)
NPM_VERSION := $(shell npm -v)

# Colors for terminal output
RED := \033[0;31m
GREEN := \033[0;32m
YELLOW := \033[0;33m
BLUE := \033[0;34m
NC := \033[0m # No Color

help: ## Show this help message
	@echo "$(BLUE)YouTube Sync Player - v$(VERSION)$(NC)"
	@echo "$(BLUE)===================================$(NC)\n"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "$(GREEN)%-20s$(NC) %s\n", $$1, $$2}'
	@echo "\n$(YELLOW)Node $(NODE_VERSION) | npm $(NPM_VERSION)$(NC)"

# ============================================================================
# Setup & Installation Targets
# ============================================================================

setup: check-node install-all migrate db-push ## Complete setup: install deps, migrate DB, initialize everything

check-node: ## Check if Node.js and npm are installed
	@echo "$(BLUE)Checking Node.js and npm...$(NC)"
	@if ! command -v node &> /dev/null; then \
		echo "$(RED)✗ Node.js not found. Please install Node.js$(NC)"; \
		exit 1; \
	fi
	@if ! command -v npm &> /dev/null; then \
		echo "$(RED)✗ npm not found. Please install npm$(NC)"; \
		exit 1; \
	fi
	@echo "$(GREEN)✓ Node.js $(NODE_VERSION)$(NC)"
	@echo "$(GREEN)✓ npm $(NPM_VERSION)$(NC)"

install-all: check-node ## Install dependencies for both client and server
	@echo "$(BLUE)Installing client dependencies...$(NC)"
	@cd client && npm install && cd ..
	@echo "$(GREEN)✓ Client dependencies installed$(NC)"
	@echo "\n$(BLUE)Installing server dependencies...$(NC)"
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
# Database Targets
# ============================================================================

migrate: ## Run Prisma database migrations
	@echo "$(BLUE)Running database migrations...$(NC)"
	@cd server && npx prisma migrate dev --name "migration" && cd ..
	@echo "$(GREEN)✓ Migrations completed$(NC)"

db-push: ## Push database schema without creating migration files (dev only)
	@echo "$(BLUE)Pushing database schema...$(NC)"
	@cd server && npx prisma db push && cd ..
	@echo "$(GREEN)✓ Database schema pushed$(NC)"

db-reset: ## ⚠️  DANGER: Reset database (deletes all data)
	@echo "$(RED)⚠️  WARNING: This will delete all data!$(NC)"
	@read -p "Are you sure? [y/N] " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		cd server && npx prisma migrate reset --force && cd ..; \
		echo "$(GREEN)✓ Database reset$(NC)"; \
	else \
		echo "$(YELLOW)Database reset cancelled$(NC)"; \
	fi

db-studio: ## Open Prisma Studio for database inspection
	@echo "$(BLUE)Opening Prisma Studio...$(NC)"
	@cd server && npx prisma studio && cd ..

# ============================================================================
# Development Targets
# ============================================================================

dev: check-node migrate ## Run both servers in development mode with hot reload
	@echo "$(BLUE)Starting development servers...$(NC)"
	@echo "$(YELLOW)Frontend: http://localhost:3000$(NC)"
	@echo "$(YELLOW)Backend:  http://localhost:4000$(NC)\n"
	@./scripts/start-dev.sh

dev-client: check-node ## Run only client dev server
	@echo "$(BLUE)Starting client dev server...$(NC)"
	@echo "$(YELLOW)Frontend: http://localhost:3000$(NC)\n"
	@cd client && npm run dev && cd ..

dev-server: check-node ## Run only server dev server
	@echo "$(BLUE)Starting server dev server...$(NC)"
	@echo "$(YELLOW)Backend: http://localhost:4000$(NC)\n"
	@cd server && npm run dev && cd ..

# ============================================================================
# Production Targets
# ============================================================================

build: check-node ## Build both client and server for production
	@echo "$(BLUE)Building client...$(NC)"
	@cd client && npm run build && cd ..
	@echo "$(GREEN)✓ Client built$(NC)"
	@echo "\n$(BLUE)Building server...$(NC)"
	@cd server && npm run build && cd ..
	@echo "$(GREEN)✓ Server built$(NC)"

start: build ## Start production servers
	@echo "$(BLUE)Starting production servers...$(NC)"
	@echo "$(YELLOW)Frontend: http://localhost:3000$(NC)"
	@echo "$(YELLOW)Backend:  http://localhost:4000$(NC)\n"
	@./scripts/start-prod.sh

# ============================================================================
# Testing & Quality Targets
# ============================================================================

test: ## Run end-to-end tests
	@echo "$(BLUE)Running end-to-end tests...$(NC)"
	@./test-application.sh

test-client: check-node ## Run client tests
	@echo "$(BLUE)Running client tests...$(NC)"
	@cd client && npm test && cd ..

test-server: check-node ## Run server tests
	@echo "$(BLUE)Running server tests...$(NC)"
	@cd server && npm test && cd ..

lint: ## Run linter on both client and server
	@echo "$(BLUE)Linting client...$(NC)"
	@cd client && npm run lint || true && cd ..
	@echo "\n$(BLUE)Linting server...$(NC)"
	@cd server && npm run lint || true && cd ..

format: ## Format code with Prettier
	@echo "$(BLUE)Formatting code...$(NC)"
	@cd client && npm run format && cd ..
	@cd server && npm run format && cd ..
	@echo "$(GREEN)✓ Code formatted$(NC)"

# ============================================================================
# Utility Targets
# ============================================================================

health: ## Check if both servers are running and healthy
	@echo "$(BLUE)Checking server health...$(NC)"
	@if curl -s http://localhost:4000/health > /dev/null; then \
		echo "$(GREEN)✓ Backend server is running$(NC)"; \
	else \
		echo "$(RED)✗ Backend server is not running$(NC)"; \
	fi
	@if curl -s http://localhost:3000 > /dev/null; then \
		echo "$(GREEN)✓ Frontend server is running$(NC)"; \
	else \
		echo "$(RED)✗ Frontend server is not running$(NC)"; \
	fi

logs: ## Show recent logs from servers
	@echo "$(BLUE)Recent server logs:$(NC)"
	@if [ -f /tmp/youtube-sync-server.log ]; then \
		tail -20 /tmp/youtube-sync-server.log; \
	else \
		echo "$(YELLOW)No server logs found$(NC)"; \
	fi

clean: ## Clean all node_modules, builds, and caches
	@echo "$(BLUE)Cleaning up...$(NC)"
	@rm -rf client/node_modules client/.next client/dist
	@rm -rf server/node_modules server/dist
	@rm -rf server/dev.db server/dev.db-journal
	@echo "$(GREEN)✓ Cleanup complete$(NC)"

clean-deps: ## Remove node_modules from both client and server
	@echo "$(BLUE)Removing node_modules...$(NC)"
	@rm -rf client/node_modules server/node_modules
	@echo "$(GREEN)✓ node_modules removed$(NC)"

clean-db: ## Remove local SQLite database
	@echo "$(BLUE)Removing local database...$(NC)"
	@rm -f server/dev.db server/dev.db-journal
	@echo "$(GREEN)✓ Database removed$(NC)"

clean-all: clean ## Deep clean: removes all node_modules, builds, DB, and caches
	@echo "$(GREEN)✓ Full cleanup complete$(NC)"

# ============================================================================
# Environment Targets
# ============================================================================

env-setup: ## Create .env files from templates (if they don't exist)
	@if [ ! -f client/.env.local ]; then \
		echo "$(BLUE)Creating client/.env.local...$(NC)"; \
		echo "NEXT_PUBLIC_SERVER_URL=http://localhost:4000" > client/.env.local; \
		echo "$(GREEN)✓ Created client/.env.local$(NC)"; \
	fi
	@if [ ! -f server/.env ]; then \
		echo "$(BLUE)Creating server/.env...$(NC)"; \
		echo "DATABASE_URL=\"file:./dev.db\"" > server/.env; \
		echo "PORT=4000" >> server/.env; \
		echo "CLIENT_URL=http://localhost:3000" >> server/.env; \
		echo "$(GREEN)✓ Created server/.env$(NC)"; \
	fi

show-env: ## Display current environment configuration
	@echo "$(BLUE)Client Environment:$(NC)"
	@cat client/.env.local 2>/dev/null || echo "$(YELLOW)client/.env.local not found$(NC)"
	@echo "\n$(BLUE)Server Environment:$(NC)"
	@cat server/.env 2>/dev/null || echo "$(YELLOW)server/.env not found$(NC)"

# ============================================================================
# Information Targets
# ============================================================================

version: ## Show version information
	@echo "$(BLUE)YouTube Sync Player$(NC)"
	@echo "Version: $(GREEN)$(VERSION)$(NC)"
	@echo "Node.js: $(YELLOW)$(NODE_VERSION)$(NC)"
	@echo "npm: $(YELLOW)$(NPM_VERSION)$(NC)"

info: ## Show project information
	@echo "$(BLUE)Project Information$(NC)"
	@echo "===================="
	@echo "Name: YouTube Sync Player"
	@echo "Version: $(VERSION)"
	@echo "Node.js: $(NODE_VERSION)"
	@echo "npm: $(NPM_VERSION)"
	@echo ""
	@echo "$(BLUE)Quick Links:$(NC)"
	@echo "- Frontend: http://localhost:3000"
	@echo "- Backend: http://localhost:4000"
	@echo "- Docs: See README.md and PLAN.md"
	@echo ""
	@echo "$(BLUE)Commands:$(NC)"
	@echo "  make setup  - Complete setup from scratch"
	@echo "  make dev    - Start development servers"
	@echo "  make build  - Build for production"
	@echo "  make test   - Run tests"
	@echo "  make clean  - Clean all files"

# ============================================================================
# Deployment Targets
# ============================================================================

docker-build: ## Build Docker image for production
	@echo "$(BLUE)Building Docker image...$(NC)"
	@docker build -t youtube-sync-player:$(VERSION) .
	@echo "$(GREEN)✓ Docker image built$(NC)"

docker-run: ## Run Docker container
	@echo "$(BLUE)Running Docker container...$(NC)"
	@docker run -p 3000:3000 -p 4000:4000 youtube-sync-player:$(VERSION)

heroku-deploy: build ## Deploy to Heroku
	@echo "$(BLUE)Preparing Heroku deployment...$(NC)"
	@git push heroku main
	@echo "$(GREEN)✓ Deployment initiated$(NC)"

# ============================================================================
# Emergency Targets
# ============================================================================

kill-ports: ## Kill processes on ports 3000 and 4000
	@echo "$(YELLOW)Killing processes on ports 3000 and 4000...$(NC)"
	@lsof -ti:3000 | xargs kill -9 2>/dev/null || true
	@lsof -ti:4000 | xargs kill -9 2>/dev/null || true
	@echo "$(GREEN)✓ Ports cleared$(NC)"

restart: kill-ports dev ## Kill and restart all servers

# ============================================================================
# Default Target
# ============================================================================

.DEFAULT_GOAL := help
