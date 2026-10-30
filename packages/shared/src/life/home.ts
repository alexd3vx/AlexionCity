import { furnitureById, type FurnitureDef } from './furniture';
import type { FurnitureUse } from './shop';

export type UnitId = 'studio' | 'flat' | 'loft';

export interface UnitDef {
  id: UnitId;
  name: string;
  /** Floor size in cells (1 cell = 1 metre). */
  w: number;
  d: number;
  /** Rent for one billing period, and the utilities on top. */
  rent: number;
  utilities: number;
  blurb: string;
}

export const UNITS: Record<UnitId, UnitDef> = {
  studio: {
    id: 'studio',
    name: 'Studio',
    w: 8,
    d: 6,
    rent: 400,
    utilities: 60,
    blurb: 'One room with everything in reach.',
  },
  flat: {
    id: 'flat',
    name: 'Flat',
    w: 10,
    d: 7,
    rent: 700,
    utilities: 90,
    blurb: 'Space for a proper living area.',
  },
  loft: {
    id: 'loft',
    name: 'Loft',
    w: 12,
    d: 9,
    rent: 1100,
    utilities: 130,
    blurb: 'High ceilings and room to host.',
  },
};

export const UNIT_IDS = Object.keys(UNITS) as UnitId[];
export const isUnitId = (v: unknown): v is UnitId => typeof v === 'string' && v in UNITS;

export type Rotation = 0 | 1 | 2 | 3;

/** One piece of furniture standing in a home. `x`,`z` is its top-left floor cell after turning. */
export interface Placed {
  id: string;
  item: string;
  x: number;
  z: number;
  /** Quarter turns. At 0 the item faces +z, with its back to the north wall. */
  rot: Rotation;
}

/** Most pieces one home can hold. */
export const MAX_PLACED = 80;

export const isRotation = (v: unknown): v is Rotation => v === 0 || v === 1 || v === 2 || v === 3;

/** Cells covered once turned. */
export function footprint(def: FurnitureDef, rot: Rotation): { w: number; d: number } {
  return rot % 2 === 0 ? { w: def.w, d: def.d } : { w: def.d, d: def.w };
}

/** The doorway: two cells wide on the north wall. Kept clear so a player can always walk in. */
export function doorCells(unit: UnitDef): { x: number; z: number; w: number; d: number } {
  return { x: Math.floor(unit.w / 2) - 1, z: 0, w: 2, d: 2 };
}

/** Where a player stands just inside the door, in metres from the room's north-west corner. */
export function doorSpot(unit: UnitDef): { x: number; z: number } {
  const door = doorCells(unit);
  return { x: door.x + door.w / 2, z: 1.2 };
}

const overlap = (
  a: { x: number; z: number; w: number; d: number },
  b: { x: number; z: number; w: number; d: number },
) => a.x < b.x + b.w && b.x < a.x + a.w && a.z < b.z + b.d && b.z < a.z + a.d;

export type PlaceCheck = { ok: true } | { ok: false; reason: string };

/** Whether `candidate` may stand in the unit alongside `layout`. `ignoreId` lets a piece be moved. */
export function canPlace(
  unit: UnitDef,
  layout: readonly Placed[],
  candidate: Omit<Placed, 'id'>,
  ignoreId?: string,
): PlaceCheck {
  const def = furnitureById(candidate.item);
  if (!def) return { ok: false, reason: 'Unknown item.' };
  if (!isRotation(candidate.rot)) return { ok: false, reason: 'Bad rotation.' };
  if (!Number.isInteger(candidate.x) || !Number.isInteger(candidate.z))
    return { ok: false, reason: 'Bad position.' };
  const box = { x: candidate.x, z: candidate.z, ...footprint(def, candidate.rot) };
  if (box.x < 0 || box.z < 0 || box.x + box.w > unit.w || box.z + box.d > unit.d)
    return { ok: false, reason: 'That does not fit inside the room.' };
  if (!def.flat && overlap(box, doorCells(unit)))
    return { ok: false, reason: 'Keep the doorway clear.' };
  const others = layout.filter((p) => p.id !== ignoreId);
  if (!ignoreId && others.length >= MAX_PLACED) return { ok: false, reason: 'The room is full.' };
  for (const other of others) {
    const od = furnitureById(other.item);
    if (!od) continue;
    // a flat rug can lie under furniture, but two rugs cannot share a spot
    if (def.flat !== od.flat) continue;
    if (overlap(box, { x: other.x, z: other.z, ...footprint(od, other.rot) }))
      return { ok: false, reason: 'Something is already there.' };
  }
  return { ok: true };
}

/** Total comfort of what is in the home. */
export function layoutComfort(layout: readonly Placed[]): number {
  let total = 0;
  for (const p of layout) total += furnitureById(p.item)?.comfort ?? 0;
  return total;
}

/** The best rate among furniture that can do `use`, or undefined when the home has none. */
export function useRate(layout: readonly Placed[], use: FurnitureUse): number | undefined {
  let best: number | undefined;
  for (const p of layout) {
    const def = furnitureById(p.item);
    if (def?.use === use) best = Math.max(best ?? 0, def.rate ?? 1);
  }
  return best;
}

/** Keep only what still fits after moving to another unit; the rest goes back to storage. */
export function fitLayout(
  unit: UnitDef,
  layout: readonly Placed[],
): { kept: Placed[]; stored: Placed[] } {
  const kept: Placed[] = [];
  const stored: Placed[] = [];
  for (const p of layout) {
    if (canPlace(unit, kept, p).ok) kept.push(p);
    else stored.push(p);
  }
  return { kept, stored };
}

/** How many of each item stands in the home. */
export function placedCounts(layout: readonly Placed[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const p of layout) counts.set(p.item, (counts.get(p.item) ?? 0) + 1);
  return counts;
}
