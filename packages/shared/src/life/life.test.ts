import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ACTIVITIES,
  afterShift,
  applyEffect,
  BACKGROUNDS,
  BACKGROUND_IDS,
  billLines,
  billTotal,
  canPlace,
  canTakeJob,
  canWork,
  currentLevel,
  decay,
  depositFor,
  doorCells,
  doorSpot,
  fitLayout,
  FURNITURE,
  furnitureById,
  JOBS,
  JOB_IDS,
  jobsAt,
  layoutComfort,
  MENUS,
  moodTarget,
  newCareer,
  payMultiplier,
  randomBackground,
  rentFor,
  shiftPay,
  START_NEEDS,
  TUTORIAL,
  UNITS,
  useRate,
  type Needs,
  type Placed,
} from '../index';

const full: Needs = { hunger: 100, energy: 100, mood: 100, hygiene: 100 };

describe('needs', () => {
  it('drains slowly: a full hunger bar lasts hours, not minutes', () => {
    const after10 = decay(full, 600);
    expect(after10.hunger).toBeCloseTo(94, 5);
    expect(after10.energy).toBeCloseTo(95, 5);
    expect(after10.hygiene).toBeCloseTo(96.5, 5);
  });

  it('never goes below 0 or above 100', () => {
    const empty = decay({ hunger: 1, energy: 1, mood: 1, hygiene: 1 }, 6000);
    expect(Object.values(empty).every((v) => v >= 0 && v <= 100)).toBe(true);
    expect(applyEffect(full, { hunger: 50 }).hunger).toBe(100);
    expect(applyEffect({ ...full, hunger: 5 }, { hunger: -50 }).hunger).toBe(0);
  });

  it('pulls mood toward the other needs, and a comfy home lifts the target', () => {
    const hungry: Needs = { hunger: 5, energy: 90, mood: 90, hygiene: 90 };
    expect(moodTarget(hungry, 0)).toBeLessThan(60);
    expect(moodTarget(full, 0)).toBeLessThan(moodTarget(full, 20));
    const later = decay(hungry, 600);
    expect(later.mood).toBeLessThan(90);
  });

  it('settles mood about the same however time is sliced', () => {
    let a: Needs = { ...START_NEEDS };
    for (let i = 0; i < 60; i++) a = decay(a, 10, 4);
    const b = decay(START_NEEDS, 600, 4);
    expect(Math.abs(a.mood - b.mood)).toBeLessThan(2);
  });

  it('stops work when tired or hungry, with a reason', () => {
    expect(canWork(START_NEEDS)).toEqual({ ok: true });
    expect(canWork({ ...START_NEEDS, energy: 10 })).toMatchObject({ ok: false });
    expect(canWork({ ...START_NEEDS, hunger: 5 })).toMatchObject({ ok: false });
  });

  it('pays a little more to happy workers', () => {
    expect(payMultiplier(0)).toBeCloseTo(0.9);
    expect(payMultiplier(100)).toBeCloseTo(1.1);
    expect(payMultiplier(500)).toBeCloseTo(1.1);
  });
});

describe('jobs', () => {
  it('has pay that rises with every level, in every job', () => {
    for (const id of JOB_IDS) {
      const pays = JOBS[id].levels.map((l) => l.pay);
      expect(pays).toEqual([...pays].sort((a, b) => a - b));
      expect(new Set(pays).size).toBe(pays.length);
      expect(JOBS[id].levels.at(-1)!.shiftsToNext).toBe(0);
    }
  });

  it('promotes after enough shifts and resets the count', () => {
    const def = JOBS.kitchen;
    let career = newCareer();
    const levels: number[] = [];
    for (let i = 0; i < 3; i++) {
      const r = afterShift(def, career);
      career = r.career;
      levels.push(career.level);
      if (i < 2) expect(r.promoted).toBe(false);
      else expect(r.promoted).toBe(true);
    }
    expect(levels).toEqual([0, 0, 1]);
    expect(career).toEqual({ level: 1, shifts: 0 });
    expect(currentLevel(def, career).title).toBe('Line cook');
  });

  it('stops promoting at the top', () => {
    let career = { level: 3, shifts: 0 };
    for (let i = 0; i < 20; i++) career = afterShift(JOBS.kitchen, career).career;
    expect(career.level).toBe(3);
  });

  it('scales a shift by mood and rounds to whole Alex', () => {
    expect(shiftPay(JOBS.kitchen, newCareer(), 100)).toBe(40);
    expect(shiftPay(JOBS.kitchen, newCareer(), 0)).toBe(32);
  });

  it('opens the tower only after some experience', () => {
    expect(canTakeJob(JOBS.clerk, 0)).toMatchObject({ ok: false });
    expect(canTakeJob(JOBS.clerk, 5)).toEqual({ ok: true });
    expect(canTakeJob(JOBS.kitchen, 0)).toEqual({ ok: true });
  });

  it('finds the jobs a workplace offers', () => {
    expect(jobsAt('food').map((j) => j.id)).toEqual(['kitchen']);
    expect(jobsAt('atm')).toEqual([]);
  });

  it('is worth working: one hour of shifts pays more than a month of rent and bills', () => {
    const perHour = (3600 / JOBS.kitchen.shiftSeconds) * JOBS.kitchen.levels[0]!.pay;
    expect(perHour).toBeGreaterThan(billTotal(billLines('studio', 'newcomer', 0)) * 1.5);
  });
});

