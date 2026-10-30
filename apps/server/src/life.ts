import { randomUUID } from 'node:crypto';
import {
  ACTIVITIES,
  afterShift,
  applyEffect,
  BACKGROUNDS,
  BILL_PERIOD_SECONDS,
  billLines,
  billTotal,
  canPlace,
  canTakeJob,
  canWork,
  currentLevel,
  decay,
  depositFor,
  EVICT_AFTER_MISSED,
  findMenuItem,
  fitLayout,
  furnitureById,
  isTutorialStep,
  JOBS,
  jobsAt,
  LATE_FEE,
  layoutComfort,
  newCareer,
  placedCounts,
  randomBackground,
  shiftPay,
  START_NEEDS,
  TUTORIAL,
  UNITS,
  useRate,
  type ActivityKind,
  type BackgroundId,
  type ClientMessage,
  type JobId,
  type LifeSnapshot,
  type Placed,
  type PoiIcon,
  type ServerMessage,
  type TutorialStep,
  type UnitId,
} from '@alexioncity/shared';
import { InsufficientFunds, StoreError, type CharacterRow, type LifeStore } from './life-store';
import { cityLayout, placeNear } from './places';

/** How far from a door the player may be and still use the place. A little looser than the client's 14 m. */
export const USE_RANGE = 18;
/** A worker who wanders this far from the workplace loses the shift. */
const LEAVE_WORK_RANGE = 30;
const SAVE_EVERY_SECONDS = 30;
const MAX_BUY = 10;

/** What the life rules need to know about the connected player, and how to reach them. */
export interface LifeHandle {
  position(): { x: number; z: number };
  send(message: ServerMessage): void;
  notice(text: string, level?: 'info' | 'warning'): void;
  /** Tells the game the player went into or came out of their home. */
  setInside(inside: boolean): void;
  /** Moves the player to a spot, for example to the door after leaving home. */
  moveTo(x: number, z: number): void;
}

type LifeMessage = Extract<
  ClientMessage,
  | { t: 'order' }
  | { t: 'work' }
  | { t: 'quit_job' }
  | { t: 'start' }
  | { t: 'stop' }
  | { t: 'buy' }
  | { t: 'home' }
  | { t: 'place' }
  | { t: 'move_item' }
  | { t: 'store_item' }
  | { t: 'pay_bills' }
  | { t: 'move_unit' }
  | { t: 'statement' }
>;

export const isLifeMessage = (m: ClientMessage): m is LifeMessage =>
  [
    'order',
    'work',
    'quit_job',
    'start',
    'stop',
    'buy',
    'home',
    'place',
    'move_item',
    'store_item',
    'pay_bills',
    'move_unit',
    'statement',
  ].includes(m.t);

interface Activity {
  kind: ActivityKind | 'shift';
  total: number;
  remaining: number;
  job?: JobId;
  /** Where the shift is worked, so walking off can be noticed. */
  at?: { x: number; z: number };
  /** Set once the shift is done and being paid; keeps the same ref so a retry pays once. */
  payRef?: string;
  /** Seconds the player has actually done this. */
  elapsed: number;
}

interface Session {
  userId: string;
  handle: LifeHandle;
  c: CharacterRow;
  layout: Placed[];
  /** Furniture owned, by catalogue id (without the database prefix). */
  owned: Record<string, number>;
  balance: number;
  activity?: Activity;
  inside: boolean;
  dirty: boolean;
  sinceSave: number;
  lastSent: string;
  queue: Promise<void>;
  gone: boolean;
}

const DB_PREFIX = 'furniture:';
const toDb = (id: string) => `${DB_PREFIX}${id}`;

export interface LifeOptions {
  store: LifeStore;
  random?: () => number;
  id?: () => string;
  /** Give every new character this background instead of a random one. For testing. */
  background?: BackgroundId;
  /** Seconds in the city between bills. Shorter than the real thing for testing. */
  billPeriodSeconds?: number;
}

/**
 * The rules of a player's life: needs, work, shopping, bills and the home. Everything is decided here and
 * saved through the store; the browser only asks. Money moves only through the store's ledger functions.
 */
