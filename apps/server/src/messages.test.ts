import { describe, expect, it } from 'vitest';
import { cleanName, parseAvatar, parseClientMessage } from './messages';

const avatar = {
  frame: 'a',
  head: 'casual',
  body: 'casual',
  legs: 'casual',
  feet: 'casual',
  skin: 's3',
  hair: 'h2',
};
const send = (m: unknown) => parseClientMessage(JSON.stringify(m));

describe('parseClientMessage', () => {
  it('accepts every valid message type', () => {
    expect(
      send({ t: 'join', v: 1, token: 'abc', name: 'Ada', district: 'downtown', avatar }),
    ).toMatchObject({ t: 'join', token: 'abc' });
    expect(
      send({ t: 'move', seq: 1, x: 1, z: 2, yaw: 0, mode: 'walk', motion: 'walk' }),
    ).toMatchObject({ t: 'move' });
    expect(send({ t: 'chat', text: 'hi' })).toEqual({ t: 'chat', text: 'hi' });
    expect(send({ t: 'emote', emote: 'wave' })).toEqual({ t: 'emote', emote: 'wave' });
    expect(send({ t: 'avatar', avatar })).toMatchObject({ t: 'avatar' });
    expect(send({ t: 'block', targetId: 'p3' })).toEqual({ t: 'block', targetId: 'p3' });
    expect(send({ t: 'unblock', ref: 'abc' })).toEqual({ t: 'unblock', ref: 'abc' });
    expect(send({ t: 'report', targetId: 'p3', reason: 'spam', details: 'x' })).toMatchObject({
      t: 'report',
      reason: 'spam',
    });
    expect(send({ t: 'ping', ts: 5 })).toEqual({ t: 'ping', ts: 5 });
  });

  it('accepts every valid life message', () => {
    expect(send({ t: 'order', item: 'slice' })).toEqual({ t: 'order', item: 'slice' });
    expect(send({ t: 'work', job: 'kitchen' })).toEqual({ t: 'work', job: 'kitchen' });
    expect(send({ t: 'quit_job' })).toEqual({ t: 'quit_job' });
    expect(send({ t: 'start', kind: 'sleep' })).toEqual({ t: 'start', kind: 'sleep' });
    expect(send({ t: 'stop' })).toEqual({ t: 'stop' });
    expect(send({ t: 'buy', item: 'sofa', qty: 2 })).toEqual({ t: 'buy', item: 'sofa', qty: 2 });
    expect(send({ t: 'home', op: 'enter' })).toEqual({ t: 'home', op: 'enter' });
    expect(send({ t: 'place', item: 'sofa', x: 1, z: 2, rot: 3 })).toEqual({
      t: 'place',
      item: 'sofa',
      x: 1,
      z: 2,
      rot: 3,
    });
    expect(send({ t: 'move_item', id: 'ab12', x: 0, z: 0, rot: 0 })).toMatchObject({
      t: 'move_item',
    });
    expect(send({ t: 'store_item', id: 'ab12' })).toEqual({ t: 'store_item', id: 'ab12' });
    expect(send({ t: 'pay_bills' })).toEqual({ t: 'pay_bills' });
    expect(send({ t: 'move_unit', unit: 'flat' })).toEqual({ t: 'move_unit', unit: 'flat' });
    expect(send({ t: 'statement' })).toEqual({ t: 'statement' });
  });

  it('ignores extra fields on life messages', () => {
    expect(send({ t: 'order', item: 'slice', price: 0 })).toEqual({ t: 'order', item: 'slice' });
    expect(send({ t: 'stop', free: true })).toEqual({ t: 'stop' });
  });

  it.each([
    'not json',
    '[]',
    JSON.stringify({ t: 'nope' }),
    JSON.stringify({ t: 'join', v: 1, name: 'A', district: 'mars', avatar }),
    JSON.stringify({
      t: 'join',
      v: 1,
      name: 'A',
      district: 'downtown',
      avatar: { ...avatar, head: 'a b' },
    }),
    JSON.stringify({ t: 'move', seq: 1, x: 'one', z: 2, yaw: 0, mode: 'walk', motion: 'walk' }),
    JSON.stringify({ t: 'move', seq: 1, x: 1, z: 2, yaw: 0, mode: 'teleport', motion: 'walk' }),
    JSON.stringify({ t: 'chat', text: 'x'.repeat(601) }),
    JSON.stringify({ t: 'emote', emote: 'dab' }),
    JSON.stringify({ t: 'report', targetId: 'p3', reason: 'because' }),
    JSON.stringify({ t: 'block', targetId: '' }),
    JSON.stringify({ t: 'order', item: '' }),
    JSON.stringify({ t: 'order', item: 'x'.repeat(40) }),
    JSON.stringify({ t: 'work', job: 'president' }),
    JSON.stringify({ t: 'start', kind: 'fly' }),
    JSON.stringify({ t: 'buy', item: 'sofa', qty: 0 }),
    JSON.stringify({ t: 'buy', item: 'sofa', qty: 11 }),
    JSON.stringify({ t: 'buy', item: 'sofa', qty: 1.5 }),
    JSON.stringify({ t: 'buy', item: 'sofa', qty: '2' }),
    JSON.stringify({ t: 'home', op: 'sell' }),
    JSON.stringify({ t: 'place', item: 'sofa', x: 1.5, z: 2, rot: 0 }),
    JSON.stringify({ t: 'place', item: 'sofa', x: 1, z: 2, rot: 4 }),
    JSON.stringify({ t: 'place', item: 'sofa', x: 'a', z: 2, rot: 0 }),
    JSON.stringify({ t: 'move_item', id: '', x: 1, z: 2, rot: 0 }),
    JSON.stringify({ t: 'move_unit', unit: 'palace' }),
  ])('rejects %s', (raw) => {
    expect(parseClientMessage(raw)).toBeUndefined();
  });
});

describe('parseAvatar', () => {
  it('only accepts short plain ids', () => {
    expect(parseAvatar(avatar)).toEqual(avatar);
    expect(parseAvatar({ ...avatar, skin: '<script>' })).toBeUndefined();
    expect(parseAvatar({ ...avatar, hair: 'x'.repeat(40) })).toBeUndefined();
    expect(parseAvatar(null)).toBeUndefined();
  });
});

describe('cleanName', () => {
  it('keeps letters, numbers and simple punctuation, and trims', () => {
    expect(cleanName('  Ada   Lovelace ')).toBe('Ada Lovelace');
    expect(cleanName('<b>Bob</b>')).toBe('bBobb');
    expect(cleanName('Zoë_1')).toBe('Zoë_1');
  });

  it('refuses names that are too short and cuts long ones', () => {
    expect(cleanName('!')).toBeUndefined();
    expect(cleanName('x'.repeat(50))).toHaveLength(20);
    expect(cleanName(42)).toBeUndefined();
  });
});
