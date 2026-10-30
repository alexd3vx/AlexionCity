import { describe, expect, it } from 'vitest';
import {
  PROTOCOL_VERSION,
  type AvatarSpec,
  type ClientMessage,
  type ServerMessage,
} from '@alexioncity/shared';
import { backoffMs, GameClient, type NetEvent, type SocketLike } from './client';

const AVATAR: AvatarSpec = {
  frame: 'a',
  head: 'casual',
  body: 'casual',
  legs: 'casual',
  feet: 'casual',
  skin: 's3',
  hair: 'h2',
};

class FakeSocket implements SocketLike {
  readyState = 0;
  sent: ClientMessage[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  send(data: string) {
    this.sent.push(JSON.parse(data) as ClientMessage);
  }
  close() {
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  receive(m: ServerMessage) {
    this.onmessage?.({ data: JSON.stringify(m) });
  }
  drop(code = 1006) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}

function rig(
  credentials: () => Promise<{ token?: string; guestId?: string }> = async () => ({ token: 'jwt' }),
) {
  const sockets: FakeSocket[] = [];
  const timers: { fn: () => void; ms: number; id: number; cleared: boolean }[] = [];
  const events: NetEvent[] = [];
  const client = new GameClient({
    url: 'ws://x',
    credentials,
    name: () => 'Ada',
    avatar: () => AVATAR,
    createSocket: () => {
      const s = new FakeSocket();
      sockets.push(s);
      return s;
    },
    setTimer: (fn, ms) => {
      const t = { fn, ms, id: timers.length, cleared: false };
      timers.push(t);
      return t.id;
    },
    clearTimer: (id) => void (timers[id as number]!.cleared = true),
    random: () => 0.5,
  });
  client.subscribe((e) => events.push(e));
  const statuses = () =>
    events
      .filter((e): e is Extract<NetEvent, { kind: 'status' }> => e.kind === 'status')
      .map((e) => e.status);
  const welcome = (s: FakeSocket) =>
    s.receive({
      t: 'welcome',
      id: 'p1',
      channel: 'downtown-1',
      name: 'Ada',
      v: PROTOCOL_VERSION,
      blocks: [],
    });
  const fire = (ms: number) =>
    timers.filter((t) => !t.cleared && t.ms === ms).forEach((t) => ((t.cleared = true), t.fn()));
  const flush = () => new Promise((r) => setTimeout(r, 0));
  return { client, sockets, timers, events, statuses, welcome, fire, flush };
}

describe('GameClient', () => {
  it('signs in with a fresh token and the saved name and look when the socket opens', async () => {
    const { client, sockets, flush } = rig();
    client.connect();
    await flush();
    sockets[0]!.open();
    expect(sockets[0]!.sent[0]).toEqual({
      t: 'join',
      v: PROTOCOL_VERSION,
      token: 'jwt',
      name: 'Ada',
      district: 'downtown',
      avatar: AVATAR,
    });
  });

  it('goes online on welcome and passes server messages to listeners', async () => {
    const { client, sockets, welcome, statuses, events, flush } = rig();
    client.connect();
    await flush();
    sockets[0]!.open();
    welcome(sockets[0]!);
    expect(statuses()).toEqual(['connecting', 'online']);
    sockets[0]!.receive({ t: 'chat', from: 'p2', name: 'Bola', text: 'hi', ts: 1 });
    expect(events.some((e) => e.kind === 'message' && e.message.t === 'chat')).toBe(true);
  });

  it('reconnects with backoff after a drop, and signs in again', async () => {
    const { client, sockets, welcome, statuses, timers, flush } = rig();
    client.connect();
    await flush();
    sockets[0]!.open();
    welcome(sockets[0]!);
    sockets[0]!.drop(1006);
    expect(statuses().at(-1)).toBe('reconnecting');
    const retry = timers.find((t) => t.ms >= 800 && !t.cleared && t.ms !== 2000);
    expect(retry?.ms).toBe(backoffMs(0, () => 0.5));
    retry!.fn();
    await flush();
    sockets[1]!.open();
    expect(sockets[1]!.sent[0]).toMatchObject({ t: 'join', token: 'jwt' });
  });

  it.each([
    [4001, 'sign-in'],
    [4003, 'banned'],
    [4002, 'update'],
  ])('does not reconnect after close code %i', async (code, reason) => {
    const { client, sockets, statuses, events, flush } = rig();
    client.connect();
    await flush();
    sockets[0]!.open();
    sockets[0]!.drop(code);
    expect(statuses().at(-1)).toBe('rejected');
    expect(events.at(-1)).toMatchObject({ reason });
  });

  it('keeps trying when credentials cannot be fetched', async () => {
    let calls = 0;
    const { client, statuses, flush } = rig(async () => {
      if (++calls === 1) throw new Error('offline');
      return { token: 'jwt' };
    });
    client.connect();
    await flush();
    expect(statuses()).toContain('reconnecting');
  });

  it('sends the position only when it changed, plus a heartbeat', async () => {
    const { client, sockets, welcome, timers, flush } = rig();
    client.connect();
    await flush();
    sockets[0]!.open();
    welcome(sockets[0]!);
    const sentMoves = () => sockets[0]!.sent.filter((m) => m.t === 'move');
    const tick = () =>
      timers
        .filter((t) => t.ms === 100 && !t.cleared)
        .at(-1)!
        .fn();

    client.updateLocal({ x: 1, z: 2, yaw: 0, motion: 'walk', mode: 'walk' });
    tick();
    expect(sentMoves()).toHaveLength(1);
    tick(); // nothing changed
    expect(sentMoves()).toHaveLength(1);
    client.updateLocal({ x: 1.5, z: 2, yaw: 0, motion: 'walk', mode: 'walk' });
    tick();
    expect(sentMoves()).toHaveLength(2);
    expect(sentMoves()[1]).toMatchObject({ seq: 2, x: 1.5, mode: 'walk', motion: 'walk' });
  });

  it('only sends chat and other actions while connected', async () => {
    const { client, sockets, welcome, flush } = rig();
    expect(client.chat('hello')).toBe(false);
    client.connect();
    await flush();
    sockets[0]!.open();
    welcome(sockets[0]!);
    expect(client.chat('hello')).toBe(true);
    expect(client.report('p2', 'spam', 'rude')).toBe(true);
    expect(sockets[0]!.sent.slice(-2)).toEqual([
      { t: 'chat', text: 'hello' },
      { t: 'report', targetId: 'p2', reason: 'spam', details: 'rude' },
    ]);
  });

  it('closes cleanly and does not come back', async () => {
    const { client, sockets, statuses, flush } = rig();
    client.connect();
    await flush();
    sockets[0]!.open();
    client.close();
    sockets[0]!.drop(1000);
    expect(statuses().at(-1)).toBe('offline');
    expect(sockets).toHaveLength(1);
  });
});

describe('backoffMs', () => {
  it('doubles up to a cap, with a little spread', () => {
    expect(backoffMs(0, () => 0.5)).toBe(1000);
    expect(backoffMs(2, () => 0.5)).toBe(4000);
    expect(backoffMs(10, () => 0.5)).toBe(15_000 * 1);
    expect(backoffMs(0, () => 0)).toBeCloseTo(800);
    expect(backoffMs(0, () => 1)).toBeCloseTo(1200);
  });
});
