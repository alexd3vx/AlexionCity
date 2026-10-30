import { describe, expect, it } from 'vitest';
import { ChannelRegistry } from './channels';

describe('ChannelRegistry', () => {
  it('fills a channel to capacity, then opens the next', () => {
    const channels = new ChannelRegistry(2);
    expect(channels.join('downtown', 'a')).toBe('downtown-1');
    expect(channels.join('downtown', 'b')).toBe('downtown-1');
    expect(channels.join('downtown', 'c')).toBe('downtown-2');
  });

  it('reuses the lowest channel with room after someone leaves', () => {
    const channels = new ChannelRegistry(1);
    channels.join('market', 'a');
    channels.join('market', 'b');
    channels.leave('a');
    expect(channels.join('market', 'c')).toBe('market-1');
  });

  it('moves a player instead of keeping two memberships', () => {
    const channels = new ChannelRegistry(5);
    channels.join('market', 'a');
    channels.join('harbor', 'a');
    expect(channels.membersOf('market-1').size).toBe(0);
    expect(channels.channelOf('a')).toBe('harbor-1');
  });
});
