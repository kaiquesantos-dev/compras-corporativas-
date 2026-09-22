# ---- Build stage ----
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# prisma.config.ts reads DATABASE_URL just to load the config for `generate`
# (schema-only, no real connection needed) — a placeholder is enough here.
ENV DATABASE_URL="postgresql://user:password@localhost:5432/placeholder"
RUN npx prisma generate
RUN npm run build

# ---- Runtime stage ----
FROM node:22-alpine AS runner
WORKDIR /app
COPY package.json package-lock.json ./
# NODE_ENV must not be "production" yet here: npm treats that as an implicit
# --omit=dev, which would strip `prisma` and `tsx` — both needed at startup
# (migrate deploy, and `prisma db seed`) even though they're devDependencies.
RUN npm ci
ENV NODE_ENV=production
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/generated ./src/generated
COPY prisma ./prisma
COPY prisma.config.ts ./prisma.config.ts
EXPOSE 3000
# Sem curl/wget disponíveis na imagem alpine, o próprio Node faz a checagem:
# GET /health e verifica o status HTTP. --start-period dá tempo para as
# migrations rodarem antes do primeiro healthcheck contar como falha.
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
