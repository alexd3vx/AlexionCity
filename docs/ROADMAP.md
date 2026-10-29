# AlexionCity Roadmap

AlexionCity is a free, browser-based 3D life sim. Players from anywhere share one persistent city that grows into a map of real-world-style countries and states. This file is the versioned roadmap; the long-form plan with diagrams is the shareable "AlexionCity Master Plan" document. Update this file as phases finish.

## Pillars

1. **Instant and light.** Guest play with no signup, a default look on first load, extra content downloaded once and cached.
2. **A deeper life sim.** Needs, skills, careers, a bank, a real-feeling phone with apps, family, businesses.
3. **One living city.** One shared city, split into district channels of about 100 players.
4. **A world that grows.** A hand-built home city first, then countries and states, then boats and aircraft as updates.
5. **Safe and fair.** Server-controlled money, filtered chat, moderated uploads, fictional brands unless a sponsor pays.

Launch bar: the game feels alive and fun within 10 minutes and is easy to share. Every launch feature works before release. Internal testing only; no public marketing until launch. No fixed date.

## Decisions

| Area                | Decision                                                                                                                                                         |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core fantasy        | Hybrid: life sim at the centre, social and economy layers on top                                                                                                 |
| Multiplayer         | One persistent city in district channels of about 100 players; separate game server for live movement, Supabase for accounts, saves and economy                  |
| World               | Fictional home city AlexionCity, hand-built, 4 to 5 districts; real-style countries and states later from OpenStreetMap; travel by airport and flight cinematic  |
| Camera              | Chase camera outdoors with high and overhead views; isometric cutaway inside homes and venues; first-person later                                                |
| Devices             | Mobile-first; budget Android (about 2019, 3 GB RAM) is the floor; Low and High quality tiers                                                                     |
| Stack               | TypeScript everywhere; Three.js client with Vite; Node game server; pnpm monorepo; React, Tailwind, Framer Motion for UI                                         |
| Accounts            | Guest first, then Google, Apple or email; guest progress carries over                                                                                            |
| Install and updates | Installable web app, versioned asset packs, default look on first load, extra content on a download page, animated "what's new" update notice, no reload         |
| Hosting             | Self-hosted Supabase on the owner's VPS, free tier to start; CDN for assets                                                                                      |
| Cheat control       | Server decides money, items and jobs; movement trusted but speed-checked                                                                                         |
| Currency            | Fictional "Alex" (₳); no cash-out; no lootboxes; regional currencies added with countries                                                                        |
| Revenue             | Free to play; self-serve billboard slots and sponsored app tiles; cosmetics shop later; no payments in the first build                                           |
| Avatars             | Mix-and-match heads, bodies, legs, feet from the modular packs with skin tint; custom hair and accessories built afterward                                       |
| Onboarding          | Instant guest start, short guided tutorial, random starting background                                                                                           |
| Jobs                | Timed shifts, flagship mini-games, career ladder; school and university; trades, office, tech, creative; entrepreneurship                                        |
| Property            | Apartments first (instanced interiors, grid furniture); plots later; player businesses from templates                                                            |
| Vehicles            | Arcade driving; cars, bikes, buses, taxis first; then boats and yachts, helicopters and jets, commercial planes; NPC traffic with working lights and light fines |
| Phone               | Real-phone feel; fictional OS and brands; one OS and app store at launch, more as updates; data and airtime bought in fintech and telco apps                     |
| Social              | Friends, DMs, follow, crews, dating, family, marriage; several in-game social apps                                                                               |
| Safety              | 13+ self-declared; filtered chat, report, block, mute; automated image scan plus human review queue; recovery and deletion; screen-time options                  |
| Brands              | Fictional by default; real brands only as paid sponsors; real-brand car models reworked into fictional ones                                                      |
| Admin               | Separate app and domain; roles, 2FA, audit log, second-person approval for risky actions                                                                         |
| Operations          | Self-hosted analytics and error tracking; daily offsite backups, tested restore, staging                                                                         |
| Legal               | Template drafts now, lawyer review before launch                                                                                                                 |
| Languages           | English first; text structured for translation                                                                                                                   |

## Phases

Each phase ends in a playable, tested build and must pass its gate before the next starts.

| Phase                 | Scope                                                                                                                                   | Gate                                                                          |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 0 Foundation          | Monorepo, CI, VPS and Supabase, staging, PWA shell, asset pipeline, brand pack, data model v0                                           | Deploys to staging; a guest opens the installable app; backups restore        |
| 1 World               | 3D district, chase and overhead cameras, avatar kit, collisions, day and night, HUD style chosen                                        | Runs on a real 3 GB Android                                                   |
| 2 Multiplayer         | Game server, district channels, guest and social login, name tags, chat, report, block, mute                                            | Players in a channel see and chat with each other                             |
| 3 Economy and homes   | Needs, jobs, wallet and bank, rent and bills, shops, instanced apartments, grid furniture, starting backgrounds                         | A player works, is paid, pays rent, decorates a home; server decides balances |
| 4 Phone               | Fictional OS, app store, messages, bank, maps, camera, jobs, data, airtime, battery                                                     | The phone runs a whole day of life                                            |
| 5 Vehicles            | Arcade driving, ownership and parking, customization, fuel and repairs, buses and taxis, NPC traffic, lights and fines                  | Drive the whole city among traffic                                            |
| 6 Social and live ops | Friends, crews, dating, family, events, quests, leaderboards, social apps, businesses, billboards and sponsored tiles, admin dashboards | Live events and ad bookings run end to end                                    |
| 7 Launch hardening    | Load test to the player target, security review, lawyer review, internal test pass                                                      | No blockers; release                                                          |
| After launch          | Countries and flights, boats and yachts, helicopters and jets, commercial planes, regional currencies, languages                        | Shipped as updates                                                            |

Assumption to confirm: launch is Phases 0 to 7; the "After launch" row ships as updates.

## Open items

- Pace of needs and bills, rules while offline, the list of starting backgrounds, and long-term goals were not answered. Proposed defaults: slow need decay; needs frozen offline with a grace period on rent; four backgrounds (comfortable, loan, newcomer, student).
- HUD visual style is not chosen; Phase 1 redoes it from the LagosLife screenshots.
- Payment provider and cosmetics shop are deferred past the first build.
- VPS size unknown; plan assumes a free-tier start and an upgrade as players grow.
- Asset licences: the packs are noted as CC0 from Poly Pizza; Poly Pizza also hosts CC-BY, so each model gets a licence entry. OpenStreetMap terms must be confirmed before any country ships.
