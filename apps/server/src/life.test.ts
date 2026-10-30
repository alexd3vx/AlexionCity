import { describe, expect, it } from 'vitest';
import {
  BILL_PERIOD_SECONDS,
  BACKGROUNDS,
  LATE_FEE,
  UNITS,
  type LifeSnapshot,
  type ServerMessage,
} from '@alexioncity/shared';
import { LifeService, type LifeHandle } from './life';
import { MemoryLifeStore } from './life-store';
import { cityLayout } from './places';

const poi = (icon: string, name?: string) =>
  cityLayout().pois.find((p) => p.icon === icon && (!name || p.name === name))!;
const BACKGROUND_AT = { comfortable: 0.1, loan: 0.3, newcomer: 0.6, student: 0.9 } as const;

interface Rig {
  store: MemoryLifeStore;
  life: LifeService;
  join(
    user: string,
    opts?: { background?: keyof typeof BACKGROUND_AT; at?: { x: number; z: number } },
  ): Promise<Player>;
}

interface Player {
  user: string;
  pos: { x: number; z: number };
  messages: ServerMessage[];
  notices: string[];
  inside: boolean;
  moved: { x: number; z: number }[];
  snap(): LifeSnapshot;
  go(x: { x: number; z: number }): void;
}

function rig(): Rig {
  const store = new MemoryLifeStore();
  let n = 0;
  let random = 0.1;
  const life = new LifeService({
    store,
    random: () => random,
    id: () => `id${(n++).toString(36).padStart(4, '0')}`,
  });
  return {
    store,
    life,
    async join(user, opts = {}) {
      random = BACKGROUND_AT[opts.background ?? 'comfortable'];
      const p: Player = {
        user,
        pos: opts.at ?? { x: 0, z: 17 },
        messages: [],
        notices: [],
        inside: false,
        moved: [],
        snap: () => life.peek(user)!,
        go(to) {
          p.pos = { x: to.x, z: to.z };
        },
      };
      const handle: LifeHandle = {
        position: () => p.pos,
        send: (m) => p.messages.push(m),
        notice: (text) => p.notices.push(text),
        setInside: (v) => (p.inside = v),
        moveTo: (x, z) => {
          p.pos = { x, z };
          p.moved.push({ x, z });
        },
      };
      expect(await life.attach(user, handle)).toBe(true);
      return p;
    },
  };
}

const lastLife = (p: Player) =>
  [...p.messages].reverse().find((m) => m.t === 'life') as
    Extract<ServerMessage, { t: 'life' }> | undefined;

describe('a new character', () => {
  it('gets a background, starting money, a home and a bed, once', async () => {
    const { life, join, store } = rig();
    const ada = await join('ada', { background: 'newcomer' });
    const s = ada.snap();
    expect(s.background).toBe('newcomer');
    expect(s.balance).toBe(BACKGROUNDS.newcomer.money);
    expect(store.balanceOf('ada')).toBe(BACKGROUNDS.newcomer.money);
    expect(s.home.unit).toBe('studio');
    expect(s.home.layout.map((p) => p.item).sort()).toEqual(['bed-single', 'shower']);
    expect(s.owned).toEqual({ 'bed-single': 1, shower: 1 });
    expect(lastLife(ada)?.life.balance).toBe(s.balance);

    await life.detach('ada');
    const again = await join('ada', { background: 'comfortable' });
    expect(again.snap().background).toBe('newcomer');
    expect(store.balanceOf('ada')).toBe(BACKGROUNDS.newcomer.money);
  });

  it('gives each background its own money, debt and discount', async () => {
    const { join } = rig();
    expect((await join('a', { background: 'comfortable' })).snap().balance).toBe(2500);
    expect((await join('b', { background: 'loan' })).snap().debt).toBe(3000);
    expect(
      (await join('c', { background: 'student' })).snap().home.layout.map((p) => p.item),
    ).toContain('desk');
  });

  it('does not let the game in with a broken database, but does not crash', async () => {
    const { life, store } = rig();
    store.failNext = true;
    const ok = await life.attach('x', {
      position: () => ({ x: 0, z: 0 }),
      send: () => {},
      notice: () => {},
      setInside: () => {},
      moveTo: () => {},
    });
    expect(ok).toBe(false);
    expect(life.has('x')).toBe(false);
  });
});

