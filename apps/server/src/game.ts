import {
  CHAT_RADIUS,
  INTEREST_RADIUS,
  isMoveAllowed,
  MOTION_CODES,
  PROTOCOL_VERSION,
  SPAWN,
  type AvatarSpec,
  type BlockEntry,
  type ClientMessage,
  type District,
  type Emote,
  type Motion,
  type Peer,
  type PosUpdate,
  type ServerMessage,
} from '@alexioncity/shared';
import type { Verifier } from './auth';
import { ChannelRegistry } from './channels';
import { cleanName, parseClientMessage } from './messages';
import { ChatGuard } from './moderation';
import type { ChatRow, Store } from './store';

/** What the game needs from a connection; `ws` sockets satisfy it. */
export interface Connection {
  send(data: string): void;
  close(code?: number): void;
}

export interface GameOptions {
  verifier: Verifier;
  store: Store;
  now?: () => number;
  channelCapacity?: number;
}

interface Sent {
  x: number;
  z: number;
  yaw: number;
  motion: Motion;
  /** Bumped when a peer's look or block flag changes, so the receiver is sent the peer again. */
  version: number;
}

interface Player {
  id: string;
  conn: Connection;
  state: 'new' | 'joining' | 'joined';
  userId: string;
  name: string;
  avatar: AvatarSpec;
  district: District;
  channel: string;
  x: number;
  z: number;
  yaw: number;
  motion: Motion;
  version: number;
  lastMoveAt: number;
  /** False until the first move: a returning player may be anywhere, so that one position is taken as given. */
  placed: boolean;
  /** Users this player has blocked, by user id. */
  blocked: Map<string, string>;
  /** What each nearby player looked like the last time this player was told. */
  known: Map<string, Sent>;
  guard: ChatGuard;
  reports: number[];
}

const WORLD_LIMIT = 140;
const LEAVE_MARGIN = 10;
const RECENT_CHAT = 30;
const REPORT_CONTEXT_MS = 3 * 60_000;
const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Live play for one game server. Movement is trusted but speed-checked; this class never touches money
 * or items. Each player is only told about others within INTEREST_RADIUS, so traffic stays small even
 * when a channel is full.
 */
export class GameServer {
  private readonly players = new Map<string, Player>();
  private readonly byUser = new Map<string, string>();
  private readonly recentChat = new Map<string, ChatRow[]>();
  private pendingLog: ChatRow[] = [];
  readonly channels: ChannelRegistry;
  private nextId = 1;
  private readonly now: () => number;

  constructor(private readonly opts: GameOptions) {
    this.now = opts.now ?? Date.now;
    this.channels = new ChannelRegistry(opts.channelCapacity);
  }

  connect(conn: Connection): string {
    const id = `p${this.nextId++}`;
    this.players.set(id, {
      id,
      conn,
      state: 'new',
      userId: '',
      name: '',
      avatar: { frame: '', head: '', body: '', legs: '', feet: '', skin: '', hair: '' },
      district: 'downtown',
      channel: '',
      x: SPAWN.x,
      z: SPAWN.z,
      yaw: SPAWN.yaw,
      motion: 'idle',
      version: 0,
      lastMoveAt: this.now(),
      placed: false,
      blocked: new Map(),
      known: new Map(),
      guard: new ChatGuard(),
      reports: [],
    });
    return id;
  }

  disconnect(id: string): void {
    const p = this.players.get(id);
    if (!p) return;
    this.channels.leave(id);
    if (p.userId && this.byUser.get(p.userId) === id) this.byUser.delete(p.userId);
    this.players.delete(id);
  }

  get playerCount(): number {
    return this.players.size;
  }

  async receive(id: string, raw: string): Promise<void> {
    const p = this.players.get(id);
    if (!p) return;
    const msg = parseClientMessage(raw);
    if (!msg) return this.send(p, { t: 'error', code: 'bad_message' });

    if (msg.t === 'ping') return this.send(p, { t: 'pong', ts: msg.ts });
    if (msg.t === 'join') return this.join(p, msg);
    if (p.state !== 'joined') return this.send(p, { t: 'error', code: 'not_joined' });

    switch (msg.t) {
      case 'move':
        return this.move(p, msg);
      case 'chat':
        return this.chat(p, msg.text);
      case 'emote':
        return this.emote(p, msg.emote);
      case 'avatar':
        p.avatar = msg.avatar;
        p.version++;
        return;
      case 'block':
        return this.block(p, msg.targetId);
      case 'unblock':
        return this.unblock(p, msg.ref);
      case 'report':
        return this.report(p, msg);
    }
  }

