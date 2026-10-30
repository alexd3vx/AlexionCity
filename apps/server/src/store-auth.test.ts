import { describe, expect, it } from 'vitest';
import { createDevVerifier, createSupabaseVerifier, verifierFromEnv } from './auth';
import { SupabaseStore, isUuid } from './store';

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';

type Call = { url: string; method: string; headers: Record<string, string>; body?: unknown };

function fakeFetch(
  respond: (call: Call) => { status?: number; json?: unknown } = () => ({ json: [] }),
) {
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
    return new Response(r.json === undefined ? '' : JSON.stringify(r.json), {
      status: r.status ?? 200,
    });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe('SupabaseStore', () => {
  const make = (respond?: Parameters<typeof fakeFetch>[0]) => {
    const f = fakeFetch(respond);
    const warnings: string[] = [];
    return {
      store: new SupabaseStore('https://x.supabase.co/', 'sb_secret_test', f.fn, (m) =>
        warnings.push(m),
      ),
      calls: f.calls,
      warnings,
    };
  };

  it('authenticates with the secret key on every request', async () => {
    const { store, calls } = make();
    await store.loadBlocks(UUID_A);
    expect(calls[0]?.headers).toMatchObject({
      apikey: 'sb_secret_test',
      Authorization: 'Bearer sb_secret_test',
    });
    expect(calls[0]?.url).toBe(
      `https://x.supabase.co/rest/v1/blocks?blocker_id=eq.${UUID_A}&select=blocked_id,blocked_name`,
    );
  });

  it('reads the display name and the blocks', async () => {
    const { store } = make((c) => ({
      json: c.url.includes('/profiles')
        ? [{ display_name: 'Ada' }]
        : [{ blocked_id: UUID_B, blocked_name: 'Bola' }],
    }));
    expect(await store.loadProfile(UUID_A)).toEqual({ displayName: 'Ada' });
    expect(await store.loadBlocks(UUID_A)).toEqual([{ blockedId: UUID_B, name: 'Bola' }]);
  });

  it('writes a block, ignoring duplicates, and deletes it', async () => {
    const { store, calls } = make();
    await store.addBlock(UUID_A, UUID_B, 'Bola');
    await store.removeBlock(UUID_A, UUID_B);
    expect(calls[0]).toMatchObject({
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates' },
      body: { blocker_id: UUID_A, blocked_id: UUID_B, blocked_name: 'Bola' },
    });
    expect(calls[1]).toMatchObject({ method: 'DELETE' });
    expect(calls[1]?.url).toContain(`blocker_id=eq.${UUID_A}&blocked_id=eq.${UUID_B}`);
  });

  it('saves a report and the chat log in the shape the tables expect', async () => {
    const { store, calls } = make();
    await store.saveReport({
      reporterId: UUID_A,
      targetId: UUID_B,
      targetName: 'Bola',
      reason: 'spam',
      details: 'd',
      channel: 'downtown-1',
      context: [],
      at: 1000,
    });
    await store.logChat([
      { channel: 'downtown-1', userId: UUID_A, name: 'Ada', text: 'hi', at: 2000 },
    ]);
    expect(calls[0]?.body).toMatchObject({
      reporter_id: UUID_A,
      target_id: UUID_B,
      reason: 'spam',
      created_at: '1970-01-01T00:00:01.000Z',
    });
    expect(calls[1]?.body).toEqual([
      {
        channel: 'downtown-1',
        user_id: UUID_A,
        name: 'Ada',
        text: 'hi',
        created_at: '1970-01-01T00:00:02.000Z',
      },
    ]);
  });

  it('turns active moderation actions into sanctions', async () => {
    const { store } = make(() => ({
      json: [
        { kind: 'ban', reason: 'spam', expires_at: null },
        { kind: 'mute', reason: 'rude', expires_at: '2030-01-01T00:00:00Z' },
      ],
    }));
    expect(await store.loadSanctions(UUID_A)).toEqual([
      { kind: 'ban', reason: 'spam', until: null },
      { kind: 'mute', reason: 'rude', until: Date.parse('2030-01-01T00:00:00Z') },
    ]);
  });

  it('does not call the database for dev guests who have no real account', async () => {
    const { store, calls } = make();
    expect(await store.loadBlocks('guest:abc')).toEqual([]);
    await store.addBlock('guest:abc', UUID_B, 'x');
    expect(calls).toHaveLength(0);
  });

  it('survives a failing database: logs and carries on', async () => {
    const { store, warnings } = make(() => ({ status: 404, json: { message: 'no table' } }));
    expect(await store.loadBlocks(UUID_A)).toEqual([]);
    await store.logChat([{ channel: 'c', userId: UUID_A, name: 'A', text: 't', at: 1 }]);
    expect(warnings.length).toBe(2);
  });

  it('recognises UUIDs', () => {
    expect(isUuid(UUID_A)).toBe(true);
    expect(isUuid('guest:abc')).toBe(false);
  });
});

describe('verifiers', () => {
  it('Supabase verifier returns the user a token belongs to', async () => {
    const f = fakeFetch(() => ({ json: { id: UUID_A, is_anonymous: true } }));
    const v = createSupabaseVerifier({ url: 'https://x.supabase.co', key: 'k', fetchFn: f.fn });
    expect(await v.verify({ token: 'jwt' })).toEqual({ userId: UUID_A, anonymous: true });
    expect(f.calls[0]).toMatchObject({
      url: 'https://x.supabase.co/auth/v1/user',
      headers: { apikey: 'k', Authorization: 'Bearer jwt' },
    });
  });

  it('Supabase verifier rejects a bad token, a missing token and an outage', async () => {
    const bad = createSupabaseVerifier({
      url: 'https://x',
      key: 'k',
      fetchFn: fakeFetch(() => ({ status: 401, json: {} })).fn,
    });
    expect(await bad.verify({ token: 'nope' })).toBeUndefined();
    expect(await bad.verify({})).toBeUndefined();
    const down = createSupabaseVerifier({
      url: 'https://x',
      key: 'k',
      fetchFn: (async () => Promise.reject(new Error('offline'))) as unknown as typeof fetch,
    });
    expect(await down.verify({ token: 'jwt' })).toBeUndefined();
  });

  it('dev verifier accepts well-formed guest ids only', async () => {
    const v = createDevVerifier();
    expect(await v.verify({ guestId: 'abcd-1234-efgh' })).toEqual({
      userId: 'guest:abcd-1234-efgh',
      anonymous: true,
    });
    expect(await v.verify({ guestId: 'x' })).toBeUndefined();
    expect(await v.verify({ guestId: '../../etc' })).toBeUndefined();
  });

  it('dev guests are on locally and off in production unless asked for', async () => {
    const guest = { guestId: 'abcd-1234-efgh' };
    expect(await verifierFromEnv({}).verify(guest)).toBeDefined();
    expect(await verifierFromEnv({ NODE_ENV: 'production' }).verify(guest)).toBeUndefined();
    expect(
      await verifierFromEnv({ NODE_ENV: 'production', ALLOW_DEV_GUESTS: '1' }).verify(guest),
    ).toBeDefined();
    expect(await verifierFromEnv({ ALLOW_DEV_GUESTS: '0' }).verify(guest)).toBeUndefined();
  });
});
