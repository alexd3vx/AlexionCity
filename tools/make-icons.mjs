// Regenerates the app icons from brand/*.svg:  node tools/make-icons.mjs
import { copyFile, mkdir } from 'node:fs/promises';
import sharp from 'sharp';

const out = 'apps/client/public/icons';
await mkdir(out, { recursive: true });
const jobs = [
  ['brand/icon.svg', 'icon-192.png', 192],
  ['brand/icon.svg', 'icon-512.png', 512],
  ['brand/icon-maskable.svg', 'icon-maskable-512.png', 512],
];
for (const [src, name, size] of jobs) {
  await sharp(src, { density: 384 }).resize(size, size).png().toFile(`${out}/${name}`);
  console.log(`${out}/${name}`);
}
await copyFile('brand/icon.svg', 'apps/client/public/icon.svg');
await copyFile('brand/mark.svg', 'apps/client/public/mark.svg');
