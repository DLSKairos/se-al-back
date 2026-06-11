# ─── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copiar manifiestos primero para aprovechar cache de capas
COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci --ignore-scripts

# Generar cliente Prisma
RUN npx prisma generate

# Copiar código fuente y compilar
COPY tsconfig.json nest-cli.json ./
COPY src ./src/

RUN npm run build

# ─── Stage 2: Runtime ────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

# Usuario no root para seguridad (Fix #24)
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Solo dependencias de producción
COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci --omit=dev --ignore-scripts && npx prisma generate

# Copiar build de la etapa anterior
COPY --from=builder /app/dist ./dist/

# Cambiar propietario antes de cambiar usuario
RUN chown -R appuser:appgroup /app

USER appuser

EXPOSE 3000

# No copiar .env — inyectar vía variables de entorno del orquestador (Fix #24)
CMD ["node", "dist/main"]
