// Shared pieces for the end-to-end checks: start a game server (memory store, dev guests) and the game
// page, open real browsers, and report results. Nothing here needs setup beyond `pnpm install`.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

export const SERVER_PORT = 8791;
export const CLIENT_PORT = 5199;
export const shots = process.env.E2E_SHOTS;
if (shots) mkdirSync(shots, { recursive: true });
export const withPacks = Boolean(process.env.E2E_PACKS);

const children = new Set();
function run(cmd, args, env) {
  const child = spawn(cmd, args, {
    env: { ...process.env, ...env },
    stdio: process.env.E2E_VERBOSE ? 'inherit' : 'ignore',
    detached: true,
  });
  children.add(child);
  return child;
}
export function stop(child) {
  children.delete(child);
  try {
    process.kill(-child.pid);
  } catch {
    // already gone
  }
}
export const stopAll = () => [...children].forEach(stop);

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
export const failed = () => failures;
export async function step(name, fn) {
  try {
    await fn();
    console.log(`  ok   ${name}`);
  } catch (e) {
    failures++;
    console.log(`  FAIL ${name}\n       ${String(e.message).split('\n')[0]}`);
  }
}

/** Start the game server and page. `serverEnv` tunes the server, for example a faster life clock. */
export async function startStack({ serverEnv = {} } = {}) {
  const startServer = () =>
    run('pnpm', ['--filter', '@alexioncity/server', 'exec', 'tsx', 'src/index.ts'], {
      PORT: String(SERVER_PORT),
      ALLOW_DEV_GUESTS: '1',
      SUPABASE_URL: '',
      SUPABASE_SECRET_KEY: '',
      ...serverEnv,
    });
  const stack = { server: startServer(), startServer };
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
  stack.browser = await chromium.launch({
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
    ],
  });
  return stack;
}

/** Open the game as a new guest with this name and wait until the city has accepted them. */
export async function join(browser, name, { query = '' } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 780 } });
  await context.addInitScript((n) => localStorage.setItem('alexion.name', n), name);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.errors = errors;
  await page.goto(`http://localhost:${CLIENT_PORT}/?t=12:00${withPacks ? '&autodl' : ''}${query}`);
  await page.getByRole('button', { name: /^Chat, Online/ }).waitFor({ timeout: 30_000 });
  return page;
}

export function finish(label) {
  stopAll();
  console.log(failures === 0 ? `\nALL ${label} CHECKS PASSED` : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

export function fail(e) {
  failures++;
  console.error(e);
}
