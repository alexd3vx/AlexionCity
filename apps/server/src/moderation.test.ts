import { describe, expect, it } from 'vitest';
import {
  ChatGuard,
  cleanChatText,
  containsBlockedWord,
  containsContactInfo,
  normalize,
} from './moderation';

describe('containsBlockedWord', () => {
  it.each([
    'fuck you',
    'what the sh1t',
    'you are a b!tch',
    'f u c k',
    'f.u.c.k',
    'fuuuuck',
    'F U C K',
    'you fucking idiot',
    'go kill yourself',
  ])('blocks %s', (text) => {
    expect(containsBlockedWord(text)).toBe(true);
  });

  it.each([
    'hello there',
    'I love the assignment',
    'Scunthorpe is a town',
    'classic cassette',
    'meet me at the plaza',
    'a bass guitar',
    'shiitake mushrooms',
    'document',
    'passing the exam',
  ])('allows %s', (text) => {
    expect(containsBlockedWord(text)).toBe(false);
  });
});

describe('containsContactInfo', () => {
  it.each([
    'visit www.example.com',
    'http://x.y',
    'mail me at a@b.com',
    'text 0803 123 4567',
    'call +234 803 123 4567',
    'join best-game.io now',
  ])('flags %s', (text) => {
    expect(containsContactInfo(text)).toBe(true);
  });

  it.each([
    'I have 3 cats',
    'meet at 5 pm',
    'it costs 1,200',
    'see you at the plaza.',
    'v1.2 is out',
  ])('allows %s', (text) => {
    expect(containsContactInfo(text)).toBe(false);
  });
});

describe('cleanChatText', () => {
  it('collapses spaces, strips control and invisible characters, and trims', () => {
    expect(
      cleanChatText(
        '  hi' + String.fromCharCode(0) + '   there' + String.fromCharCode(0x200b) + '  ',
      ),
    ).toBe('hi there');
  });

  it('cuts to the maximum length', () => {
    expect(cleanChatText('x'.repeat(500))).toHaveLength(160);
  });
});

describe('normalize', () => {
  it('undoes accents and letter swaps', () => {
    expect(normalize('Ça v4!')).toBe('ca vai');
  });
});

describe('ChatGuard', () => {
  it('lets a normal message through, cleaned', () => {
    expect(new ChatGuard().check('  hello   world ', 0)).toEqual({ ok: true, text: 'hello world' });
  });

  it('rejects empty messages', () => {
    expect(new ChatGuard().check('   ', 0).ok).toBe(false);
  });

  it('rate limits bursts and recovers', () => {
    const g = new ChatGuard();
    for (let i = 0; i < 4; i++) expect(g.check(`message ${i}`, i * 100).ok).toBe(true);
    expect(g.check('one more', 500)).toMatchObject({
      ok: false,
      message: expect.stringContaining('too fast'),
    });
    expect(g.check('later on', 9000).ok).toBe(true);
  });

  it('blocks repeats within 15 seconds', () => {
    const g = new ChatGuard();
    expect(g.check('same thing', 0).ok).toBe(true);
    expect(g.check('Same   thing!', 2000)).toMatchObject({ ok: false });
    expect(g.check('same thing', 20_000).ok).toBe(true);
  });

  it('explains why a message was rejected', () => {
    const g = new ChatGuard();
    expect(g.check('fuck', 0)).toMatchObject({ ok: false, message: 'Please keep chat friendly.' });
    expect(g.check('www.spam.com', 2000)).toMatchObject({
      ok: false,
      message: 'Please do not share links or contact details.',
    });
  });

  it('mutes after three strikes and unmutes later', () => {
    const g = new ChatGuard();
    g.check('fuck', 0);
    g.check('shit', 1000);
    expect(g.check('bitch', 2000)).toMatchObject({
      ok: false,
      message: expect.stringContaining('muted for 5 minutes'),
    });
    expect(g.check('hello', 3000)).toMatchObject({
      ok: false,
      message: expect.stringContaining('muted'),
    });
    expect(g.check('hello again', 6 * 60_000).ok).toBe(true);
  });
});
