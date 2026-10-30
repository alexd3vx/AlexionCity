import { describe, expect, it } from 'vitest';
import {
  PROTOCOL_VERSION,
  type AvatarSpec,
  type ClientMessage,
  type ServerMessage,
} from '@alexioncity/shared';
import { GameServer } from './game';
import { LifeService } from './life';
import { MemoryLifeStore } from './life-store';
import { cityLayout } from './places';
import { MemoryStore } from './store';
import type { Verifier } from './auth';

const AVATAR: AvatarSpec = {
  frame: 'a',
  head: 'casual',
  body: 'casual',
  legs: 'casual',
  feet: 'casual',
  skin: 's3',
  hair: 'h2',
};
const verifier: Verifier = {
  async verify({ token }) {
    return token?.startsWith('user:') ? { userId: token.slice(5), anonymous: false } : undefined;
  },
};
const home = () => cityLayout().pois.find((p) => p.icon === 'home')!;
const food = () => cityLayout().pois.find((p) => p.icon === 'food')!;

function rig(withLife = true) {
  let t = 1_000_000;
  const lifeStore = new MemoryLifeStore(() => t);
  const life = new LifeService({ store: lifeStore, random: () => 0.1 });
  const game = new GameServer({
    verifier,
    store: new MemoryStore(),
    ...(withLife ? { life } : {}),
    now: () => t,
  });

  class Client {
    readonly sent: ServerMessage[] = [];
    id: string;
    constructor() {
      this.id = game.connect({
        send: (d) => void this.sent.push(JSON.parse(d) as ServerMessage),
        close: () => {},
      });
    }
    send(msg: ClientMessage) {
      return game.receive(this.id, JSON.stringify(msg));
    }
    of<T extends ServerMessage['t']>(type: T) {
      return this.sent.filter((m): m is Extract<ServerMessage, { t: T }> => m.t === type);
    }
    last<T extends ServerMessage['t']>(type: T) {
      return this.of(type).at(-1);
    }
  }

  const join = async (name: string, at: { x: number; z: number }) => {
    const c = new Client();
    await c.send({
      t: 'join',
      v: PROTOCOL_VERSION,
      token: `user:${name.toLowerCase()}`,
      name,
      district: 'downtown',
      avatar: AVATAR,
    });
    await c.send({ t: 'move', seq: 1, x: at.x, z: at.z, yaw: 0, mode: 'walk', motion: 'idle' });
    return c;
  };
  return { game, life, lifeStore, join, Client, advance: (ms: number) => void (t += ms) };
}

describe('life in the game server', () => {
  it('sends the player their life when they join, before anything else needs it', async () => {
    const { join } = rig();
    const ada = await join('Ada', { x: 0, z: 17 });
    expect(ada.last('welcome')).toBeDefined();
    expect(ada.last('life')?.life).toMatchObject({
      balance: 2500,
      home: { unit: 'studio', inside: false },
    });
    // the life arrives with the welcome: the interface never shows empty bars
    const kinds = ada.sent.map((m) => m.t);
    expect(kinds.indexOf('life')).toBeLessThan(kinds.indexOf('welcome') + 1);
  });

  it('answers life requests with a reason when life is not set up', async () => {
    const { join } = rig(false);
    const ada = await join('Ada', { x: 0, z: 17 });
    await ada.send({ t: 'order', item: 'slice' });
    expect(ada.last('error')).toEqual({ t: 'error', code: 'not_ready' });
    expect(ada.last('life')).toBeUndefined();
  });

  it('runs a purchase end to end through the protocol', async () => {
    const { join, life, lifeStore } = rig();
    const ada = await join('Ada', food());
    await ada.send({ t: 'order', item: 'slice' });
    expect(lifeStore.balanceOf('ada')).toBe(2494);
    await life.tick(1);
    expect(ada.last('life')?.life.balance).toBe(2494);
  });

  it('hides a player who is inside their home, stops their chat, and ignores their steps', async () => {
    const { join, game } = rig();
    const ada = await join('Ada', home());
    const bo = await join('Bo', { x: home().x + 3, z: home().z + 3 });
    game.broadcast();
    expect(bo.last('peers')?.add.map((p) => p.name)).toContain('Ada');

    await ada.send({ t: 'home', op: 'enter' });
    expect(ada.last('life')?.life.home.inside).toBe(true);
    game.broadcast();
    expect(bo.last('peers')?.remove).toHaveLength(1);

    await ada.send({ t: 'chat', text: 'hello?' });
    expect(ada.last('notice')?.text).toMatch(/Nobody can hear you/);
    expect(bo.of('chat')).toHaveLength(0);

    const x = home().x;
    await ada.send({
      t: 'move',
      seq: 9,
      x: x + 80,
      z: home().z,
      yaw: 0,
      mode: 'walk',
      motion: 'walk',
    });
    expect(ada.of('correct').filter((c) => c.seq === 9)).toHaveLength(0); // ignored, not corrected

    await ada.send({ t: 'home', op: 'exit' });
    expect(ada.last('correct')).toMatchObject({ x: home().x, z: home().z });
    game.broadcast();
    expect(bo.last('peers')?.add.map((p) => p.name)).toContain('Ada');
  });

  it('lives move on with the clock, and a new sign-in replaces the old one without losing anything', async () => {
    const { join, life, lifeStore, game } = rig();
    const first = await join('Ada', food());
    await first.send({ t: 'order', item: 'slice' });
    await life.tick(60);
    const second = await join('Ada', food());
    expect(second.last('life')?.life.balance).toBe(2494);
    expect(lifeStore.balanceOf('ada')).toBe(2494);
    expect(game.playerCount).toBe(1);
  });

  it('saves a player who disconnects', async () => {
    const { join, life, lifeStore, game } = rig();
    const ada = await join('Ada', food());
    await life.tick(300);
    game.disconnect(ada.id);
    await life.detach('ada');
    expect((await lifeStore.loadLife('ada'))?.character.onlineSeconds).toBe(300);
  });
});
