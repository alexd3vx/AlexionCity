import { CHAT_MAX_LENGTH } from '@alexioncity/shared';

/**
 * Chat safety, applied by the server before any message reaches another player.
 *
 * This is a starter filter: a short English word list, link and contact-detail blocking, and rate
 * limits. It will not catch everything (other languages, Nigerian Pidgin, creative spelling). Before a
 * public launch it needs a maintained multilingual list or a moderation service; reports are the
 * safety net for what slips through.
 */

// whole-word matches only, for short words that appear inside harmless words (ass in "assignment")
const EXACT = new Set([
  'ass',
  'dick',
  'cunt',
  'fuck',
  'shit',
  'shits',
  'shitty',
  'shitting',
  'shithead',
  'shite',
  'piss',
  'slut',
  'whore',
  'porn',
  'kys',
  'rape',
  'nazi',
  'tits',
  'cock',
  'wank',
]);
// a word that starts with one of these is blocked ("fucking", "bitches")
// ('shit' is not a stem: "shiitake" starts with it once repeated letters are collapsed)
const STEMS = [
  'fuck',
  'bitch',
  'asshole',
  'nigg',
  'fagg',
  'whore',
  'slut',
  'retard',
  'rapist',
  'pussy',
  'bastard',
  'motherf',
  'dickhead',
];
const PHRASES = ['kill yourself', 'kill your self', 'go die', 'hang yourself'];

const LEET: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  $: 's',
  '!': 'i',
  '+': 't',
};

/** Lower-case, strip accents, undo common letter swaps ("sh1t"), and keep only letters and spaces. */
export function normalize(text: string): string {
  const mapped = [...text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()]
    .map((c) => LEET[c] ?? c)
    .join('');
  return mapped
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "f u c k" and "f.u.c.k" become "fuck": runs of single letters are joined into one word. */
function tokens(normalized: string): string[] {
  const words = normalized.split(' ').filter(Boolean);
  const out: string[] = [];
  let run = '';
  for (const w of words) {
    if (w.length === 1) {
      run += w;
      continue;
    }
    if (run) {
      out.push(run);
      run = '';
    }
    out.push(w);
  }
  if (run) out.push(run);
  // "fuuuck" -> "fuck": collapse repeated letters
  return out.map((w) => w.replace(/(.)\1{2,}/g, '$1$1').replace(/(.)\1+/g, '$1'));
}

export function containsBlockedWord(text: string): boolean {
  const normalized = normalize(text);
  if (PHRASES.some((p) => normalized.includes(p))) return true;
  return tokens(normalized).some((w) => EXACT.has(w) || STEMS.some((s) => w.startsWith(s)));
}

/** Links, email addresses and phone numbers: players, many of them teenagers, should not trade contact details. */
export function containsContactInfo(text: string): boolean {
  if (/(https?:\/\/|www\.)/i.test(text)) return true;
  if (/[^\s@]+@[^\s@]+\.[a-z]{2,}/i.test(text)) return true;
  if (/\b[a-z0-9-]{2,}\.(com|net|org|io|ng|co|me|app|gg|ly|xyz|link|ru|tk)\b/i.test(text))
    return true;
  return /\d{7,}/.test(text.replace(/[\s().+-]/g, ''));
}

/* eslint-disable no-control-regex -- removing control characters is the point of this pattern */
/** Control characters and invisible or direction-changing characters that can hide or reorder text. */
const HIDDEN = new RegExp(
  '[\\u0000-\\u001f\\u007f\\u200b-\\u200f\\u2028-\\u202e\\u2060-\\u206f]',
  'g',
);
/* eslint-enable no-control-regex */

/** Trim, drop control characters, collapse spaces, and cut to the maximum length. */
export function cleanChatText(raw: string): string {
  return raw.replace(HIDDEN, '').replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX_LENGTH);
}

export type ChatVerdict = { ok: true; text: string } | { ok: false; message: string };

const WINDOW_MS = 8000;
const MAX_IN_WINDOW = 4;
const STRIKE_WINDOW_MS = 10 * 60_000;
const STRIKES_FOR_MUTE = 3;
const MUTE_MS = 5 * 60_000;

/** Per-player chat limits: speed, repeats, and a short mute after repeated rule-breaking. */
export class ChatGuard {
  private sent: number[] = [];
  private strikes: number[] = [];
  private last = { text: '', at: -Infinity };
  private mutedUntil = 0;

  check(raw: string, now: number): ChatVerdict {
    if (now < this.mutedUntil) {
      return {
        ok: false,
        message: `You are muted for ${Math.ceil((this.mutedUntil - now) / 60_000)} more minute(s) for breaking the chat rules.`,
      };
    }
    const text = cleanChatText(raw);
    if (text.length === 0) return { ok: false, message: 'Type something to send.' };

    this.sent = this.sent.filter((t) => now - t < WINDOW_MS);
    if (this.sent.length >= MAX_IN_WINDOW)
      return { ok: false, message: 'You are sending messages too fast. Wait a moment.' };

    if (containsBlockedWord(text) || containsContactInfo(text)) {
      this.strikes = this.strikes.filter((t) => now - t < STRIKE_WINDOW_MS);
      this.strikes.push(now);
      if (this.strikes.length >= STRIKES_FOR_MUTE) {
        this.mutedUntil = now + MUTE_MS;
        this.strikes = [];
        return { ok: false, message: 'You are muted for 5 minutes for breaking the chat rules.' };
      }
      return {
        ok: false,
        message: containsContactInfo(text)
          ? 'Please do not share links or contact details.'
          : 'Please keep chat friendly.',
      };
    }

    // compare without punctuation or case, so "Same thing!" counts as a repeat of "same thing"
    const key = text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    if (key === this.last.text && now - this.last.at < 15_000)
      return { ok: false, message: 'You already said that.' };

    this.sent.push(now);
    this.last = { text: key, at: now };
    return { ok: true, text };
  }
}
