# syntax=docker.io/docker/dockerfile:1

# =============================================================================
# MOCHI - Production Dockerfile for Coolify
# =============================================================================
# Multi-stage build optimized for security and minimal image size.
# Compatible with Coolify's environment variable injection.
# =============================================================================

# -----------------------------------------------------------------------------
# Base image - Alpine for minimal attack surface
# -----------------------------------------------------------------------------
FROM node:20-alpine AS base

# -----------------------------------------------------------------------------
# Stage 1: Dependencies
# Install production and dev dependencies for build
# -----------------------------------------------------------------------------
FROM base AS deps

# Install build dependencies (libc6-compat for native modules, openssl for Prisma)
RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

# Copy lockfiles for dependency installation
COPY package.json yarn.lock* package-lock.json* pnpm-lock.yaml* .npmrc* ./

# Install dependencies based on available lockfile
RUN \
  if [ -f yarn.lock ]; then yarn --frozen-lockfile; \
  elif [ -f package-lock.json ]; then npm ci; \
  elif [ -f pnpm-lock.yaml ]; then corepack enable pnpm && pnpm i --frozen-lockfile; \
  else echo "Lockfile not found." && exit 1; \
  fi

# -----------------------------------------------------------------------------
# Stage 2: Builder
# Build the Next.js application
# -----------------------------------------------------------------------------
FROM base AS builder

# Install openssl for Prisma client generation
RUN apk add --no-cache openssl

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# =============================================================================
# BUILD ARGUMENTS - Environment variables needed at build time
# NEXT_PUBLIC_ variables are embedded into the client-side JavaScript bundle.
# Server-side secrets (like STRIPE_SECRET_KEY) are needed because Next.js
# evaluates API routes during "Collecting page data" phase of build.
# Pass these via Coolify's Build Arguments section.
# =============================================================================

# Server-side secrets required at build time (Next.js evaluates routes during build)
ARG STRIPE_SECRET_KEY
ARG STRIPE_TEST_SECRET_KEY
ARG LEAD_SESSION_TOKEN_SECRET

# NEXT_PUBLIC_ variables (embedded into client bundle)
ARG NEXT_PUBLIC_ROOT_DOMAIN
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_APP_NAME
ARG NEXT_PUBLIC_EMBED_URL
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_ACCEPT_PAYMENT_FOR_FREE_PLAN
ARG NEXT_PUBLIC_FREE_NAME
ARG NEXT_PUBLIC_FREE_SHOW_PLAN
ARG NEXT_PUBLIC_STARTER_NAME
ARG NEXT_PUBLIC_STARTER_SHOW_PLAN
ARG NEXT_PUBLIC_PRO_NAME
ARG NEXT_PUBLIC_PRO_SHOW_PLAN
ARG NEXT_PUBLIC_ENTERPRISE_NAME
ARG NEXT_PUBLIC_ENTERPRISE_SHOW_PLAN
ARG NEXT_PUBLIC_STARTER_PRICE_MONTHLY
ARG NEXT_PUBLIC_STARTER_PRICE_YEARLY
ARG NEXT_PUBLIC_PRO_PRICE_MONTHLY
ARG NEXT_PUBLIC_PRO_PRICE_YEARLY
ARG NEXT_PUBLIC_ENTERPRISE_PRICE_MONTHLY
ARG NEXT_PUBLIC_ENTERPRISE_PRICE_YEARLY
ARG NEXT_PUBLIC_FREE_TRIAL_DAYS
ARG NEXT_PUBLIC_STARTER_TRIAL_DAYS
ARG NEXT_PUBLIC_PRO_TRIAL_DAYS
ARG NEXT_PUBLIC_ENTERPRISE_TRIAL_DAYS
ARG NEXT_PUBLIC_STRIPE_TEST_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY
ARG NEXT_PUBLIC_CLARITY_PROJECT_ID

# Make build args available as environment variables during build
# Server-side secrets (needed for Next.js route evaluation during build)
ENV STRIPE_SECRET_KEY=$STRIPE_SECRET_KEY
ENV STRIPE_TEST_SECRET_KEY=$STRIPE_TEST_SECRET_KEY
ENV LEAD_SESSION_TOKEN_SECRET=$LEAD_SESSION_TOKEN_SECRET