export class LifeService {
  private readonly sessions = new Map<string, Session>();
  private readonly leaving = new Map<string, Promise<void>>();
  private readonly random: () => number;
  private readonly uid: () => string;
  private readonly period: number;

  constructor(private readonly opts: LifeOptions) {
    this.random = opts.random ?? Math.random;
    this.uid = opts.id ?? (() => randomUUID().slice(0, 8));
    this.period = opts.billPeriodSeconds ?? BILL_PERIOD_SECONDS;
  }

  // ---------------------------------------------------------------------------------------------
  // joining and leaving

  /** Load the player's life, creating a character with a random background the first time. */
  async attach(userId: string, handle: LifeHandle): Promise<boolean> {
    // a player who just left may still be saving; wait, so the new session starts from what was saved
    await this.leaving.get(userId);
    try {
      let loaded = await this.opts.store.loadLife(userId);
      if (!loaded) {
        const bg = BACKGROUNDS[this.opts.background ?? randomBackground(this.random)];
        const layout: Placed[] = bg.starter.map((s) => ({ id: this.uid(), ...s }));
        const items = [...placedCounts(layout)].map(([item, qty]) => ({ item: toDb(item), qty }));
        await this.opts.store.createCharacter(userId, {
          background: bg.id,
          money: bg.money,
          debt: bg.debt,
          unit: bg.unit,
          needs: { ...START_NEEDS },
          nextDue: this.period,
          layout,
          items,
        });
        loaded = await this.opts.store.loadLife(userId);
      }
      if (!loaded) return false;
      const owned: Record<string, number> = {};
      for (const [id, qty] of Object.entries(loaded.owned))
        if (id.startsWith(DB_PREFIX)) owned[id.slice(DB_PREFIX.length)] = qty;
      const session: Session = {
        userId,
        handle,
        c: loaded.character,
        layout: loaded.layout,
        owned,
        balance: loaded.balance,
        inside: false,
        dirty: false,
        sinceSave: 0,
        lastSent: '',
        queue: Promise.resolve(),
        gone: false,
      };
      this.sessions.set(userId, session);
      this.push(session, true);
      return true;
    } catch (e) {
      console.error('life load failed:', e instanceof Error ? e.message : e);
      return false;
    }
  }

  /** Save and forget a player who left. */
  detach(userId: string): Promise<void> {
    const s = this.sessions.get(userId);
    if (!s) return this.leaving.get(userId) ?? Promise.resolve();
    s.gone = true;
    this.sessions.delete(userId);
    const done = (async () => {
      await s.queue;
      try {
        await this.opts.store.saveCharacter(userId, s.c);
      } catch (e) {
        console.error('life save failed:', e instanceof Error ? e.message : e);
      }
    })().finally(() => this.leaving.delete(userId));
    this.leaving.set(userId, done);
    return done;
  }

  has(userId: string): boolean {
    return this.sessions.has(userId);
  }

  isInside(userId: string): boolean {
    return this.sessions.get(userId)?.inside ?? false;
  }

  /** For tests and tools: the live state of a player. */
  peek(userId: string): LifeSnapshot | undefined {
    const s = this.sessions.get(userId);
    return s ? this.snapshot(s) : undefined;
  }

  // ---------------------------------------------------------------------------------------------
  // the clock

  /** Move the clock on by `seconds` for every player in the city. Call about once a second. */
  async tick(seconds: number): Promise<void> {
    await Promise.all(
      [...this.sessions.values()].map((s) => this.run(s, () => this.advance(s, seconds))),
    );
  }

  private async advance(s: Session, seconds: number): Promise<void> {
    if (s.gone) return;
    s.c.onlineSeconds += seconds;
    s.c.needs = decay(s.c.needs, seconds, layoutComfort(s.layout));
    s.dirty = true;

    const a = s.activity;
    if (a) await this.progress(s, a, seconds);

    // bills fall due on a clock that only runs while the player is here
    while (s.c.unit && s.c.onlineSeconds >= s.c.nextDue && !s.gone) await this.settleBills(s);

    s.sinceSave += seconds;
    if (s.sinceSave >= SAVE_EVERY_SECONDS && s.dirty) await this.save(s);
    this.push(s);
  }

