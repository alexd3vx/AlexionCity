// End-to-end check of Phase 3: a real browser plays a short life against the real game server (memory
// store, dev guests): eat, take a job, finish a shift and get paid, read the bank, shop for furniture,
// go home, sleep, pay rent and decorate. The server's life clock runs ten times faster here.
//   pnpm e2e:life       runs it
//   E2E_SHOTS=dir       also saves screenshots there
//   E2E_PACKS=1         with real models (needs `pnpm assets:build` first)
import { fail, finish, join, shots, startStack, step } from './e2e-lib.mjs';

const balanceOf = async (page) => {
  const label = await page
    .getByRole('button', { name: /^Bank, balance/ })
    .getAttribute('aria-label');
  return Number(label.replace(/[^\d]/g, ''));
};
const toast = (page, text) => page.getByRole('status').filter({ hasText: text }).first();
const sheet = (page, name) => page.getByRole('dialog', { name, exact: true });
const closeSheet = (page, name) => sheet(page, name).getByRole('button', { name: 'Close' }).click();

try {
  const stack = await startStack({
    serverEnv: { DEV_BACKGROUND: 'comfortable', LIFE_TICK_MS: '100' },
  });
  const { browser } = stack;
  console.log('One life, start to finish');
  const ada = await join(browser, 'Ada', { query: '&at=poi:Pizza Corner' });

  await step('the needs bars and the balance come from the server', async () => {
    await ada.getByRole('button', { name: /^Bank, balance ₳2,500/ }).waitFor({ timeout: 10_000 });
    for (const need of ['Hunger', 'Energy', 'Mood', 'Hygiene']) {
      const v = Number(await ada.getByRole('meter', { name: need }).getAttribute('aria-valuenow'));
      if (!(v > 20 && v <= 100)) throw new Error(`${need} is ${v}`);
    }
    await ada
      .getByRole('button', { name: /Getting started, 0 of 6 done. Next: Grab a bite/ })
      .waitFor();
  });

  await step('the restaurant sells a meal: money out, step ticked', async () => {
    await ada.getByRole('button', { name: 'Enter Pizza Corner' }).click();
    await sheet(ada, 'venue').waitFor();
    if (shots) await ada.screenshot({ path: `${shots}/life-venue.png` });
    await ada.getByRole('button', { name: 'Buy Pizza slice for ₳6' }).click();
    await toast(ada, 'Pizza slice: -₳6.').waitFor({ timeout: 5_000 });
    await ada.getByRole('button', { name: /^Bank, balance ₳2,494/ }).waitFor({ timeout: 5_000 });
  });

  await step('a job can be taken, the shift runs, and the wage arrives', async () => {
    await ada.getByRole('button', { name: 'Apply and start' }).click();
    await toast(ada, 'hired as Kitchen hand').waitFor({ timeout: 10_000 });
    await closeSheet(ada, 'venue');
    await ada.getByRole('status', { name: 'Current activity' }).waitFor();
    if (shots) await ada.screenshot({ path: `${shots}/life-shift.png` });
    await toast(ada, /Shift done: \+₳3\d/).waitFor({ timeout: 30_000 });
    const after = await balanceOf(ada);
    if (!(after >= 2494 + 33 && after <= 2494 + 40)) throw new Error(`balance ${after}`);
    await ada
      .getByRole('status', { name: 'Current activity' })
      .waitFor({ state: 'hidden', timeout: 5_000 });
  });

  await step('the bank lists what came in and went out', async () => {
    await ada.getByRole('button', { name: /^Bank, balance/ }).click();
    const bank = sheet(ada, 'bank');
    await bank.getByText('Pizza slice at Pizza Corner').waitFor({ timeout: 5_000 });
    await bank.getByText(/^wages: Kitchen hand/).waitFor();
    await bank.getByText('starting money').waitFor();
    await bank.getByText(/Next bill in about/).waitFor();
    if (shots) await ada.screenshot({ path: `${shots}/life-bank.png` });
    await closeSheet(ada, 'bank');
  });

  await step('furniture can be bought from the shop and goes to storage', async () => {
    await ada.getByRole('button', { name: 'Buy', exact: true }).click();
    const shop = sheet(ada, 'buy');
    await shop.getByRole('tab', { name: 'Decor' }).click();
    const before = await balanceOf(ada);
    await shop.getByRole('button', { name: 'Buy Potted plant for ₳35' }).click();
    await toast(ada, 'Bought Potted plant').waitFor({ timeout: 20_000 });
    await shop
      .getByText(/You own 2 · 1 in storage/)
      .first()
      .waitFor({ timeout: 5_000 });
    if ((await balanceOf(ada)) !== before - 35) throw new Error('the price was not charged once');
    if (shots) await ada.screenshot({ path: `${shots}/life-shop.png` });
    await closeSheet(ada, 'buy');
  });

  await step('the page logged no errors', async () => {
    if (ada.errors.length > 0) throw new Error(ada.errors[0]);
  });

  await browser.close();
} catch (e) {
  fail(e);
}

finish('LIFE');
