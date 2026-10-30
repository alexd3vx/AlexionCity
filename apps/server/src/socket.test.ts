import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { PROTOCOL_VERSION, type ServerMessage } from '@alexioncity/shared';
import { createDevVerifier } from './auth';
import { GameServer } from './game';
import { startServer, type RunningServer } from './server';
import { MemoryStore } from './store';

const AVATAR = {
  frame: 'a',
  head: 'casual',
  body: 'casual',
  legs: 'casual',
  feet: 'casual',
  skin: 's3',
  hair: 'h2',
};

describe('websocket server', () => {
  let running: RunningServer | undefined;
  afterEach(async () => {
    await running?.close();
    running = undefined;
  });

  const start = (extra: { allowedOrigins?: string[] } = {}) =>
    startServer({
      port: 0,
      tickHz: 50,
      game: new GameServer({ verifier: createDevVerifier(), store: new MemoryStore() }),
      ...extra,
    });

  const open = (port: number, origin?: string) =>
    new Promise<WebSocket>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}`, origin ? { origin } : undefined);
      ws.once('open', () => resolve(ws));
      ws.once('error', reject);
      ws.once('unexpected-response', (_req, res) => reject(new Error(`HTTP ${res.statusCode}`)));
    });

  const waitFor = <T extends ServerMessage['t']>(ws: WebSocket, type: T) =>
    new Promise<Extract<ServerMessage, { t: T }>>((resolve) => {
      const on = (d: WebSocket.RawData) => {
        const m = JSON.parse(d.toString()) as ServerMessage;
        if (m.t === type) {
          ws.off('message', on);
          resolve(m as Extract<ServerMessage, { t: T }>);
        }
      };
      ws.on('message', on);
    });

  const join = (ws: WebSocket, name: string, guestId: string) =>
    ws.send(
      JSON.stringify({
        t: 'join',
        v: PROTOCOL_VERSION,
        guestId,
        name,
        district: 'downtown',
        avatar: AVATAR,
      }),
    );

  it('answers /healthz', async () => {
    running = await start();
    expect(await fetch(`http://127.0.0.1:${running.port}/healthz`).then((r) => r.json())).toEqual({
      ok: true,
      players: 0,
    });
  });

  it('lets two real players see and talk to each other', async () => {
    running = await start();
    const a = await open(running.port);
    const b = await open(running.port);
    const aWelcome = waitFor(a, 'welcome');
    const bWelcome = waitFor(b, 'welcome');
    // listen before anyone joins: the news of Bola can arrive as soon as she does
    const seen = waitFor(a, 'peers');
    join(a, 'Ada', 'guest-aaaa-1111');
    join(b, 'Bola', 'guest-bbbb-2222');
    expect((await aWelcome).channel).toBe('downtown-1');
    await bWelcome;

    expect((await seen).add[0]?.name).toBe('Bola');

    const heard = waitFor(b, 'chat');
    a.send(JSON.stringify({ t: 'chat', text: 'hello from Ada' }));
    expect(await heard).toMatchObject({ name: 'Ada', text: 'hello from Ada' });
    a.close();
    b.close();
  });

  it('refuses origins that are not on the allow list', async () => {
    running = await start({ allowedOrigins: ['https://alexioncity.test'] });
    await expect(open(running.port, 'https://evil.test')).rejects.toThrow();
    (await open(running.port, 'https://alexioncity.test')).close();
  });

  it('drops oversized messages', async () => {
    running = await start();
    const ws = await open(running.port);
    const closed = new Promise<number>((resolve) => ws.once('close', (code) => resolve(code)));
    ws.send('x'.repeat(5000));
    expect(await closed).toBe(1009);
  });

  it('survives a bad login without crashing', async () => {
    running = await start();
    const ws = await open(running.port);
    const err = waitFor(ws, 'error');
    join(ws, 'Eve', 'x');
    expect(await err).toEqual({ t: 'error', code: 'auth_failed' });
    expect(await fetch(`http://127.0.0.1:${running.port}/healthz`).then((r) => r.ok)).toBe(true);
  });
});