  private async join(p: Player, msg: Extract<ClientMessage, { t: 'join' }>): Promise<void> {
    if (p.state !== 'new') return;
    if (msg.v !== PROTOCOL_VERSION) {
      this.send(p, { t: 'error', code: 'bad_version' });
      return p.conn.close(4002);
    }
    p.state = 'joining';

    const identity = await this.opts.verifier.verify({ token: msg.token, guestId: msg.guestId });
    if (!identity) {
      this.send(p, { t: 'error', code: 'auth_failed' });
      return p.conn.close(4001);
    }
    if (!this.players.has(p.id)) return; // the player left while we were checking

    const sanctions = await this.opts.store.loadSanctions(identity.userId);
    const nowMs = this.now();
    if (sanctions.some((s) => s.kind === 'ban' && (s.until === null || s.until > nowMs))) {
      this.send(p, { t: 'error', code: 'banned' });
      return p.conn.close(4003);
    }

    // one connection per account: a newer sign-in replaces an older one
    const existing = this.byUser.get(identity.userId);
    if (existing && existing !== p.id) {
      const old = this.players.get(existing);
      if (old) {
        this.send(old, { t: 'notice', text: 'You signed in somewhere else.', level: 'info' });
        old.conn.close(4000);
        this.disconnect(existing);
      }
    }

    const [profile, blocks] = await Promise.all([
      this.opts.store.loadProfile(identity.userId),
      this.opts.store.loadBlocks(identity.userId),
    ]);
    if (!this.players.has(p.id)) return;

    p.userId = identity.userId;
    this.byUser.set(identity.userId, p.id);
    p.name =
      cleanName(profile.displayName) ??
      cleanName(msg.name) ??
      `Guest${Math.floor(1000 + Math.random() * 9000)}`;
    p.avatar = msg.avatar;
    p.district = msg.district;
    p.blocked = new Map(blocks.map((b) => [b.blockedId, b.name]));
    p.channel = this.channels.join(msg.district, p.id);
    p.lastMoveAt = this.now();
    p.state = 'joined';
    this.send(p, {
      t: 'welcome',
      id: p.id,
      channel: p.channel,
      name: p.name,
      v: PROTOCOL_VERSION,
      blocks: this.blockList(p),
    });
  }

  private move(p: Player, msg: Extract<ClientMessage, { t: 'move' }>): void {
    const t = this.now();
    const dt = (t - p.lastMoveAt) / 1000;
    p.lastMoveAt = t;
    const inBounds = Math.abs(msg.x) <= WORLD_LIMIT && Math.abs(msg.z) <= WORLD_LIMIT;
    // the first position after joining is the starting point (after a reconnect the player is not at the spawn)
    const first = !p.placed && inBounds;
    if (first || (inBounds && isMoveAllowed(p, msg, dt, msg.mode))) {
      p.placed = true;
      p.x = msg.x;
      p.z = msg.z;
      p.yaw = msg.yaw;
      p.motion = msg.motion;
    } else {
      // too fast or out of the world: keep the last good position and tell the client to snap back
      this.send(p, { t: 'correct', seq: msg.seq, x: p.x, z: p.z });
    }
  }

  private nearby(p: Player, radius: number): Player[] {
    const out: Player[] = [];
    for (const id of this.channels.membersOf(p.channel)) {
      const q = this.players.get(id);
      if (q && q.state === 'joined' && Math.hypot(q.x - p.x, q.z - p.z) <= radius) out.push(q);
    }
    return out;
  }

  private chat(p: Player, raw: string): void {
    const verdict = p.guard.check(raw, this.now());
    if (!verdict.ok) return this.send(p, { t: 'notice', text: verdict.message, level: 'warning' });

    const row: ChatRow = {
      channel: p.channel,
      userId: p.userId,
      name: p.name,
      text: verdict.text,
      at: this.now(),
    };
    const ring = this.recentChat.get(p.channel) ?? [];
    ring.push(row);
    if (ring.length > RECENT_CHAT) ring.shift();
    this.recentChat.set(p.channel, ring);
    this.pendingLog.push(row);

    const message: ServerMessage = {
      t: 'chat',
      from: p.id,
      name: p.name,
      text: verdict.text,
      ts: row.at,
    };
    for (const q of this.nearby(p, CHAT_RADIUS)) {
      // blocking works both ways for chat, so a blocked player cannot keep messaging the blocker
      if (q !== p && (q.blocked.has(p.userId) || p.blocked.has(q.userId))) continue;
      this.send(q, message);
    }
  }

