# Stage 1: Build the application
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Run the application
FROM node:20-alpine AS runner
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
