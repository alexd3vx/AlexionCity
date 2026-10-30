// Draw-call and triangle budget check for the district, on both quality tiers.
//
// Needs a running dev server and built packs:
//   pnpm assets:build && pnpm dev:client      (in another terminal)
//   node tools/perf-check.mjs [--url http://localhost:5173]
//
// Draw calls and triangles do not depend on the machine, so this is a fair check even on a
// computer with no GPU. Frame rate does, so it is printed only as a hint. Run the game with
// ?debug on a real budget phone to see its true frame rate.
import { chromium } from 'playwright';

const url = process.argv.includes('--url')
  ? process.argv[process.argv.indexOf('--url') + 1]
  : 'http://localhost:5173';

/** Proposed budgets. Low is the target for a budget Android with 3 GB of RAM. */
const BUDGETS = {
  low: { calls: 120, triangles: 150_000 },
  high: { calls: 200, triangles: 300_000 },
};

/** Places chosen to be the worst cases: open plaza, a long avenue, a busy crossing, the tower block. */
const SPOTS = {
  plaza: [0, 17],
  'long avenue': [-39, 70],
  'busy corner': [39, -39],
  'tower block': [78, 10],
};

const launchArgs = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
];
const browser = await chromium.launch({
  args: launchArgs,
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
});
let failed = false;

for (const tier of /** @type {const} */ (['low', 'high'])) {
  const page = await (
    await browser.newContext({ viewport: { width: 1100, height: 700 } })
  ).newPage();
  await page.addInitScript((t) => localStorage.setItem('alexion.quality', t), tier);
  await page.goto(`${url}/?t=10:30&autodl`);
  await page.waitForFunction(() => Boolean(window.__world), null, { timeout: 30_000 });
  await page.evaluate(() => window.__world.onState((s) => (window.__state = s)));
  await page.waitForFunction(
    () => window.__state?.look === 'models' && window.__state?.avatars,
    null,
    { timeout: 180_000 },
  );

  console.log(
    `\n${tier.toUpperCase()} tier  (budget: ${BUDGETS[tier].calls} draw calls, ${BUDGETS[tier].triangles / 1000}k triangles)`,
  );
  for (const [name, [x, z]] of Object.entries(SPOTS)) {
    await page.evaluate(([px, pz]) => window.__world.teleport(px, pz), [x, z]);
    await page.waitForTimeout(1500);
    const { calls, triangles } = (await page.evaluate(() => window.__state)).stats;
    const ok = calls <= BUDGETS[tier].calls && triangles <= BUDGETS[tier].triangles;
    failed ||= !ok;
    console.log(
      `  ${ok ? 'ok  ' : 'OVER'} ${name.padEnd(12)} ${String(calls).padStart(4)} calls  ${String(Math.round(triangles / 1000)).padStart(4)}k triangles`,
    );
  }
  await page.close();
}

await browser.close();
console.log(failed ? '\nOver budget.' : '\nWithin budget.');
process.exit(failed ? 1 : 0);