# NEXT_PUBLIC_ variables
ENV NEXT_PUBLIC_ROOT_DOMAIN=$NEXT_PUBLIC_ROOT_DOMAIN
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_APP_NAME=$NEXT_PUBLIC_APP_NAME
ENV NEXT_PUBLIC_EMBED_URL=$NEXT_PUBLIC_EMBED_URL
ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_ACCEPT_PAYMENT_FOR_FREE_PLAN=$NEXT_PUBLIC_ACCEPT_PAYMENT_FOR_FREE_PLAN
ENV NEXT_PUBLIC_FREE_NAME=$NEXT_PUBLIC_FREE_NAME
ENV NEXT_PUBLIC_FREE_SHOW_PLAN=$NEXT_PUBLIC_FREE_SHOW_PLAN
ENV NEXT_PUBLIC_STARTER_NAME=$NEXT_PUBLIC_STARTER_NAME
ENV NEXT_PUBLIC_STARTER_SHOW_PLAN=$NEXT_PUBLIC_STARTER_SHOW_PLAN
ENV NEXT_PUBLIC_PRO_NAME=$NEXT_PUBLIC_PRO_NAME
ENV NEXT_PUBLIC_PRO_SHOW_PLAN=$NEXT_PUBLIC_PRO_SHOW_PLAN
ENV NEXT_PUBLIC_ENTERPRISE_NAME=$NEXT_PUBLIC_ENTERPRISE_NAME
ENV NEXT_PUBLIC_ENTERPRISE_SHOW_PLAN=$NEXT_PUBLIC_ENTERPRISE_SHOW_PLAN
ENV NEXT_PUBLIC_STARTER_PRICE_MONTHLY=$NEXT_PUBLIC_STARTER_PRICE_MONTHLY
ENV NEXT_PUBLIC_STARTER_PRICE_YEARLY=$NEXT_PUBLIC_STARTER_PRICE_YEARLY
ENV NEXT_PUBLIC_PRO_PRICE_MONTHLY=$NEXT_PUBLIC_PRO_PRICE_MONTHLY
ENV NEXT_PUBLIC_PRO_PRICE_YEARLY=$NEXT_PUBLIC_PRO_PRICE_YEARLY
ENV NEXT_PUBLIC_ENTERPRISE_PRICE_MONTHLY=$NEXT_PUBLIC_ENTERPRISE_PRICE_MONTHLY
ENV NEXT_PUBLIC_ENTERPRISE_PRICE_YEARLY=$NEXT_PUBLIC_ENTERPRISE_PRICE_YEARLY
ENV NEXT_PUBLIC_FREE_TRIAL_DAYS=$NEXT_PUBLIC_FREE_TRIAL_DAYS
ENV NEXT_PUBLIC_STARTER_TRIAL_DAYS=$NEXT_PUBLIC_STARTER_TRIAL_DAYS
ENV NEXT_PUBLIC_PRO_TRIAL_DAYS=$NEXT_PUBLIC_PRO_TRIAL_DAYS
ENV NEXT_PUBLIC_ENTERPRISE_TRIAL_DAYS=$NEXT_PUBLIC_ENTERPRISE_TRIAL_DAYS
ENV NEXT_PUBLIC_STRIPE_TEST_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_TEST_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY
ENV NEXT_PUBLIC_CLARITY_PROJECT_ID=$NEXT_PUBLIC_CLARITY_PROJECT_ID

# Disable Next.js telemetry during build
ENV NEXT_TELEMETRY_DISABLED=1

# Increase Node.js heap memory for TypeScript type-checking during build
# Default ~2GB is insufficient for this codebase — OOMs during "Running TypeScript" phase
ENV NODE_OPTIONS="--max-old-space-size=4096"

# Generate Prisma client and build Next.js
# NODE_OPTIONS is set via ENV above but we also pass it inline to ensure
# child worker processes (TypeScript checker) inherit the increased heap limit
RUN \
  if [ -f yarn.lock ]; then yarn prisma generate && NODE_OPTIONS="--max-old-space-size=8192" yarn build; \
  elif [ -f package-lock.json ]; then npx prisma generate && NODE_OPTIONS="--max-old-space-size=8192" npm run build; \
  elif [ -f pnpm-lock.yaml ]; then corepack enable pnpm && pnpm prisma generate && NODE_OPTIONS="--max-old-space-size=8192" pnpm run build; \
  else echo "Lockfile not found." && exit 1; \
  fi

# -----------------------------------------------------------------------------
# Stage 3: Runner
# Production runtime with minimal footprint and security hardening
# -----------------------------------------------------------------------------
FROM base AS runner

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV NEXT_TELEMETRY_DISABLED=1