describe('needs over time', () => {
  it('slowly empty while the player is in the city, and are saved when they leave', async () => {
    const { life, join, store } = rig();
    const ada = await join('ada');
    const before = ada.snap().needs;
    await life.tick(600);
    const after = ada.snap().needs;
    expect(after.hunger).toBeLessThan(before.hunger);
    expect(after.hunger).toBeGreaterThan(before.hunger - 10);
    await life.detach('ada');
    const row = await store.loadLife('ada');
    expect(row?.character.onlineSeconds).toBe(600);
    expect(Math.round(row!.character.needs.hunger)).toBe(after.hunger);
  });

  it('stand still while the player is away', async () => {
    const { life, join } = rig();
    const ada = await join('ada');
    await life.tick(300);
    const hungerThen = ada.snap().needs.hunger;
    await life.detach('ada');
    const back = await join('ada');
    expect(back.snap().needs.hunger).toBe(hungerThen);
  });
});

describe('food', () => {
  it('sells a meal at a restaurant: money out, hunger up, first step done', async () => {
    const { life, join, store } = rig();
    const ada = await join('ada', { at: poi('food') });
    await life.tick(1200); // get a little hungry
    const hungry = ada.snap().needs.hunger;
    await life.handle('ada', { t: 'order', item: 'whole-pizza' });
    expect(store.balanceOf('ada')).toBe(2500 - 18);
    expect(ada.snap().balance).toBe(2500 - 18);
    expect(ada.snap().needs.hunger).toBeGreaterThan(hungry);
    expect(ada.snap().tutorial.eat).toBe(true);
    expect((await store.statement('ada', 5))[0]).toMatchObject({ delta: -18 });
  });

  it('is refused away from a restaurant, and for things the place does not sell', async () => {
    const { life, join, store } = rig();
    const ada = await join('ada', { at: { x: 0, z: 17 } });
    await life.handle('ada', { t: 'order', item: 'slice' });
    expect(ada.notices.at(-1)).toMatch(/Nobody here sells/);
    ada.go(poi('food'));
    await life.handle('ada', { t: 'order', item: 'cocktail' });
    expect(ada.notices.at(-1)).toMatch(/Nobody here sells/);
    expect(store.balanceOf('ada')).toBe(2500);
  });

  it('does nothing when the player cannot pay', async () => {
    const { life, join, store } = rig();
    const ada = await join('ada', { background: 'newcomer', at: poi('hospital') });
    await life.handle('ada', { t: 'buy', item: 'bed-double', qty: 1 }); // 320 of 400
    await life.handle('ada', { t: 'order', item: 'checkup' }); // 60 of 80: fine
    await life.handle('ada', { t: 'order', item: 'checkup' }); // 60 of 20: refused
    expect(ada.notices.at(-1)).toMatch(/enough money/);
    expect(store.balanceOf('ada')).toBe(400 - 320 - 60);
  });

  it('lets only one of two simultaneous orders through when the money covers one', async () => {
    const { life, join, store } = rig();
    await join('ada', { background: 'newcomer', at: poi('hospital') });
    await life.handle('ada', { t: 'buy', item: 'bed-double', qty: 1 }); // 80 left
    await Promise.all([
      life.handle('ada', { t: 'order', item: 'checkup' }),
      life.handle('ada', { t: 'order', item: 'checkup' }),
    ]);
    expect(store.balanceOf('ada')).toBe(20);
  });
});

