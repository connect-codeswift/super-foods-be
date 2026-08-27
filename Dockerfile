# Multi-stage build. `dev` runs tsx watch against bind-mounted source;
# `runner` ships only the esbuild bundle plus production dependencies.
# Kept free of BuildKit-only syntax so podman build works too.

ARG NODE_VERSION=24

# --------------------------------------------------------------------------
FROM docker.io/library/node:${NODE_VERSION}-alpine AS base
WORKDIR /app
ENV NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_UPDATE_NOTIFIER=false

# `prisma generate` parses the URL but never connects, so a placeholder is
# enough at build time. Real values arrive from env_file at run time.
ARG BUILD_DATABASE_URL="postgresql://placeholder:placeholder@localhost:5433/placeholder"

# --------------------------------------------------------------------------
# Every dependency, dev included.
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# --------------------------------------------------------------------------
# Development image: hot reload via tsx watch. Source is bind-mounted over
# this copy by docker-compose.local.yml, but the image also runs standalone.
FROM base AS dev
ENV NODE_ENV=development
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN DATABASE_URL="$BUILD_DATABASE_URL" npx prisma generate
EXPOSE 3001
CMD ["npm", "run", "dev"]

# --------------------------------------------------------------------------
# Type-check and bundle. Fails the build on a type error, which esbuild alone
# would not catch.
FROM deps AS build
COPY . .
RUN DATABASE_URL="$BUILD_DATABASE_URL" npx prisma generate \
 && npm run type-check \
 && npm run build

# --------------------------------------------------------------------------
# Carries the Prisma CLI and the schema, which the runtime image does not.
FROM build AS migrate
CMD ["npx", "prisma", "migrate", "deploy"]

# --------------------------------------------------------------------------
FROM base AS prod-deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

# --------------------------------------------------------------------------
# Runtime. Dependencies stay external to the bundle, so node_modules ships too.
FROM base AS runner
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