describe('shops', () => {
  it('prices everything above zero and has unique ids per place', () => {
    for (const items of Object.values(MENUS)) {
      expect(new Set(items!.map((i) => i.id)).size).toBe(items!.length);
      for (const i of items!) expect(i.price).toBeGreaterThan(0);
    }
  });

  it('never makes eating cost more than it feeds', () => {
    for (const i of MENUS.food!) expect(i.effect.hunger ?? 0).toBeGreaterThan(i.price / 2);
  });

  it('defines every activity with something to gain', () => {
    for (const a of Object.values(ACTIVITIES)) {
      expect(a.seconds).toBeGreaterThan(0);
      expect(Object.values(a.perSecond).some((v) => v > 0)).toBe(true);
    }
  });
});

describe('furniture', () => {
  it('has unique ids and sane sizes and prices', () => {
    expect(new Set(FURNITURE.map((f) => f.id)).size).toBe(FURNITURE.length);
    for (const f of FURNITURE) {
      expect(f.w).toBeGreaterThanOrEqual(1);
      expect(f.d).toBeGreaterThanOrEqual(1);
      expect(f.price).toBeGreaterThan(0);
    }
  });

  it('only uses models that have a licence entry', () => {
    const licences = JSON.parse(
      readFileSync(new URL('../../../../assets-src/licences.json', import.meta.url), 'utf8'),
    ) as
      | {
          entries?: { file: string }[];
        }
      | { file: string }[];
    const list = Array.isArray(licences) ? licences : (licences.entries ?? []);
    const kebab = (file: string) => file.toLowerCase().replace(/ /g, '-');
    const known = new Set(list.map((e) => kebab(e.file)));
    for (const f of FURNITURE) {
      const hit = [...known].some((k) => k === f.file || k.startsWith(f.file.replace('.glb', '')));
      expect(hit, f.file).toBe(true);
    }
  });
});

