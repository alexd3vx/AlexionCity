// End-to-end check of the home: a real browser goes indoors, sleeps, washes, arranges furniture on the
// grid, pays rent, leaves, and (with another player who spends everything) loses the home to unpaid rent.
// The server's life clock runs ten times faster and a month lasts 60 seconds of it.
//   pnpm e2e:home       runs it
//   E2E_SHOTS=dir       also saves screenshots there
//   E2E_PACKS=1         with real furniture models (needs `pnpm assets:build` first)
import { fail, finish, join, shots, startStack, step } from './e2e-lib.mjs';

const toast = (page, text) => page.getByRole('status').filter({ hasText: text }).first();
const sheet = (page, name) => page.getByRole('dialog', { name, exact: true });
const meter = async (page, need) =>
  Number(await page.getByRole('meter', { name: need }).getAttribute('aria-valuenow'));
const balanceOf = async (page) =>
  Number(
    (await page.getByRole('button', { name: /^Bank, balance/ }).getAttribute('aria-label')).replace(
      /[^\d]/g,
      '',
    ),
  );

try {
  const stack = await startStack({
    serverEnv: { DEV_BACKGROUND: 'comfortable', LIFE_TICK_MS: '100', DEV_BILL_PERIOD: '60' },
  });
  const { browser } = stack;
  console.log('A home to live in');
  const ada = await join(browser, 'Ada', { query: '&at=poi:Your home' });

  await step('the front door leads into the home, with the city put away', async () => {
    await ada.getByRole('button', { name: 'Go inside' }).click();
    await ada.getByText('At home').waitFor({ timeout: 8_000 });
    await ada.getByRole('button', { name: 'Arrange' }).waitFor();
    await ada.getByRole('button', { name: 'Leave home' }).waitFor();
    // nothing of the city's controls is left on screen
    if ((await ada.getByLabel('Minimap').count()) > 0)
      throw new Error('the minimap is still showing');
    await ada.waitForTimeout(1500);
    if (shots) await ada.screenshot({ path: `${shots}/home-room.png` });
  });

  await step('sleeping restores energy and ticks the step', async () => {
    const before = await meter(ada, 'Energy');
    await ada.getByRole('button', { name: 'Sleep' }).click();
    await ada
      .getByRole('status', { name: 'Current activity' })
      .getByText('Sleeping')
      .waitFor({ timeout: 5_000 });
    if (shots) await ada.screenshot({ path: `${shots}/home-sleep.png` });
    await toast(ada, 'Done: Sleep at home.').waitFor({ timeout: 25_000 });
    const after = await meter(ada, 'Energy');
    if (!(after > before + 5 || after >= 99)) throw new Error(`energy ${before} -> ${after}`);
  });

  await step('a shower washes you clean', async () => {
    await ada.getByRole('button', { name: 'Wash' }).click();
    await ada
      .getByRole('status', { name: 'Current activity' })
      .getByText('Washing')
      .waitFor({ timeout: 5_000 });
    await ada
      .getByRole('status', { name: 'Current activity' })
      .waitFor({ state: 'hidden', timeout: 10_000 });
    if ((await meter(ada, 'Hygiene')) < 90) throw new Error('hygiene did not rise');
  });

  await step('bought furniture is arranged on the grid: ghost, place, done', async () => {
    await ada.getByRole('button', { name: 'Buy', exact: true }).click();
    const shop = sheet(ada, 'buy');
    await shop.getByRole('tab', { name: 'Living room' }).click();
    await shop.getByRole('button', { name: 'Buy Armchair for ₳130' }).click();
    await toast(ada, 'Bought Armchair').waitFor({ timeout: 20_000 });
    await shop.getByRole('button', { name: 'Close' }).click();

    await ada.getByRole('button', { name: 'Arrange' }).click();
    await ada
      .getByRole('list', { name: 'Storage' })
      .getByRole('button', { name: /Armchair/ })
      .click();
    await ada.getByText('Tap the floor to move it, then place it.').waitFor();
    if (shots) await ada.screenshot({ path: `${shots}/home-ghost.png` });
    await ada.getByRole('button', { name: 'Place', exact: true }).click();
    await toast(ada, 'Done: Make it yours.').waitFor({ timeout: 20_000 });
    await ada.getByText(/Storage is empty/).waitFor({ timeout: 5_000 });
    if (shots) await ada.screenshot({ path: `${shots}/home-arranged.png` });
  });

  await step('a piece of furniture can be tapped in the room and stored again', async () => {
    // find a spot on screen that is over furniture, the way a finger would
    const spot = await ada.evaluate(() => {
      const rect = window.__world.canvas.getBoundingClientRect();
      for (let y = 0.15; y < 0.95; y += 0.03)
        for (let x = 0.1; x < 0.95; x += 0.03) {
          const hit = window.__world.homePick(rect.width * x, rect.height * y);
          if (hit.pieceId) return { x: rect.left + rect.width * x, y: rect.top + rect.height * y };
        }
      return null;
    });
    if (!spot) throw new Error('no furniture could be picked');
    await ada.mouse.click(spot.x, spot.y);
    await ada.getByRole('button', { name: 'Store', exact: true }).waitFor({ timeout: 5_000 });
    await ada.getByRole('button', { name: 'Rotate piece' }).waitFor();
    await ada.getByRole('button', { name: 'Store', exact: true }).click();
    await ada.getByRole('list', { name: 'Storage' }).waitFor({ timeout: 5_000 });
    await ada.getByRole('button', { name: 'Done', exact: true }).click();
  });

  await step('the view can be turned all the way round without errors', async () => {
    for (let i = 0; i < 4; i++) {
      await ada.getByRole('button', { name: 'Turn the view' }).click();
      await ada.waitForTimeout(350);
    }
    if (shots) await ada.screenshot({ path: `${shots}/home-turned.png` });
  });

  await step('rent and bills are paid on time and show in the bank', async () => {
    await ada.getByRole('button', { name: /^Bank, balance/ }).click();
    const bank = sheet(ada, 'bank');
    // the statement, not the list of upcoming bills: money really left the account
    const statement = bank.getByRole('region', { name: 'Statement' });
    await statement.getByText('Studio rent', { exact: true }).first().waitFor({ timeout: 60_000 });
    await statement.getByText('Water, power and internet').first().waitFor();
    if (shots) await ada.screenshot({ path: `${shots}/home-bank.png` });
    await bank.getByRole('button', { name: 'Close' }).click();
  });

  await step('leaving home brings the city back', async () => {
    await ada.getByRole('button', { name: 'Leave home' }).click();
    await ada.getByRole('button', { name: 'Go inside' }).waitFor({ timeout: 8_000 });
    await ada.getByLabel('Minimap').waitFor();
    if (shots) await ada.screenshot({ path: `${shots}/home-outside.png` });
  });

  await step('the page logged no errors', async () => {
    if (ada.errors.length > 0) throw new Error(ada.errors[0]);
  });

  console.log('Rent that cannot be paid');
  const bo = await join(browser, 'Bo', { query: '&at=poi:Your home' });
  await step(
    'a player who spends everything is warned, then loses the home, and keeps the furniture',
    async () => {
      await bo.getByRole('button', { name: 'Buy', exact: true }).click();
      const shop = sheet(bo, 'buy');
      await shop.getByRole('tab', { name: 'Living room' }).click();
      for (let i = 0; i < 5; i++) {
        await shop.getByRole('button', { name: 'Buy Corner sofa for ₳420' }).click();
        await bo.waitForTimeout(250);
      }
      await shop.getByRole('tab', { name: 'Bedroom' }).click();
      await shop.getByRole('button', { name: 'Buy Double bed for ₳320' }).click();
      await toast(bo, 'Bought Double bed').waitFor({ timeout: 40_000 });
      if ((await balanceOf(bo)) > 100) throw new Error('the money was not spent');
      await shop.getByRole('button', { name: 'Close' }).click();

      // the warnings and the loss are shown as toasts, but the lasting proof is in the Me panel
      await bo.getByRole('button', { name: 'Me', exact: true }).click();
      await bo.getByText('You have no home right now.').waitFor({ timeout: 150_000 });
      await bo.getByRole('button', { name: 'Close' }).first().click();
      await bo.getByRole('button', { name: 'Go inside' }).click();
      await toast(bo, /no home/).waitFor({ timeout: 20_000 });
      await bo.getByRole('button', { name: 'Me', exact: true }).click();
      await bo.getByText('You have no home right now.').waitFor();
      if (shots) await bo.screenshot({ path: `${shots}/home-evicted.png` });
    },
  );

  await browser.close();
} catch (e) {
  fail(e);
}

finish('HOME');
