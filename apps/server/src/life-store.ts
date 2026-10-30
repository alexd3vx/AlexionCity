import type {
  Career,
  JobId,
  Needs,
  Placed,
  StatementRow,
  TutorialState,
  UnitId,
  BackgroundId,
} from '@alexioncity/shared';
import { isUuid } from './store';

/** What is saved about a player's life, apart from money, items and the furniture layout. */
export interface CharacterRow {
  background: BackgroundId;
  needs: Needs;
  /** Seconds spent in the city. Needs and bills only move while a player is here. */
  onlineSeconds: number;
  job?: JobId | undefined;
  careers: Partial<Record<JobId, Career>>;
  totalShifts: number;
  /** The unit rented, or null after an eviction. */
  unit: UnitId | null;
  /** `onlineSeconds` at which the next bill falls due. */
  nextDue: number;
  overdue: number;
  owing: number;
  debt: number;
  tutorial: TutorialState;
}

export interface LoadedLife {
  character: CharacterRow;
  layout: Placed[];
  /** Items owned by database id, such as `furniture:bed-single`. */
  owned: Record<string, number>;
  balance: number;
}

export interface NewCharacter {
  background: BackgroundId;
  money: number;
  debt: number;
  unit: UnitId;
  needs: Needs;
  nextDue: number;
  layout: Placed[];
  items: { item: string; qty: number }[];
}

/** Thrown when a payment would take the balance below zero. */
export class InsufficientFunds extends Error {
  constructor() {
    super('insufficient_funds');
  }
}

/** Thrown when the database could not be reached or refused; nothing changed. */
export class StoreError extends Error {}

/**
 * Everything the life rules save. Money and items change only here, through the database's own
 * `apply_ledger` and `purchase_item` functions, so a payment and what it buys happen together or not at all.
 */
export interface LifeStore {
  loadLife(userId: string): Promise<LoadedLife | undefined>;
  /** Returns false when the player already had a character. */
  createCharacter(userId: string, input: NewCharacter): Promise<boolean>;
  saveCharacter(userId: string, character: CharacterRow): Promise<void>;
  saveLayout(userId: string, layout: Placed[]): Promise<void>;
  /** Add or take money. A repeated `ref` is applied once. Returns the new balance. */
  applyLedger(userId: string, delta: number, reason: string, ref: string): Promise<number>;
  /** Pay for items and receive them together. A repeated `ref` is applied once. Returns the new balance. */
  purchase(
    userId: string,
    item: string,
    qty: number,
    unitPrice: number,
    ref: string,
  ): Promise<number>;
  statement(userId: string, limit: number): Promise<StatementRow[]>;
}

/** Keeps everything in memory, with the same rules as the database. For tests and local play with no database. */
export class MemoryLifeStore implements LifeStore {
  private readonly lives = new Map<string, { character: CharacterRow; layout: Placed[] }>();
  private readonly balances = new Map<string, number>();
  private readonly owned = new Map<string, Record<string, number>>();
  private readonly ledger = new Map<string, (StatementRow & { ref: string })[]>();
  /** Set to make the next call fail, to test how callers cope. */
  failNext = false;

  constructor(private readonly now: () => number = Date.now) {}

  private check(): void {
    if (this.failNext) {
      this.failNext = false;
      throw new StoreError('simulated outage');
    }
  }

  balanceOf(userId: string): number {
    return this.balances.get(userId) ?? 0;
  }

  async loadLife(userId: string) {
    this.check();
    const life = this.lives.get(userId);
    if (!life) return undefined;
    return {
      character: structuredClone(life.character),
      layout: structuredClone(life.layout),
      owned: { ...(this.owned.get(userId) ?? {}) },
      balance: this.balanceOf(userId),
    };
  }

  async createCharacter(userId: string, input: NewCharacter) {
    this.check();
    if (this.lives.has(userId)) return false;
    this.lives.set(userId, {
      character: {
        background: input.background,
        needs: { ...input.needs },
        onlineSeconds: 0,
        careers: {},
        totalShifts: 0,
        unit: input.unit,
        nextDue: input.nextDue,
        overdue: 0,
        owing: 0,
        debt: input.debt,
        tutorial: {},
      },
      layout: structuredClone(input.layout),
    });
    const owned: Record<string, number> = {};
    for (const i of input.items) owned[i.item] = (owned[i.item] ?? 0) + i.qty;
    this.owned.set(userId, owned);
    if (input.money > 0) await this.applyLedger(userId, input.money, 'starting money', 'start');
    return true;
  }

