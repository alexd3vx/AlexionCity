import { describe, expect, it } from 'vitest';
import {
  PROTOCOL_VERSION,
  type AvatarSpec,
  type ClientMessage,
  type ServerMessage,
} from '@alexioncity/shared';
import type { Identity, Verifier } from './auth';
import { GameServer } from './game';
import { MemoryStore } from './store';

const AVATAR: AvatarSpec = {
  frame: 'a',
  head: 'casual',
  body: 'casual',
  legs: 'casual',
  feet: 'casual',
  skin: 's3',
  hair: 'h2',
};

/** Accepts tokens like "user:ada" and treats anything else as a bad login. */
const verifier: Verifier = {
  async verify({ token }): Promise<Identity | undefined> {
    return token?.startsWith('user:') ? { userId: token.slice(5), anonymous: false } : undefined;
  },
};

function rig() {
  let t = 1_000_000;
  const store = new MemoryStore();
  const game = new GameServer({ verifier, store, now: () => t });
  let closed: number[] = [];
  const clients: Client[] = [];

  class Client {
    readonly sent: ServerMessage[] = [];
    id = '';
    constructor(readonly label: string) {
      this.id = game.connect({
        send: (d) => void this.sent.push(JSON.parse(d) as ServerMessage),
        close: (c) => void closed.push(c ?? 0),
      });
      clients.push(this);
    }
    async send(msg: ClientMessage) {
      await game.receive(this.id, JSON.stringify(msg));
    }
    of<T extends ServerMessage['t']>(type: T) {
      return this.sent.filter((m): m is Extract<ServerMessage, { t: T }> => m.t === type);
    }
    last<T extends ServerMessage['t']>(type: T) {
      return this.of(type).at(-1);
    }
    clear() {
      this.sent.length = 0;
    }
  }

  const join = async (
    name: string,
    at: { x: number; z: number } = { x: 0, z: 0 },
    token = `user:${name.toLowerCase()}`,
  ) => {
    const c = new Client(name);
    await c.send({
      t: 'join',
      v: PROTOCOL_VERSION,
      token,
      name,
      district: 'downtown',
      avatar: AVATAR,
    });
    if (at.x !== 0 || at.z !== 0) {
      t += 60_000;
      await c.send({ t: 'move', seq: 1, x: at.x, z: at.z, yaw: 0, mode: 'run', motion: 'run' });
    }
    return c;
  };

  return {
    game,
    store,
    join,
    Client,
    advance: (ms: number) => void (t += ms),
    closed: () => closed,
    resetClosed: () => void (closed = []),
    clients,
  };
}

describe('joining', () => {
  it('welcomes a verified player with their id, channel and name', async () => {
    const { join } = rig();
    const ada = await join('Ada');
    expect(ada.last('welcome')).toMatchObject({
      t: 'welcome',
      channel: 'downtown-1',
      name: 'Ada',
      v: PROTOCOL_VERSION,
    });
  });

  it('refuses a bad login and closes the connection', async () => {
    const { join, closed } = rig();
    const bad = await join('Eve', undefined, 'garbage');
    expect(bad.last('error')).toEqual({ t: 'error', code: 'auth_failed' });
    expect(closed()).toContain(4001);
  });

  it('refuses a client with a different protocol version', async () => {
    const { Client, closed } = rig();
    const c = new Client('old');
    await c.send({
      t: 'join',
      v: 999,
      token: 'user:old',
      name: 'Old',
      district: 'downtown',
      avatar: AVATAR,
    });
    expect(c.last('error')).toEqual({ t: 'error', code: 'bad_version' });
    expect(closed()).toContain(4002);
  });

  it('ignores moves before joining and reports malformed messages', async () => {
    const { Client, game } = rig();
    const c = new Client('x');
    await c.send({ t: 'move', seq: 1, x: 1, z: 0, yaw: 0, mode: 'walk', motion: 'walk' });
    await game.receive(c.id, 'this is not json');
    expect(c.sent).toEqual([
      { t: 'error', code: 'not_joined' },
      { t: 'error', code: 'bad_message' },
    ]);
  });

  it('uses the saved profile name over the one the browser sent', async () => {
    const { join, store } = rig();
    store.profiles.set('ada', 'Ada Lovelace');
    expect((await join('whatever', undefined, 'user:ada')).last('welcome')?.name).toBe(
      'Ada Lovelace',
    );
  });

  it('turns away a banned player and lets an expired ban through', async () => {
    const { join, store } = rig();
    store.sanctions.set('eve', [{ kind: 'ban', reason: 'spam', until: null }]);
    expect((await join('Eve')).last('error')).toEqual({ t: 'error', code: 'banned' });
    store.sanctions.set('bob', [{ kind: 'ban', reason: 'old', until: 1 }]);
    expect((await join('Bob')).last('welcome')).toBeDefined();
  });

  it('keeps one connection per account: a new sign-in replaces the old', async () => {
    const { join, closed } = rig();
    const first = await join('Ada');
    await join('Ada');
    expect(closed()).toContain(4000);
    expect(first.last('notice')?.text).toMatch(/somewhere else/);
  });
});

