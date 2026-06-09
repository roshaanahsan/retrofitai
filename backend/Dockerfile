FROM node:20-alpine

WORKDIR /app

# Install dependencies first (layer cache)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy source
COPY src/ ./src/

# Cloud Run injects PORT at runtime; default fallback keeps local runs working
EXPOSE 3001

CMD ["node", "src/index.js"]
