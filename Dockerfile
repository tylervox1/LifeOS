FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY . .

# Fail the image build immediately if the app source was not copied.
RUN test -f /app/server/index.js \
 && test -f /app/server/migrate.js \
 && test -f /app/server/worker.js \
 && test -f /app/server/scheduler.js \
 && echo "LifeOS Docker source verification passed"

RUN chown -R node:node /app
USER node
EXPOSE 3000
CMD ["npm","start"]
