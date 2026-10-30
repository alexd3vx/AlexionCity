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
  // by default the game server is on the same machine as the page, so a phone on your Wi-Fi works too
  gameWsUrl:
    import.meta.env.VITE_GAME_WS_URL ??
    (location.protocol === 'https:'
      ? `wss://${location.host}/ws`
      : `ws://${location.hostname}:8787`),
  assetBase: import.meta.env.VITE_ASSET_BASE ?? '/packs',
} as const;

export const supabaseConfigured = Boolean(config.supabaseUrl && config.supabaseKey);
