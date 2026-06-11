# Stage 1: Build the application
FROM node:20-slim AS builder
WORKDIR /app
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
