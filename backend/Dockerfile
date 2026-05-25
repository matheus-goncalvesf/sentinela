FROM node:22-slim

RUN apt-get update && apt-get install -y \
    chromium \
    libnss3 \
    libnspr4 \
    libatk1.0-0t64 \
    libatk-bridge2.0-0t64 \
    libcups2t64 \
    libdrm2 \
    libdbus-1-3 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2t64 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --include=dev

COPY . .
RUN npx tsc

ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV CHROMIUM_PATH=/usr/bin/chromium
ENV PORT=3001

EXPOSE 3001

CMD ["node", "dist/index.js"]
