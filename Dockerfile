FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Build
FROM base AS build
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

# Production
FROM base AS runtime
RUN apk add --no-cache unzip unrar
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/CHANGELOG.md ./CHANGELOG.md
COPY --from=build /app/src/db/migrations ./src/db/migrations
COPY --from=build /app/src/db/migrate.js ./src/db/migrate.js

COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

ENV HOST=0.0.0.0
ENV PORT=3000
EXPOSE 3000

ENTRYPOINT ["./entrypoint.sh"]
