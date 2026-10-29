# Phase 0: Foundation checklist

Goal: a deployable skeleton on the owner's VPS, an installable web app shell, and an asset pipeline that can turn the downloaded packs into versioned, licensed, compressed packs. Nothing here is done yet.

**Gate:** deploys to a staging copy on the VPS; a guest opens the installable app; backups restore; CI is green; the asset pipeline builds a pack from the City Pack; the brand pack is approved.

## Repo and tooling

- [ ] pnpm workspace: `apps/client` (Vite, TypeScript, Three.js, React), `apps/server` (Node, TypeScript), `apps/admin`, `packages/shared`, `packages/asset-tools`
- [ ] TypeScript strict config, ESLint, Prettier, Vitest, Playwright
- [ ] CI that lints, type-checks, tests and builds every package
- [ ] `CLAUDE.md` with repo conventions and commands

## Hosting and backend

- [ ] VPS baseline: non-root user, SSH keys only, firewall, Docker Compose, reverse proxy with automatic TLS
- [ ] Self-hosted Supabase running (auth, Postgres, storage, realtime) with secrets kept out of the repo
- [ ] Staging and production environments, domain, Cloudflare in front of assets
- [ ] Daily offsite database backups and one practiced restore
- [ ] Self-hosted analytics and error tracking
- [ ] Data model v0: profiles, wallet ledger, inventory; row-level security; money writes only from the server

## Client shell

- [ ] Installable PWA: manifest, service worker, offline shell
- [ ] Versioned asset-pack loader with IndexedDB cache and a download page
- [ ] Update notice: animated "what's new" prompt, no page reload
- [ ] Guest sign-in (Supabase anonymous auth) with a path to link Google, Apple or email later
- [ ] Renderer scaffold: scene, chase camera, collision stub, device detection, Low and High quality tiers

## Asset pipeline

- [ ] `assets-src/` with a licence manifest (model, source page, author, licence) and a check that fails when an entry is missing
- [ ] glTF pipeline: simplify heavy meshes, make distant versions, compress meshes and textures, build packs, write a manifest with hashes
- [ ] Import City Pack parts 1 and 2, the Furniture Kit and the Modular Men and Women packs
- [ ] Rework the four real-brand cars (Nissan 180MX, Dodge Challenger, Nissan GTR, Mitsubishi L200) into fictional cars
- [ ] Credits screen generated from the manifest
- [ ] Get or borrow a real 3 GB budget Android for performance tests

## Design and brand

- [ ] Brand pack draft: logo, wordmark, palette, app icon, short style guide
- [ ] HUD style exploration from the LagosLife screenshots, then pick one
- [ ] Design tokens in `packages/shared`

## Legal and safety groundwork

- [ ] Draft terms of service, privacy policy and age gate text from templates; list the questions for a lawyer
- [ ] Moderation and report data model sketched for Phase 2