  private async progress(s: Session, a: Activity, seconds: number): Promise<void> {
    if (a.kind === 'shift') {
      if (a.at) {
        const p = s.handle.position();
        if (Math.hypot(p.x - a.at.x, p.z - a.at.z) > LEAVE_WORK_RANGE && !a.payRef) {
          s.activity = undefined;
          s.handle.notice('You left work early, so there is no pay for that shift.', 'warning');
          return;
        }
      }
      a.elapsed += seconds;
      a.remaining = Math.max(0, a.remaining - seconds);
      if (a.remaining === 0) await this.finishShift(s, a);
      return;
    }

    const def = ACTIVITIES[a.kind];
    const use = 'home' in def.place ? def.place.home : undefined;
    const rate = use ? (useRate(s.layout, use) ?? 1) : 1;
    const dt = Math.min(seconds, a.remaining);
    const effect: Partial<Record<keyof typeof s.c.needs, number>> = {};
    for (const [k, v] of Object.entries(def.perSecond))
      effect[k as keyof typeof effect] = v * dt * (v > 0 ? rate : 1);
    s.c.needs = applyEffect(s.c.needs, effect);
    a.elapsed += dt;
    a.remaining -= dt;
    // stop early when the need being served is full
    const gain = Object.entries(def.perSecond).find(([, v]) => v > 0)?.[0] as
      keyof typeof s.c.needs | undefined;
    if (a.remaining <= 0.0001 || (gain && gain !== 'mood' && s.c.needs[gain] >= 99.5))
      this.endActivity(s, a);
  }

  private endActivity(s: Session, a: Activity): void {
    s.activity = undefined;
    if (a.kind === 'sleep' && a.elapsed >= 5) void this.tutorial(s, 'sleep');
  }

  private async finishShift(s: Session, a: Activity): Promise<void> {
    const job = a.job!;
    const def = JOBS[job];
    const career = s.c.careers[job] ?? newCareer();
    const pay = shiftPay(def, career, s.c.needs.mood);
    a.payRef ??= `shift:${this.uid()}${this.uid()}`;
    try {
      s.balance = await this.opts.store.applyLedger(
        s.userId,
        pay,
        `wages: ${currentLevel(def, career).title}`,
        a.payRef,
      );
    } catch (e) {
      // not paid yet: keep the shift open and try again on the next tick, with the same ref
      this.fail(s, e);
      return;
    }
    const next = afterShift(def, career);
    s.c.careers[job] = next.career;
    s.c.totalShifts += 1;
    s.c.needs = applyEffect(s.c.needs, def.cost);
    s.activity = undefined;
    s.handle.notice(
      next.promoted
        ? `Shift done: +₳${pay}. You were promoted to ${currentLevel(def, next.career).title}!`
        : `Shift done: +₳${pay}.`,
    );
    await this.tutorial(s, 'shift');
    await this.save(s);
  }

