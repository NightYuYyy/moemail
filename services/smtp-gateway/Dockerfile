FROM node:24-alpine

# Haraka's tls plugin shells out to `openssl` to generate dhparams.pem on startup
RUN apk add --no-cache openssl

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --chown=node:node . .
RUN mkdir -p /app/queue && chown node:node /app/queue

ENV NODE_ENV=production
ENV SPOOL_DIR=/var/spool/moemail-gateway

VOLUME ["/var/spool/moemail-gateway"]
EXPOSE 2525/tcp

USER node

CMD ["npm", "start"]
