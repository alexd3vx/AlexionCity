import { isMoveAllowed, type PlayerState, type ServerMessage } from '@alexioncity/shared';
import { ChannelRegistry } from './channels';
import { parseClientMessage } from './messages';

/** What the game needs from a connection; `ws` sockets satisfy it. */
export interface Connection {
  send(data: string): void;
  close(code?: number): void;
}

interface Player extends PlayerState {
  conn: Connection;
  lastMoveAt: number;
}

/**
 * Live movement only. The server trusts clients for where they walk but checks speed, and it
 * never touches money or items: those go through the database (see docs/ARCHITECTURE.md).
 */
export class GameServer {
  private readonly players = new Map<string, Player>();
  readonly channels: ChannelRegistry;
  private nextId = 1;

  constructor(
    private readonly now: () => number = Date.now,
    channelCapacity?: number,
  ) {
    this.channels = new ChannelRegistry(channelCapacity);
  }

  connect(conn: Connection): string {
    const id = `p${this.nextId++}`;
    this.players.set(id, { id, name: '', x: 0, z: 0, yaw: 0, conn, lastMoveAt: this.now() });
    return id;
  }

  disconnect(id: string): void {
    this.channels.leave(id);
    this.players.delete(id);
  }

  receive(id: string, raw: string): void {
    const player = this.players.get(id);
    if (!player) return;
    const msg = parseClientMessage(raw);
    if (!msg) return this.reply(player, { t: 'error', code: 'bad_message' });

    if (msg.t === 'join') {
      player.name = msg.name;
      player.lastMoveAt = this.now();
      const channel = this.channels.join(msg.district, id);
      this.reply(player, { t: 'welcome', id, channel, players: this.snapshot(channel) });
      return;
    }

    if (!this.channels.channelOf(id)) return this.reply(player, { t: 'error', code: 'not_joined' });
    const t = this.now();
    const dt = (t - player.lastMoveAt) / 1000;
    player.lastMoveAt = t;
    if (isMoveAllowed(player, msg, dt, msg.mode)) {
      player.x = msg.x;
      player.z = msg.z;
      player.yaw = msg.yaw;
    } else {
      // too fast: keep the last good position and tell the client to snap back
      this.reply(player, { t: 'correct', seq: msg.seq, x: player.x, z: player.z });
    }
  }

  /** Send every channel's current positions to its members. Call about 10 times a second. */
  broadcast(): void {
    for (const channel of this.channels.channelIds()) {
      const state: ServerMessage = { t: 'state', players: this.snapshot(channel) };
      const payload = JSON.stringify(state);
      for (const id of this.channels.membersOf(channel)) this.players.get(id)?.conn.send(payload);
    }
  }

  private snapshot(channel: string): PlayerState[] {
    return [...this.channels.membersOf(channel)].flatMap((id) => {
      const p = this.players.get(id);
      return p ? [{ id: p.id, name: p.name, x: p.x, z: p.z, yaw: p.yaw }] : [];
    });
  }

  private reply(player: Player, msg: ServerMessage): void {
    player.conn.send(JSON.stringify(msg));
  }

  get playerCount(): number {
    return this.players.size;
  }
}
