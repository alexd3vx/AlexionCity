// End-to-end check of Phase 2: two real browsers join the same channel and must see and chat with
// each other. Starts its own game server (memory store, dev guests) and client, so it needs no setup.
//   pnpm e2e            runs it
//   E2E_SHOTS=dir       also saves screenshots there
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const SERVER_PORT = 8791;
const CLIENT_PORT = 5199;
const shots = process.env.E2E_SHOTS;
if (shots) mkdirSync(shots, { recursive: true });

const children = new Set();
function run(cmd, args, env) {
  const child = spawn(cmd, args, {
    env: { ...process.env, ...env },
    stdio: 'ignore',
    detached: true,
  });
  children.add(child);
  return child;
}
function stop(child) {
  children.delete(child);
  try {
    process.kill(-child.pid);
  } catch {
    // already gone
  }
}
const stopAll = () => [...children].forEach(stop);

async function waitFor(url, what, ms = 60_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`${what} did not start`);
}

let failures = 0;
async function step(name, fn) {
  try {
    await fn();
    console.log(`  ok   ${name}`);
  } catch (e) {
    failures++;
    console.log(`  FAIL ${name}\n       ${String(e.message).split('\n')[0]}`);
  }
}

const withPacks = Boolean(process.env.E2E_PACKS);

async function join(browser, name) {
  const context = await browser.newContext({ viewport: { width: 390, height: 780 } });
  await context.addInitScript((n) => localStorage.setItem('alexion.name', n), name);
  const page = await context.newPage();
  await page.goto(`http://localhost:${CLIENT_PORT}/?t=12:00${withPacks ? '&autodl' : ''}`);
  await page.getByRole('button', { name: /^Chat, Online/ }).waitFor({ timeout: 30_000 });
  return page;
}

const tag = (page, name) => page.locator('div', { hasText: new RegExp(`^${name}$`) }).last();

async function say(page, text) {
  await page.getByRole('button', { name: /^Chat,/ }).click();
  await page.getByLabel('Message').fill(text);
  await page.getByRole('button', { name: 'Send' }).click();
  await page.getByRole('dialog', { name: 'chat' }).getByRole('button', { name: 'Close' }).click();
}

try {
  const startServer = () =>
    run('pnpm', ['--filter', '@alexioncity/server', 'exec', 'tsx', 'src/index.ts'], {
      PORT: String(SERVER_PORT),
      ALLOW_DEV_GUESTS: '1',
      SUPABASE_URL: '',
      SUPABASE_SECRET_KEY: '',
    });
  let server = startServer();
  run(
    'pnpm',
    [
      '--filter',
      '@alexioncity/client',
      'exec',
      'vite',
      '--port',
      String(CLIENT_PORT),
      '--strictPort',
    ],
    {
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_PUBLISHABLE_KEY: '',
      VITE_GAME_WS_URL: `ws://localhost:${SERVER_PORT}`,
    },
  );
  await waitFor(`http://localhost:${SERVER_PORT}/healthz`, 'game server');
  await waitFor(`http://localhost:${CLIENT_PORT}/`, 'client');

  const browser = await chromium.launch({
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
    ],
  });
  console.log('Two players in one channel');
  const ada = await join(browser, 'Ada');
  const bo = await join(browser, 'Bo');

  await step("each player sees the other's name tag", async () => {
    await tag(ada, 'Bo').waitFor({ timeout: 15_000 });
    await tag(bo, 'Ada').waitFor({ timeout: 15_000 });
  });

  if (withPacks) {
    // needs `pnpm assets:build` first; proves players see each other's real avatars, not just capsules
    await step('players are drawn as real avatars once packs are downloaded', async () => {
      // walk a few steps ahead so the two do not stand on the same spot (the server would undo a teleport)
      await ada.keyboard.down('w');
      await ada.waitForTimeout(1400);
      await ada.keyboard.up('w');
      await bo.waitForFunction(
        () => new Promise((resolve) => window.__world.onState((st) => st.avatars && resolve(true))),
        null,
        { timeout: 90_000 },
      );
      await bo.waitForTimeout(6000);
      if (shots) await bo.screenshot({ path: `${shots}/bo-sees-real-ada.png` });
    });
  }

  await step(
    'a message shows as a bubble and in the chat history for the other player',
    async () => {
      await say(ada, 'Hello Bo, welcome to town');
      await ada.getByText('Hello Bo, welcome to town').first().waitFor({ timeout: 8_000 });
      await bo.getByText('Hello Bo, welcome to town').first().waitFor({ timeout: 8_000 });
      await bo.getByRole('button', { name: /^Chat,.*1 new/ }).waitFor({ timeout: 5_000 });
    },
  );

  if (shots) await bo.screenshot({ path: `${shots}/bo-sees-ada.png` });

  await step(
    'a blocked word is refused with a notice and never reaches the other player',
    async () => {
      await say(ada, 'you are a fuck');
      await ada
        .getByRole('status')
        .filter({ hasText: /keep chat friendly/ })
        .first()
        .waitFor({ timeout: 5_000 });
      if ((await bo.getByText('you are a fuck').count()) > 0)
        throw new Error('the message was delivered');
    },
  );

  await step('a player can be reported from their name tag', async () => {
    await tag(bo, 'Ada').click();
    await bo.getByRole('button', { name: 'Report' }).click();
    await bo.getByRole('radio', { name: 'Spam or advertising' }).click();
    await bo.getByRole('button', { name: 'Send report' }).click();
    await bo.getByText('Thanks. The team will take a look.').waitFor({ timeout: 5_000 });
  });

  await step("muting hides that player's chat for the muter only", async () => {
    await tag(bo, 'Ada').click();
    await bo.getByRole('button', { name: /^Mute chat/ }).click();
    await say(ada, 'can you hear me');
    await ada.getByText('can you hear me').first().waitFor({ timeout: 5_000 });
    await bo.waitForTimeout(1200);
    if ((await bo.getByText('can you hear me').count()) > 0)
      throw new Error('muted message was shown');
  });

  await step('blocking hides the player, lists them under Me, and can be undone', async () => {
    await tag(bo, 'Ada').click();
    await bo.getByRole('button', { name: /^Block/ }).click();
    await tag(bo, 'Ada').waitFor({ state: 'hidden', timeout: 8_000 });
    await bo.getByRole('button', { name: 'Me', exact: true }).click();
    await bo
      .getByRole('region', { name: 'Blocked players' })
      .getByText('Ada')
      .waitFor({ timeout: 5_000 });
    await bo.getByRole('button', { name: 'Unblock' }).click();
    await bo
      .getByRole('region', { name: 'Blocked players' })
      .getByText('Nobody.')
      .waitFor({ timeout: 5_000 });
    await bo.getByRole('dialog', { name: 'me' }).getByRole('button', { name: 'Close' }).click();
    await tag(bo, 'Ada').waitFor({ timeout: 8_000 });
  });

  await step('leaving removes the tag for the other player', async () => {
    await ada.context().close();
    await tag(bo, 'Ada').waitFor({ state: 'hidden', timeout: 8_000 });
  });

  await step('the game reconnects by itself when the server comes back', async () => {
    const back = await join(browser, 'Cy');
    stop(server);
    await back.getByText('Reconnecting to the city…').waitFor({ timeout: 15_000 });
    server = startServer();
    await back.getByRole('button', { name: /^Chat, Online/ }).waitFor({ timeout: 40_000 });
  });

  await browser.close();
} catch (e) {
  failures++;
  console.error(e);
} finally {
  stopAll();
}

console.log(failures === 0 ? '\nALL MULTIPLAYER CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
