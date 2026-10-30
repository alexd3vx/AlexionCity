// End-to-end check of Phase 2: two real browsers join the same channel and must see and chat with
// each other. Starts its own game server (memory store, dev guests) and client, so it needs no setup.
//   pnpm e2e            runs it
//   E2E_SHOTS=dir       also saves screenshots there
//   E2E_PACKS=1         also checks real avatars (needs `pnpm assets:build` first)
import {
  fail,
  finish,
  join as joinGame,
  shots,
  startStack,
  step,
  stop,
  withPacks,
} from './e2e-lib.mjs';

const tag = (page, name) => page.locator('div', { hasText: new RegExp(`^${name}$`) }).last();

async function say(page, text) {
  await page.getByRole('button', { name: /^Chat,/ }).click();
  await page.getByLabel('Message').fill(text);
  await page.getByRole('button', { name: 'Send' }).click();
  await page.getByRole('dialog', { name: 'chat' }).getByRole('button', { name: 'Close' }).click();
}

try {
  const stack = await startStack();
  const { browser } = stack;
  const join = (b, name) => joinGame(b, name);
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
    stop(stack.server);
    await back.getByText('Reconnecting to the city…').waitFor({ timeout: 15_000 });
    stack.server = stack.startServer();
    await back.getByRole('button', { name: /^Chat, Online/ }).waitFor({ timeout: 40_000 });
  });

  await browser.close();
} catch (e) {
  fail(e);
}

finish('MULTIPLAYER');
