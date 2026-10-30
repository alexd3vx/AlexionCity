import { SPAWN } from '@alexioncity/shared';
import type { Box, Circle } from '../collision';

export type { Box };
import { dims, type ModelId } from './models';

/** Centre-based rectangle on the ground: `w` runs along x, `d` along z. */
export interface Rect {
  x: number;
  z: number;
  w: number;
  d: number;
}

export interface Placement {
  model: ModelId;
  x: number;
  z: number;
  /** Rotation about the vertical axis; a model's front (+z) points along (sin yaw, cos yaw). */
  yaw: number;
}

export type PoiIcon =
  'food' | 'bar' | 'hospital' | 'hotel' | 'home' | 'atm' | 'bus' | 'park' | 'tower';

export interface Poi {
  id: string;
  name: string;
  icon: PoiIcon;
  /** Where to stand to use it: on the pavement in front of the door. */
  x: number;
  z: number;
}

export interface Street {
  name: string;
  axis: 'x' | 'z';
  /** The street runs along `axis` at this coordinate on the other axis. */
  at: number;
}

export type Zone = 'residential' | 'commercial' | 'civic' | 'plaza';

export interface Block {
  cx: number;
  cz: number;
  zone: Zone;
}

export interface Layout {
  /** Half the width of the playable square, in metres. */
  extent: number;
  streets: Street[];
  blocks: Block[];
  roads: Rect[];
  /** One raised pavement slab per block. */
  slabs: Rect[];
  /** Painted lines and crossings on the asphalt. */
  markings: Rect[];
  placements: Placement[];
  /** Procedural street lamps (no model in the packs). */
  lamps: { x: number; z: number }[];
  /** Procedural billboard frames; the ad system fills them from Phase 6. */
  billboards: { x: number; z: number; yaw: number }[];
  fountain: { x: number; z: number; r: number };
  boxes: Box[];
  circles: Circle[];
  pois: Poi[];
  spawn: { x: number; z: number; yaw: number };
}

export const BLOCK = 64;
export const ROAD = 8;
export const WALK = 3;
/** Distance from a block's edge to the front of its buildings. */
export const SETBACK = 2;
export const PITCH = BLOCK + ROAD + 2 * WALK;
export const EXTENT = 124;

const FRONT = BLOCK / 2 - SETBACK; // 30
const GAP = 1.2;
/** North and south rows may be this deep; west and east rows fill the 20 m left between them. */
const MAX_DEPTH = 19;
const SIDE_LENGTH = BLOCK - 2 * 2 * 11; // 20
const CLEAR = ROAD / 2 + 3; // keep furniture this far from an intersection's centre

const ZONES: Zone[][] = [
  ['residential', 'commercial', 'civic'],
  ['commercial', 'plaza', 'commercial'],
  ['residential', 'commercial', 'residential'],
];

const POOLS: Record<Exclude<Zone, 'plaza'>, ModelId[]> = {
  commercial: [
    'bldg-red',
    'bldg-red',
    'bldg-green',
    'bldg-big',
    'bldg-red-corner',
    'bldg-brown',
    'pizza',
    'bar',
    'bldg-large',
  ],
  residential: [
    'apartment',
    'house',
    'house',
    'bldg-brown',
    'bldg-green',
    'bldg-brown',
    'bldg-red',
  ],
  civic: ['bldg-large', 'bldg-big', 'hotel', 'bldg-large'],
};

const NAMES: Partial<Record<ModelId, string[]>> = {
  pizza: ['Pizza Corner', 'Slice House', 'Mama Roma'],
  bar: ['Sunset Bar', 'Neon Lounge'],
  hotel: ['Skyline Hotel'],
  hospital: ['City General Hospital'],
  skyscraper: ['Alexion Tower'],
};

const ICONS: Partial<Record<ModelId, PoiIcon>> = {
  pizza: 'food',
  bar: 'bar',
  hotel: 'hotel',
  hospital: 'hospital',
  skyscraper: 'tower',
};

