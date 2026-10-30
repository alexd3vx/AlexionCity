# Phase 3: Economy and homes

Goal: a player eats, works, is paid, pays rent and decorates a home, with the server deciding every balance.

**Gate:** a player works, is paid, pays rent, decorates a home; server decides balances. **Met** in a real browser against the real game server with a memory store (`pnpm e2e:life`, `pnpm e2e:home`). **Not yet met on your Supabase project**: the new migration has to be applied there (see the last section), and the server's Supabase code has been tested against a fake HTTP layer and the throwaway Postgres, not live.

Status key: `[x]` done and tested here, `[~]` works but is a placeholder or only partly tested, `[ ]` not done. Items for you are marked **you**.

## The rules (shared by client and server, `packages/shared/src/life`)

- [x] Four needs: hunger, energy, mood, hygiene. They fall slowly while you are in the city (a full hunger bar lasts about 2.5 hours) and stand still while you are away
- [x] Mood follows the other needs (the weakest counts most) and gets a lift from a comfortable home
- [x] Tired or hungry players cannot start a shift; happy workers earn up to 10% more, unhappy ones up to 10% less
- [x] Food and drink at restaurants, bars and the hospital, with prices and effects decided on the server
- [x] Four jobs (kitchen, bar, hospital, tower), each a four-step career ladder; the tower needs five shifts of experience first
- [x] Timed shifts (90 to 120 seconds): pay arrives only when the shift finishes, walking away or stopping loses it
- [x] Four random starting backgrounds: comfortable, loan (with installments), newcomer, student (cheaper rent)
- [x] Rent and utilities every "month" (an hour in the city), a late fee, three missed rents lose the home, furniture goes to storage
- [x] A six-step getting-started list (eat, job, shift, sleep, decorate, rent) with a nudge on screen
- [x] 53 unit tests, including that every starting home is valid and every furniture model has a licence entry

## Money (server only)

- [x] Every balance change goes through `apply_ledger`; buying goes through `purchase_item`, which charges and delivers in one database transaction
- [x] Every payment has a fixed reference, so a retry after a dropped connection cannot charge or pay twice (tested: wages, bills, purchases)
- [x] If the database does not answer, the server tells the player, changes nothing, and tries a wage or a bill again on the next tick
- [x] Two orders sent at once with money for one: only one goes through
- [x] Players can read their own balance, ledger, character, home and inventory, and cannot write any of them (database tests, plus `pnpm check:db` against the live project)
- [~] One balance: the bank shows a balance, bills and a statement. There is no separate cash and savings, and no interest yet
- [~] Prices and pay are a first pass. An hour of work pays about three times the rent and bills, which feels right on paper and needs tuning from real play

## Work, food and the bank (client)

- [x] Needs bars, money and the activity bar show what the server says
- [x] Restaurant, bar, hospital and tower sheets: menu, jobs, career progress, shift timer, quit
- [x] Bank sheet from the ATM or the money in the top pill: balance, upcoming bills, overdue warning with a pay button, statement
- [x] Buy tab: home goods by category, with how many you own and how many are in storage
- [x] Me: your story, your job and progress, the getting-started list, housing (move to a bigger place for a deposit)
- [x] Messages from the server wait their turn on screen, so a wage and a "step done" are both read
- [~] Venues are sheets, not rooms you walk into. Only your own home is a 3D interior
- [ ] Mini-games for jobs (planned as "flagship" mini-games; today a shift is a timer)
- [ ] Hotel, shops with clothes, more jobs and places (the city has one bar, one hospital and one tower)

## Homes

- [x] Three homes: studio (8 by 6 m), flat, loft, each with rent and utilities
- [x] Instanced: indoors you are removed from the city (others stop seeing you) and chat is switched off
- [x] Isometric cutaway view with the two near walls left out, turned a quarter at a time
- [x] 40 pieces of furniture from the interiors pack in 7 categories, on a one-metre grid, with a stand-in box shown until the pack is downloaded
- [x] Arrange mode: pick from storage, a ghost that turns green or red as you move it, rotate, place; tap a piece in the room to rotate, move or store it. The server checks everything again: you own it, it fits, the doorway stays clear, rugs may lie under furniture
- [x] Sleep, wash and relax at home with the right furniture (a better bed restores energy faster); sleeping and washing hide the player
- [x] The home survives a reconnect; moving to a smaller place stores what no longer fits
- [~] The player cannot walk around inside; furniture is used from buttons
- [~] Sofa and TV give a mood boost but there is no sitting animation (needs animation clips)
- [ ] Visiting other people's homes, roommates, plots and building your own (later phases)
- [ ] Wall decorations, stairs and more than one room

## Database

- [x] `20261031000000_life.sql`: `characters` and `homes` tables, `create_character` and `purchase_item` functions, row-level security
- [x] Tested on a throwaway Postgres (`bash supabase/tests/run-local.sh`): creating twice is harmless, purchases are atomic and safe to retry, players cannot write anything
- [ ] **you** Applied to your Supabase project (not yet; see below)

## Tools and tests

- [x] `pnpm e2e:life`: eat, take a job, finish a shift and get paid, read the bank, buy furniture
- [x] `pnpm e2e:home`: go indoors, sleep, wash, buy and arrange furniture, pick a piece in the room, turn the view, rent is charged, leave; and a second player who spends everything loses the home
- [x] `pnpm e2e:all` runs all three end-to-end checks
- [x] Test-only server settings (ignored in production): `DEV_BACKGROUND`, `LIFE_TICK_MS`, `DEV_BILL_PERIOD`
- [x] 164 server tests, 78 client tests, 53 shared tests

## Known gaps you should know about

- **Teleport once per connection.** The server takes the first position a player sends after joining as given (so a reconnect resumes where you were). A cheater could use that to start a session anywhere. It gains nothing today because every place is public, but it should be tightened (remember the last position on the server) before places are locked or guarded.
- **Bus stops differ between Low and High quality.** Buildings and named places are the same for everyone; only the bus stop positions are drawn differently. They matter from Phase 5.
- **Time scale.** A "month" is an hour in the city. It is a guess; change `BILL_PERIOD_SECONDS` in `packages/shared/src/life/bills.ts` if it feels wrong.

## To finish this phase

- [ ] **you** Apply the migration to Supabase (below), then run `pnpm check:db` and `pnpm dev` once with your `.env.local`: the first sign-in should create a character with a background and starting money
- [ ] **you** Play it for an evening and say what feels too slow, too fast, too cheap or too dear
- [ ] **you** Tell me which jobs and places you want next
