import type { AvatarCatalog } from '@alexioncity/shared';
import { loadSpec, randomSpec, saveSpec, type AvatarSpec } from '../avatar/catalog';
import type { PackLoader } from '../packs/loader';
import { AssetStore } from './assets';
import type { World } from './world';

export interface Content {
  store: AssetStore;
  catalog?: AvatarCatalog;
}

/** Open whatever is downloaded on this device. Returns nothing if there is no content server. */
export async function openContent(loader: PackLoader): Promise<Content | undefined> {
  try {
    const manifest = await loader.fetchManifest();
    const store = await AssetStore.open(loader, manifest);
    const catalog = store.has('avatars')
      ? await store.json<AvatarCatalog>('avatars', 'catalog.json')
      : undefined;
    return { store, ...(catalog ? { catalog } : {}) };
  } catch {
    return undefined;
  }
}

/** The player's saved avatar, or a first random everyday look that is then saved. */
export function playerSpec(catalog: AvatarCatalog): AvatarSpec {
  try {
    if (localStorage.getItem('alexion.avatar')) return loadSpec(catalog);
  } catch {
    // fall through to a fresh look
  }
  const spec = randomSpec(catalog, Math.random);
  saveSpec(spec);
  return spec;
}

/** Upgrade a running world with everything that is downloaded. Safe to call again after a download. */
export async function applyContent(world: World, content: Content): Promise<void> {
  await world.upgradeCity(content.store);
  if (content.catalog)
    await world.upgradeAvatars(content.store, content.catalog, playerSpec(content.catalog));
}
