import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import type { ServerMessage } from '@alexioncity/shared';
import { ChannelRegistry } from './channels';
import { GameServer, type Connection } from './game';
import { cleanName, parseClientMessage } from './messages';
import { startServer, type RunningServer } from './server';

describe('ChannelRegistry', () => {
  it('fills a channel to capacity, then opens the next', () => {
    const channels = new ChannelRegistry(2);
    expect(channels.join('downtown', 'a')).toBe('downtown-1');
    expect(channels.join('downtown', 'b')).toBe('downtown-1');
    expect(channels.join('downtown', 'c')).toBe('downtown-2');
  });

  it('reuses the lowest channel with room after someone leaves', () => {
    const channels = new ChannelRegistry(1);
    channels.join('market', 'a');
    channels.join('market', 'b');
    channels.leave('a');
    expect(channels.join('market', 'c')).toBe('market-1');
  });

  it('moves a player instead of keeping two memberships', () => {
    const channels = new ChannelRegistry(5);
    channels.join('market', 'a');
    channels.join('harbor', 'a');
    expect(channels.membersOf('market-1').size).toBe(0);
    expect(channels.channelOf('a')).toBe('harbor-1');
  });
});

describe('message parsing', () => {
  it('accepts a valid join and move', () => {
    expect(parseClientMessage('{"t":"join","district":"downtown","name":"Ada"}')).toEqual({
      t: 'join',
      district: 'downtown',
      name: 'Ada',
    });
    expect(
      parseClientMessage('{"t":"move","seq":1,"x":1,"z":2,"yaw":0,"mode":"walk"}'),
    ).toMatchObject({ t: 'move', x: 1 });
  });

  it.each([
    'not json',
    '[]',
    '{"t":"join","district":"mars","name":"Ada"}',
    '{"t":"join","district":"downtown","name":"A"}',
    '{"t":"move","seq":1,"x":"1","z":2,"yaw":0,"mode":"walk"}',
    '{"t":"move","seq":1,"x":1,"z":2,"yaw":0,"mode":"teleport"}',
    '{"t":"nope"}',
  ])('rejects %s', (raw) => {
    expect(parseClientMessage(raw)).toBeUndefined();
  });

  it('cleans names', () => {
    expect(cleanName('  <b>Ada</b>  ')).toBe('bAdab');
    expect(cleanName('x'.repeat(50))).toHaveLength(20);
    expect(cleanName('!')).toBeUndefined();
  });
});

function fakeConn() {
  const sent: ServerMessage[] = [];
  const conn: Connection = {
    send: (d) => void sent.push(JSON.parse(d) as ServerMessage),
    close: () => {},
  };
  return { conn, sent };
}

describe('GameServer', () => {
  it('welcomes a player and shares positions within a channel', () => {
    let t = 0;
    const game = new GameServer(() => t);
    const a = fakeConn();
    const b = fakeConn();
    const ida = game.connect(a.conn);
    const idb = game.connect(b.conn);
    game.receive(ida, '{"t":"join","district":"downtown","name":"Ada"}');
    game.receive(idb, '{"t":"join","district":"downtown","name":"Bola"}');
    expect(a.sent[0]).toMatchObject({ t: 'welcome', channel: 'downtown-1' });

    t = 1000;
    game.receive(ida, '{"t":"move","seq":1,"x":2,"z":0,"yaw":1,"mode":"walk"}');
    game.broadcast();
    const state = b.sent.at(-1);
    expect(state).toMatchObject({ t: 'state' });
    expect(state?.t === 'state' && state.players.find((p) => p.name === 'Ada')?.x).toBe(2);
  });

  it('snaps back a player who moves too fast', () => {
    let t = 0;
    const game = new GameServer(() => t);
    const a = fakeConn();
    const id = game.connect(a.conn);
    game.receive(id, '{"t":"join","district":"market","name":"Ada"}');
    t = 1000;
    game.receive(id, '{"t":"move","seq":7,"x":500,"z":0,"yaw":0,"mode":"walk"}');
    expect(a.sent.at(-1)).toEqual({ t: 'correct', seq: 7, x: 0, z: 0 });
  });

  it('ignores moves before joining and reports bad messages', () => {
    const game = new GameServer();
    const a = fakeConn();
    const id = game.connect(a.conn);
    game.receive(id, '{"t":"move","seq":1,"x":1,"z":0,"yaw":0,"mode":"walk"}');
    game.receive(id, 'garbage');
    expect(a.sent).toEqual([
      { t: 'error', code: 'not_joined' },
      { t: 'error', code: 'bad_message' },
    ]);
  });

  it('does not keep players after they disconnect', () => {
    const game = new GameServer();
    const id = game.connect(fakeConn().conn);
    game.receive(id, '{"t":"join","district":"harbor","name":"Ada"}');
    game.disconnect(id);
    expect(game.playerCount).toBe(0);
    expect(game.channels.channelIds()).toEqual([]);
  });
});

describe('websocket server', () => {
  let running: RunningServer | undefined;
  afterEach(async () => {
    await running?.close();
    running = undefined;
  });

  const open = (port: number, origin?: string) =>
    new Promise<WebSocket>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}`, origin ? { origin } : undefined);
      ws.once('open', () => resolve(ws));
      ws.once('error', reject);
      ws.once('unexpected-response', (_req, res) => reject(new Error(`HTTP ${res.statusCode}`)));
    });

  const next = (ws: WebSocket) =>
    new Promise<ServerMessage>((resolve) =>
      ws.once('message', (d) => resolve(JSON.parse(d.toString()) as ServerMessage)),
    );

  it('answers /healthz and runs a join over a real socket', async () => {
    running = await startServer({ port: 0, tickHz: 50 });
    const health = await fetch(`http://127.0.0.1:${running.port}/healthz`).then((r) => r.json());
    expect(health).toEqual({ ok: true, players: 0 });

    const ws = await open(running.port);
    const welcome = next(ws);
    ws.send('{"t":"join","district":"airport","name":"Ada"}');
    expect(await welcome).toMatchObject({ t: 'welcome', channel: 'airport-1' });
    ws.close();
  });

  it('refuses origins that are not on the allow list', async () => {
    running = await startServer({ port: 0, allowedOrigins: ['https://alexioncity.test'] });
    await expect(open(running.port, 'https://evil.test')).rejects.toThrow();
    const ok = await open(running.port, 'https://alexioncity.test');
    ok.close();
  });

  it('drops oversized messages', async () => {
    running = await startServer({ port: 0 });
    const ws = await open(running.port);
    const closed = new Promise<number>((resolve) => ws.once('close', (code) => resolve(code)));
    ws.send('x'.repeat(5000));
    expect(await closed).toBe(1009);
  });
});
