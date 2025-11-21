# Multi-stage build for one-way-availability-bot
# Build context should be parent directory: docker build -f one-way-availability-bot/Dockerfile -t one-way-availability-bot:latest .

# Stage 1: Builder - Compile TypeScript and build native modules
FROM node:22-alpine AS builder

# Install build dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

WORKDIR /build

# Copy package files
COPY one-way-availability-bot/package.json one-way-availability-bot/pnpm-lock.yaml ./

# Install pnpm and dependencies
# pnpm 10+ requires onlyBuiltDependencies in package.json for better-sqlite3
# Force building from source instead of using prebuilt binaries for Alpine compatibility
# Use BuildKit cache mount for pnpm store to avoid rebuilding native modules unnecessarily
ENV npm_config_build_from_source=true
RUN npm install -g pnpm@latest
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# Copy source code
COPY one-way-availability-bot/ ./

# Build TypeScript
RUN pnpm build

# Stage 2: Production - Minimal runtime image
FROM node:22-alpine

# Install runtime dependencies (curl for health checks)
RUN apk add --no-cache curl

# Create app directory
WORKDIR /app

# Copy package files
COPY one-way-availability-bot/package.json one-way-availability-bot/pnpm-lock.yaml ./

# Install pnpm and production dependencies (without building native modules)
RUN npm install -g pnpm@latest && \
    pnpm install --prod --frozen-lockfile

# Copy pre-built better-sqlite3 build directory from builder stage
# This provides the native binary without requiring build tools in production
# Find and copy the version-independent path
COPY --from=builder /build/node_modules/.pnpm/better-sqlite3@*/node_modules/better-sqlite3/build /tmp/bs3-build
RUN cp -r /tmp/bs3-build /app/node_modules/.pnpm/better-sqlite3@*/node_modules/better-sqlite3/ && \
    rm -rf /tmp/bs3-build

# Copy built application from builder
COPY --from=builder /build/dist ./dist

# Copy only the required airport data file (not the entire 307MB directory)
# The bot only uses airports.csv for timezone lookups
RUN mkdir -p ../ourairports-data
COPY ourairports-data/airports.csv ../ourairports-data/airports.csv

# Create data directory for SQLite database
RUN mkdir -p /app/data

# Use non-root user
RUN chown -R node:node /app
USER node

# Expose metrics port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Start the application
CMD ["node", "dist/index.js"]
