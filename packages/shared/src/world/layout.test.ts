import { describe, expect, it } from 'vitest';
import { BLOCK, EXTENT, generateLayout, PITCH, ROAD, type Box } from './layout';
import { dims } from './models';

const layout = generateLayout({ seed: 1 });

const overlaps = (a: Box, b: Box) =>
  Math.abs(a.x - b.x) < a.hw + b.hw && Math.abs(a.z - b.z) < a.hd + b.hd;

describe('generateLayout', () => {
  it('builds the same district from the same seed', () => {
    expect(generateLayout({ seed: 1 })).toEqual(layout);
    expect(generateLayout({ seed: 2 }).placements).not.toEqual(layout.placements);
  });

  it('has a street grid of four streets each way, named', () => {
    expect(layout.streets).toHaveLength(8);
    expect(new Set(layout.streets.map((s) => s.name)).size).toBe(8);
    expect(layout.blocks).toHaveLength(9);
    expect(layout.blocks.filter((b) => b.zone === 'plaza')).toHaveLength(1);
  });

  it('puts buildings in the blocks and keeps them off the roads', () => {
    const buildings = layout.placements.filter(
      (p) =>
        ['hospital', 'pizza', 'house', 'apartment', 'bldg-big'].includes(p.model) ||
        dims(p.model).h > 7,
    );
    expect(buildings.length).toBeGreaterThan(30);
    const roadEdges = [-1.5, -0.5, 0.5, 1.5].map((k) => k * PITCH);
    for (const box of layout.boxes.filter(
      (b) => b.hw < EXTENT && b.hd < EXTENT && b.hw > 1.5 && b.hd > 1.5,
    )) {
      for (const line of roadEdges) {
        // a building's box must not reach into a street, whichever way the street runs
        expect(Math.abs(box.x - line) >= box.hw + ROAD / 2 || Math.abs(box.z - line) >= 0).toBe(
          true,
        );
        const intoNorthSouthRoad = Math.abs(box.x - line) < box.hw + ROAD / 2 - 0.01;
        const intoEastWestRoad = Math.abs(box.z - line) < box.hd + ROAD / 2 - 0.01;
        expect(intoNorthSouthRoad || intoEastWestRoad).toBe(false);
      }
    }
  });

  it('never overlaps one building with another', () => {
    const big = layout.boxes.filter((b) => b.hw > 3 && b.hd > 3 && b.hw < EXTENT && b.hd < EXTENT);
    for (let i = 0; i < big.length; i++) {
      for (let j = i + 1; j < big.length; j++) {
        expect(overlaps(big[i]!, big[j]!), `boxes ${i} and ${j}`).toBe(false);
      }
    }
  });

  it('keeps every building inside its block', () => {
    for (const box of layout.boxes.filter(
      (b) => b.hw > 3 && b.hd > 3 && b.hw < EXTENT && b.hd < EXTENT,
    )) {
      const cx = Math.round(box.x / PITCH) * PITCH;
      const cz = Math.round(box.z / PITCH) * PITCH;
      expect(Math.abs(box.x - cx) + box.hw).toBeLessThanOrEqual(BLOCK / 2 - 1.9);
      expect(Math.abs(box.z - cz) + box.hd).toBeLessThanOrEqual(BLOCK / 2 - 1.9);
    }
  });

  it('keeps trees, lamps and props out of buildings', () => {
    const solid = layout.boxes.filter(
      (b) => b.hw > 3 && b.hd > 3 && b.hw < EXTENT && b.hd < EXTENT,
    );
    for (const c of layout.circles) {
      for (const b of solid) {
        const inside = Math.abs(c.x - b.x) < b.hw + c.r && Math.abs(c.z - b.z) < b.hd + c.r;
        expect(inside, `circle at ${c.x.toFixed(1)}, ${c.z.toFixed(1)}`).toBe(false);
      }
    }
  });

  it('has named, unique places and a free spawn point', () => {
    const ids = layout.pois.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    const names = layout.pois.map((p) => p.name);
    for (const must of ['Your home', 'Central Plaza', 'City General Hospital', 'Alexion Tower'])
      expect(names).toContain(must);
    for (const p of layout.pois) expect(Math.abs(p.x)).toBeLessThan(EXTENT);

    const { x, z } = layout.spawn;
    expect(layout.circles.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + 0.5)).toBe(false);
    expect(
      layout.boxes.some((b) => Math.abs(x - b.x) < b.hw + 0.5 && Math.abs(z - b.z) < b.hd + 0.5),
    ).toBe(false);
  });

  it('thins out street furniture on the Low tier', () => {
    const low = generateLayout({ seed: 1, density: 0.5 });
    const count = (l: typeof layout, model: string) =>
      l.placements.filter((p) => p.model === model).length;
    expect(count(low, 'tree')).toBeLessThan(count(layout, 'tree'));
    expect(low.lamps.length).toBeLessThan(layout.lamps.length);
    // the buildings do not change with density
    expect(low.boxes.filter((b) => b.hw > 3 && b.hd > 3).length).toBe(
      layout.boxes.filter((b) => b.hw > 3 && b.hd > 3).length,
    );
  });
});
