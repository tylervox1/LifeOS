FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./

RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi \
    && npm cache clean --force

COPY . .

RUN test -f server/index.js \
    && test -f server/migrate.js \
    && test -f server/worker.js \
    && test -f server/scheduler.js \
    && echo "Synchrified server files verified"

USER node

EXPOSE 10000

CMD ["npm", "start"]
