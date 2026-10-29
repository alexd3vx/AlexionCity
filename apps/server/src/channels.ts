import { CHANNEL_CAPACITY, type District } from '@alexioncity/shared';

/**
 * Splits each district into channels of at most `capacity` players, so a busy district never
 * becomes one huge crowd. A joining player goes to the lowest-numbered channel with room;
 * when everything is full a new channel opens.
 */
export class ChannelRegistry {
  private readonly members = new Map<string, Set<string>>();
  private readonly where = new Map<string, string>();

  constructor(private readonly capacity: number = CHANNEL_CAPACITY) {}

  join(district: District, playerId: string): string {
    this.leave(playerId);
    for (let n = 1; ; n++) {
      const id = `${district}-${n}`;
      const set = this.members.get(id) ?? new Set<string>();
      if (set.size < this.capacity) {
        set.add(playerId);
        this.members.set(id, set);
        this.where.set(playerId, id);
        return id;
      }
    }
  }

  leave(playerId: string): void {
    const id = this.where.get(playerId);
    if (!id) return;
    this.where.delete(playerId);
    const set = this.members.get(id);
    set?.delete(playerId);
    if (set?.size === 0) this.members.delete(id);
  }

  channelOf(playerId: string): string | undefined {
    return this.where.get(playerId);
  }

  membersOf(channelId: string): ReadonlySet<string> {
    return this.members.get(channelId) ?? new Set();
  }

  channelIds(): string[] {
    return [...this.members.keys()];
  }
}
