# ============================================================
# Stage 1: Dependencias
# ============================================================
FROM node:22-alpine AS deps
WORKDIR /app

# Instalar dependencias del sistema necesarias para módulos nativos
RUN apk add --no-cache libc6-compat

COPY package.json package-lock.json ./
RUN npm ci --only=production && cp -r node_modules /tmp/node_modules_prod
RUN npm ci

# ============================================================
# Stage 2: Build
# ============================================================
FROM node:22-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Variables necesarias en build time
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN npm run build

# ============================================================
# Stage 3: Runner (imagen final ligera)
# ============================================================
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Crear usuario no-root para seguridad
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copiar solo los archivos necesarios para producción
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/sql ./sql

# Dependencias de producción para scripts (pg, bcryptjs)
COPY --from=deps /tmp/node_modules_prod ./node_modules

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