describe('homes', () => {
  const studio = UNITS.studio;
  const bed = (x: number, z: number, rot: 0 | 1 | 2 | 3 = 0) => ({ item: 'bed-single', x, z, rot });

  it('accepts a piece inside the room and refuses one outside it', () => {
    expect(canPlace(studio, [], bed(0, 3))).toEqual({ ok: true });
    expect(canPlace(studio, [], bed(0, 5))).toMatchObject({ ok: false }); // 2 cells deep, only 1 row left
    expect(canPlace(studio, [], bed(-1, 3))).toMatchObject({ ok: false });
    expect(canPlace(studio, [], bed(0.5, 3))).toMatchObject({ ok: false });
  });

  it('turns the footprint a quarter turn', () => {
    expect(canPlace(studio, [], bed(0, 5, 1))).toEqual({ ok: true }); // now 2 wide, 1 deep
    expect(canPlace(studio, [], bed(7, 5, 1))).toMatchObject({ ok: false });
  });

  it('keeps the doorway clear', () => {
    const door = doorCells(studio);
    expect(canPlace(studio, [], { item: 'chair', x: door.x, z: 0, rot: 0 })).toMatchObject({
      ok: false,
    });
    expect(canPlace(studio, [], { item: 'rug-square', x: door.x, z: 0, rot: 0 })).toEqual({
      ok: true,
    });
    expect(doorSpot(studio).z).toBeGreaterThan(0);
  });

  it('does not allow two pieces on one cell, but lets furniture stand on a rug', () => {
    const layout: Placed[] = [{ id: 'a', ...bed(0, 3) }];
    expect(canPlace(studio, layout, bed(0, 4))).toMatchObject({ ok: false });
    expect(canPlace(studio, layout, bed(1, 3))).toEqual({ ok: true });
    const rug: Placed[] = [{ id: 'r', item: 'rug-square', x: 2, z: 2, rot: 0 }];
    expect(canPlace(studio, rug, { item: 'sofa', x: 2, z: 2, rot: 0 })).toEqual({ ok: true });
    expect(canPlace(studio, rug, { item: 'rug-round', x: 3, z: 3, rot: 0 })).toMatchObject({
      ok: false,
    });
  });

  it('can move a piece onto its own old cells', () => {
    const layout: Placed[] = [{ id: 'a', ...bed(0, 3) }];
    expect(canPlace(studio, layout, bed(0, 3), 'a')).toEqual({ ok: true });
  });

  it('refuses unknown items and bad turns', () => {
    expect(canPlace(studio, [], { item: 'rocket', x: 0, z: 0, rot: 0 })).toMatchObject({
      ok: false,
    });
    expect(canPlace(studio, [], { item: 'chair', x: 0, z: 0, rot: 7 as never })).toMatchObject({
      ok: false,
    });
  });

  it('sums comfort and finds the best bed', () => {
    const layout: Placed[] = [
      { id: 'a', item: 'bed-single', x: 0, z: 3, rot: 0 },
      { id: 'b', item: 'bed-double', x: 2, z: 3, rot: 0 },
      { id: 'c', item: 'plant', x: 7, z: 5, rot: 0 },
    ];
    expect(layoutComfort(layout)).toBe(2 + 5 + 2);
    expect(useRate(layout, 'sleep')).toBe(1.3);
    expect(useRate(layout, 'wash')).toBeUndefined();
  });

  it('keeps what fits when moving to a smaller place and stores the rest', () => {
    const layout: Placed[] = [
      { id: 'a', item: 'chair', x: 0, z: 0, rot: 0 },
      { id: 'b', item: 'chair', x: 11, z: 8, rot: 0 },
    ];
    const { kept, stored } = fitLayout(UNITS.studio, layout);
    expect(kept.map((p) => p.id)).toEqual(['a']);
    expect(stored.map((p) => p.id)).toEqual(['b']);
  });

  it('makes every unit bigger and dearer than the last', () => {
    const list = [UNITS.studio, UNITS.flat, UNITS.loft];
    for (let i = 1; i < list.length; i++) {
      expect(list[i]!.w * list[i]!.d).toBeGreaterThan(list[i - 1]!.w * list[i - 1]!.d);
      expect(list[i]!.rent).toBeGreaterThan(list[i - 1]!.rent);
    }
  });
});

describe('backgrounds and bills', () => {
  it('starts every background with a valid home that has a bed and a shower', () => {
    for (const id of BACKGROUND_IDS) {
      const bg = BACKGROUNDS[id];
      const layout: Placed[] = [];
      for (const [i, s] of bg.starter.entries()) {
        expect(canPlace(UNITS[bg.unit], layout, s), `${id} ${s.item}`).toEqual({ ok: true });
        layout.push({ id: `s${i}`, ...s });
      }
      expect(useRate(layout, 'sleep')).toBeDefined();
      expect(useRate(layout, 'wash')).toBeDefined();
      for (const s of bg.starter) expect(furnitureById(s.item)).toBeDefined();
    }
  });

  it('gives each background a way to afford the first rent', () => {
    for (const id of BACKGROUND_IDS)
      expect(BACKGROUNDS[id].money).toBeGreaterThan(rentFor('studio', id) * 0.9);
  });

  it('picks backgrounds across the whole range', () => {
    expect(randomBackground(() => 0)).toBe(BACKGROUND_IDS[0]);
    expect(randomBackground(() => 0.999999)).toBe(BACKGROUND_IDS.at(-1));
  });

  it('applies the student discount and the loan installment', () => {
    expect(rentFor('studio', 'student')).toBe(300);
    expect(rentFor('studio', 'newcomer')).toBe(400);
    expect(billLines('studio', 'loan', 3000).map((l) => l.kind)).toEqual([
      'rent',
      'utilities',
      'loan',
    ]);
    expect(billLines('studio', 'loan', 0).map((l) => l.kind)).toEqual(['rent', 'utilities']);
    expect(billLines('studio', 'loan', 40).at(-1)!.amount).toBe(40);
    expect(depositFor('flat', 'student')).toBe(525);
  });
});

describe('tutorial', () => {
  it('lists distinct steps', () => {
    expect(new Set(TUTORIAL.map((t) => t.id)).size).toBe(TUTORIAL.length);
  });
});
