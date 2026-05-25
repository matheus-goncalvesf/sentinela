FROM node:22-slim

RUN apt-get update && apt-get install -y \
    chromium \
    chromium-sandbox \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --include=dev && npm cache clean --force

COPY . .

ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV CHROMIUM_PATH=/usr/bin/chromium
ENV PORT=3001

EXPOSE 3001

CMD ["npx", "tsx", "src/index.ts"]
