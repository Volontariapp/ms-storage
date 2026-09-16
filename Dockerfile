# 1. BASE : On prépare l'environnement commun
FROM node:24-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app
RUN corepack enable && corepack prepare yarn@4.12.0 --activate

# 2. DEVELOPMENT & BUILD : On installe tout et on compile
FROM base AS builder
COPY . .
# Yarn 4 gère très bien le cache, on installe tout (devDeps incluses pour le build)
RUN yarn install --immutable
RUN yarn build
# On prépare les modules de prod immédiatement après le build dans le même stage
RUN yarn workspaces focus --all --production && yarn cache clean --all


# 3. PRODUCTION : L'image finale
FROM node:24-alpine AS production
LABEL maintainer="Volontariapp"
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3006

# Sécurité : Création de l'utilisateur
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs

# On ne copie que le strict nécessaire
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/package.json ./package.json
# Si ton dossier config est nécessaire au runtime :
COPY --from=builder --chown=nestjs:nodejs /app/config ./config

USER nestjs
EXPOSE ${PORT}

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch(\`http://localhost:\${PORT}/health\`).then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

ENTRYPOINT ["node"]
CMD ["dist/main"]