describe('work', () => {
  it('pays a finished shift through the ledger, once', async () => {
    const { life, join, store } = rig();
    const ada = await join('ada', { at: poi('food') });
    await life.handle('ada', { t: 'work', job: 'kitchen' });
    expect(ada.snap().activity).toMatchObject({ kind: 'shift', job: 'kitchen', total: 90 });
    expect(ada.notices.some((n) => /hired as Kitchen hand/.test(n))).toBe(true);

    await life.tick(60);
    expect(store.balanceOf('ada')).toBe(2500); // not yet
    const energyBefore = ada.snap().needs.energy;
    await life.tick(30);
    const pay = store.balanceOf('ada') - 2500;
    expect(pay).toBeGreaterThanOrEqual(33);
    expect(pay).toBeLessThanOrEqual(40);
    expect(ada.snap().activity).toBeUndefined();
    expect(ada.snap().totalShifts).toBe(1);
    expect(ada.snap().needs.energy).toBeLessThan(energyBefore - 5);
    expect(ada.snap().tutorial).toMatchObject({ job: true, shift: true });
    expect((await store.statement('ada', 3))[0]).toMatchObject({ delta: pay });

    await life.tick(120);
    expect(store.balanceOf('ada')).toBe(2500 + pay); // no second payment
  });

  it('promotes after enough shifts and then pays more', async () => {
    const { life, join, store } = rig();
    const ada = await join('ada', { at: poi('food') });
    const pays: number[] = [];
    for (let i = 0; i < 4; i++) {
      const before = store.balanceOf('ada');
      await life.handle('ada', { t: 'work', job: 'kitchen' });
      await life.tick(90);
      pays.push(store.balanceOf('ada') - before);
      // a meal between shifts so hunger never blocks the next one
      await life.handle('ada', { t: 'order', item: 'whole-pizza' });
    }
    expect(ada.snap().careers.kitchen?.level).toBe(1);
    expect(ada.notices.some((n) => /promoted to Line cook/.test(n))).toBe(true);
    expect(pays[3]!).toBeGreaterThan(pays[0]!);
  });

  it('is refused away from the workplace, to the wrong place, while tired, or without experience', async () => {
    const { life, join } = rig();
    const ada = await join('ada', { at: { x: 0, z: 17 } });
    await life.handle('ada', { t: 'work', job: 'kitchen' });
    expect(ada.notices.at(-1)).toMatch(/need to be at/);

    ada.go(poi('bar'));
    await life.handle('ada', { t: 'work', job: 'kitchen' });
    expect(ada.notices.at(-1)).toMatch(/need to be at/);

    ada.go(poi('tower'));
    await life.handle('ada', { t: 'work', job: 'clerk' });
    expect(ada.notices.at(-1)).toMatch(/more shift/);
    expect(ada.snap().activity).toBeUndefined();
  });

  it('is refused when too tired', async () => {
    const { life, join, store } = rig();
    const ada = await join('ada', { at: poi('food') });
    await life.tick(60 * 200); // far too long without sleep
    await life.handle('ada', { t: 'work', job: 'kitchen' });
    expect(ada.notices.at(-1)).toMatch(/too (tired|hungry)/);
    expect(store.balanceOf('ada')).toBeLessThanOrEqual(2500);
  });

  it('cancels with no pay when the player walks away or stops', async () => {
    const { life, join, store } = rig();
    const ada = await join('ada', { at: poi('food') });
    await life.handle('ada', { t: 'work', job: 'kitchen' });
    await life.tick(30);
    ada.go({ x: 0, z: 17 });
    await life.tick(70);
    expect(ada.snap().activity).toBeUndefined();
    expect(ada.notices.at(-1)).toMatch(/left work early/);
    expect(store.balanceOf('ada')).toBe(2500);

    ada.go(poi('food'));
    await life.handle('ada', { t: 'work', job: 'kitchen' });
    await life.handle('ada', { t: 'stop' });
    await life.tick(100);
    expect(store.balanceOf('ada')).toBe(2500);
  });

  it('cannot do two things at once', async () => {
    const { life, join } = rig();
    const ada = await join('ada', { at: poi('food') });
    await life.handle('ada', { t: 'work', job: 'kitchen' });
    await life.handle('ada', { t: 'order', item: 'slice' });
    expect(ada.notices.at(-1)).toMatch(/shift first/);
  });

  it('keeps the shift open and pays exactly once when the database drops out at the end', async () => {
    const { life, join, store } = rig();
    const ada = await join('ada', { at: poi('food') });
    await life.handle('ada', { t: 'work', job: 'kitchen' });
    await life.tick(89);
    store.failNext = true;
    await life.tick(1);
    expect(ada.snap().activity).toBeDefined(); // not lost
    expect(store.balanceOf('ada')).toBe(2500);
    await life.tick(1);
    expect(ada.snap().activity).toBeUndefined();
    const paid = store.balanceOf('ada') - 2500;
    expect(paid).toBeGreaterThan(0);
    await life.tick(10);
    expect(store.balanceOf('ada')).toBe(2500 + paid);
  });

  it('lets the player quit and keep their experience', async () => {
    const { life, join } = rig();
    const ada = await join('ada', { at: poi('food') });
    await life.handle('ada', { t: 'work', job: 'kitchen' });
    await life.tick(90);
    await life.handle('ada', { t: 'quit_job' });
    expect(ada.snap().job).toBeUndefined();
    expect(ada.snap().careers.kitchen?.shifts).toBe(1);
  });
});

