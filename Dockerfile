# CleanRoute — Cloud Run container image
# Zero runtime dependencies, so the build is fast and reproducible.

FROM node:20-alpine

WORKDIR /app

# Copy app source (no npm install needed — no dependencies declared)
COPY package.json ./
COPY server.js ./
COPY public ./public

# Cloud Run injects PORT; the server reads process.env.PORT already.
ENV NODE_ENV=production

EXPOSE 8080

CMD ["node", "server.js"]
