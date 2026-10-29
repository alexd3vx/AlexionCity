import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node22',
  clean: true,
  // bundle everything into one file so the server runs on any host with just Node, no install step
  noExternal: ['@alexioncity/shared', 'ws'],
  // some bundled packages use require(); give the ESM output one
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
});
