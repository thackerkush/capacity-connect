FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Install build dependencies for native modules
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*


# Copy workspace manifests
COPY package.json package-lock.json turbo.json ./
COPY packages/db/package.json ./packages/db/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/ui/package.json ./packages/ui/
COPY apps/web/package.json ./apps/web/

# Install all dependencies
RUN npm ci

# Copy source code
COPY packages/db ./packages/db
COPY apps/web ./apps/web

# Build Next.js app
ENV NEXT_TELEMETRY_DISABLED=1
RUN cd apps/web && npm run build

# ─── Production Stage ─────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS production

# The standalone output bundles its own node_modules, no npm install needed
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Copy the standalone bundle (includes its own minimal node_modules)
COPY --from=builder /app/apps/web/.next/standalone ./
# Static assets must be placed where Next.js expects them inside the standalone tree
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# server.js is placed at the workspace root inside standalone
CMD ["node", "apps/web/server.js"]
