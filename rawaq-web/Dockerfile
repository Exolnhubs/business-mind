# syntax=docker/dockerfile:1

# Multi-stage build for the Next.js (App Router) app using standalone output.
# See README.Docker.md for how to build & run.

ARG NODE_VERSION=22.23.1

# ---- Base image ----------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS base
# Patch OS-level (Alpine/apk) packages to pick up security fixes that lag the
# base image tag (openssl, busybox, etc.). Runs once and is shared by all stages.
RUN apk upgrade --no-cache
WORKDIR /usr/src/app

# ---- Dependencies (all deps, incl. dev — needed to build) ----------------
FROM base AS deps
RUN --mount=type=bind,source=package.json,target=package.json \
    --mount=type=bind,source=package-lock.json,target=package-lock.json \
    --mount=type=cache,target=/root/.npm \
    npm ci

# ---- Builder -------------------------------------------------------------
FROM base AS builder
COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* values are inlined into the client bundle at build time, so
# they MUST be present here. They are passed as build args from compose.yaml.
# (These are public by design — they are shipped to the browser anyway.)
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_PAYMOB_PUBLIC_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_PAYMOB_PUBLIC_KEY=$NEXT_PUBLIC_PAYMOB_PUBLIC_KEY

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- Runner (minimal production image) -----------------------------------
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# public/ (incl. the Serwist-generated sw.js) and the standalone server.
# Copy as the non-root `node` user so the runtime can write to these paths.
COPY --from=builder --chown=node:node /usr/src/app/public ./public
COPY --from=builder --chown=node:node /usr/src/app/.next/standalone ./
COPY --from=builder --chown=node:node /usr/src/app/.next/static ./.next/static

# Next.js writes its image-optimization / ISR cache to .next/cache at runtime;
# pre-create it owned by `node` so the non-root process can write there.
RUN mkdir -p .next/cache && chown -R node:node .next

# Run as the non-root user that ships with the node image.
USER node

EXPOSE 3000

# server.js is produced by Next.js standalone output.
CMD ["node", "server.js"]
