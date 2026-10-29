import { createServer as createHttpServer, type Server } from 'node:http';
import { WebSocketServer } from 'ws';
import { GameServer } from './game';

export interface ServerOptions {
  port: number;
  /** Origins allowed to open a socket. Empty means any origin, which is fine for local development only. */
  allowedOrigins?: string[];
  tickHz?: number;
  game?: GameServer;
}

export interface RunningServer {
  port: number;
  game: GameServer;
  close(): Promise<void>;
}

const MAX_MESSAGE_BYTES = 1024;
const MAX_MESSAGES_PER_SECOND = 40;

export async function startServer(opts: ServerOptions): Promise<RunningServer> {
  const game = opts.game ?? new GameServer();
  const allowed = new Set(opts.allowedOrigins ?? []);

  const http: Server = createHttpServer((req, res) => {
    if (req.url === '/healthz') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, players: game.playerCount }));
      return;
    }
    res.writeHead(404).end();
  });

  const wss = new WebSocketServer({
    server: http,
    maxPayload: MAX_MESSAGE_BYTES,
    verifyClient: ({ origin }: { origin: string }) => allowed.size === 0 || allowed.has(origin),
  });

  wss.on('connection', (socket) => {
    const id = game.connect({
      send: (d) => socket.readyState === socket.OPEN && socket.send(d),
      close: (c) => socket.close(c),
    });
    let windowStart = Date.now();
    let count = 0;

    socket.on('message', (data) => {
      const now = Date.now();
      if (now - windowStart >= 1000) {
        windowStart = now;
        count = 0;
      }
      if (++count > MAX_MESSAGES_PER_SECOND) return socket.close(1008, 'rate limit');
      game.receive(id, data.toString());
    });
    socket.on('close', () => game.disconnect(id));
    socket.on('error', () => game.disconnect(id));
  });

  const timer = setInterval(() => game.broadcast(), 1000 / (opts.tickHz ?? 10));

  await new Promise<void>((resolve) => http.listen(opts.port, resolve));
  const address = http.address();
  const port = typeof address === 'object' && address ? address.port : opts.port;

  return {
    port,
    game,
    close: () =>
      new Promise<void>((resolve) => {
        clearInterval(timer);
        for (const client of wss.clients) client.terminate();
        wss.close(() => http.close(() => resolve()));
      }),
  };
}