  /**
   * Charge one billing cycle. Rent that cannot be paid is owed, with a late fee, and too many misses lose
   * the home. Every ledger call has a fixed ref, so if the database drops out half way the whole cycle
   * can be run again without charging anything twice. State changes are made only once it all went through.
   */
  private async settleBills(s: Session): Promise<void> {
    const period = Math.floor(s.c.nextDue / this.period);
    const lines = billLines(s.c.unit!, s.c.background, s.c.debt);
    let balance = s.balance;
    let owing = s.c.owing;
    let overdue = s.c.overdue;
    let debt = s.c.debt;
    let missedRent = false;
    let paidRent = false;
    try {
      // clear what is owed from earlier cycles first, if the money is there
      if (owing > 0) {
        try {
          balance = await this.opts.store.applyLedger(
            s.userId,
            -owing,
            'overdue rent and fees',
            `arrears:${period}`,
          );
          owing = 0;
          overdue = 0;
        } catch (e) {
          if (!(e instanceof InsufficientFunds)) throw e;
        }
      }
      for (const line of lines) {
        try {
          balance = await this.opts.store.applyLedger(
            s.userId,
            -line.amount,
            line.label,
            `bill:${period}:${line.kind}`,
          );
          if (line.kind === 'loan') debt = Math.max(0, debt - line.amount);
          if (line.kind === 'rent') paidRent = true;
        } catch (e) {
          if (!(e instanceof InsufficientFunds)) throw e;
          if (line.kind === 'rent') missedRent = true;
          // a missed loan installment is simply not taken; the loan stays as it is
          if (line.kind !== 'loan') owing += line.amount;
        }
      }
    } catch (e) {
      // the database is not answering: leave the bill due and try the whole cycle again on the next tick
      this.fail(s, e);
      throw new BillsDeferred();
    }

    if (missedRent) {
      overdue += 1;
      owing += LATE_FEE;
    }
    s.balance = balance;
    s.c.owing = owing;
    s.c.overdue = overdue;
    s.c.debt = debt;
    s.c.nextDue += this.period;
    if (paidRent) await this.tutorial(s, 'rent');

    if (s.c.overdue >= EVICT_AFTER_MISSED) {
      s.c.unit = null;
      s.layout = [];
      s.inside = false;
      s.handle.setInside(false);
      await this.saveLayout(s);
      s.handle.notice(
        'You missed too much rent and lost your home. Your furniture is in storage. Rent a new place in the Home tab.',
        'warning',
      );
    } else if (missedRent) {
      s.handle.notice(
        `You could not pay the rent. ₳${s.c.owing} is overdue; pay it in the bank before it costs you your home.`,
        'warning',
      );
    } else {
      s.handle.notice(`Bills paid: ₳${billTotal(lines)}.`);
    }
    await this.save(s);
  }

  // ---------------------------------------------------------------------------------------------
  // requests

  /** Handle one request from a player. Requests from one player run one after another. */
  handle(userId: string, msg: LifeMessage): Promise<void> {
    const s = this.sessions.get(userId);
    if (!s) return Promise.resolve();
    return this.run(s, async () => {
      if (s.gone) return;
      await this.dispatch(s, msg);
      this.push(s);
    });
  }

  private async dispatch(s: Session, msg: LifeMessage): Promise<void> {
    switch (msg.t) {
      case 'order':
        return this.order(s, msg.item);
      case 'work':
        return this.work(s, msg.job);
      case 'quit_job':
        if (s.activity?.kind === 'shift') s.activity = undefined;
        s.c.job = undefined;
        s.dirty = true;
        return s.handle.notice('You quit your job. Your experience stays with you.');
      case 'start':
        return this.startActivity(s, msg.kind);
      case 'stop':
        return this.stop(s);
      case 'buy':
        return this.buy(s, msg.item, msg.qty);
      case 'home':
        return msg.op === 'enter' ? this.enterHome(s) : this.exitHome(s);
      case 'place':
        return this.place(s, msg);
      case 'move_item':
        return this.moveItem(s, msg);
      case 'store_item':
        return this.storeItem(s, msg.id);
      case 'pay_bills':
        return this.payBills(s);
      case 'move_unit':
        return this.moveUnit(s, msg.unit);
      case 'statement':
        return s.handle.send({
          t: 'statement',
          rows: await this.opts.store.statement(s.userId, 25),
        });
    }
  }

  private busy(s: Session): boolean {
    if (!s.activity) return false;
    s.handle.notice(
      s.activity.kind === 'shift'
        ? 'Finish your shift first, or stop it.'
        : 'You are busy. Stop what you are doing first.',
      'warning',
    );
    return true;
  }

  private near(s: Session, icon: PoiIcon) {
    const p = s.handle.position();
    return placeNear(p.x, p.z, icon, USE_RANGE);
  }

