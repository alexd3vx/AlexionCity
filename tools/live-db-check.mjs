// Checks the safety rules on a REAL Supabase project: what a player can and cannot do, and what the
// server can do. Creates one temporary guest, then deletes it.
//
//   SUPABASE_URL=https://xxx.supabase.co SUPABASE_PUBLISHABLE_KEY=sb_publishable_... \
//   SUPABASE_SECRET_KEY=sb_secret_... node tools/live-db-check.mjs
//
// The secret key is read from the environment and never printed or saved.
const { SUPABASE_URL: URL_, SUPABASE_PUBLISHABLE_KEY: PUB, SUPABASE_SECRET_KEY: SEC } = process.env;
if (!URL_ || !PUB || !SEC) {
  console.error('Set SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY.');
  process.exit(2);
}

async function call(method, path, key, { token, body, headers } = {}) {
  const res = await fetch(URL_ + path, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${token ?? key}`,
      'Content-Type': 'application/json',
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

let passed = 0;
let total = 0;
const check = (label, res, ok) => {
  total++;
  const good = ok(res.status, res.json);
  if (good) passed++;
  console.log(`${good ? 'PASS' : 'FAIL'} ${label}  [${res.status}]`);
};
const denied = (s) => s === 401 || s === 403;

const signup = await call('POST', '/auth/v1/signup', PUB, { body: {} });
if (signup.status !== 200) {
  console.error('Could not sign in a guest. Are anonymous sign-ins turned on in Supabase?');
  process.exit(1);
}
const token = signup.json.access_token;
const uid = signup.json.user.id;
const player = { token };

check(
  'player reads their own profile',
  await call('GET', '/rest/v1/profiles?select=id', PUB, player),
  (s, b) => s === 200 && b.length === 1 && b[0].id === uid,
);
check(
  'player sees only their own wallet',
  await call('GET', '/rest/v1/wallets?select=balance', PUB, player),
  (s, b) => s === 200 && b.length === 1 && b[0].balance === 0,
);
check(
  'player CANNOT change their wallet',
  await call('PATCH', `/rest/v1/wallets?user_id=eq.${uid}`, PUB, {
    ...player,
    body: { balance: 999999 },
  }),
  (s) => denied(s),
);
check(
  'player CANNOT write the ledger',
  await call('POST', '/rest/v1/ledger', PUB, {
    ...player,
    body: { user_id: uid, delta: 50, balance_after: 50, reason: 'cheat' },
  }),
  (s) => denied(s),
);
check(
  'player CANNOT call apply_ledger',
  await call('POST', '/rest/v1/rpc/apply_ledger', PUB, {
    ...player,
    body: { p_user: uid, p_delta: 100, p_reason: 'cheat' },
  }),
  (s) => denied(s) || s === 404,
);
for (const table of ['reports', 'chat_log', 'mod_actions'])
  check(`player CANNOT read ${table}`, await call('GET', `/rest/v1/${table}`, PUB, player), (s) =>
    denied(s),
  );
check(
  'player can set their display name',
  await call('PATCH', `/rest/v1/profiles?id=eq.${uid}`, PUB, {
    ...player,
    body: { display_name: 'Test Guest' },
    headers: { Prefer: 'return=representation' },
  }),
  (s, b) => s === 200 && b[0].display_name === 'Test Guest',
);

const pay = { body: { p_user: uid, p_delta: 100, p_reason: 'live-check', p_ref: 'live-check-1' } };
check(
  'server CAN pay the player',
  await call('POST', '/rest/v1/rpc/apply_ledger', SEC, pay),
  (s, b) => s === 200 && b === 100,
);
check(
  'a retry with the same ref pays only once',
  await call('POST', '/rest/v1/rpc/apply_ledger', SEC, pay),
  (s, b) => s === 200 && b === 100,
);
check(
  'player sees the balance and one ledger row',
  await call('GET', '/rest/v1/wallets?select=balance', PUB, player),
  (s, b) => s === 200 && b[0].balance === 100,
);

// ---- Phase 3: characters, homes and purchases --------------------------------------------------
const start = {
  body: {
    p_user: uid,
    p_background: 'newcomer',
    p_money: 400,
    p_debt: 0,
    p_unit: 'studio',
    p_needs: { hunger: 80, energy: 85, mood: 70, hygiene: 85 },
    p_next_due: 3600,
    p_layout: [{ id: 'a1', item: 'bed-single', x: 0, z: 3, rot: 0 }],
    p_items: [{ item: 'furniture:bed-single', qty: 1 }],
  },
};
check(
  'player CANNOT create a character for themselves',
  await call('POST', '/rest/v1/rpc/create_character', PUB, { ...player, ...start }),
  (s) => denied(s) || s === 404,
);
check(
  'player CANNOT buy for free',
  await call('POST', '/rest/v1/rpc/purchase_item', PUB, {
    ...player,
    body: { p_user: uid, p_item: 'furniture:sofa', p_qty: 1, p_unit_price: 1, p_ref: 'cheat' },
  }),
  (s) => denied(s) || s === 404,
);
check(
  'server CAN create the character, with starting money',
  await call('POST', '/rest/v1/rpc/create_character', SEC, start),
  (s, b) => s === 200 && b === true,
);
check(
  'creating twice changes nothing',
  await call('POST', '/rest/v1/rpc/create_character', SEC, start),
  (s, b) => s === 200 && b === false,
);
check(
  'player reads their own character',
  await call('GET', '/rest/v1/characters?select=background,unit,next_due', PUB, player),
  (s, b) => s === 200 && b.length === 1 && b[0].background === 'newcomer' && b[0].unit === 'studio',
);
check(
  'player reads their own home',
  await call('GET', '/rest/v1/homes?select=layout', PUB, player),
  (s, b) => s === 200 && b.length === 1 && b[0].layout.length === 1,
);
check(
  'player CANNOT edit their character',
  await call('PATCH', `/rest/v1/characters?user_id=eq.${uid}`, PUB, {
    ...player,
    body: { needs: { hunger: 100, energy: 100, mood: 100, hygiene: 100 }, owing: 0 },
  }),
  (s) => denied(s),
);
check(
  'player CANNOT edit their home or inventory',
  await call('PATCH', `/rest/v1/homes?user_id=eq.${uid}`, PUB, { ...player, body: { layout: [] } }),
  (s) => denied(s),
);
check(
  'player CANNOT add to their inventory',
  await call('POST', '/rest/v1/inventory', PUB, {
    ...player,
    body: { user_id: uid, item_id: 'furniture:gold-throne', quantity: 99 },
  }),
  (s) => denied(s),
);
const buy = {
  body: { p_user: uid, p_item: 'furniture:plant', p_qty: 2, p_unit_price: 35, p_ref: 'live-buy-1' },
};
check(
  'server CAN sell an item: charged and delivered together',
  await call('POST', '/rest/v1/rpc/purchase_item', SEC, buy),
  (s, b) => s === 200 && b === 100 + 400 - 70,
);
check(
  'a retry of the same purchase neither charges nor delivers twice',
  await call('POST', '/rest/v1/rpc/purchase_item', SEC, buy),
  (s, b) => s === 200 && b === 100 + 400 - 70,
);
check(
  'player sees exactly two plants',
  await call('GET', '/rest/v1/inventory?item_id=eq.furniture:plant&select=quantity', PUB, player),
  (s, b) => s === 200 && b.length === 1 && b[0].quantity === 2,
);
check(
  'a purchase the player cannot afford is refused and delivers nothing',
  await call('POST', '/rest/v1/rpc/purchase_item', SEC, {
    body: {
      p_user: uid,
      p_item: 'furniture:sofa',
      p_qty: 1,
      p_unit_price: 99999,
      p_ref: 'live-buy-2',
    },
  }),
  (s, b) => s === 400 && JSON.stringify(b).includes('insufficient_funds'),
);
check(
  'player still has no sofa and the same balance',
  await call('GET', '/rest/v1/wallets?select=balance', PUB, player),
  (s, b) => s === 200 && b[0].balance === 430,
);

const deleted = await call('DELETE', `/auth/v1/admin/users/${uid}`, SEC);
check('server deletes the test account', deleted, (s) => s === 200 || s === 204);
check(
  'its character and home are gone with it',
  await call('GET', `/rest/v1/characters?user_id=eq.${uid}&select=user_id`, SEC),
  (s, b) => s === 200 && b.length === 0,
);
check(
  'its profile is gone with it',
  await call('GET', `/rest/v1/profiles?id=eq.${uid}&select=id`, SEC),
  (s, b) => s === 200 && b.length === 0,
);

console.log(`\n${passed}/${total} checks passed`);
process.exit(passed === total ? 0 : 1);
