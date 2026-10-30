import type { AvatarCatalog, AvatarFrame, AvatarPart, AvatarSpec } from '@alexioncity/shared';

export const SLOTS: readonly AvatarPart[] = ['head', 'body', 'legs', 'feet'];

export type { AvatarSpec };

export interface Swatch {
  id: string;
  name: string;
  hex: string;
}

/** A wide, evenly spaced range from very light to very deep. */
export const SKIN_TONES: readonly Swatch[] = [
  { id: 's1', name: 'Porcelain', hex: '#f8dcc9' },
  { id: 's2', name: 'Fair', hex: '#f0c7a6' },
  { id: 's3', name: 'Light', hex: '#e6b48a' },
  { id: 's4', name: 'Golden', hex: '#d49a6a' },
  { id: 's5', name: 'Olive', hex: '#c1855a' },
  { id: 's6', name: 'Tan', hex: '#a96f47' },
  { id: 's7', name: 'Brown', hex: '#8d5733' },
  { id: 's8', name: 'Deep brown', hex: '#704024' },
  { id: 's9', name: 'Rich', hex: '#573119' },
  { id: 's10', name: 'Ebony', hex: '#3f2312' },
];

export const HAIR_COLORS: readonly Swatch[] = [
  { id: 'h1', name: 'Black', hex: '#14100e' },
  { id: 'h2', name: 'Dark brown', hex: '#33211a' },
  { id: 'h3', name: 'Brown', hex: '#5e3a22' },
  { id: 'h4', name: 'Auburn', hex: '#8a3f24' },
  { id: 'h5', name: 'Honey', hex: '#b9854a' },
  { id: 'h6', name: 'Blond', hex: '#dcbc78' },
  { id: 'h7', name: 'Silver', hex: '#a9adb4' },
  { id: 'h8', name: 'Sky blue', hex: '#3f8cff' },
  { id: 'h9', name: 'Violet', hex: '#8a48d6' },
  { id: 'h10', name: 'Pink', hex: '#ff6fb5' },
];

export const swatch = (list: readonly Swatch[], id: string): Swatch =>
  list.find((s) => s.id === id) ?? list[0]!;

export const frameOf = (catalog: AvatarCatalog, id: string): AvatarFrame | undefined =>
  catalog.frames.find((f) => f.id === id);

/** Outfits that have a given slot, everyday ones first so they are offered at the start. */
export function outfitsFor(frame: AvatarFrame, slot: AvatarPart) {
  return frame.outfits
    .filter((o) => o.parts[slot])
    .sort((a, b) => Number(b.tags.includes('everyday')) - Number(a.tags.includes('everyday')));
}

export function defaultSpec(catalog: AvatarCatalog, frameId?: string): AvatarSpec {
  const frame = (frameId && frameOf(catalog, frameId)) || catalog.frames[0];
  if (!frame) throw new Error('avatar catalog has no frames');
  const pick = (slot: AvatarPart) => outfitsFor(frame, slot)[0]?.id ?? frame.outfits[0]!.id;
  return {
    frame: frame.id,
    head: pick('head'),
    body: pick('body'),
    legs: pick('legs'),
    feet: pick('feet'),
    skin: SKIN_TONES[5]!.id,
    hair: HAIR_COLORS[1]!.id,
  };
}

/** Make a stored or edited spec safe: unknown frames, outfits or swatches fall back to defaults. */
export function normalizeSpec(
  catalog: AvatarCatalog,
  spec: Partial<AvatarSpec> | undefined,
): AvatarSpec {
  const base = defaultSpec(catalog, spec?.frame);
  const frame = frameOf(catalog, base.frame)!;
  const out: AvatarSpec = { ...base };
  for (const slot of SLOTS) {
    const wanted = spec?.[slot];
    if (wanted && frame.outfits.some((o) => o.id === wanted && o.parts[slot])) out[slot] = wanted;
  }
  if (spec?.skin && SKIN_TONES.some((s) => s.id === spec.skin)) out.skin = spec.skin;
  if (spec?.hair && HAIR_COLORS.some((s) => s.id === spec.hair)) out.hair = spec.hair;
  return out;
}

/** A random everyday look, for pedestrians and a player's first avatar. `rng` returns 0 to 1. */
export function randomSpec(catalog: AvatarCatalog, rng: () => number): AvatarSpec {
  const frame = catalog.frames[Math.floor(rng() * catalog.frames.length)]!;
  const choose = <T>(list: readonly T[]): T => list[Math.floor(rng() * list.length)]!;
  const everyday = (slot: AvatarPart) => {
    const list = outfitsFor(frame, slot).filter((o) => o.tags.includes('everyday'));
    return choose(list.length > 0 ? list : outfitsFor(frame, slot)).id;
  };
  return {
    frame: frame.id,
    head: everyday('head'),
    body: everyday('body'),
    legs: everyday('legs'),
    feet: everyday('feet'),
    skin: choose(SKIN_TONES).id,
    hair: choose(HAIR_COLORS).id,
  };
}

const KEY = 'alexion.avatar';

export function loadSpec(catalog: AvatarCatalog): AvatarSpec {
  try {
    const raw = localStorage.getItem(KEY);
    return normalizeSpec(catalog, raw ? (JSON.parse(raw) as Partial<AvatarSpec>) : undefined);
  } catch {
    return defaultSpec(catalog);
  }
}

export function saveSpec(spec: AvatarSpec): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(spec));
  } catch {
    // storage may be blocked; the avatar just is not remembered
  }
}