  private async order(s: Session, itemId: string): Promise<void> {
    if (s.inside) return s.handle.notice('You are at home.', 'warning');
    if (this.busy(s)) return;
    const p = s.handle.position();
    // the first place nearby that sells it
    const place = (['food', 'bar', 'hospital'] as PoiIcon[])
      .map((icon) => placeNear(p.x, p.z, icon, USE_RANGE))
      .find((poi) => poi && findMenuItem(poi.icon, itemId));
    const item = place && findMenuItem(place.icon, itemId);
    if (!place || !item)
      return s.handle.notice(
        'Nobody here sells that. Walk to a restaurant, bar or the hospital.',
        'warning',
      );
    try {
      s.balance = await this.opts.store.applyLedger(
        s.userId,
        -item.price,
        `${item.name} at ${place.name}`,
        `order:${this.uid()}${this.uid()}`,
      );
    } catch (e) {
      return this.fail(s, e, 'You do not have enough money for that.');
    }
    s.c.needs = applyEffect(s.c.needs, item.effect);
    s.dirty = true;
    s.handle.notice(`${item.name}: -₳${item.price}.`);
    if ((item.effect.hunger ?? 0) > 0) await this.tutorial(s, 'eat');
  }

  private async work(s: Session, jobId: JobId): Promise<void> {
    const def = JOBS[jobId];
    if (s.inside) return s.handle.notice('Leave your home first.', 'warning');
    if (this.busy(s)) return;
    const place = this.near(s, def.workplace);
    if (!place || !jobsAt(place.icon).some((j) => j.id === jobId))
      return s.handle.notice(
        `You need to be at the ${def.name.toLowerCase()} to work here.`,
        'warning',
      );
    const open = canTakeJob(def, s.c.totalShifts);
    if (!open.ok) return s.handle.notice(open.reason, 'warning');
    const fit = canWork(s.c.needs);
    if (!fit.ok) return s.handle.notice(fit.reason, 'warning');

    const hired = s.c.job !== jobId;
    s.c.job = jobId;
    s.c.careers[jobId] ??= newCareer();
    s.activity = {
      kind: 'shift',
      total: def.shiftSeconds,
      remaining: def.shiftSeconds,
      job: jobId,
      at: { x: place.x, z: place.z },
      elapsed: 0,
    };
    s.dirty = true;
    const level = currentLevel(def, s.c.careers[jobId]!);
    s.handle.notice(
      hired
        ? `You are hired as ${level.title}. Shift started.`
        : 'Shift started. Stay at work until it ends.',
    );
    await this.tutorial(s, 'job');
  }

  private async startActivity(s: Session, kind: ActivityKind): Promise<void> {
    if (this.busy(s)) return;
    const def = ACTIVITIES[kind];
    if ('home' in def.place) {
      if (!s.inside) return s.handle.notice('Go home to do that.', 'warning');
      if (useRate(s.layout, def.place.home) === undefined)
        return s.handle.notice(
          {
            sleep: 'You need a bed.',
            wash: 'You need a shower or a bathtub.',
            relax: 'You need a sofa, an armchair or a TV.',
          }[def.place.home],
          'warning',
        );
    } else if (!this.near(s, def.place.poi)) {
      return s.handle.notice('Go to the plaza to do that.', 'warning');
    }
    const skip = def.skipIfAtLeast;
    if (skip && s.c.needs[skip.key] >= skip.value)
      return s.handle.notice('You do not need that right now.');
    s.activity = { kind, total: def.seconds, remaining: def.seconds, elapsed: 0 };
  }

  private stop(s: Session): void {
    const a = s.activity;
    if (!a) return;
    if (a.kind === 'shift') {
      s.activity = undefined;
      return s.handle.notice('Shift stopped. No pay for an unfinished shift.', 'warning');
    }
    this.endActivity(s, a);
  }

  private async buy(s: Session, itemId: string, qty: number): Promise<void> {
    const def = furnitureById(itemId);
    if (!def) return s.handle.notice('That is not for sale.', 'warning');
    const n = Math.max(1, Math.min(MAX_BUY, Math.floor(qty)));
    try {
      s.balance = await this.opts.store.purchase(
        s.userId,
        toDb(def.id),
        n,
        def.price,
        `buy:${this.uid()}${this.uid()}`,
      );
    } catch (e) {
      return this.fail(s, e, 'You do not have enough money for that.');
    }
    s.owned[def.id] = (s.owned[def.id] ?? 0) + n;
    s.handle.notice(
      `Bought ${n > 1 ? `${n} × ` : ''}${def.name}: -₳${def.price * n}. It is in your storage.`,
    );
  }

