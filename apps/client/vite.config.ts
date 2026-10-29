import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

/** In dev, serve packs built by `asset-tools` from ../../packs-out at /packs, like the CDN will. */
function devPacks(): Plugin {
  const root = path.resolve(import.meta.dirname, '../../packs-out');
  return {
    name: 'alexion-dev-packs',
    configureServer(server) {
      server.middlewares.use('/packs', (req, res, next) => {
        const rel = decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/');
        const file = path.join(root, rel);
        if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) return next();
        res.setHeader(
          'content-type',
          file.endsWith('.json') ? 'application/json' : 'application/octet-stream',
        );
        createReadStream(file).pipe(res);
      });
    },
  };
}

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    react(),
    tailwindcss(),
    devPacks(),
    VitePWA({
      // "prompt" keeps the old version running until the player taps Update, so a live game is never reloaded under them
      registerType: 'prompt',
      includeAssets: ['icon.svg', 'whats-new.json'],
      manifest: {
        name: 'AlexionCity',
        short_name: 'AlexionCity',
        description: 'Live your life in a shared 3D city.',
        theme_color: '#ff7a1a',
        background_color: '#1b2340',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        // only the app shell is precached; model packs are cached by PackLoader so updates stay small
        globPatterns: ['**/*.{js,css,html,svg,png,json,woff2}'],
        globIgnores: ['packs/**'],
        navigateFallbackDenylist: [/^\/packs\//],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        // separate chunks cache independently, so a game update does not re-download three.js
        manualChunks: (id) => {
          if (id.includes('/three/')) return 'three';
          if (id.includes('@supabase')) return 'supabase';
          if (id.includes('framer-motion') || id.includes('/motion-')) return 'motion';
          return undefined;
        },
      },
    },
  },
  server: { host: true },
});
