# AlexionCity

A free, browser-based 3D life sim: one shared city, played from any phone or laptop. Mobile-first, installable, with guest play and no signup. See `docs/ROADMAP.md` for the plan and `docs/PHASE-0-CHECKLIST.md` for what is built.

## Run it

Needs Node 22 and pnpm 10.

```bash
pnpm install
cp apps/client/.env.example apps/client/.env.local   # then fill in your Supabase values
pnpm dev:client      # the game, http://localhost:5173
pnpm dev:server      # live game server, ws://localhost:8787 (not used by the client until Phase 2)
```

Without Supabase variables the game still runs, as an offline guest.

## Check it

```bash
pnpm check                          # lint, typecheck and all tests
bash supabase/tests/run-local.sh    # database rules, on a throwaway Postgres
pnpm assets:validate                # model licence manifest
pnpm build                          # production builds
```

## Layout

`apps/client` game, `apps/server` live server, `apps/admin` admin placeholder, `packages/shared` shared rules and types, `packages/asset-tools` model pipeline, `supabase` database, `assets-src` model licences and pack definitions. More in `docs/ARCHITECTURE.md`, `docs/HOSTING.md` and `docs/ASSETS.md`.
