import { describe, expect, it } from 'vitest';
import { type ServerMessage } from '@alexioncity/shared';
import { initialRoom, MAX_LINES, rejectionText, roomReducer, type RoomState } from './room';

const none = new Set<string>();
const msg = (state: RoomState, message: ServerMessage, muted: ReadonlySet<string> = none) =>
  roomReducer(state, { type: 'message', message, muted });
const welcome: ServerMessage = {
  t: 'welcome',
  id: 'me',
  channel: 'downtown-1',
  name: 'Ada',
  v: 1,
  blocks: [],
};

describe('roomReducer', () => {
  it('remembers who the player is from the welcome', () => {
    const s = msg(initialRoom, welcome);
    expect(s).toMatchObject({ selfId: 'me', channel: 'downtown-1', name: 'Ada' });
  });

  it("marks the player's own lines and does not count them as unread", () => {
    let s = msg(initialRoom, welcome);
    s = msg(s, { t: 'chat', from: 'me', name: 'Ada', text: 'hi', ts: 1 });
    s = msg(s, { t: 'chat', from: 'p2', name: 'Bo', text: 'hello', ts: 2 });
    expect(s.lines.map((l) => l.self)).toEqual([true, false]);
    expect(s.unread).toBe(1);
    expect(roomReducer(s, { type: 'read' }).unread).toBe(0);
  });

  it('drops chat from muted players', () => {
    let s = msg(initialRoom, welcome);
    s = msg(s, { t: 'chat', from: 'p2', name: 'Bo', text: 'spam', ts: 1 }, new Set(['p2']));
    expect(s.lines).toHaveLength(0);
    expect(s.unread).toBe(0);
  });

  it('keeps only the latest lines', () => {
    let s = msg(initialRoom, welcome);
    for (let i = 0; i < MAX_LINES + 10; i++)
      s = msg(s, { t: 'chat', from: 'p2', name: 'Bo', text: `m${i}`, ts: i });
    expect(s.lines).toHaveLength(MAX_LINES);
    expect(s.lines.at(-1)!.text).toBe(`m${MAX_LINES + 9}`);
  });

  it('follows the block list the server sends', () => {
    const s = msg(initialRoom, { t: 'blocks', blocks: [{ ref: 'u1', name: 'Bo' }] });
    expect(s.blocks).toEqual([{ ref: 'u1', name: 'Bo' }]);
  });

  it('turns notices and rate limits into a notice', () => {
    expect(
      msg(initialRoom, { t: 'notice', text: 'No links please.', level: 'warning' }).notice,
    ).toMatchObject({
      text: 'No links please.',
      level: 'warning',
    });
    expect(msg(initialRoom, { t: 'error', code: 'rate_limited' }).notice?.level).toBe('warning');
    expect(msg(initialRoom, { t: 'error', code: 'bad_message' })).toBe(initialRoom);
  });

  it('forgets the session id when the connection drops, and keeps the reason when refused', () => {
    let s = msg(initialRoom, welcome);
    s = roomReducer(s, { type: 'status', status: 'reconnecting' });
    expect(s.selfId).toBeUndefined();
    s = roomReducer(s, { type: 'status', status: 'rejected', reason: 'banned' });
    expect(s.reason).toBe('banned');
    s = roomReducer(s, { type: 'status', status: 'online' });
    expect(s.reason).toBeUndefined();
  });
});

describe('life messages', () => {
  const life = {
    balance: 2500,
    needs: { hunger: 80, energy: 85, mood: 70, hygiene: 85 },
    background: 'comfortable',
    debt: 0,
    totalShifts: 0,
    careers: {},
    home: { unit: 'studio', inside: false, layout: [], comfort: 0 },
    owned: {},
    bills: { dueIn: 3600, lines: [], total: 0, overdue: 0, owing: 0 },
    tutorial: {},
  } as const;

  it('keeps the latest life and when it arrived', () => {
    const s = roomReducer(initialRoom, {
      type: 'message',
      message: { t: 'life', life: life as never },
      muted: none,
      at: 1234,
    });
    expect(s.life?.balance).toBe(2500);
    expect(s.lifeAt).toBe(1234);
    const next = roomReducer(s, {
      type: 'message',
      message: { t: 'life', life: { ...life, balance: 10 } as never },
      muted: none,
      at: 1300,
    });
    expect(next.life?.balance).toBe(10);
  });

  it('keeps the life shown while the connection drops', () => {
    let s = msg(initialRoom, { t: 'life', life: life as never });
    s = roomReducer(s, { type: 'status', status: 'reconnecting' });
    expect(s.life?.balance).toBe(2500);
  });

  it('keeps the statement the server sends', () => {
    const rows = [{ at: 1, delta: -6, balance: 94, reason: 'Pizza slice' }];
    expect(msg(initialRoom, { t: 'statement', rows }).statement).toEqual(rows);
  });

  it('keeps every notice in order, so two that arrive together are both shown', () => {
    let s = msg(initialRoom, { t: 'notice', text: 'Shift done: +₳38.', level: 'info' });
    s = msg(s, { t: 'notice', text: 'Done: Work a shift.', level: 'info' });
    expect(s.notices.map((n) => n.text)).toEqual(['Shift done: +₳38.', 'Done: Work a shift.']);
    expect(s.notices[1]!.key).toBeGreaterThan(s.notices[0]!.key);
    expect(s.notice?.text).toBe('Done: Work a shift.');
  });

  it('does not keep an endless list of notices', () => {
    let s = initialRoom;
    for (let i = 0; i < 30; i++) s = msg(s, { t: 'notice', text: `n${i}`, level: 'info' });
    expect(s.notices.length).toBeLessThanOrEqual(8);
    expect(s.notices.at(-1)?.text).toBe('n29');
  });
});

describe('rejectionText', () => {
  it('speaks plainly', () => {
    expect(rejectionText('banned')).toMatch(/suspended/);
    expect(rejectionText('update')).toMatch(/Refresh/);
    expect(rejectionText(undefined)).toMatch(/sign you in/);
  });
});
