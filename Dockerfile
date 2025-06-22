# Multi-stage, so the runtime image carries no compiler, no source and no dev dependencies.
# Smaller, and a much smaller set of things that can be exploited in a running container.

FROM node:22-alpine AS build

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

# Manifest first, so this layer is cached until a dependency actually changes.
COPY package.json ./
RUN pnpm install --no-frozen-lockfile

COPY tsconfig.json nest-cli.json ./
COPY src ./src

RUN pnpm exec nest build && pnpm prune --prod

FROM node:22-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

# tini reaps zombies and forwards SIGTERM, which is what makes graceful shutdown work.
# Node as PID 1 ignores the signal ECS and Compose send.
RUN apk add --no-cache tini

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/package.json ./

# Running as root inside a container is a default nobody should accept.
USER node
EXPOSE 3003

# Liveness, not readiness. Restarting because a dependency blipped turns a recoverable
# incident into an outage.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3   CMD node -e "require('http').get('http://127.0.0.1:3003/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
