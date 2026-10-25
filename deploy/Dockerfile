# Two images from one file, built from the repo root:
#   docker build -f deploy/Dockerfile --target app -t store-app .
#   docker build -f deploy/Dockerfile --target web -t store-web .

# --- the Node server (the API) ---
FROM node:22-alpine AS app
WORKDIR /srv/app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server ./server
# The server imports a few shared modules from public/js (category, stickers), so it needs the folder too.
COPY public ./public
USER node
EXPOSE 3000
CMD ["node", "server/index.js"]

# --- Caddy: serves the static site and proxies /api to the app ---
FROM caddy:2-alpine AS web
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY public /srv/public
