import { startServer } from './server';

const port = Number(process.env.PORT ?? 8787);
// comma-separated list, for example "https://alexioncity.pages.dev,https://alexioncity.com"
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

if (allowedOrigins.length === 0 && process.env.NODE_ENV === 'production') {
  console.error('ALLOWED_ORIGINS must be set in production');
  process.exit(1);
}

const server = await startServer({ port, allowedOrigins });
console.log(
  `game server listening on :${server.port} (origins: ${allowedOrigins.join(', ') || 'any'})`,
);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => void server.close().then(() => process.exit(0)));
}