describe('the home', () => {
  const goHome = async (life: LifeService, ada: Player) => {
    ada.go(poi('home'));
    await life.handle(ada.user, { t: 'home', op: 'enter' });
  };

  it('can be entered at the front door only, and left at the door', async () => {
    const { life, join } = rig();
    const ada = await join('ada');
    await life.handle('ada', { t: 'home', op: 'enter' });
    expect(ada.inside).toBe(false);
    expect(ada.notices.at(-1)).toMatch(/front door/);

    await goHome(life, ada);
    expect(ada.inside).toBe(true);
    expect(ada.snap().home.inside).toBe(true);
    expect(life.isInside('ada')).toBe(true);

    await life.handle('ada', { t: 'home', op: 'exit' });
    expect(ada.inside).toBe(false);
    expect(ada.moved.at(-1)).toEqual({ x: poi('home').x, z: poi('home').z });
  });

  it('restores energy in bed, faster in a better bed, and only at home', async () => {
    const { life, join } = rig();
    const ada = await join('ada');
    await life.tick(60 * 120);
    await life.handle('ada', { t: 'start', kind: 'sleep' });
    expect(ada.notices.at(-1)).toMatch(/Go home/);

    await goHome(life, ada);
    const tired = ada.snap().needs.energy;
    await life.handle('ada', { t: 'start', kind: 'sleep' });
    expect(ada.snap().activity?.kind).toBe('sleep');
    await life.tick(20);
    expect(ada.snap().needs.energy).toBeGreaterThan(tired + 15);
    await life.tick(80);
    expect(ada.snap().activity).toBeUndefined();
    expect(ada.snap().tutorial.sleep).toBe(true);
  });

  it('needs the right furniture', async () => {
    const { life, join } = rig();
    const ada = await join('ada', { background: 'newcomer' });
    await goHome(life, ada);
    await life.tick(60 * 100);
    await life.handle('ada', { t: 'start', kind: 'relax' });
    expect(ada.notices.at(-1)).toMatch(/sofa/);
    const bed = ada.snap().home.layout.find((p) => p.item === 'bed-single')!;
    await life.handle('ada', { t: 'store_item', id: bed.id });
    await life.handle('ada', { t: 'start', kind: 'sleep' });
    expect(ada.notices.at(-1)).toMatch(/need a bed/);
  });

  it('washes you clean quickly', async () => {
    const { life, join } = rig();
    const ada = await join('ada');
    await life.tick(60 * 200);
    await goHome(life, ada);
    await life.handle('ada', { t: 'start', kind: 'wash' });
    await life.tick(10);
    expect(ada.snap().needs.hygiene).toBeGreaterThan(90);
  });

  it('lets the player buy furniture and place it, but only what they own, where it fits', async () => {
    const { life, join, store } = rig();
    const ada = await join('ada', { background: 'newcomer' });
    await life.handle('ada', { t: 'buy', item: 'plant', qty: 2 });
    expect(store.balanceOf('ada')).toBe(400 - 70);
    expect(ada.snap().owned.plant).toBe(2);

    await life.handle('ada', { t: 'place', item: 'plant', x: 1, z: 1, rot: 0 });
    expect(ada.notices.at(-1)).toMatch(/inside your home/);
    await goHome(life, ada);
    await life.handle('ada', { t: 'place', item: 'plant', x: 1, z: 1, rot: 0 });
    await life.handle('ada', { t: 'place', item: 'plant', x: 1, z: 1, rot: 0 });
    expect(ada.notices.at(-1)).toMatch(/already there/);
    await life.handle('ada', { t: 'place', item: 'plant', x: 2, z: 1, rot: 0 });
    await life.handle('ada', { t: 'place', item: 'plant', x: 3, z: 1, rot: 0 });
    expect(ada.notices.at(-1)).toMatch(/do not have one/);
    expect(ada.snap().home.layout.filter((p) => p.item === 'plant')).toHaveLength(2);
    expect(ada.snap().tutorial.decorate).toBe(true);

    // never in the doorway, never outside the room, never a made-up item
    await life.handle('ada', { t: 'buy', item: 'chair', qty: 1 });
    await life.handle('ada', {
      t: 'place',
      item: 'chair',
      x: UNITS.studio.w / 2 - 1,
      z: 0,
      rot: 0,
    });
    expect(ada.notices.at(-1)).toMatch(/doorway/);
    await life.handle('ada', { t: 'place', item: 'chair', x: 50, z: 50, rot: 0 });
    expect(ada.notices.at(-1)).toMatch(/inside the room/);
    await life.handle('ada', { t: 'buy', item: 'rocket', qty: 1 });
    expect(ada.notices.at(-1)).toMatch(/not for sale/);
  });

  it('moves, turns and stores furniture, and remembers the layout', async () => {
    const { life, join, store } = rig();
    const ada = await join('ada');
    await goHome(life, ada);
    const bed = ada.snap().home.layout.find((p) => p.item === 'bed-single')!;
    await life.handle('ada', { t: 'move_item', id: bed.id, x: 0, z: 1, rot: 0 });
    expect(ada.snap().home.layout.find((p) => p.id === bed.id)).toMatchObject({ x: 0, z: 1 });
    await life.handle('ada', { t: 'move_item', id: bed.id, x: 0, z: 1, rot: 1 });
    expect(ada.snap().home.layout.find((p) => p.id === bed.id)?.rot).toBe(1);
    expect((await store.loadLife('ada'))!.layout.find((p) => p.id === bed.id)).toMatchObject({
      x: 0,
      z: 1,
      rot: 1,
    });
    await life.handle('ada', { t: 'store_item', id: bed.id });
    expect(ada.snap().home.layout.some((p) => p.id === bed.id)).toBe(false);
    expect(ada.snap().owned['bed-single']).toBe(1); // still owned, in storage
  });

  it('does not let money buy things when the database fails: nothing charged, nothing delivered', async () => {
    const { life, join, store } = rig();
    const ada = await join('ada');
    store.failNext = true;
    await life.handle('ada', { t: 'buy', item: 'sofa', qty: 1 });
    expect(ada.notices.at(-1)).toMatch(/Nothing was charged/);
    expect(store.balanceOf('ada')).toBe(2500);
    expect(ada.snap().owned.sofa).toBe(1); // the starter sofa only
  });
});

