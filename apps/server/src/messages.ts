import { DISTRICTS, type ClientMessage, type District } from '@alexioncity/shared';

const MODES = ['walk', 'run', 'vehicle'] as const;
const isDistrict = (v: unknown): v is District =>
  typeof v === 'string' && (DISTRICTS as readonly string[]).includes(v);
const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Names are shown above players' heads, so keep them short and plain. */
export function cleanName(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const name = raw
    .replace(/[^\p{L}\p{N} _.-]/gu, '')
    .trim()
    .slice(0, 20);
  return name.length >= 2 ? name : undefined;
}

/** Parse and validate one client message. Returns undefined for anything malformed. */
export function parseClientMessage(raw: string): ClientMessage | undefined {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof data !== 'object' || data === null) return undefined;
  const m = data as Record<string, unknown>;

  if (m.t === 'join') {
    const name = cleanName(m.name);
    return isDistrict(m.district) && name ? { t: 'join', district: m.district, name } : undefined;
  }
  if (m.t === 'move') {
    const { seq, x, z, yaw, mode } = m;
    if (
      isFiniteNumber(seq) &&
      isFiniteNumber(x) &&
      isFiniteNumber(z) &&
      isFiniteNumber(yaw) &&
      (MODES as readonly unknown[]).includes(mode)
    ) {
      return { t: 'move', seq, x, z, yaw, mode: mode as (typeof MODES)[number] };
    }
  }
  return undefined;
}
