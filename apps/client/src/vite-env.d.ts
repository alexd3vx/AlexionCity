/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  /** Older name for the same key; still accepted. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_GAME_WS_URL?: string;
  /** Where asset packs and manifest.json are served from. Change this when moving to a CDN or a domain. */
  readonly VITE_ASSET_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __APP_VERSION__: string;