  private enterHome(s: Session): void {
    if (!s.c.unit) return s.handle.notice('You have no home. Rent one in the Home tab.', 'warning');
    if (this.busy(s)) return;
    if (!this.near(s, 'home')) return s.handle.notice('Walk to your front door first.', 'warning');
    s.inside = true;
    s.handle.setInside(true);
  }

  private exitHome(s: Session): void {
    if (!s.inside) return;
    if (s.activity) s.activity = undefined;
    s.inside = false;
    const door = cityLayout().pois.find((p) => p.icon === 'home');
    if (door) s.handle.moveTo(door.x, door.z);
    s.handle.setInside(false);
  }

  private placedFree(s: Session, itemId: string): number {
    return (s.owned[itemId] ?? 0) - (placedCounts(s.layout).get(itemId) ?? 0);
  }

  private async place(s: Session, m: Extract<LifeMessage, { t: 'place' }>): Promise<void> {
    if (!s.inside || !s.c.unit)
      return s.handle.notice('Go inside your home to arrange furniture.', 'warning');
    if (this.placedFree(s, m.item) < 1)
      return s.handle.notice('You do not have one of those in storage.', 'warning');
    const ok = canPlace(UNITS[s.c.unit], s.layout, m);
    if (!ok.ok) return s.handle.notice(ok.reason, 'warning');
    s.layout.push({ id: this.uid(), item: m.item, x: m.x, z: m.z, rot: m.rot });
    await this.saveLayout(s);
    await this.tutorial(s, 'decorate');
  }

  private async moveItem(s: Session, m: Extract<LifeMessage, { t: 'move_item' }>): Promise<void> {
    if (!s.inside || !s.c.unit) return;
    const piece = s.layout.find((p) => p.id === m.id);
    if (!piece) return;
    const ok = canPlace(
      UNITS[s.c.unit],
      s.layout,
      { item: piece.item, x: m.x, z: m.z, rot: m.rot },
      piece.id,
    );
    if (!ok.ok) return s.handle.notice(ok.reason, 'warning');
    piece.x = m.x;
    piece.z = m.z;
    piece.rot = m.rot;
    await this.saveLayout(s);
    await this.tutorial(s, 'decorate');
  }

  private async storeItem(s: Session, id: string): Promise<void> {
    if (!s.inside) return;
    const before = s.layout.length;
    s.layout = s.layout.filter((p) => p.id !== id);
    if (s.layout.length !== before) await this.saveLayout(s);
  }

  private async saveLayout(s: Session): Promise<void> {
    try {
      await this.opts.store.saveLayout(s.userId, s.layout);
    } catch (e) {
      this.fail(s, e);
    }
  }

  private async payBills(s: Session): Promise<void> {
    if (s.c.owing <= 0) return s.handle.notice('You have nothing overdue.');
    try {
      s.balance = await this.opts.store.applyLedger(
        s.userId,
        -s.c.owing,
        'overdue rent and fees',
        `arrears:${this.uid()}${this.uid()}`,
      );
    } catch (e) {
      return this.fail(s, e, 'You do not have enough money to clear what you owe.');
    }
    const paid = s.c.owing;
    s.c.owing = 0;
    s.c.overdue = 0;
    s.handle.notice(`Paid ₳${paid} that was overdue.`);
    await this.save(s);
  }

  private async moveUnit(s: Session, unit: UnitId): Promise<void> {
    if (this.busy(s)) return;
    if (s.inside) return s.handle.notice('Leave your home first.', 'warning');
    if (s.c.unit === unit) return s.handle.notice('You already live there.');
    if (s.c.owing > 0) return s.handle.notice('Clear what you owe before you move.', 'warning');
    const deposit = depositFor(unit, s.c.background);
    try {
      s.balance = await this.opts.store.applyLedger(
        s.userId,
        -deposit,
        `deposit: ${UNITS[unit].name}`,
        `move:${this.uid()}${this.uid()}`,
      );
    } catch (e) {
      return this.fail(s, e, `You need ₳${deposit} for the deposit.`);
    }
    const { kept, stored } = fitLayout(UNITS[unit], s.layout);
    s.layout = kept;
    s.c.unit = unit;
    s.c.overdue = 0;
    // the new rent starts a fresh cycle
    s.c.nextDue = s.c.onlineSeconds + this.period;
    await this.saveLayout(s);
    await this.save(s);
    s.handle.notice(
      stored.length > 0
        ? `You moved into the ${UNITS[unit].name}. ${stored.length} piece(s) did not fit and are in storage.`
        : `You moved into the ${UNITS[unit].name}.`,
    );
  }