  private emote(p: Player, emote: Emote): void {
    for (const q of this.nearby(p, INTEREST_RADIUS)) {
      if (q !== p && q.blocked.has(p.userId)) continue;
      this.send(q, { t: 'emote', from: p.id, emote });
    }
  }

  private blockList(p: Player): BlockEntry[] {
    return [...p.blocked].map(([ref, name]) => ({ ref, name }));
  }

  private async block(p: Player, targetId: string): Promise<void> {
    const target = this.players.get(targetId);
    if (!target || target.state !== 'joined' || target === p || target.channel !== p.channel)
      return;
    p.blocked.set(target.userId, target.name);
    p.known.delete(target.id); // forces the peer to be sent again, now flagged as blocked
    this.send(p, { t: 'blocks', blocks: this.blockList(p) });
    await this.opts.store.addBlock(p.userId, target.userId, target.name);
  }

  private async unblock(p: Player, ref: string): Promise<void> {
    if (!p.blocked.delete(ref)) return;
    const online = this.byUser.get(ref);
    if (online) p.known.delete(online);
    this.send(p, { t: 'blocks', blocks: this.blockList(p) });
    await this.opts.store.removeBlock(p.userId, ref);
  }

  private async report(p: Player, msg: Extract<ClientMessage, { t: 'report' }>): Promise<void> {
    const target = this.players.get(msg.targetId);
    if (!target || target.state !== 'joined' || target === p) return;
    const t = this.now();
    p.reports = p.reports.filter((at) => t - at < 3_600_000);
    if (
      p.reports.length >= 5 ||
      (p.reports.at(-1) !== undefined && t - p.reports.at(-1)! < 10_000)
    ) {
      return this.send(p, {
        t: 'notice',
        text: 'You are sending reports too quickly. Try again in a little while.',
        level: 'warning',
      });
    }
    p.reports.push(t);

    const context = (this.recentChat.get(p.channel) ?? []).filter(
      (r) => t - r.at < REPORT_CONTEXT_MS,
    );
    await this.opts.store.saveReport({
      reporterId: p.userId,
      targetId: target.userId,
      targetName: target.name,
      reason: msg.reason,
      details: (msg.details ?? '').slice(0, 500),
      channel: p.channel,
      context,
      at: t,
    });
    this.send(p, {
      t: 'notice',
      text: 'Thanks. Our team will look at your report.',
      level: 'info',
    });
  }

  /**
   * Send each player the changes around them. Call about 8 times a second: peers that came into or left
   * range, new looks, and positions that changed. Nothing is sent when nothing changed.
   */
  broadcast(): void {
    for (const p of this.players.values()) {
      if (p.state !== 'joined') continue;
      const add: Peer[] = [];
      const remove: string[] = [];
      const updates: PosUpdate[] = [];
      const visible = new Set<string>();

      for (const q of this.nearby(p, INTEREST_RADIUS + LEAVE_MARGIN)) {
        if (q === p) continue;
        const dist = Math.hypot(q.x - p.x, q.z - p.z);
        const known = p.known.get(q.id);
        // enter at the radius, leave a little beyond it, so players on the edge do not flicker
        if (!known && dist > INTEREST_RADIUS) continue;
        visible.add(q.id);

        const motion = MOTION_CODES.indexOf(q.motion);
        const state: Sent = {
          x: round(q.x),
          z: round(q.z),
          yaw: round(q.yaw),
          motion: q.motion,
          version: q.version,
        };
        if (!known || known.version !== q.version) {
          add.push({
            id: q.id,
            name: q.name,
            avatar: q.avatar,
            ...state,
            ...(p.blocked.has(q.userId) ? { blocked: true } : {}),
          });
          p.known.set(q.id, state);
        } else if (
          known.x !== state.x ||
          known.z !== state.z ||
          known.yaw !== state.yaw ||
          known.motion !== state.motion
        ) {
          updates.push([q.id, state.x, state.z, state.yaw, motion]);
          p.known.set(q.id, state);
        }
      }
      for (const id of p.known.keys()) {
        if (!visible.has(id)) {
          remove.push(id);
          p.known.delete(id);
        }
      }
      if (add.length > 0 || remove.length > 0) this.send(p, { t: 'peers', add, remove });
      if (updates.length > 0) this.send(p, { t: 'pos', u: updates });
    }
  }

  /** Write queued chat to the log. Call every few seconds. */
  async flushLogs(): Promise<void> {
    if (this.pendingLog.length === 0) return;
    const batch = this.pendingLog;
    this.pendingLog = [];
    await this.opts.store.logChat(batch);
  }

  private send(p: Player, msg: ServerMessage): void {
    p.conn.send(JSON.stringify(msg));
  }
}
