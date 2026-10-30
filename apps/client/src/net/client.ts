import {
  PROTOCOL_VERSION,
  type AvatarSpec,
  type ClientMessage,
  type Emote,
  type Motion,
  type MoveMode,
  type ReportReason,
  type ServerMessage,
} from '@alexioncity/shared';
export type NetStatus = 'offline' | 'connecting' | 'online' | 'reconnecting' | 'rejected';

export type NetEvent =
  | { kind: 'status'; status: NetStatus; reason?: string }
  | { kind: 'message'; message: ServerMessage };

export interface Credentials {
  token?: string | undefined;
  guestId?: string | undefined;
}

/** The parts of a browser WebSocket this client uses, so tests can supply a fake. */
export interface SocketLike {
  readyState: number;
  send(data: string): void;
  close(code?: number): void;
  onopen: (() => void) | null;
  onmessage: ((e: { data: unknown }) => void) | null;
  onclose: ((e: { code: number }) => void) | null;
  onerror: (() => void) | null;
}

export interface ClientOptions {
  url: string;
  credentials(): Promise<Credentials>;
  name(): string;
  avatar(): AvatarSpec;
  createSocket?: (url: string) => SocketLike;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (id: unknown) => void;
  random?: () => number;
}

export interface LocalState {
  x: number;
  z: number;
  yaw: number;
  motion: Motion;
  mode: MoveMode;
}

const OPEN = 1;
const SEND_EVERY_MS = 100;
const HEARTBEAT_MS = 2000;
/** Server close codes after which reconnecting cannot help. */
const FATAL = new Set([4001, 4002, 4003]);

export const backoffMs = (attempt: number, random = Math.random): number =>
  Math.min(15_000, 1000 * 2 ** Math.min(attempt, 4)) * (0.8 + random() * 0.4);

/**
 * Talks to the game server: signs in, keeps the connection alive across drops, and sends the player's
 * position about ten times a second, but only when it changed (plus a heartbeat).
 */
export class GameClient {
  private socket: SocketLike | undefined;
  private listeners = new Set<(e: NetEvent) => void>();
  private attempt = 0;
  private retry: unknown;
  private tick: unknown;
  private closedByUs = false;
  private seq = 0;
  private lastSent: (LocalState & { at: number }) | undefined;
  private local: LocalState | undefined;
  private _status: NetStatus = 'offline';
  private _selfId: string | undefined;

  constructor(private readonly opts: ClientOptions) {}

  get status(): NetStatus {
    return this._status;
  }

  /** This player's id in the current session, once the server has said hello. */
  get selfId(): string | undefined {
    return this._selfId;
  }

  subscribe(listener: (e: NetEvent) => void): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  private emit(e: NetEvent): void {
    this.listeners.forEach((l) => l(e));
  }

  private setStatus(status: NetStatus, reason?: string): void {
    if (status === this._status && !reason) return;
    this._status = status;
    this.emit({ kind: 'status', status, ...(reason ? { reason } : {}) });
  }

  private timer(fn: () => void, ms: number): unknown {
    return (this.opts.setTimer ?? ((f, m) => setTimeout(f, m)))(fn, ms);
  }

  connect(): void {
    this.closedByUs = false;
    void this.open();
  }

  private async open(): Promise<void> {
    this.setStatus(this.attempt === 0 ? 'connecting' : 'reconnecting');
    let credentials: Credentials;
    try {
      credentials = await this.opts.credentials();
    } catch {
      return this.scheduleRetry();
    }
    if (this.closedByUs) return;

    const socket = (this.opts.createSocket ?? ((u) => new WebSocket(u) as unknown as SocketLike))(
      this.opts.url,
    );
    this.socket = socket;
    socket.onopen = () => {
      const join: ClientMessage = {
        t: 'join',
        v: PROTOCOL_VERSION,
        ...credentials,
        name: this.opts.name(),
        district: 'downtown',
        avatar: this.opts.avatar(),
      };
      socket.send(JSON.stringify(join));
    };
    socket.onmessage = (e) => {
      let message: ServerMessage;
      try {
        message = JSON.parse(String(e.data)) as ServerMessage;
      } catch {
        return;
      }
      if (message.t === 'welcome') {
        this._selfId = message.id;
        this.attempt = 0;
        this.lastSent = undefined;
        this.startSending();
        this.setStatus('online');
      }
      this.emit({ kind: 'message', message });
    };
    socket.onclose = (e) => {
      this.stopSending();
      this._selfId = undefined;
      if (this.socket === socket) this.socket = undefined;
      if (this.closedByUs) return this.setStatus('offline');
      if (FATAL.has(e.code))
        return this.setStatus(
          'rejected',
          e.code === 4003 ? 'banned' : e.code === 4002 ? 'update' : 'sign-in',
        );
      this.scheduleRetry();
    };
    socket.onerror = () => {};
  }

  private scheduleRetry(): void {
    this.setStatus('reconnecting');
    this.retry = this.timer(() => void this.open(), backoffMs(this.attempt++, this.opts.random));
  }

  private startSending(): void {
    this.stopSending();
    const loop = () => {
      this.flushLocal(false);
      this.tick = this.timer(loop, SEND_EVERY_MS);
    };
    this.tick = this.timer(loop, SEND_EVERY_MS);
  }

  private stopSending(): void {
    if (this.tick !== undefined)
      (this.opts.clearTimer ?? ((id) => clearTimeout(id as number)))(this.tick);
    this.tick = undefined;
  }

  /** The player's latest position. Called every frame; only sent when it changed or on the heartbeat. */
  updateLocal(state: LocalState): void {
    this.local = state;
  }

  private flushLocal(force: boolean, now = Date.now()): void {
    const s = this.local;
    if (!s || !this.socket || this.socket.readyState !== OPEN) return;
    const last = this.lastSent;
    const changed =
      !last ||
      Math.abs(last.x - s.x) > 0.02 ||
      Math.abs(last.z - s.z) > 0.02 ||
      Math.abs(last.yaw - s.yaw) > 0.03 ||
      last.motion !== s.motion;
    if (!force && !changed && last && now - last.at < HEARTBEAT_MS) return;
    this.lastSent = { ...s, at: now };
    this.send({
      t: 'move',
      seq: ++this.seq,
      x: Math.round(s.x * 100) / 100,
      z: Math.round(s.z * 100) / 100,
      yaw: Math.round(s.yaw * 100) / 100,
      mode: s.mode,
      motion: s.motion,
    });
  }

  send(message: ClientMessage): boolean {
    if (!this.socket || this.socket.readyState !== OPEN) return false;
    this.socket.send(JSON.stringify(message));
    return true;
  }

  chat(text: string): boolean {
    return this.send({ t: 'chat', text });
  }
  emote(emote: Emote): boolean {
    return this.send({ t: 'emote', emote });
  }
  setAvatar(avatar: AvatarSpec): boolean {
    return this.send({ t: 'avatar', avatar });
  }
  block(targetId: string): boolean {
    return this.send({ t: 'block', targetId });
  }
  unblock(ref: string): boolean {
    return this.send({ t: 'unblock', ref });
  }
  report(targetId: string, reason: ReportReason, details?: string): boolean {
    return this.send({ t: 'report', targetId, reason, ...(details ? { details } : {}) });
  }

  close(): void {
    this.closedByUs = true;
    this.stopSending();
    if (this.retry !== undefined)
      (this.opts.clearTimer ?? ((id) => clearTimeout(id as number)))(this.retry);
    this.socket?.close(1000);
    this.socket = undefined;
    this.setStatus('offline');
  }
}
