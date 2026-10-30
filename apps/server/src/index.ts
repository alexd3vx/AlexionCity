import { verifierFromEnv } from './auth';
import { GameServer } from './game';
import { startServer } from './server';
import { MemoryStore, SupabaseStore, type Store } from './store';

const env = process.env;
const port = Number(env.PORT ?? 8787);
// comma-separated list, for example "https://alexioncity.pages.dev,https://alexioncity.com"
const allowedOrigins = (env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

if (allowedOrigins.length === 0 && env.NODE_ENV === 'production') {
  console.error('ALLOWED_ORIGINS must be set in production');
  process.exit(1);
}

const verifier = verifierFromEnv(env);
const supabase = env.SUPABASE_URL && env.SUPABASE_SECRET_KEY;
const store: Store = supabase
  ? new SupabaseStore(env.SUPABASE_URL!, env.SUPABASE_SECRET_KEY!)
  : new MemoryStore();

const server = await startServer({
  port,
  allowedOrigins,
  game: new GameServer({ verifier, store }),
});
console.log(
  `game server listening on :${server.port} | origins: ${allowedOrigins.join(', ') || 'any'} | ` +
    `accounts: ${supabase ? 'Supabase' : 'dev guests only'} | saves: ${supabase ? 'Supabase' : 'memory'}`,
);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => void server.close().then(() => process.exit(0)));
}
