# Production Dockerfile for Google Cloud Run, Render, or any container host
FROM node:20-slim AS builder

WORKDIR /app

# Copy dependency specifications
COPY package*.json ./
RUN npm ci

# Copy full application source code
COPY . .

# Build Vite frontend assets and bundle server.ts to dist/server.cjs
RUN npm run build

# Production runtime stage
FROM node:20-slim AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY package*.json ./
# Install only production dependencies
RUN npm ci --only=production

# Copy compiled frontend and bundled CommonJS backend from builder
COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["npm", "start"]