  async saveCharacter(userId: string, character: CharacterRow) {
    this.check();
    const life = this.lives.get(userId);
    if (life) life.character = structuredClone(character);
  }

  async saveLayout(userId: string, layout: Placed[]) {
    this.check();
    const life = this.lives.get(userId);
    if (life) life.layout = structuredClone(layout);
  }

  async applyLedger(userId: string, delta: number, reason: string, ref: string) {
    this.check();
    const rows = this.ledger.get(userId) ?? [];
    const earlier = rows.find((r) => r.ref === ref);
    if (earlier) return earlier.balance;
    const balance = this.balanceOf(userId);
    if (balance + delta < 0) throw new InsufficientFunds();
    this.balances.set(userId, balance + delta);
    rows.push({ at: this.now(), delta, balance: balance + delta, reason, ref });
    this.ledger.set(userId, rows);
    return balance + delta;
  }

  async purchase(userId: string, item: string, qty: number, unitPrice: number, ref: string) {
    this.check();
    const earlier = (this.ledger.get(userId) ?? []).find((r) => r.ref === ref);
    if (earlier) return earlier.balance;
    const balance = await this.applyLedger(userId, -qty * unitPrice, `purchase: ${item}`, ref);
    const owned = this.owned.get(userId) ?? {};
    owned[item] = (owned[item] ?? 0) + qty;
    this.owned.set(userId, owned);
    return balance;
  }

  async statement(userId: string, limit: number) {
    this.check();
    return [...(this.ledger.get(userId) ?? [])]
      .reverse()
      .slice(0, limit)
      .map(({ at, delta, balance, reason }) => ({ at, delta, balance, reason }));
  }
}

type FetchFn = typeof fetch;

interface CharacterDbRow {
  background: BackgroundId;
  needs: Needs;
  online_seconds: number;
  job: JobId | null;
  careers: Partial<Record<JobId, Career>>;
  total_shifts: number;
  unit: UnitId | null;
  next_due: number;
  overdue: number;
  owing: number;
  debt: number;
  tutorial: TutorialState;
}

/**
 * Saves to Supabase over its REST API with the secret key. Unlike chat logs, money must never be
 * guessed at: when a call fails this throws, and the caller tells the player to try again.
 * Players with a development guest id (not a real account) live in memory instead.
 */
export class SupabaseLifeStore implements LifeStore {
  private readonly base: string;
  private readonly fetchFn: FetchFn;
  private readonly local: MemoryLifeStore;

  constructor(
    url: string,
    private readonly key: string,
    fetchFn?: FetchFn,
    now: () => number = Date.now,
  ) {
    this.base = `${url.replace(/\/$/, '')}/rest/v1`;
    this.fetchFn = fetchFn ?? ((...a) => fetch(...a));
    this.local = new MemoryLifeStore(now);
  }

