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
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
