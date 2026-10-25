#!/usr/bin/env bash
# Update a running server to the latest code (or roll back). Run as the app user, from anywhere:
#   deploy/vps/deploy.sh                          # latest of the current branch
#   BRANCH=main deploy/vps/deploy.sh              # a specific branch
#   ROLLBACK_TO=<commit> deploy/vps/deploy.sh     # go back to a commit that worked
#   SMOKE_URL=https://store.example.com deploy/vps/deploy.sh   # also run the smoke test afterwards
set -euo pipefail
cd "$(dirname "$0")/../.."

if [ -n "${ROLLBACK_TO:-}" ]; then
  git fetch --prune origin
  git checkout --detach "$ROLLBACK_TO"
else
  BRANCH="${BRANCH:-$(git rev-parse --abbrev-ref HEAD)}"
  [ "$BRANCH" != "HEAD" ] || { echo "detached HEAD: set BRANCH=<name> (or ROLLBACK_TO to stay on a commit)"; exit 1; }
  git fetch --prune origin
  git checkout "$BRANCH"
  git pull --ff-only origin "$BRANCH"
fi
echo "deploying $(git rev-parse --short HEAD): $(git log -1 --format=%s)"

npm ci --omit=dev
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save

# Caddy only needs a reload when its config changed, but a reload is cheap and harmless.
sudo -n systemctl reload caddy 2>/dev/null || echo "note: could not reload caddy (run: sudo systemctl reload caddy)"

# The app must answer before we call it done.
for i in 1 2 3 4 5 6 7 8 9 10; do
  curl -fsS http://127.0.0.1:"${PORT:-3000}"/api/health >/dev/null 2>&1 && { echo "app is healthy"; break; }
  [ "$i" -lt 10 ] || { echo "app did not become healthy: pm2 logs store"; exit 1; }
  sleep 1
done

if [ -n "${SMOKE_URL:-}" ]; then deploy/smoke.sh "$SMOKE_URL"; fi
