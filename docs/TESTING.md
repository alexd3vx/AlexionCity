# How to test AlexionCity

Three ways, from quickest to most real. All of them run on your own computer; nothing here needs a public host.

## 1. Play it with two players (about 5 minutes)

You need Node 22 and pnpm, and the packs built once (`pnpm assets:build`, needs the raw models in `assets-src/raw`; skip it to play with the plain default look).

```bash
pnpm install
```

```bash
pnpm dev
```

`pnpm dev` starts the game server on port 8787 and the game page on port 5173. Then:

1. Open <http://localhost:5173> in one browser window. Pick a name, for example `Ada`.
2. Open the same address in a **second window**, or better a private/incognito window (so it is a second guest, not the same one). Pick another name, for example `Bo`.
3. Both of you appear at the plaza. You should see:
   - the other player's name tag above their head (tap it for mute, block, report);
   - the chat button on the right with a coloured dot: green is connected, amber is connecting, grey is offline;
   - after tapping the chat button and sending a message, a bubble above your head, the same bubble on the other window, and the line in both chat histories.
4. Walk away with W A S D (Shift to run) or the on-screen stick. The other window sees you move smoothly.
5. Close one window. Its player disappears from the other.

### On your phone (same Wi-Fi)

1. Find your computer's address on the Wi-Fi, for example `192.168.1.20`.
2. On the phone open `http://192.168.1.20:5173`. The game finds the server on the same address by itself (port 8787).
3. If it cannot connect, your computer's firewall is blocking ports 5173 and 8787.

Phone installs of the app (the "add to home screen" prompt) need `https`, so they only work once it is hosted; the game itself runs fine in the phone browser.

### Things worth trying on purpose

| Try                                                            | You should see                                                                                                        |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Type a rude word, or `visit mysite.com`, or a phone number     | A toast: "Please keep chat friendly" or "Please do not share links or contact details". The other player sees nothing |
| Send the same message twice quickly                            | "You already said that."                                                                                              |
| Send many messages fast                                        | "You are sending messages too fast." Three blocked messages within 10 minutes mute you for 5 minutes                  |
| Tap a player's name tag, choose **Mute chat**                  | You stop seeing their bubbles and chat lines (for this visit only)                                                    |
| Tap a name tag, choose **Block**                               | They vanish for you, you vanish for them in chat, and they are listed in Me, "Blocked players", where you can unblock |
| Tap a name tag, choose **Report**, pick a reason, send         | A "Thanks" toast. The report is stored with the recent chat around it (see below)                                     |
| Stop the server (Ctrl+C in its terminal), wait, start it again | "Reconnecting to the city…" appears, then play resumes by itself, at the spot you were standing                       |
| Open the game with no server running                           | You can still walk around alone; the chat dot is grey/amber                                                           |

## 2. Read what your testers did (reports, chat log)

The game server writes reports, blocks and a short chat log into your Supabase project. There is no admin screen yet (that comes later), so read them in the dashboard:

1. Supabase dashboard, **Table Editor**.
2. `reports`: one row per report, with the reason, the details, the player's name, and `context`, the recent chat nearby.
3. `chat_log`: every chat line, for moderators only. Players cannot read it.
4. `blocks`: who blocked whom.
5. `mod_actions`: to ban or mute someone, add a row (`target_id`, `kind` = `ban` or `mute`, `reason`, optional `expires_at`). A banned player is refused at the next sign-in.

These tables are only written when the server has your Supabase URL and secret key (`apps/server/.env.local`, see `HOSTING.md`). Without them the server runs in memory: everything works, but nothing is kept.

Guests who open the game with your Supabase project configured get a real anonymous account. If a dev guest id is not a real account the server keeps it out of the database.

## 3. Automatic checks

| Command                            | What it proves                                                                                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm check`                       | Lint, types and every unit test (client, server, shared rules, asset tools). Run before any commit                                                                 |
| `pnpm e2e`                         | Starts a server and the game, opens **two real browsers**, and checks they see each other, chat, mute, block, report and reconnect. About a minute                 |
| `E2E_PACKS=1 pnpm e2e`             | The same, and also checks that players appear as real avatars once the packs are downloaded                                                                        |
| `E2E_SHOTS=./shots pnpm e2e`       | The same, saving screenshots to `./shots`                                                                                                                          |
| `bash supabase/tests/run-local.sh` | Runs every database migration on a throwaway Postgres and checks the security rules (nobody but the server can change money or read reports)                       |
| `pnpm check:db`                    | Read-only check of your **live** Supabase project: the tables exist and the security rules hold. Needs `SUPABASE_URL` and `SUPABASE_SECRET_KEY` in the environment |
| `pnpm perf`                        | Draw calls and triangles against the phone budget. Needs `pnpm dev:client` running and built packs                                                                 |

`pnpm e2e` needs the Playwright browsers installed (`npx playwright install chromium`).

## What is not tested yet

- A real 3 GB Android phone (frame rate, memory, heat). Run the game on one and tell me how it feels.
- Google and Apple login: the buttons are in Me, Account, but each provider must be switched on in Supabase first, so they show a plain "not set up yet" message until then.
- Email linking depends on Supabase's email sending. The built-in sender is limited to a few emails an hour; connect your own mail service before inviting testers.
- Hundreds of players at once (Phase 7 load test).