describe('bills', () => {
  it('charges rent and utilities once an hour in the city, not before', async () => {
    const { life, join, store } = rig();
    const ada = await join('ada', { background: 'newcomer' });
    await life.tick(BILL_PERIOD_SECONDS - 1);
    expect(store.balanceOf('ada')).toBe(400);
    expect(ada.snap().bills.dueIn).toBe(1);
    await life.tick(1);
    // rent is paid in full; the utilities are owed, which costs no home
    expect(store.balanceOf('ada')).toBe(0);
    expect(ada.snap().bills).toMatchObject({ owing: 60, overdue: 0 });
  });

  it('pays rent and utilities from the balance when there is enough, and ticks the tutorial', async () => {
    const { life, join, store } = rig();
    const ada = await join('ada', { background: 'comfortable' });
    await life.tick(BILL_PERIOD_SECONDS);
    expect(store.balanceOf('ada')).toBe(2500 - 400 - 60);
    expect(ada.snap().bills.overdue).toBe(0);
    expect(ada.snap().tutorial.rent).toBe(true);
    expect(ada.snap().bills.dueIn).toBe(BILL_PERIOD_SECONDS);
    const rows = await store.statement('ada', 5);
    expect(rows.map((r) => r.delta).sort((a, b) => a - b)).toEqual(
      [-400, -60, 2500].sort((a, b) => a - b),
    );
  });

  it('gives students cheaper rent and takes loan installments off the debt', async () => {
    const { life, join, store } = rig();
    await join('stu', { background: 'student' });
    await life.tick(BILL_PERIOD_SECONDS);
    expect(store.balanceOf('stu')).toBe(700 - 300 - 60);

    const lo = await join('lo', { background: 'loan' });
    await life.tick(BILL_PERIOD_SECONDS);
    expect(lo.snap().debt).toBe(3000 - 150);
    expect(store.balanceOf('lo')).toBe(1500 - 400 - 60 - 150);
  });

  it('owes what cannot be paid, with a late fee, and warns', async () => {
    const { life, join, store } = rig();
    const ada = await join('ada', { background: 'newcomer' });
    await life.handle('ada', { t: 'buy', item: 'bed-double', qty: 1 }); // 400 -> 80
    await life.tick(BILL_PERIOD_SECONDS);
    const s = ada.snap();
    expect(s.bills.overdue).toBe(1);
    // the utilities (60) fit in what was left; the rent (400) did not, so it is owed with the late fee
    expect(s.bills.owing).toBe(400 + LATE_FEE);
    expect(store.balanceOf('ada')).toBe(20);
    expect(ada.notices.some((n) => /could not pay the rent/.test(n))).toBe(true);
    expect(s.home.unit).toBe('studio');
  });

  it('clears what is owed when the player pays, and the overdue count resets', async () => {
    const { life, join, store } = rig();
    const ada = await join('ada', { background: 'newcomer', at: poi('food') });
    await life.handle('ada', { t: 'buy', item: 'bed-double', qty: 1 });
    await life.tick(BILL_PERIOD_SECONDS);
    const owing = ada.snap().bills.owing;
    expect(owing).toBeGreaterThan(0);
    await life.handle('ada', { t: 'pay_bills' });
    expect(ada.notices.at(-1)).toMatch(/enough money/);
    // a payday arrives from outside, as a test shortcut
    await store.applyLedger('ada', 1000, 'gift', 'gift:1');
    const before = store.balanceOf('ada');
    expect(before).toBeGreaterThanOrEqual(owing);
    await life.handle('ada', { t: 'pay_bills' });
    expect(store.balanceOf('ada')).toBe(before - owing);
    expect(ada.snap().bills.owing).toBe(0);
    expect(ada.snap().bills.overdue).toBe(0);
  });

  it('takes the home after three missed rents and keeps the furniture', async () => {
    const { life, join } = rig();
    const ada = await join('ada', { background: 'newcomer' });
    await life.handle('ada', { t: 'buy', item: 'bed-double', qty: 1 });
    await life.tick(BILL_PERIOD_SECONDS);
    await life.tick(BILL_PERIOD_SECONDS);
    expect(ada.snap().home.unit).toBe('studio');
    await life.tick(BILL_PERIOD_SECONDS);
    const s = ada.snap();
    expect(s.home.unit).toBeNull();
    expect(s.home.layout).toEqual([]);
    expect(s.owned['bed-double']).toBe(1);
    expect(ada.notices.some((n) => /lost your home/.test(n))).toBe(true);
    await life.handle('ada', { t: 'home', op: 'enter' });
    expect(ada.inside).toBe(false);
  });

  it('settles a retry after an outage without charging twice', async () => {
    const { life, join, store } = rig();
    const ada = await join('ada', { background: 'comfortable' });
    await life.tick(BILL_PERIOD_SECONDS - 1);
    store.failNext = true;
    await life.tick(1);
    expect(store.balanceOf('ada')).toBe(2500);
    expect(ada.snap().bills.dueIn).toBe(0);
    await life.tick(1);
    expect(store.balanceOf('ada')).toBe(2500 - 460);
    await life.tick(10);
    expect(store.balanceOf('ada')).toBe(2500 - 460);
  });

  it('does not run the bill clock while the player is away', async () => {
    const { life, join, store } = rig();
    await join('ada', { background: 'comfortable' });
    await life.tick(BILL_PERIOD_SECONDS - 100);
    await life.detach('ada');
    const back = await join('ada');
    expect(back.snap().bills.dueIn).toBe(100);
    expect(store.balanceOf('ada')).toBe(2500);
  });
});

