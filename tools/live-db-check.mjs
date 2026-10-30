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

const deleted = await call('DELETE', `/auth/v1/admin/users/${uid}`, SEC);
check('server deletes the test account', deleted, (s) => s === 200 || s === 204);
check(
  'its profile is gone with it',
  await call('GET', `/rest/v1/profiles?id=eq.${uid}&select=id`, SEC),
  (s, b) => s === 200 && b.length === 0,
);

console.log(`\n${passed}/${total} checks passed`);
process.exit(passed === total ? 0 : 1);
