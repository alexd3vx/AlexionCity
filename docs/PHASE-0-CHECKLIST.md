# Phase 0: Foundation checklist

Goal: a deployable skeleton, an installable web app shell, and an asset pipeline that turns the downloaded packs into versioned, licensed, compressed packs.

**Gate:** deploys to a staging copy; a guest opens the installable app; backups restore; CI is green; the asset pipeline builds a pack from the City Pack; the brand pack is approved.

Status key: `[x]` done and tested here, `[~]` written but not exercised end to end, `[ ]` not done. Items that need your accounts or machines are marked **you**.

## Repo and tooling

- [x] pnpm workspace: `apps/client`, `apps/server`, `apps/admin`, `packages/shared`, `packages/asset-tools`
- [x] TypeScript strict, ESLint, Prettier, Vitest (51 tests)
- [~] CI workflow in `.github/workflows/ci.yml` (same commands pass locally; has not run on GitHub yet)
- [x] `CLAUDE.md` with repo conventions and commands
- [ ] Playwright end-to-end tests in the repo (the browser checks so far were one-off scripts)

## Hosting and backend

- [ ] **you** Static host for the client (for example Cloudflare Pages) with the `VITE_*` variables set; see `docs/HOSTING.md`
- [x] Supabase project reachable with the publishable key; anonymous sign-ins on; the app starts as an online guest and reuses it on reload
- [ ] **you** Run `supabase/migrations/20261029000000_init.sql` in the Supabase SQL Editor (tested on a local Postgres, not yet on your project)
- [x] Data model v0: profiles, wallet, append-only ledger, inventory, row-level security, money writes only through `apply_ledger` (15 database checks)
- [ ] **you** CAPTCHA and sign-up rate limits for anonymous sign-ins, before public launch
- [ ] VPS baseline, reverse proxy with TLS, and staging and production environments (wait for the domain and the Phase 2 server)
- [ ] Daily offsite backups and one practiced restore
- [ ] Self-hosted analytics and error tracking
- [~] Game server skeleton: health check, district channels of 100, speed checks, origin allow list, size and rate limits; runs standalone from one file (`apps/server/Dockerfile` not tested in a container)

## Client shell

- [x] Installable PWA: manifest, service worker, icons (placeholders)
- [x] Versioned asset-pack loader: downloads, hash-checks, caches, skips what is installed, fetches only changed files (tested in a real browser with the real packs)
- [x] Downloads page for extra content
- [x] Animated "what's new" update notice; Update now applies the update and reloads (tested by shipping a second version while the app was open)
- [x] Guest sign-in with Supabase anonymous auth; falls back to offline mode without it
- [x] Renderer scaffold: scene, chase camera, joystick and keyboard, collision, Low and High quality tiers (placeholder world)
- [ ] Link a guest life to Google, Apple or email (Phase 2)

## Asset pipeline

- [x] `assets-src/licences.json` with all 231 models; validator fails on missing entries; CC-BY needs an author
- [x] Optimizer (weld, simplify, dedupe, quantize, meshopt) and pack builder with a hash manifest; builds 4 packs in about 7 seconds
- [x] Imported City Pack parts 1 and 2, Furniture Kit, Modular Men and Women packs
- [ ] Verify each model's licence at its source page (all 231 are `user-attested`)
- [ ] Rework the four real-brand cars into fictional cars (they are in the manifest but not in any pack)
- [ ] Credits screen in the game, generated from the manifest (the generator exists; the screen does not)
- [ ] Texture compression (KTX2), shared animation clips, lighter versions of heavy models; see `docs/ASSETS.md`
- [ ] **you** A real 3 GB budget Android for performance tests

## Design and brand

- [ ] Brand pack draft: logo, wordmark, palette, app icon, short style guide (in progress)
- [ ] HUD style, chosen from the LagosLife screenshots (Phase 1)
- [x] Design tokens file in `packages/shared` (placeholder values)

## Legal and safety groundwork

- [ ] Draft terms of service, privacy policy and age gate text from templates, with a list of questions for a lawyer
- [ ] Moderation and report data model sketched for Phase 2