describe('seeing nearby players', () => {
  it('shows players within range with their look, and updates as they move', async () => {
    const { join, game, advance } = rig();
    const ada = await join('Ada');
    const bola = await join('Bola', { x: 20, z: 0 });
    game.broadcast();
    expect(ada.last('peers')?.add[0]).toMatchObject({
      name: 'Bola',
      x: 20,
      motion: 'run',
      avatar: AVATAR,
    });
    expect(bola.last('peers')?.add[0]).toMatchObject({ name: 'Ada' });

    ada.clear();
    advance(1000);
    await bola.send({ t: 'move', seq: 2, x: 24, z: 0, yaw: 1.5, mode: 'run', motion: 'run' });
    game.broadcast();
    expect(ada.of('peers')).toHaveLength(0);
    expect(ada.last('pos')?.u).toEqual([[bola.id, 24, 0, 1.5, 2]]);
  });

  it('sends nothing when nothing changed', async () => {
    const { join, game } = rig();
    const ada = await join('Ada');
    await join('Bola', { x: 5, z: 0 });
    game.broadcast();
    ada.clear();
    game.broadcast();
    expect(ada.sent).toEqual([]);
  });

  it('does not show players beyond the interest radius, and drops them when they leave range', async () => {
    const { join, game, advance } = rig();
    const ada = await join('Ada');
    const far = await join('Far', { x: 130, z: 0 });
    game.broadcast();
    expect(ada.of('peers')).toHaveLength(0);

    advance(60_000);
    await far.send({ t: 'move', seq: 3, x: 60, z: 0, yaw: 0, mode: 'run', motion: 'idle' });
    game.broadcast();
    expect(ada.last('peers')?.add[0]?.name).toBe('Far');

    advance(60_000);
    await far.send({ t: 'move', seq: 4, x: 130, z: 0, yaw: 0, mode: 'run', motion: 'idle' });
    game.broadcast();
    expect(ada.last('peers')?.remove).toEqual([far.id]);
  });

  it('tells others when someone leaves, and resends a peer whose look changed', async () => {
    const { join, game } = rig();
    const ada = await join('Ada');
    const bola = await join('Bola', { x: 5, z: 0 });
    game.broadcast();
    ada.clear();
    await bola.send({ t: 'avatar', avatar: { ...AVATAR, skin: 's9' } });
    game.broadcast();
    expect(ada.last('peers')?.add[0]?.avatar.skin).toBe('s9');

    game.disconnect(bola.id);
    game.broadcast();
    expect(ada.last('peers')?.remove).toEqual([bola.id]);
  });

  it('snaps back a player who moves too fast or leaves the world', async () => {
    const { join, advance } = rig();
    const ada = await join('Ada');
    advance(1000);
    await ada.send({ t: 'move', seq: 7, x: 90, z: 0, yaw: 0, mode: 'walk', motion: 'walk' });
    expect(ada.last('correct')).toEqual({ t: 'correct', seq: 7, x: 0, z: 0 });
    advance(600_000);
    await ada.send({ t: 'move', seq: 8, x: 500, z: 0, yaw: 0, mode: 'run', motion: 'run' });
    expect(ada.last('correct')).toMatchObject({ seq: 8 });
  });

  it('keeps separate channels from seeing each other', async () => {
    const { Client, game } = rig();
    const a = new Client('a');
    const b = new Client('b');
    await a.send({
      t: 'join',
      v: PROTOCOL_VERSION,
      token: 'user:a',
      name: 'Aa',
      district: 'downtown',
      avatar: AVATAR,
    });
    await b.send({
      t: 'join',
      v: PROTOCOL_VERSION,
      token: 'user:b',
      name: 'Bb',
      district: 'market',
      avatar: AVATAR,
    });
    game.broadcast();
    expect(a.of('peers')).toHaveLength(0);
  });
});

