# Makefile Quick Reference - YouTube Sync Player

## 🚀 Most Used Commands

### Start Development
```bash
make setup              # ⭐ Complete setup (install + migrate + db setup)
make dev               # ⭐ Start all servers
make build             # Build for production
make start             # Start production servers
```

### Database Management
```bash
make migrate           # Run database migrations
make db-push          # Push schema to database
make db-reset         # ⚠️  RESET database (deletes all data!)
make db-studio        # Open Prisma Studio GUI
```

### Testing & Verification
```bash
make test             # Run end-to-end tests
make health           # Check if servers are running
make info             # Show project information
```

### Cleanup & Maintenance
```bash
make clean            # Remove node_modules, builds, DB
make kill-ports       # Kill processes on ports 3000/4000
make restart          # Kill and restart all servers
make clean-deps       # Remove only node_modules
make clean-db         # Remove only database
```

### Code Quality
```bash
make format           # Format code with Prettier
make lint             # Run linter
make logs             # Show server logs
```

---

## 📋 All Available Commands

### Installation & Setup
- `make check-node` - Check if Node.js and npm are installed
- `make install-all` - Install dependencies for client and server
- `make install-client` - Install only client dependencies
- `make install-server` - Install only server dependencies
- `make env-setup` - Create .env files from templates
- `make show-env` - Display current environment configuration

### Development Servers
- `make dev` - Run both servers with hot reload
- `make dev-client` - Run only client dev server
- `make dev-server` - Run only server dev server

### Production
- `make build` - Build both client and server
- `make start` - Start production servers

### Database Operations
- `make migrate` - Run Prisma migrations
- `make db-push` - Push schema to database
- `make db-reset` - Reset database (DANGER!)
- `make db-studio` - Open Prisma Studio

### Testing & Quality
- `make test` - Run end-to-end tests
- `make test-client` - Run client tests
- `make test-server` - Run server tests
- `make lint` - Run linter on both projects
- `make format` - Format code with Prettier

### Utilities
- `make health` - Check server health
- `make logs` - Show recent logs
- `make version` - Show version info
- `make info` - Show project information
- `make help` - Show help message

### Cleanup & Maintenance
- `make clean` - Clean all artifacts
- `make clean-all` - Deep clean
- `make clean-deps` - Remove node_modules
- `make clean-db` - Remove database
- `make kill-ports` - Kill processes on ports
- `make restart` - Kill and restart servers

### Docker & Deployment
- `make docker-build` - Build Docker image
- `make docker-run` - Run Docker container
- `make heroku-deploy` - Deploy to Heroku

---

## 🎯 Workflow Examples

### Fresh Start
```bash
make setup              # Setup everything
make dev               # Start development
```

### After Making Changes
```bash
make format            # Format code
make lint              # Check code
make test              # Run tests
```

### Database Changes
```bash
make migrate           # Create migration
make db-push          # Push to database
make dev              # Restart with new schema
```

### Production Deployment
```bash
make build             # Build for production
make start             # Start production servers
```

### Debugging Issues
```bash
make health            # Check servers
make logs              # View logs
make restart           # Restart everything
```

---

## 📝 Notes

- All paths are relative to project root
- Use `make help` to see all commands with descriptions
- Commands work on Linux, macOS, and Windows (with WSL)
- Database commands require Node.js and npm installed
- Port 3000 (frontend) and 4000 (backend) must be available

---

## 🔧 Environment Variables

### Client (.env.local)
```env
NEXT_PUBLIC_SERVER_URL=http://localhost:4000
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_google_client_id
```

### Server (.env)
```env
DATABASE_URL="file:./dev.db"
PORT=4000
CLIENT_URL=http://localhost:3000
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
```

---

## 🚀 Quick Start

1. **Complete Setup**
   ```bash
   make setup
   ```

2. **Start Development**
   ```bash
   make dev
   ```

3. **Open Browser**
   ```
   http://localhost:3000
   ```

4. **Start Streaming!** 🎬✨

---

**Version**: 1.0.0-production  
**Last Updated**: June 14, 2026  
**Status**: ✅ Production Ready
