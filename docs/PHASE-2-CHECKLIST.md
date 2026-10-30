# Phase 2: Multiplayer

Goal: players in the same channel see each other, talk, and can protect themselves, on a server that checks what clients send.

**Gate:** players in a channel see and chat with each other. **Met** in two real browsers (`pnpm e2e`), against the real game server. Not yet tried with more than two players at once, or on a phone.

Status key: `[x]` done and tested here, `[~]` works but is a placeholder or only partly tested, `[ ]` not done. Items for you are marked **you**.

## Game server

- [x] Wire protocol v1 shared by client and server (`packages/shared/src/protocol.ts`); a client on an older version is told to refresh
- [x] Sign-in: a Supabase access token is checked with Supabase; development guests are accepted only outside production (or with `ALLOW_DEV_GUESTS=1`)
- [x] District channels of up to 100 players; a new player goes to the first channel with room
- [x] Players only hear about others within 90 m (10 m margin before they are dropped); positions go out 8 times a second as small arrays, only for those who changed
- [x] Movement is trusted but speed-checked and kept inside the world; the first position after joining is the starting point, so reconnecting resumes where you were
- [x] One live session per account: signing in again replaces the older connection
- [x] Origin allow list, 2 KB message limit, 40 messages a second per socket
- [x] 96 server tests, including real WebSocket connections

## Chat and safety

- [x] Chat reaches players within 80 m; messages are cleaned and limited to 160 characters
- [x] Word filter that sees through spacing, symbols and look-alike letters; blocks links, email addresses and phone numbers
- [x] Rate limit, repeat detection, and a 5-minute mute after three blocked messages within 10 minutes
- [x] Mute (this visit, only for the muter), block (saved, works both ways for chat, shown again in Me), report (reason, details, and the recent chat nearby saved with it)
- [x] Reports, blocks, chat log and bans in the database, with row-level security: players can read only their own block list (database tests)
- [x] Ban through the `mod_actions` table; a banned account is refused at sign-in
- [~] The word list is a starter list and will miss things; it needs a proper maintained list and, for other languages, local words
- [ ] Admin review screen for reports (for now, read them in the Supabase Table Editor, see `TESTING.md`)
- [ ] Scheduled `purge_old_chat` (the function exists; schedule it and state the retention in the privacy policy)
- [ ] Age and consent screen, and the privacy policy the chat log needs

## Client

- [x] Other players drawn at once as a capsule in their skin tone, then as their real avatar one at a time, nearest first (at most 8 on Low, 24 on High)
- [x] Smoothed movement, walk and run animation from real speed, snap when far
- [x] Name tags (at most 14 within 38 m) and chat bubbles as page elements over the 3D view; tapping a tag opens the player card
- [x] Chat button with unread count and a connection dot; recent lines fade over the game; chat sheet with history, emotes (wave, clap, dance, laugh) and input
- [x] Player card: mute, block, report
- [x] Name prompt on first visit (2 to 20 characters, same rule as the server); change it later in Me; saved on the account when signed in
- [x] Me shows blocked players with Unblock
- [x] Connection banner while joining, reconnecting or refused (suspended, out of date, sign-in failed); reconnects by itself with backoff
- [x] The player's look is sent when it changes; before avatar packs are downloaded other players see a skin-tone capsule
- [~] Emotes show as a line above the head, not an animation (needs animation clips)
- [~] Players standing on the same spawn point overlap until one walks away

## Accounts

- [x] Guests get a real anonymous Supabase account (existing since Phase 0) and sign in to the game server with its token
- [x] Me, Account: link Google or Apple, save the guest to an email, sign in with an emailed link, sign out
- [~] Google and Apple linking and the email flows are written against the Supabase API but **not tested**: each provider has to be switched on in Supabase first (and Apple needs an Apple developer account). Until then the buttons show a plain "not set up yet" message
- [ ] **you** Switch on "Allow manual linking" and the providers you want in Supabase Auth, and connect your own email sender (the built-in one allows only a few emails an hour)
- [ ] Save the avatar look and name to the account so they follow the player to a new device (the name is saved; the look is still per device)

## Database (applied to your Supabase project)

- [x] `20261030000000_moderation.sql` applied to the live project; `pnpm check:db` confirms the tables exist and the security rules hold
- [x] Also gave the 58 development guests created during Phase 0 and 1 their profile and wallet rows
- [~] Those 58 test guests are still in Supabase; they can be deleted in Authentication, Users

## Developer experience

- [x] `pnpm dev` starts the server and the game together; the server reads `apps/server/.env.local`
- [x] `pnpm e2e`: two real browsers (see `TESTING.md`)
- [x] `docs/TESTING.md`: how you test it yourself, on one computer and on a phone

## Before this phase can be called finished

- [ ] **you** Play it with a second person or two devices and tell me what feels wrong
- [ ] **you** Revoke the Supabase personal access token (`sbp_...`) you gave me for the migration: Supabase dashboard, Account, Access Tokens
- [ ] A game server on a host that stays on (your VPS), with `wss://`, and the client pointed at it (`HOSTING.md`)
