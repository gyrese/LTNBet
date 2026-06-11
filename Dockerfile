# Stage 1: Build the application
FROM node:20-slim AS builder
WORKDIR /app
# Outils de build pour compiler les modules natifs (better-sqlite3) quand aucun binaire
# pré-compilé n'est disponible pour ce Linux. Le runner réutilise le binaire compilé (même base).
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
# npm install (et non npm ci) : le package-lock.json est généré sous Windows et omet des deps
# optionnelles natives nécessaires sous Linux (@emnapi/* via @tailwindcss/oxide). install les résout.
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build

# Stage 2: Run the application
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy built application and production dependencies
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/src ./src

# Expose Next.js port
EXPOSE 3000

# Start server
CMD ["npm", "run", "start"]