describe('moving house', () => {
  it('costs a deposit, keeps what fits, and starts a fresh bill cycle', async () => {
    const { life, join, store } = rig();
    const ada = await join('ada');
    await life.tick(1000);
    await life.handle('ada', { t: 'move_unit', unit: 'flat' });
    expect(ada.snap().home.unit).toBe('flat');
    expect(store.balanceOf('ada')).toBe(2500 - 700);
    expect(ada.snap().bills.dueIn).toBe(BILL_PERIOD_SECONDS);
    expect(ada.snap().bills.lines[0]).toMatchObject({ kind: 'rent', amount: 700 });
    expect(ada.snap().home.layout.length).toBe(4);
  });

  it('rents a place again after an eviction', async () => {
    const { life, join } = rig();
    const ada = await join('ada', { background: 'newcomer' });
    await life.handle('ada', { t: 'buy', item: 'bed-double', qty: 1 });
    for (let i = 0; i < 3; i++) await life.tick(BILL_PERIOD_SECONDS);
    expect(ada.snap().home.unit).toBeNull();
    await life.handle('ada', { t: 'move_unit', unit: 'studio' });
    expect(ada.notices.at(-1)).toMatch(/Clear what you owe/);
  });

  it('refuses when the money is short', async () => {
    const { life, join, store } = rig();
    const ada = await join('ada', { background: 'newcomer' });
    await life.handle('ada', { t: 'move_unit', unit: 'loft' });
    expect(ada.notices.at(-1)).toMatch(/₳1100/);
    expect(store.balanceOf('ada')).toBe(400);
  });
});

describe('the bank', () => {
  it('lists recent ledger rows, newest first', async () => {
    const { life, join } = rig();
    const ada = await join('ada', { at: poi('food') });
    await life.handle('ada', { t: 'order', item: 'slice' });
    await life.handle('ada', { t: 'order', item: 'soda' });
    await life.handle('ada', { t: 'statement' });
    const rows = (
      ada.messages.filter((m) => m.t === 'statement').at(-1) as Extract<
        ServerMessage,
        { t: 'statement' }
      >
    ).rows;
    expect(rows.map((r) => r.delta)).toEqual([-3, -6, 2500]);
    expect(rows[0]!.balance).toBe(2491);
  });
});
