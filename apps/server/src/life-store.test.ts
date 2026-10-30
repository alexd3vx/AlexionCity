import { describe, expect, it } from 'vitest';
import { InsufficientFunds, MemoryLifeStore, StoreError, SupabaseLifeStore } from './life-store';

const USER = '11111111-1111-4111-8111-111111111111';
const NEEDS = { hunger: 80, energy: 85, mood: 70, hygiene: 85 };

type Call = { url: string; method: string; headers: Record<string, string>; body?: unknown };

function fakeFetch(respond: (call: Call) => { status?: number; json?: unknown; text?: string }) {
  const calls: Call[] = [];
  const fn = (async (url: string, init?: RequestInit) => {
    const call: Call = {
      url,
      method: init?.method ?? 'GET',
      headers: (init?.headers ?? {}) as Record<string, string>,
      ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}),
    };
    calls.push(call);
    const r = respond(call);
    return new Response(r.text ?? (r.json === undefined ? '' : JSON.stringify(r.json)), {
      status: r.status ?? 200,
    });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const store = (respond: Parameters<typeof fakeFetch>[0]) => {
  const f = fakeFetch(respond);
  return { ...f, store: new SupabaseLifeStore('https://x.supabase.co/', 'sb_secret_test', f.fn) };
};

describe('SupabaseLifeStore', () => {
  it('reads a character, home, items and balance in one go and maps the columns', async () => {
    const { store: s, calls } = store((c) => {
      if (c.url.includes('/characters'))
        return {
          json: [
            {
              background: 'loan',
              needs: NEEDS,
              online_seconds: 120,
              job: 'kitchen',
              careers: { kitchen: { level: 1, shifts: 2 } },
              total_shifts: 5,
              unit: 'studio',
              next_due: 3600,
              overdue: 1,
              owing: 425,
              debt: 2850,
              tutorial: { eat: true },
            },
          ],
        };
      if (c.url.includes('/homes'))
        return { json: [{ layout: [{ id: 'a', item: 'bed-single', x: 0, z: 3, rot: 0 }] }] };
      if (c.url.includes('/inventory'))
        return { json: [{ item_id: 'furniture:bed-single', quantity: 1 }] };
      return { json: [{ balance: 1234 }] };
    });
    const life = await s.loadLife(USER);
    expect(life).toMatchObject({
      balance: 1234,
      owned: { 'furniture:bed-single': 1 },
      layout: [{ id: 'a' }],
      character: {
        background: 'loan',
        onlineSeconds: 120,
        job: 'kitchen',
        totalShifts: 5,
        nextDue: 3600,
        owing: 425,
        debt: 2850,
      },
    });
    expect(calls).toHaveLength(4);
    expect(calls.every((c) => c.headers.apikey === 'sb_secret_test' && c.url.includes(USER))).toBe(
      true,
    );
  });

  it('says there is no character yet when the table has no row', async () => {
    const { store: s } = store(() => ({ json: [] }));
    expect(await s.loadLife(USER)).toBeUndefined();
  });

  it('creates a character through the database function, which also pays the starting money', async () => {
    const { store: s, calls } = store(() => ({ json: true }));
    const created = await s.createCharacter(USER, {
      background: 'newcomer',
      money: 400,
      debt: 0,
      unit: 'studio',
      needs: NEEDS,
      nextDue: 3600,
      layout: [{ id: 'a', item: 'bed-single', x: 0, z: 3, rot: 0 }],
      items: [{ item: 'furniture:bed-single', qty: 1 }],
    });
    expect(created).toBe(true);
    expect(calls[0]!.url).toMatch(/\/rpc\/create_character$/);
    expect(calls[0]!.body).toMatchObject({
      p_user: USER,
      p_money: 400,
      p_unit: 'studio',
      p_next_due: 3600,
    });
  });

  it('pays and buys only through the ledger and purchase functions', async () => {
    const { store: s, calls } = store(() => ({ json: 321 }));
    expect(await s.applyLedger(USER, -50, 'a meal', 'order:1')).toBe(321);
    expect(await s.purchase(USER, 'furniture:sofa', 2, 240, 'buy:1')).toBe(321);
    expect(calls.map((c) => c.url.split('/rpc/')[1])).toEqual(['apply_ledger', 'purchase_item']);
    expect(calls[0]!.body).toEqual({
      p_user: USER,
      p_delta: -50,
      p_reason: 'a meal',
      p_ref: 'order:1',
    });
    expect(calls[1]!.body).toEqual({
      p_user: USER,
      p_item: 'furniture:sofa',
      p_qty: 2,
      p_unit_price: 240,
      p_ref: 'buy:1',
    });
  });

  it('turns the database refusing a payment into InsufficientFunds', async () => {
    const { store: s } = store(() => ({
      status: 400,
      text: '{"code":"23514","message":"insufficient_funds"}',
    }));
    await expect(s.applyLedger(USER, -50, 'x', 'r')).rejects.toBeInstanceOf(InsufficientFunds);
    await expect(s.purchase(USER, 'furniture:sofa', 1, 240, 'r')).rejects.toBeInstanceOf(
      InsufficientFunds,
    );
  });

  it('throws, never guesses, when the database fails or cannot be reached', async () => {
    const { store: s } = store(() => ({ status: 500, text: 'boom' }));
    await expect(s.applyLedger(USER, -50, 'x', 'r')).rejects.toBeInstanceOf(StoreError);
    await expect(s.loadLife(USER)).rejects.toBeInstanceOf(StoreError);
    const down = new SupabaseLifeStore('https://x.supabase.co', 'k', (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch);
    await expect(down.applyLedger(USER, 5, 'x', 'r')).rejects.toBeInstanceOf(StoreError);
  });

  it('saves the character and the layout with the secret key', async () => {
    const { store: s, calls } = store(() => ({}));
    await s.saveCharacter(USER, {
      background: 'student',
      needs: NEEDS,
      onlineSeconds: 99.6,
      job: undefined,
      careers: {},
      totalShifts: 2,
      unit: null,
      nextDue: 3600,
      overdue: 3,
      owing: 10,
      debt: 0,
      tutorial: {},
    });
    await s.saveLayout(USER, []);
    expect(calls[0]).toMatchObject({ method: 'PATCH' });
    expect(calls[0]!.body).toMatchObject({
      online_seconds: 100,
      job: null,
      unit: null,
      overdue: 3,
    });
    expect(calls[1]).toMatchObject({ method: 'PATCH', body: { layout: [] } });
  });

  it('reads the statement newest first', async () => {
    const { store: s, calls } = store(() => ({
      json: [
        { delta: -6, balance_after: 94, reason: 'Pizza slice', created_at: '2026-10-30T10:00:00Z' },
      ],
    }));
    expect(await s.statement(USER, 25)).toEqual([
      { at: Date.parse('2026-10-30T10:00:00Z'), delta: -6, balance: 94, reason: 'Pizza slice' },
    ]);
    expect(calls[0]!.url).toMatch(/order=id\.desc&limit=25/);
  });

  it('keeps development guests (not real accounts) in memory and never calls the network', async () => {
    const { store: s, calls } = store(() => ({ status: 500 }));
    await s.createCharacter('guest:abc12345', {
      background: 'newcomer',
      money: 400,
      debt: 0,
      unit: 'studio',
      needs: NEEDS,
      nextDue: 3600,
      layout: [],
      items: [],
    });
    expect((await s.loadLife('guest:abc12345'))?.balance).toBe(400);
    expect(await s.applyLedger('guest:abc12345', -10, 'x', 'r')).toBe(390);
    expect(calls).toHaveLength(0);
  });
});

describe('MemoryLifeStore', () => {
  it('behaves like the database: idempotent refs, no overdrafts, purchases deliver once', async () => {
    const m = new MemoryLifeStore();
    await m.createCharacter('u', {
      background: 'newcomer',
      money: 100,
      debt: 0,
      unit: 'studio',
      needs: NEEDS,
      nextDue: 1,
      layout: [],
      items: [],
    });
    expect(
      await m.createCharacter('u', {
        background: 'loan',
        money: 999,
        debt: 0,
        unit: 'loft',
        needs: NEEDS,
        nextDue: 1,
        layout: [],
        items: [],
      }),
    ).toBe(false);
    expect(await m.applyLedger('u', -30, 'x', 'r1')).toBe(70);
    expect(await m.applyLedger('u', -30, 'x', 'r1')).toBe(70);
    await expect(m.applyLedger('u', -500, 'x', 'r2')).rejects.toBeInstanceOf(InsufficientFunds);
    expect(await m.purchase('u', 'furniture:plant', 1, 35, 'b1')).toBe(35);
    expect(await m.purchase('u', 'furniture:plant', 1, 35, 'b1')).toBe(35);
    expect((await m.loadLife('u'))?.owned['furniture:plant']).toBe(1);
    await expect(m.purchase('u', 'furniture:sofa', 1, 240, 'b2')).rejects.toBeInstanceOf(
      InsufficientFunds,
    );
    expect((await m.loadLife('u'))?.owned['furniture:sofa']).toBeUndefined();
  });
});