# =============================================================================
# RUNTIME ENVIRONMENT VARIABLES (Set in Coolify)
# =============================================================================
# These are injected at runtime by Coolify. Some are ALSO needed as Build
# Arguments (see builder stage above) because Next.js evaluates routes at build.
#
# REQUIRED (Runtime only - set in Environment Variables):
# - DATABASE_URL              : PostgreSQL connection string
# - BETTER_AUTH_SECRET        : Auth session signing secret
# - BETTER_AUTH_URL           : Auth base URL (defaults to NEXT_PUBLIC_APP_URL)
# - INTERNAL_SERVICE_TOKEN_SECRET : Trigger.dev service-to-service auth
# - STRIPE_WEBHOOK_SECRET     : Stripe webhook verification
# - STRIPE_CONNECT_WEBHOOK_SECRET : Stripe Connect webhook verification
# - STRIPE_PLATFORM_CLIENT_ID : Stripe Connect OAuth client ID (ca_xxx)
# - PLATFORM_API_URL          : Platform root URL for OAuth callbacks
# - RESEND_API_KEY            : Email sending API key
# - RESEND_FROM_EMAIL         : Sender email address for outbound emails
# - RESEND_WEBHOOK_SECRET     : Resend webhook verification secret
# - UPSTASH_REDIS_REST_URL    : Realtime events Redis URL
# - UPSTASH_REDIS_REST_TOKEN  : Realtime events Redis token
# - R2_ACCOUNT_ID             : Cloudflare R2 account
# - R2_ACCESS_KEY_ID          : Cloudflare R2 access key
# - R2_SECRET_ACCESS_KEY      : Cloudflare R2 secret
# - R2_BUCKET_NAME            : Cloudflare R2 bucket name
# - R2_PUBLIC_URL             : Cloudflare R2 public URL
#
# REQUIRED (BOTH Build Args AND Runtime - set in BOTH sections):
# - STRIPE_SECRET_KEY         : Stripe API secret key
# - STRIPE_TEST_SECRET_KEY    : Stripe test mode API secret key
# - LEAD_SESSION_TOKEN_SECRET : Chat widget session signing (HMAC-SHA256)
#                               Generate with: openssl rand -hex 32
# - VAPID_PRIVATE_KEY         : Web Push VAPID private key (push notifications)
# - VAPID_SUBJECT             : Web Push VAPID subject (mailto: email)
#
# PORTAL (Runtime only - Client Portal admin dashboard):
# - PORTAL_ENABLED            : Enable/disable portal feature (true/false)
# - PORTAL_INITIAL_OWNER_EMAIL : First portal admin email (must exist in system)
# - PORTAL_SESSION_TIMEOUT_HOURS : Portal session timeout (default: 4)
# - PORTAL_PATH_PREFIX        : Portal URL path (default: /portal)
# - PORTAL_AUDIT_LOGGING_ENABLED : Enable portal audit logs (true/false)
# - PORTAL_SECRET             : Portal token signing secret (openssl rand -base64 32)
#
# OPTIONAL:
# - OPENAI_API_KEY            : OpenAI API key (AI features)
# - ANTHROPIC_API_KEY         : Anthropic API key (AI features)
# - TRIGGER_SECRET_KEY        : Trigger.dev secret key
# =============================================================================

# Install runtime dependencies (curl for healthcheck, openssl for Prisma)
# Using --no-cache to minimize image size
RUN apk add --no-cache curl openssl

# =============================================================================
# SECURITY: Create non-root user
# Running as non-root prevents container escape attacks
# =============================================================================
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy public assets (static files)
COPY --from=builder /app/public ./public

# Copy standalone build output (owned by nextjs user)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy only Prisma engine binaries and generated client for runtime queries.
# WHY: Standalone mode bundles all JS dependencies already — the only runtime
# files it does NOT include are Prisma's native query engine binaries and the
# generated client output. Copying the full node_modules (~1GB) would double
# the image size and is the likely cause of disk-space build failures.
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Copy Prisma schema (needed for runtime queries)
COPY --from=builder /app/prisma ./prisma

# =============================================================================
# SECURITY: Switch to non-root user
# All subsequent commands run as unprivileged user
# =============================================================================
USER nextjs

# Expose application port
EXPOSE 3000

# =============================================================================
# HEALTHCHECK: Container orchestration health monitoring
# Coolify and Docker use this to verify container health
# =============================================================================
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Start the Next.js server
CMD ["node", "server.js"]