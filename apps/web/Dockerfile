FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Install build dependencies for native modules
RUN apt-get update && apt-get install -y python3 make g++


# Copy workspace manifests
COPY package.json package-lock.json turbo.json ./
COPY packages/db/package.json ./packages/db/
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

WORKDIR /app/apps/web

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Copy built Next.js output
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./.next/static
COPY --from=builder /app/apps/web/public ./public

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