  private async call(
    path: string,
    init: { method?: string; body?: unknown; prefer?: string } = {},
  ): Promise<unknown> {
    let res: Response;
    try {
      res = await this.fetchFn(`${this.base}${path}`, {
        method: init.method ?? 'GET',
        headers: {
          apikey: this.key,
          Authorization: `Bearer ${this.key}`,
          'Content-Type': 'application/json',
          ...(init.prefer ? { Prefer: init.prefer } : {}),
        },
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      });
    } catch (e) {
      throw new StoreError(
        `supabase request failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    const text = await res.text();
    if (!res.ok) {
      if (text.includes('insufficient_funds')) throw new InsufficientFunds();
      throw new StoreError(
        `supabase ${init.method ?? 'GET'} ${path.split('?')[0]} failed: ${res.status} ${text.slice(0, 200)}`,
      );
    }
    return text ? JSON.parse(text) : null;
  }

  async loadLife(userId: string): Promise<LoadedLife | undefined> {
    if (!isUuid(userId)) return this.local.loadLife(userId);
    const [chars, homes, items, wallets] = (await Promise.all([
      this.call(`/characters?user_id=eq.${userId}&select=*`),
      this.call(`/homes?user_id=eq.${userId}&select=layout`),
      this.call(`/inventory?user_id=eq.${userId}&select=item_id,quantity`),
      this.call(`/wallets?user_id=eq.${userId}&select=balance`),
    ])) as [
      CharacterDbRow[],
      { layout: Placed[] }[],
      { item_id: string; quantity: number }[],
      { balance: number }[],
    ];
    const c = chars[0];
    if (!c) return undefined;
    const owned: Record<string, number> = {};
    for (const i of items) owned[i.item_id] = i.quantity;
    return {
      character: {
        background: c.background,
        needs: c.needs,
        onlineSeconds: Number(c.online_seconds),
        job: c.job ?? undefined,
        careers: c.careers ?? {},
        totalShifts: c.total_shifts,
        unit: c.unit,
        nextDue: Number(c.next_due),
        overdue: c.overdue,
        owing: Number(c.owing),
        debt: Number(c.debt),
        tutorial: c.tutorial ?? {},
      },
      layout: homes[0]?.layout ?? [],
      owned,
      balance: Number(wallets[0]?.balance ?? 0),
    };
  }

  async createCharacter(userId: string, input: NewCharacter) {
    if (!isUuid(userId)) return this.local.createCharacter(userId, input);
    const created = await this.call('/rpc/create_character', {
      method: 'POST',
      body: {
        p_user: userId,
        p_background: input.background,
        p_money: input.money,
        p_debt: input.debt,
        p_unit: input.unit,
        p_needs: input.needs,
        p_next_due: input.nextDue,
        p_layout: input.layout,
        p_items: input.items,
      },
    });
    return created === true;
  }

  async saveCharacter(userId: string, c: CharacterRow) {
    if (!isUuid(userId)) return this.local.saveCharacter(userId, c);
    await this.call(`/characters?user_id=eq.${userId}`, {
      method: 'PATCH',
      body: {
        needs: c.needs,
        online_seconds: Math.round(c.onlineSeconds),
        job: c.job ?? null,
        careers: c.careers,
        total_shifts: c.totalShifts,
        unit: c.unit,
        next_due: Math.round(c.nextDue),
        overdue: c.overdue,
        owing: c.owing,
        debt: c.debt,
        tutorial: c.tutorial,
      },
    });
  }

  async saveLayout(userId: string, layout: Placed[]) {
    if (!isUuid(userId)) return this.local.saveLayout(userId, layout);
    await this.call(`/homes?user_id=eq.${userId}`, { method: 'PATCH', body: { layout } });
  }

  async applyLedger(userId: string, delta: number, reason: string, ref: string) {
    if (!isUuid(userId)) return this.local.applyLedger(userId, delta, reason, ref);
    const balance = await this.call('/rpc/apply_ledger', {
      method: 'POST',
      body: { p_user: userId, p_delta: delta, p_reason: reason, p_ref: ref },
    });
    return Number(balance);
  }

  async purchase(userId: string, item: string, qty: number, unitPrice: number, ref: string) {
    if (!isUuid(userId)) return this.local.purchase(userId, item, qty, unitPrice, ref);
    const balance = await this.call('/rpc/purchase_item', {
      method: 'POST',
      body: { p_user: userId, p_item: item, p_qty: qty, p_unit_price: unitPrice, p_ref: ref },
    });
    return Number(balance);
  }

  async statement(userId: string, limit: number) {
    if (!isUuid(userId)) return this.local.statement(userId, limit);
    const rows = (await this.call(
      `/ledger?user_id=eq.${userId}&order=id.desc&limit=${limit}&select=delta,balance_after,reason,created_at`,
    )) as { delta: number; balance_after: number; reason: string; created_at: string }[];
    return rows.map((r) => ({
      at: Date.parse(r.created_at),
      delta: Number(r.delta),
      balance: Number(r.balance_after),
      reason: r.reason,
    }));
  }
}