describe('chat', () => {
  it('delivers to players nearby, including the sender, but not to those far away', async () => {
    const { join } = rig();
    const ada = await join('Ada');
    const near = await join('Near', { x: 30, z: 0 });
    const far = await join('Far', { x: 120, z: 0 });
    await ada.send({ t: 'chat', text: 'hello everyone' });
    expect(near.last('chat')).toMatchObject({ from: ada.id, name: 'Ada', text: 'hello everyone' });
    expect(ada.last('chat')?.text).toBe('hello everyone');
    expect(far.of('chat')).toHaveLength(0);
  });

  it('refuses rule-breaking messages with a reason and tells nobody else', async () => {
    const { join } = rig();
    const ada = await join('Ada');
    const bola = await join('Bola', { x: 5, z: 0 });
    await ada.send({ t: 'chat', text: 'fuck this' });
    expect(ada.last('notice')).toMatchObject({
      level: 'warning',
      text: 'Please keep chat friendly.',
    });
    await ada.send({ t: 'chat', text: 'find me at www.spam.com' });
    expect(ada.last('notice')?.text).toMatch(/links or contact details/);
    expect(bola.of('chat')).toHaveLength(0);
  });

  it('rate limits fast talkers', async () => {
    const { join } = rig();
    const ada = await join('Ada');
    for (let i = 0; i < 5; i++) await ada.send({ t: 'chat', text: `line number ${i}` });
    expect(ada.of('chat')).toHaveLength(4);
    expect(ada.last('notice')?.text).toMatch(/too fast/);
  });

  it('queues messages for the log', async () => {
    const { join, game, store } = rig();
    const ada = await join('Ada');
    await ada.send({ t: 'chat', text: 'for the record' });
    await game.flushLogs();
    expect(store.chat).toMatchObject([
      { channel: 'downtown-1', userId: 'ada', name: 'Ada', text: 'for the record' },
    ]);
  });
});

describe('block', () => {
  it('flags the peer, stops chat in both directions, and is remembered', async () => {
    const { join, game, store } = rig();
    const ada = await join('Ada');
    const bola = await join('Bola', { x: 5, z: 0 });
    game.broadcast();

    await ada.send({ t: 'block', targetId: bola.id });
    expect(ada.last('blocks')?.blocks).toEqual([{ ref: 'bola', name: 'Bola' }]);
    expect(store.blocks.get('ada')?.get('bola')).toBe('Bola');

    game.broadcast();
    expect(ada.last('peers')?.add[0]).toMatchObject({ name: 'Bola', blocked: true });

    ada.clear();
    bola.clear();
    await bola.send({ t: 'chat', text: 'hey, are you there' });
    await ada.send({ t: 'chat', text: 'go away please' });
    expect(ada.of('chat').map((m) => m.text)).toEqual(['go away please']);
    expect(bola.of('chat').map((m) => m.text)).toEqual(['hey, are you there']);
  });

  it('loads blocks again when the player returns, and unblock reverses it', async () => {
    const { join, game, store } = rig();
    const ada = await join('Ada');
    const bola = await join('Bola', { x: 5, z: 0 });
    await ada.send({ t: 'block', targetId: bola.id });
    game.disconnect(ada.id);

    const back = await join('Ada');
    expect(back.last('welcome')?.blocks).toEqual([{ ref: 'bola', name: 'Bola' }]);

    await back.send({ t: 'unblock', ref: 'bola' });
    expect(back.last('blocks')?.blocks).toEqual([]);
    expect(store.blocks.get('ada')?.size).toBe(0);
  });

  it('cannot block yourself or someone who is not there', async () => {
    const { join } = rig();
    const ada = await join('Ada');
    await ada.send({ t: 'block', targetId: ada.id });
    await ada.send({ t: 'block', targetId: 'p999' });
    expect(ada.of('blocks')).toHaveLength(0);
  });
});

describe('report', () => {
  it('saves the report with the recent chat as context and thanks the reporter', async () => {
    const { join, store, advance } = rig();
    const ada = await join('Ada');
    const bola = await join('Bola', { x: 5, z: 0 });
    await bola.send({ t: 'chat', text: 'something rude but not on the list' });
    advance(2000);
    await ada.send({
      t: 'report',
      targetId: bola.id,
      reason: 'harassment',
      details: 'kept following me',
    });

    expect(store.reports).toHaveLength(1);
    expect(store.reports[0]).toMatchObject({
      reporterId: 'ada',
      targetId: 'bola',
      targetName: 'Bola',
      reason: 'harassment',
      details: 'kept following me',
      channel: 'downtown-1',
    });
    expect(store.reports[0]?.context.map((c) => c.text)).toEqual([
      'something rude but not on the list',
    ]);
    expect(ada.last('notice')).toMatchObject({ level: 'info' });
  });

  it('limits how fast a player can file reports and ignores self-reports', async () => {
    const { join, store } = rig();
    const ada = await join('Ada');
    const bola = await join('Bola', { x: 5, z: 0 });
    await ada.send({ t: 'report', targetId: ada.id, reason: 'spam' });
    await ada.send({ t: 'report', targetId: bola.id, reason: 'spam' });
    await ada.send({ t: 'report', targetId: bola.id, reason: 'spam' });
    expect(store.reports).toHaveLength(1);
    expect(ada.last('notice')).toMatchObject({ level: 'warning' });
  });
});