  // ---------------------------------------------------------------------------------------------
  // helpers

  private async tutorial(s: Session, step: TutorialStep): Promise<void> {
    if (!isTutorialStep(step) || s.c.tutorial[step]) return;
    s.c.tutorial[step] = true;
    s.dirty = true;
    const t = TUTORIAL.find((x) => x.id === step);
    if (t) s.handle.notice(`Done: ${t.title}.`);
  }

  private run(s: Session, fn: () => Promise<void>): Promise<void> {
    const next = s.queue.then(fn).catch((e: unknown) => {
      if (!(e instanceof BillsDeferred))
        console.error('life error:', e instanceof Error ? e.message : e);
    });
    s.queue = next;
    return next;
  }

  /** Tell the player something went wrong, without changing anything. */
  private fail(s: Session, e: unknown, brokeMessage?: string): void {
    if (e instanceof InsufficientFunds)
      return s.handle.notice(brokeMessage ?? 'You do not have enough money.', 'warning');
    if (e instanceof StoreError) console.error('life store:', e.message);
    else console.error('life error:', e instanceof Error ? e.message : e);
    s.handle.notice(
      'Something went wrong on our side. Nothing was charged. Please try again.',
      'warning',
    );
  }

  private async save(s: Session): Promise<void> {
    s.sinceSave = 0;
    try {
      await this.opts.store.saveCharacter(s.userId, s.c);
      s.dirty = false;
    } catch (e) {
      console.error('life save failed:', e instanceof Error ? e.message : e);
    }
  }

  private snapshot(s: Session): LifeSnapshot {
    const lines = s.c.unit ? billLines(s.c.unit, s.c.background, s.c.debt) : [];
    const a = s.activity;
    return {
      balance: s.balance,
      needs: {
        hunger: Math.round(s.c.needs.hunger),
        energy: Math.round(s.c.needs.energy),
        mood: Math.round(s.c.needs.mood),
        hygiene: Math.round(s.c.needs.hygiene),
      },
      background: s.c.background,
      debt: s.c.debt,
      totalShifts: s.c.totalShifts,
      ...(s.c.job ? { job: s.c.job } : {}),
      careers: s.c.careers,
      ...(a
        ? {
            activity: {
              kind: a.kind,
              total: a.total,
              remaining: Math.ceil(a.remaining),
              ...(a.job ? { job: a.job } : {}),
              ...(a.job
                ? { pay: shiftPay(JOBS[a.job], s.c.careers[a.job] ?? newCareer(), s.c.needs.mood) }
                : {}),
            },
          }
        : {}),
      home: {
        unit: s.c.unit,
        inside: s.inside,
        layout: s.layout,
        comfort: layoutComfort(s.layout),
      },
      owned: s.owned,
      bills: {
        dueIn: Math.max(0, Math.round(s.c.nextDue - s.c.onlineSeconds)),
        lines,
        total: billTotal(lines),
        overdue: s.c.overdue,
        owing: s.c.owing,
      },
      tutorial: s.c.tutorial,
    };
  }

  /** Send the player their life if it changed. Time left on an activity does not count as a change: the client counts down itself. */
  private push(s: Session, force = false): void {
    const life = this.snapshot(s);
    const key = JSON.stringify({
      ...life,
      activity: life.activity && { ...life.activity, remaining: 0 },
      bills: { ...life.bills, dueIn: Math.floor(life.bills.dueIn / 30) },
    });
    if (!force && key === s.lastSent) return;
    s.lastSent = key;
    s.handle.send({ t: 'life', life });
  }
}

/** Raised inside bill settling to stop the loop for this tick when the database is not answering. */
class BillsDeferred extends Error {}
