# Notes for Claude sessions working in this repo

Read [docs/ROADMAP.md](docs/ROADMAP.md) first: it is the current plan and to-do list.

## Do not touch: demo deployment (owned by Misha)

Misha is doing the demo deployment himself. Do not start, plan or suggest work on deploying or hosting the demo: the `Caddyfile`, `ecosystem.config.cjs`, the domain, server setup, or publishing the app anywhere. If a task seems to need it, stop and ask Misha.

## SerpApi: never call it without asking

Every SerpApi call spends real credits (a search is two: Google Shopping plus Amazon, more with retries). Do not make any SerpApi call, directly or indirectly, without the user saying yes first. That includes:

- `curl` to `serpapi.com`;
- hitting the local `/api/search` route while the server has a `SERPAPI_KEY` loaded (a `.env` in `server/`), or any other route that reaches SerpApi;
- scripts such as `npm run prewarm`.

Test without credits instead: unit tests use a fake `fetchImpl`, and demo mode (`?demo=1`, or `demo: true` in the request body, or `DEMO_MODE=1`) never calls SerpApi. If a live call would really help, ask first and say roughly how many credits it would use. (Gemini calls are separate and are fine.)

## Other house rules

- Never commit `server/.env` or any API key (`server/.env.example` is the template).
- Merge or push only when asked.
