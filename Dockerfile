FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY . .

RUN echo "=== /app/server ===" && ls -la /app/server && echo "=== migrate.js ===" && stat /app/server/migrate.js

RUN chown -R node:node /app
USER node
EXPOSE 3000
CMD ["npm","start"]
