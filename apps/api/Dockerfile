FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Install build dependencies for native modules (like argon2)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*


# Copy workspace manifests
COPY package.json package-lock.json turbo.json ./
COPY packages/db/package.json ./packages/db/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/ui/package.json ./packages/ui/
COPY apps/api/package.json ./apps/api/

# Install all dependencies
RUN npm ci

# Copy source code
COPY packages/db ./packages/db
COPY apps/api ./apps/api

# Generate Prisma client
RUN cd packages/db && npx prisma generate

# Build API
RUN cd apps/api && npm run build

# ─── Production Stage ─────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS production

# Install native build deps needed at runtime for argon2, plus curl for docker healthcheck
RUN apt-get update && apt-get install -y python3 make g++ curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy workspace manifests so npm ci can resolve workspaces
COPY package.json package-lock.json turbo.json ./
COPY packages/db/package.json ./packages/db/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/ui/package.json ./packages/ui/
COPY apps/api/package.json ./apps/api/

# Install production dependencies only
RUN npm ci --omit=dev

# Copy built artifacts and Prisma schema/migrations from builder
COPY --from=builder /app/packages/db ./packages/db
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json

WORKDIR /app/apps/api

EXPOSE 4000

# Run Prisma migrations then start the server
CMD ["sh", "-c", "cd /app/packages/db && npx prisma migrate deploy && cd /app/apps/api && node dist/src/main"]
