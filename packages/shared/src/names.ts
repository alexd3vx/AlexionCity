import { NAME_MAX_LENGTH, NAME_MIN_LENGTH } from './constants';

/** Names are shown above players' heads, so keep them short and plain. */
export function cleanName(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const name = raw
    .replace(/[^\p{L}\p{N} _.-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX_LENGTH);
  return name.length >= NAME_MIN_LENGTH ? name : undefined;
}
