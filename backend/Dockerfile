# Multi-stage: the runtime image carries no compiler, no test suite and no source.
FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npx prisma generate

COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN npm run build

# ---

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma

# Don't run as root.
USER node

ENV PORT=4000
EXPOSE 4000

# Migrations are applied on start so a fresh container has a usable schema. For a real
# deployment this belongs in a release step, not the app's entrypoint — a crash-looping
# pod should not be re-running migrations.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
