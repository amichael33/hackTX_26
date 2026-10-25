#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu 22.04 / 24.04 server: Node 22, Caddy (automatic HTTPS), pm2, a firewall, and the app.
# Run as root:   sudo REPO_URL=https://github.com/<you>/<repo>.git SITE_ADDRESS=store.example.com bash deploy/vps/setup.sh
#   SITE_ADDRESS  the domain, with its DNS A record already pointing at this server (needed for the HTTPS certificate)
#   BRANCH        branch to deploy (default main)
# Not yet run on a real server (it was written and linted, not exercised): read it before you run it.
set -euo pipefail
: "${REPO_URL:?set REPO_URL}"
: "${SITE_ADDRESS:?set SITE_ADDRESS}"
BRANCH="${BRANCH:-main}"
APP_DIR=/var/www/store
APP_USER=store

[ "$(id -u)" -eq 0 ] || { echo "run as root (sudo)"; exit 1; }

# Stop before changing anything if this server is already set up by hand (a Caddy config, or something in the app folder).
# This script replaces /etc/caddy/Caddyfile and turns the firewall on, so it is for a fresh server only. For a server that already
# has Caddy and a domain working, use "Path C" in deploy/README.md instead. FORCE=1 overrides these checks.
if [ "${FORCE:-}" != "1" ]; then
  problems=()
  if [ -s /etc/caddy/Caddyfile ] && ! cmp -s "$(dirname "$0")/../Caddyfile" /etc/caddy/Caddyfile; then
    problems+=("/etc/caddy/Caddyfile already exists and is different (this script would replace it)")
  fi
  if [ -d "$APP_DIR" ] && [ ! -d "$APP_DIR/.git" ] && [ -n "$(ls -A "$APP_DIR" 2>/dev/null)" ]; then
    problems+=("$APP_DIR already exists and is not a git checkout")
  fi
  if [ "${#problems[@]}" -gt 0 ]; then
    echo "This server is not fresh, so setup.sh is stopping before it changes anything:"
    printf '  - %s\n' "${problems[@]}"
    echo "Use Path C in deploy/README.md for a server that is already set up, or run with FORCE=1 if you really want to overwrite."
    exit 1
  fi
fi

apt-get update -y
apt-get install -y curl git ufw ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https

# Node 22 (the app needs 18+).
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

# Caddy, from its official apt repository.
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  apt-get update -y
  apt-get install -y caddy
fi

command -v pm2 >/dev/null || npm install -g pm2

id "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --shell /bin/bash "$APP_USER"

# The app, in a folder the web server can read.
mkdir -p "$(dirname "$APP_DIR")"
if [ ! -d "$APP_DIR/.git" ]; then
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# Settings: start in demo mode with no keys, so nothing can spend credits until you decide to.
if [ ! -f "$APP_DIR/server/.env" ]; then
  sudo -u "$APP_USER" cp "$APP_DIR/server/.env.example" "$APP_DIR/server/.env"
  sed -i 's/^DEMO_MODE=.*/DEMO_MODE=1/' "$APP_DIR/server/.env"
  chmod 600 "$APP_DIR/server/.env"
fi

# Caddy: the repo's Caddyfile, told where things are through its environment.
install -m 644 "$APP_DIR/deploy/Caddyfile" /etc/caddy/Caddyfile
cat >/etc/caddy/store.env <<EOF
SITE_ADDRESS=$SITE_ADDRESS
APP_ROOT=$APP_DIR/public
APP_UPSTREAM=localhost:3000
EOF
mkdir -p /etc/systemd/system/caddy.service.d
cat >/etc/systemd/system/caddy.service.d/store.conf <<'EOF'
[Service]
EnvironmentFile=/etc/caddy/store.env
EOF
systemctl daemon-reload
systemctl enable --now caddy
systemctl restart caddy

# Let the app user reload Caddy without a password (deploy.sh does this), and nothing else.
echo "$APP_USER ALL=(root) NOPASSWD: /usr/bin/systemctl reload caddy" >/etc/sudoers.d/store-caddy
chmod 440 /etc/sudoers.d/store-caddy

# Firewall: SSH, HTTP (certificate challenge and redirect) and HTTPS only. The app itself listens on 127.0.0.1 only.
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# First deploy, and start pm2 on boot.
sudo -u "$APP_USER" bash "$APP_DIR/deploy/vps/deploy.sh"
env PATH="$PATH:/usr/bin" pm2 startup systemd -u "$APP_USER" --hp "/home/$APP_USER" >/dev/null
sudo -u "$APP_USER" pm2 save

echo
echo "Done. Check it:   deploy/smoke.sh https://$SITE_ADDRESS"
echo "It is in DEMO MODE. To go live, edit $APP_DIR/server/.env (keys, DEMO_MODE=0) and run deploy/vps/deploy.sh again."
