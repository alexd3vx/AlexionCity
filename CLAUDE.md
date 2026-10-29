# AlexionCity: working notes

Browser 3D life sim. Plan: `docs/ROADMAP.md`. Current phase checklist: `docs/PHASE-0-CHECKLIST.md`. Architecture: `docs/ARCHITECTURE.md`.

## Commands

- `pnpm check` lint, typecheck, test everything. Run before committing.
- `pnpm build` production builds; `pnpm format` runs Prettier.
- `bash supabase/tests/run-local.sh` runs the database tests on a throwaway Postgres.
- `pnpm assets:validate`, `pnpm assets:build` model licence check and pack build.

## Rules

- **Money and items change only through `apply_ledger` on the server.** Never add a client write path to `wallets`, `ledger` or `inventory`.
- **No secrets in git or the client.** Only `VITE_` publishable values are allowed in `apps/client`; the Supabase service-role key lives in the game server's environment.
- **Hosts are environment variables** (`docs/HOSTING.md`); do not hard-code URLs.
- **Fictional brands by default.** No real brand names or logos in game content unless a sponsor contract says so.
- **Every model needs a licence entry** in `assets-src/licences.json` before it ships; raw models stay out of git.
- **Phones are the floor.** The target is a budget Android with 3 GB RAM. Keep the first load small and put extras in packs.
- Add a test with each behaviour change; the shared rules in `packages/shared` are used by both client and server.

## Style

TypeScript strict, ES modules, `import type` for types, Prettier defaults in `.prettierrc.json`. Comments say why, not what.
