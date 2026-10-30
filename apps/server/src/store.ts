import type { ReportReason } from '@alexioncity/shared';

export interface BlockRow {
  blockedId: string;
  name: string;
}

export interface ChatRow {
  channel: string;
  userId: string;
  name: string;
  text: string;
  at: number;
}

export interface ReportRow {
  reporterId: string;
  targetId: string;
  targetName: string;
  reason: ReportReason;
  details: string;
  channel: string;
  /** The recent chat around the incident, so a moderator can judge it. */
  context: ChatRow[];
  at: number;
}

export interface Sanction {
  kind: 'ban' | 'mute';
  reason: string;
  /** Epoch milliseconds, or null for no end. */
  until: number | null;
}

/** Everything the game server saves or reads that is not live movement. */
export interface Store {
  loadProfile(userId: string): Promise<{ displayName?: string }>;
  loadBlocks(userId: string): Promise<BlockRow[]>;
  addBlock(userId: string, blockedId: string, name: string): Promise<void>;
  removeBlock(userId: string, blockedId: string): Promise<void>;
  saveReport(report: ReportRow): Promise<void>;
  logChat(rows: ChatRow[]): Promise<void>;
  loadSanctions(userId: string): Promise<Sanction[]>;
}

/** Keeps everything in memory. Used by tests and by local development with no database. */
export class MemoryStore implements Store {
  readonly profiles = new Map<string, string>();
  readonly blocks = new Map<string, Map<string, string>>();
  readonly reports: ReportRow[] = [];
  readonly chat: ChatRow[] = [];
  readonly sanctions = new Map<string, Sanction[]>();

  async loadProfile(userId: string) {
    const displayName = this.profiles.get(userId);
    return displayName ? { displayName } : {};
  }
  async loadBlocks(userId: string) {
    return [...(this.blocks.get(userId) ?? [])].map(([blockedId, name]) => ({ blockedId, name }));
  }
  async addBlock(userId: string, blockedId: string, name: string) {
    this.blocks.set(userId, (this.blocks.get(userId) ?? new Map()).set(blockedId, name));
  }
  async removeBlock(userId: string, blockedId: string) {
    this.blocks.get(userId)?.delete(blockedId);
  }
  async saveReport(report: ReportRow) {
    this.reports.push(report);
  }
  async logChat(rows: ChatRow[]) {
    this.chat.push(...rows);
  }
  async loadSanctions(userId: string) {
    return this.sanctions.get(userId) ?? [];
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const isUuid = (s: string): boolean => UUID.test(s);

type FetchFn = typeof fetch;

/**
 * Saves to Supabase over its REST API with the secret key, so it bypasses row-level security: only the
 * server may write blocks, reports and the chat log. A failed call is logged and skipped, so a missing
 * table or a short outage never takes the game down. Dev guests (ids that are not UUIDs) are not saved.
 */
export class SupabaseStore implements Store {
  private readonly base: string;
  private readonly fetchFn: FetchFn;

  constructor(
    url: string,
    private readonly key: string,
    fetchFn?: FetchFn,
    private readonly warn: (message: string) => void = (m) => console.warn(m),
  ) {
    this.base = `${url.replace(/\/$/, '')}/rest/v1`;
    this.fetchFn = fetchFn ?? ((...a) => fetch(...a));
  }

  private async call(
    path: string,
    init: { method?: string; body?: unknown; prefer?: string } = {},
  ): Promise<unknown> {
    try {
      const res = await this.fetchFn(`${this.base}${path}`, {
        method: init.method ?? 'GET',
        headers: {
          apikey: this.key,
          Authorization: `Bearer ${this.key}`,
          'Content-Type': 'application/json',
          ...(init.prefer ? { Prefer: init.prefer } : {}),
        },
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      });
      if (!res.ok) {
        this.warn(`supabase ${init.method ?? 'GET'} ${path.split('?')[0]} failed: ${res.status}`);
        return undefined;
      }
      const text = await res.text();
      return text ? JSON.parse(text) : null;
    } catch (e) {
      this.warn(`supabase request failed: ${e instanceof Error ? e.message : String(e)}`);
      return undefined;
    }
  }

  async loadProfile(userId: string) {
    if (!isUuid(userId)) return {};
    const rows = (await this.call(`/profiles?id=eq.${userId}&select=display_name`)) as
      { display_name: string | null }[] | undefined;
    const name = rows?.[0]?.display_name;
    return name ? { displayName: name } : {};
  }

  async loadBlocks(userId: string) {
    if (!isUuid(userId)) return [];
    const rows = (await this.call(
      `/blocks?blocker_id=eq.${userId}&select=blocked_id,blocked_name`,
    )) as { blocked_id: string; blocked_name: string }[] | undefined;
    return (rows ?? []).map((r) => ({ blockedId: r.blocked_id, name: r.blocked_name }));
  }

  async addBlock(userId: string, blockedId: string, name: string) {
    if (!isUuid(userId) || !isUuid(blockedId)) return;
    await this.call('/blocks', {
      method: 'POST',
      prefer: 'resolution=ignore-duplicates',
      body: { blocker_id: userId, blocked_id: blockedId, blocked_name: name },
    });
  }

  async removeBlock(userId: string, blockedId: string) {
    if (!isUuid(userId) || !isUuid(blockedId)) return;
    await this.call(`/blocks?blocker_id=eq.${userId}&blocked_id=eq.${blockedId}`, {
      method: 'DELETE',
    });
  }

  async saveReport(r: ReportRow) {
    await this.call('/reports', {
      method: 'POST',
      body: {
        reporter_id: isUuid(r.reporterId) ? r.reporterId : null,
        target_id: isUuid(r.targetId) ? r.targetId : null,
        target_name: r.targetName,
        reason: r.reason,
        details: r.details,
        channel: r.channel,
        context: r.context,
        created_at: new Date(r.at).toISOString(),
      },
    });
  }

  async logChat(rows: ChatRow[]) {
    if (rows.length === 0) return;
    await this.call('/chat_log', {
      method: 'POST',
      body: rows.map((r) => ({
        channel: r.channel,
        user_id: isUuid(r.userId) ? r.userId : null,
        name: r.name,
        text: r.text,
        created_at: new Date(r.at).toISOString(),
      })),
    });
  }

  async loadSanctions(userId: string) {
    if (!isUuid(userId)) return [];
    const now = new Date().toISOString();
    const rows = (await this.call(
      `/mod_actions?target_id=eq.${userId}&revoked_at=is.null&or=(expires_at.is.null,expires_at.gt.${encodeURIComponent(now)})&select=kind,reason,expires_at`,
    )) as { kind: 'ban' | 'mute'; reason: string; expires_at: string | null }[] | undefined;
    return (rows ?? []).map((r) => ({
      kind: r.kind,
      reason: r.reason,
      until: r.expires_at ? Date.parse(r.expires_at) : null,
    }));
  }
}
