# Hosting

The rule: **every host-specific value is an environment variable.** Moving from free hosting to a bought domain, or from a free server to your own VPS, is a settings change, not a code change.

## What runs where

| Part                                | Needed from | Free-first choice                                      | Switches to                                  |
| ----------------------------------- | ----------- | ------------------------------------------------------ | -------------------------------------------- |
| Client (the game page)              | Phase 0     | Any static host; Cloudflare Pages is the suggested one | Same host with your domain                   |
| Supabase (accounts, saves, economy) | Phase 0     | Your existing Supabase project on its free plan        | Pro plan or self-hosted Supabase on your VPS |
| Asset packs (3D models)             | Phase 1     | Static hosting or object storage                       | A CDN on your domain                         |
| Game server (live movement)         | Phase 2     | Your own computer while testing                        | Your VPS, or any always-on host              |
| Admin app                           | Phase 2     | Not needed yet                                         | Its own hidden domain                        |

## Environment variables

Client (`apps/client`, copy `.env.example` to `.env.local`; on a host, set these in its dashboard):

| Variable                        | What it is                                                                                   |
| ------------------------------- | -------------------------------------------------------------------------------------------- |
| `VITE_SUPABASE_URL`             | Your Supabase project URL                                                                    |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | The publishable (formerly "anon") key. Safe to publish; row-level security protects the data |
| `VITE_GAME_WS_URL`              | WebSocket address of the game server                                                         |
| `VITE_ASSET_BASE`               | Where `manifest.json` and the packs are served from                                          |

Game server (`apps/server`, copy `.env.example` to `.env.local`; `pnpm dev` reads it):

| Variable              | What it is                                                                                                                                            |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`                | Port to listen on (8787)                                                                                                                              |
| `ALLOWED_ORIGINS`     | Comma-separated page origins allowed to connect. Required in production                                                                               |
| `SUPABASE_URL`        | Your project URL. With the next one, the server checks sign-in tokens and saves reports, blocks and chat. Without them it runs in memory, for testing |
| `SUPABASE_SECRET_KEY` | The `sb_secret_...` key (the newer name for the service-role key)                                                                                     |
| `ALLOW_DEV_GUESTS`    | `1` accepts made-up guest ids without Supabase. On by default outside production, off in production. Never turn it on for a public server             |
| `NODE_ENV`            | Set to `production` on a real host                                                                                                                    |

In the client, `VITE_GAME_WS_URL` is where the browser connects. If it is not set, the client uses the page's own address on port 8787 (so a phone on your Wi-Fi works), or `wss://your-site/ws` on an https page, which a reverse proxy should forward to the server. **That secret key lives only in the server's environment. It never goes in the client or in git, and it should not be pasted into chat. Rotate it before launch, and straight away if anyone else can see the conversation.**

## Supabase setup (once)

1. **Anonymous sign-ins:** Authentication, Sign In / Providers, turn on "Allow anonymous sign-ins". (Done for the current project.)
2. **Data model:** run the files in `supabase/migrations/` in order, once each, in the dashboard SQL Editor, or with the Supabase CLI (`supabase link`, then `supabase db push`). `20261029000000_init.sql` creates profiles, wallets, an append-only ledger and inventory, with row-level security so players can read but never change their money. `20261030000000_moderation.sql` adds blocks, reports, the chat log and bans. `20261031000000_life.sql` adds characters, homes and the purchase functions. The first two are applied to the current project; the life migration is not yet (Phase 3). `pnpm check:db` checks everything that is applied.
3. **Abuse control:** anonymous sign-ins let anyone create accounts cheaply. Before public launch, turn on CAPTCHA and rate limits for sign-ups in the Auth settings.
4. **Google and Apple login, and linking a guest to an account:** switch on "Allow manual linking" and each provider in Authentication, and set the Site URL and redirect URLs to your real domain. Email sign-in works with Supabase's built-in sender only a few times an hour; connect your own sender before real testers arrive.

The migrations are tested on a throwaway Postgres with `bash supabase/tests/run-local.sh`, and applied to the hosted project.

## Game server

A live game needs a server that stays on. Hosts that put free apps to sleep after a few idle minutes break live play. Based on 2026 comparisons (secondary sources, check each provider's own pricing page):

- **Your VPS** is the safe default and what the architecture assumes.
- **Oracle Cloud Always Free** is reported as the one free option that is truly always on, with a reduced allowance in 2026, a card required, and possible reclaim of idle instances.
- **Render's free tier** sleeps after about 15 minutes idle; **Fly.io** has no free tier for new accounts; **Koyeb's** free status is unclear.

The server builds to one self-contained file, so it runs anywhere with Node 22:

```bash
pnpm --filter @alexioncity/server build
PORT=8787 ALLOWED_ORIGINS=https://your-site.example node apps/server/dist/index.js
```

`apps/server/Dockerfile` wraps the same file in a container (not yet tested in a container runtime). Put a reverse proxy with automatic TLS in front of it so browsers can use `wss://`.

## Switching to your own domain

When you buy a domain, change settings only:

1. Point the domain at the static host for the client.
2. Set `ALLOWED_ORIGINS` on the game server to the new origin.
3. In Supabase Auth, set the Site URL and redirect URLs to the new domain.
4. Update `VITE_ASSET_BASE` and `VITE_GAME_WS_URL` if those hosts moved.
5. Rebuild the client. No code changes.

## Free-tier facts worth checking yourself

These come from third-party articles, not the providers: Supabase free plan 500 MB database and an inactivity pause after about a week; Cloudflare Pages Free plan 20,000 files per site (this one is from Cloudflare's changelog). Confirm limits and prices on each provider's official page before relying on them.

Sources: [free Docker hosting comparison](https://flywp.com/blog/9769/best-free-docker-hosting-platforms/), [Render on free tiers](https://render.com/articles/platforms-with-a-real-free-tier-for-developers-in-2026), [state of free hosting 2026](https://snapdeploy.dev/state-of-free-hosting), [Supabase free tier limits 2026](https://automationatlas.io/answers/supabase-free-tier-limits-2026/), [Cloudflare Pages file limit changelog](https://developers.cloudflare.com/changelog/post/2026-01-23-pages-file-limit-increase/).