const NS_STREETS = ['West Ring Road', 'Sunrise Avenue', 'Market Street', 'East Ring Road'];
const EW_STREETS = ['North Ring Road', 'Harbor Road', 'Alexion Boulevard', 'South Ring Road'];

/** Small seeded random number generator, so the same seed always builds the same district. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Side = 'N' | 'S' | 'W' | 'E';
const SIDE_YAW: Record<Side, number> = { N: Math.PI, S: 0, W: -Math.PI / 2, E: Math.PI / 2 };

export interface LayoutOptions {
  seed?: number;
  /** 1 is full; lower thins out trees, lamps and parked cars for weaker phones. */
  density?: number;
}

export function generateLayout(opts: LayoutOptions = {}): Layout {
  const rng = mulberry32(opts.seed ?? 1);
  const density = opts.density ?? 1;
  const chance = (p: number) => rng() < p * density;
  const pick = <T>(list: readonly T[]): T => list[Math.floor(rng() * list.length)]!;

  const lines = [-1.5, -0.5, 0.5, 1.5].map((k) => k * PITCH);
  const centres = [-1, 0, 1].map((k) => k * PITCH);

  const layout: Layout = {
    extent: EXTENT,
    streets: [],
    blocks: [],
    roads: [],
    slabs: [],
    markings: [],
    placements: [],
    lamps: [],
    billboards: [],
    fountain: { x: 0, z: 0, r: 4 },
    boxes: [],
    circles: [],
    pois: [],
    spawn: { ...SPAWN },
  };

  // ---- streets, pavements, paint
  lines.forEach((at, i) => {
    layout.streets.push(
      { name: NS_STREETS[i]!, axis: 'z', at },
      { name: EW_STREETS[i]!, axis: 'x', at },
    );
    layout.roads.push(
      { x: at, z: 0, w: ROAD, d: 2 * EXTENT },
      { x: 0, z: at, w: 2 * EXTENT, d: ROAD },
    );
  });
  centres.forEach((cx, i) =>
    centres.forEach((cz, j) => {
      layout.slabs.push({ x: cx, z: cz, w: BLOCK + 2 * WALK, d: BLOCK + 2 * WALK });
      layout.blocks.push({ cx, cz, zone: ZONES[j]![i]! });
    }),
  );

  // spans of each street between intersections, plus the two ends
  const stops = [-EXTENT, ...lines, EXTENT];
  const spans = stops.slice(0, -1).map((from, i) => ({
    from: from + (i === 0 ? 3 : CLEAR),
    to: stops[i + 1]! - (i === stops.length - 2 ? 3 : CLEAR),
  }));

  for (const at of lines) {
    for (const { from, to } of spans) {
      for (let p = from + 1; p < to - 1; p += 6) {
        layout.markings.push({ x: at, z: p, w: 0.25, d: 2.2 }, { x: p, z: at, w: 2.2, d: 0.25 });
      }
    }
    for (const other of lines) {
      for (const sign of [-1, 1]) {
        const off = sign * (ROAD / 2 + 1.4);
        for (let s = 0; s < 7; s++) {
          const across = -3.6 + s * 1.2;
          layout.markings.push(
            { x: at + across, z: other + off, w: 0.6, d: 2.4 },
            { x: at + off, z: other + across, w: 2.4, d: 0.6 },
          );
        }
      }
    }
  }

  // ---- buildings
  let homeAssigned = false;
  const nameCount = new Map<ModelId, number>();

  const addBuilding = (model: ModelId, x: number, z: number, side: Side) => {
    const { w, d } = dims(model);
    const swap = side === 'W' || side === 'E';
    layout.placements.push({ model, x, z, yaw: SIDE_YAW[side] });
    layout.boxes.push({ x, z, hw: (swap ? d : w) / 2, hd: (swap ? w : d) / 2 });

    // a spot on the pavement in front of the door
    const [fx, fz] = { N: [0, -1], S: [0, 1], W: [-1, 0], E: [1, 0] }[side] as [number, number];
    const stand = d / 2 + SETBACK + 1;
    const standX = x + fx * stand;
    const standZ = z + fz * stand;

    let name = NAMES[model]?.[nameCount.get(model) ?? 0];
    nameCount.set(model, (nameCount.get(model) ?? 0) + 1);
    let icon = ICONS[model];
    if (model === 'house' && !homeAssigned) {
      homeAssigned = true;
      name = 'Your home';
      icon = 'home';
    }
    if (name && icon)
      layout.pois.push({ id: `${model}-${layout.pois.length}`, name, icon, x: standX, z: standZ });
  };

  const rowOf = (pool: readonly ModelId[], length: number, maxDepth: number) => {
    const row: { model: ModelId; w: number }[] = [];
    let used = 0;
    for (let attempt = 0; attempt < 30; attempt++) {
      const model = pick(pool);
      const { w, d } = dims(model);
      if (d > maxDepth || w > length) continue;
      const need = w + (row.length > 0 ? GAP : 0);
      if (used + need <= length) {
        row.push({ model, w });
        used += need;
      }
      if (length - used < 8.5) break;
    }
    return { row, used };
  };

  const fillSide = (block: Block, side: Side, pool: readonly ModelId[], onlyFirst?: ModelId) => {
    const length = side === 'N' || side === 'S' ? BLOCK - 4 : SIDE_LENGTH;
    const { row, used } = onlyFirst
      ? { row: [{ model: onlyFirst, w: dims(onlyFirst).w }], used: dims(onlyFirst).w }
      : rowOf(pool, length, MAX_DEPTH);
    let t = -used / 2;
    for (const { model, w } of row) {
      const { d } = dims(model);
      const along = t + w / 2;
      const half = d / 2;
      const pos = {
        N: [block.cx + along, block.cz - FRONT + half],
        S: [block.cx + along, block.cz + FRONT - half],
        W: [block.cx - FRONT + half, block.cz + along],
        E: [block.cx + FRONT - half, block.cz + along],
      }[side];
      addBuilding(model, pos[0]!, pos[1]!, side);
      t += w + GAP;
    }
  };

  for (const block of layout.blocks) {
    if (block.zone === 'plaza') continue;
    const pool = POOLS[block.zone];
    if (block.zone === 'civic') {
      // the hospital takes the middle of the north side, as a landmark
      addBuilding('hospital', block.cx, block.cz - FRONT + dims('hospital').d / 2, 'N');
    } else {
      fillSide(block, 'N', pool);
    }
    fillSide(block, 'S', pool);
    if (block.zone !== 'civic') {
      fillSide(block, 'W', pool);
      // the landmark tower stands on the east side of the commercial block beside the plaza
      if (block.cx > 0 && block.cz === 0) fillSide(block, 'E', pool, 'skyscraper');
      else fillSide(block, 'E', pool);
    }
  }

  // ---- plaza: fountain, trees, benches
  const fx = layout.fountain.x;
  const fz = layout.fountain.z;
  layout.circles.push({ x: fx, z: fz, r: layout.fountain.r });
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + 0.4;
    layout.placements.push({
      model: 'tree',
      x: fx + Math.cos(a) * 14,
      z: fz + Math.sin(a) * 14,
      yaw: rng() * Math.PI * 2,
    });
    layout.circles.push({ x: fx + Math.cos(a) * 14, z: fz + Math.sin(a) * 14, r: 0.45 });
  }
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const x = fx + Math.cos(a) * 8;
    const z = fz + Math.sin(a) * 8;
    layout.placements.push({ model: 'bench', x, z, yaw: Math.atan2(fx - x, fz - z) });
    layout.circles.push({ x, z, r: 0.9 });
  }
  layout.pois.push({ id: 'plaza', name: 'Central Plaza', icon: 'park', x: fx, z: fz + 9 });
  layout.billboards.push({ x: 0, z: -29, yaw: 0 }, { x: -29, z: 0, yaw: Math.PI / 2 });

  // ---- street furniture along every street, kept clear of intersections
  const place = (model: ModelId, x: number, z: number, yaw = 0, r?: number) => {
    layout.placements.push({ model, x, z, yaw });
    if (r) layout.circles.push({ x, z, r });
  };
  let busStops = 0;
  for (const street of layout.streets) {
    const alongX = street.axis === 'x'; // runs along x, so lateral offsets are in z
    for (const { from, to } of spans) {
      let index = 0;
      for (let p = from + 3; p < to - 2; p += 12, index++) {
        for (const side of [-1, 1]) {
          const at = (along: number, off: number) =>
            alongX
              ? { x: along, z: street.at + side * off }
              : { x: street.at + side * off, z: along };

          if (chance(0.85)) {
            const t = at(p + (side > 0 ? 0 : 6), 5.8);
            place('tree', t.x, t.z, rng() * Math.PI * 2, 0.45);
          }
          if (index % 2 === 0 && chance(0.9)) {
            const l = at(p + 3, 4.6);
            layout.lamps.push(l);
            layout.circles.push({ x: l.x, z: l.z, r: 0.25 });
          }
          if (chance(0.34)) {
            const c = at(p + 6, 2.8);
            const model = pick<ModelId>(['car', 'suv', 'van', 'sports', 'car', 'suv']);
            // cars face the direction of travel on their own side of the street
            const yaw = alongX ? (side > 0 ? Math.PI / 2 : -Math.PI / 2) : side > 0 ? 0 : Math.PI;
            layout.placements.push({ model, x: c.x, z: c.z, yaw });
            const { d } = dims(model);
            for (const k of [-1, 0, 1]) {
              const dx = alongX ? k * (d / 3) : 0;
              const dz = alongX ? 0 : k * (d / 3);
              layout.circles.push({ x: c.x + dx, z: c.z + dz, r: 1 });
            }
          }
          if (index % 5 === 2 && chance(0.7)) {
            const t = at(p + 9, 4.4);
            place(pick<ModelId>(['hydrant', 'trash', 'mailbox']), t.x, t.z, 0, 0.35);
          }
          if (index % 7 === 3 && side > 0 && busStops < 6 && chance(1)) {
            busStops++;
            const t = at(p + 4, 6.3);
            const yaw = alongX ? (side > 0 ? Math.PI : 0) : side > 0 ? -Math.PI / 2 : Math.PI / 2;
            layout.placements.push({ model: 'bus-stop', x: t.x, z: t.z, yaw });
            layout.boxes.push({ x: t.x, z: t.z, hw: alongX ? 1.4 : 0.9, hd: alongX ? 0.9 : 1.4 });
            layout.pois.push({
              id: `bus-${busStops}`,
              name: 'Bus stop',
              icon: 'bus',
              x: t.x + (alongX ? 0 : side * -1.5),
              z: t.z + (alongX ? side * -1.5 : 0),
            });
          }
        }
      }
    }
  }

  // traffic lights at the four central crossings
  for (const ix of lines.slice(1, 3)) {
    for (const iz of lines.slice(1, 3)) {
      for (const [sx, sz] of [
        [-1, -1],
        [1, 1],
      ] as const) {
        place(
          'traffic-light',
          ix + sx * (ROAD / 2 + 0.9),
          iz + sz * (ROAD / 2 + 0.9),
          Math.atan2(-sx, -sz),
          0.3,
        );
      }
    }
  }

  // ATMs near the commercial blocks
  const atms: [number, number][] = [
    [-PITCH + 12, -PITCH + 33],
    [PITCH - 12, PITCH - 33],
  ];
  for (const [x, z] of atms) {
    place('atm', x, z, 0);
    layout.boxes.push({ x, z, hw: 0.5, hd: 0.5 });
    layout.pois.push({ id: `atm-${layout.pois.length}`, name: 'ATM', icon: 'atm', x, z: z + 1.6 });
  }

  // the playable square is closed by four walls
  const o = EXTENT + 2;
  layout.boxes.push(
    { x: 0, z: -o, hw: o, hd: 2 },
    { x: 0, z: o, hw: o, hd: 2 },
    { x: -o, z: 0, hw: 2, hd: o },
    { x: o, z: 0, hw: 2, hd: o },
  );

  return layout;
}
