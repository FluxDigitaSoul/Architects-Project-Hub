# syntax=docker/dockerfile:1.7
# Immagine dell'API (NestJS). Si costruisce dalla radice del monorepo, perché l'API usa i pacchetti
# condivisi @aph/contracts e @aph/rai-engine:
#   docker build -f apps/api/Dockerfile -t aph-api .
# Configurazione solo da variabili d'ambiente (vedi docs/deploy/DEPLOY.md): nessun segreto nell'immagine.

FROM node:24-alpine AS base
WORKDIR /app

# Manifest dei workspace: npm ci verifica il lockfile su tutti, installa solo quelli richiesti.
FROM base AS manifests
COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/rai-engine/package.json packages/rai-engine/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

FROM manifests AS build
RUN npm ci --workspace packages/contracts --workspace packages/rai-engine --workspace apps/api --include-workspace-root
COPY tsconfig.base.json ./
COPY packages/contracts packages/contracts
COPY packages/rai-engine packages/rai-engine
COPY apps/api apps/api
RUN npm run build --workspace packages/contracts --workspace packages/rai-engine --workspace apps/api

FROM manifests AS prod-deps
RUN npm ci --omit=dev --workspace packages/contracts --workspace packages/rai-engine --workspace apps/api \
  && mkdir -p apps/api/node_modules \
  && npm cache clean --force

FROM node:24-alpine AS runtime
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app
COPY --from=prod-deps /app/package.json ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/packages/contracts/package.json ./packages/contracts/
COPY --from=build /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=build /app/packages/rai-engine/package.json ./packages/rai-engine/
COPY --from=build /app/packages/rai-engine/dist ./packages/rai-engine/dist
COPY --from=build /app/apps/api/package.json ./apps/api/
COPY --from=build /app/apps/api/dist ./apps/api/dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/v1/health" >/dev/null || exit 1
CMD ["node", "apps/api/dist/main.js"]
