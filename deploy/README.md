# Deploying the demo

Owner: Misha. Everything here lives on the `deploy/demo` branch so `main` stays app-only.

**What is tested:** the Docker setup, end to end on a laptop (both images build, the stack comes up healthy, `deploy/smoke.sh` passes, and the 3D store loads and runs a demo search through it). `deploy/vps/deploy.sh` (update and rollback) was run in a clean Node container with pm2 **and on the real server**. **Path C is deployed and verified on a real server** (demo mode, no API keys, at https://stor3d.tech): a valid Let's Encrypt certificate, `deploy/smoke.sh` 10 passed with 1 advisory warning, update, rollback and roll-forward worked, source files and dotfiles are not served, and the app loads and runs a demo search in a real browser over HTTPS. **What is not:** `deploy/vps/setup.sh` (Path B) has been linted and its safety checks tested in a container, but never run on a fresh server (the real server was already set up, which is what Path C is for); a reboot has not been tested.

## Decisions you still have to make
1. **Where it runs.** Any machine that can run Docker (simplest), or a plain Ubuntu server (the VPS scripts).
2. **A domain.** Browsers only allow geolocation and the microphone over HTTPS (or on localhost), so the public demo needs a real domain pointing at the server. Without one, the "share my location" button and push-to-talk do not work; typing a city still does.
3. **Demo or live.** Recommended for the public site: demo mode (`DEMO_MODE=1`). It serves the built-in demo products and canned ideas, so the public site can never spend SerpApi credits, and even with no Gemini key the clerk still works (it falls back to using what you typed as the search). Live mode (`DEMO_MODE=0` plus both keys) means anyone on the internet can spend your credits: the per-IP rate limits (10 searches a minute) slow that down but do not stop it.

## Path A: Docker (anywhere)
```bash
cp deploy/.env.example deploy/.env      # edit: SITE_ADDRESS=store.example.com (a domain gives you HTTPS), keys optional
docker compose -f deploy/docker-compose.yml up -d --build
deploy/smoke.sh https://store.example.com      # or http://localhost for a local run
```
- Two containers: `web` (Caddy: HTTPS, the static site, `/api` proxy) and `app` (the Node API). Only `web` is exposed (ports 80 and 443).
- For HTTPS, DNS must already point the domain at the machine and ports 80 and 443 must be open: Caddy gets the certificate itself on first start. Keep the `caddy_data` volume or it asks for a new certificate every restart.
- Local try-out without touching ports 80/443: `HTTP_PORT=8088 HTTPS_PORT=8443 docker compose -f deploy/docker-compose.yml up -d --build`, then `deploy/smoke.sh http://localhost:8088`.
- Update: `git pull && docker compose -f deploy/docker-compose.yml up -d --build`. Logs: `docker compose -f deploy/docker-compose.yml logs -f`. Stop: `... down`.
- Roll back: `git checkout <good commit>` and run the update command again.

## Path B: a plain Ubuntu server
```bash
# once, as root, on a fresh Ubuntu 22.04/24.04 server (DNS for the domain already pointing at it):
sudo REPO_URL=https://github.com/<you>/<repo>.git SITE_ADDRESS=store.example.com bash deploy/vps/setup.sh
# every update, as the app user:
deploy/vps/deploy.sh                                   # latest of the current branch
ROLLBACK_TO=<commit> deploy/vps/deploy.sh              # roll back
SMOKE_URL=https://store.example.com deploy/vps/deploy.sh   # also run the smoke test
```
`setup.sh` installs Node 22, Caddy and pm2, makes a `store` user, opens only SSH, 80 and 443, starts in demo mode, and starts the app on boot. To go live later, edit `/var/www/store/server/.env` and run `deploy.sh` again. Read `setup.sh` before running it on a real machine; it has not been run on one yet.

## Path C: a server that is already set up (Caddy and a domain working)
Use this when Caddy already serves your domain (as on stor3d.tech): do **not** run `setup.sh`, which would replace the Caddy config and the firewall. The only requirement is a Caddy site that serves `/var/www/store/public` and proxies `/api/*` to `127.0.0.1:3000`; the app then needs to be cloned there and run under pm2. As the user that owns `/var/www/store`:
```bash
rmdir /var/www/store/public                  # only if it is an empty folder: this fails safely if it is not
git clone --branch deploy-test https://github.com/amichael33/hackTX_26.git /var/www/store
printf 'DEMO_MODE=1\nPORT=3000\nNOMINATIM_CONTACT=https://your-domain\n' > /var/www/store/server/.env && chmod 600 /var/www/store/server/.env
BRANCH=deploy-test bash /var/www/store/deploy/vps/deploy.sh
sudo env PATH="$PATH:/usr/bin" pm2 startup systemd -u "$USER" --hp "$HOME"     # start on boot; then: pm2 save
/var/www/store/deploy/smoke.sh https://your-domain
```
Updates and rollbacks are the same `deploy.sh` commands as in Path B. The Caddy config is left exactly as it was.

## Checking a deployment
`deploy/smoke.sh <url>` (never spends credits: searches use the demo path). It checks the page, scripts, API health, demo search, demo clothing search, demo ideas, security headers, no-cache on scripts, and HTTPS.

## Settings (environment)
| Variable | Meaning |
|---|---|
| `SITE_ADDRESS` | domain (automatic HTTPS) or `:80` |
| `DEMO_MODE` | `1` = demo data only, never calls SerpApi |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | chat, stickers, ideas; leave empty for no Gemini calls |
| `SERPAPI_KEY`, `AMAZON_RESULTS` | live search; ignored in demo mode |
| `HOST`, `TRUST_PROXY` | the app listens on `HOST` (default `127.0.0.1` in production; `0.0.0.0` in the container) and believes `X-Forwarded-For` from `TRUST_PROXY` (default `loopback`; `uniquelocal` in compose), which keeps rate limits per visitor |
| `NOMINATIM_CONTACT` | a URL or email for the geocoder's User-Agent (its usage policy asks for one) |

## Known risks
- **A-Frame loads from a CDN.** If the venue wifi is down or blocks it, the 3D scene does not appear. Vendoring it into `public/` fixes that (on the roadmap).
- Fonts (Google Fonts) also come from a CDN; the page falls back to system fonts without them.
- Reverse geocoding uses the public OpenStreetMap Nominatim service, which has its own rate limit.
- There is no content-security policy yet (the CDN scripts make a strict one fiddly).
- Secrets: `deploy/.env` and `server/.env` are git-ignored; never commit either.
