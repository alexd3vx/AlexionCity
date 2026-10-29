/**
 * Every host-specific value comes from environment variables, so moving from free hosting to a
 * bought domain or your own VPS is an environment change, not a code change.
 */
export const config = {
  appVersion: __APP_VERSION__,
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  // Supabase renamed the "anon" key to "publishable"; accept either name
  supabaseKey:
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY,
  gameWsUrl: import.meta.env.VITE_GAME_WS_URL ?? 'ws://localhost:8787',
  assetBase: import.meta.env.VITE_ASSET_BASE ?? '/packs',
} as const;

export const supabaseConfigured = Boolean(config.supabaseUrl && config.supabaseKey);
