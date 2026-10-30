import {
  DISTRICTS,
  EMOTES,
  MOTION_CODES,
  NAME_MAX_LENGTH,
  NAME_MIN_LENGTH,
  REPORT_REASONS,
  type AvatarSpec,
  type ClientMessage,
  type District,
  type Emote,
  type MoveMode,
  type ReportReason,
} from '@alexioncity/shared';

const MODES: readonly MoveMode[] = ['walk', 'run', 'vehicle'];
const isDistrict = (v: unknown): v is District =>
  typeof v === 'string' && (DISTRICTS as readonly string[]).includes(v);
const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isString = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
const ID = /^[a-z0-9_-]{1,32}$/;

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

/** The server does not know the catalog, so it only checks the shape: short plain ids. */
export function parseAvatar(raw: unknown): AvatarSpec | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const a = raw as Record<string, unknown>;
  const keys = ['frame', 'head', 'body', 'legs', 'feet', 'skin', 'hair'] as const;
  if (!keys.every((k) => typeof a[k] === 'string' && ID.test(a[k] as string))) return undefined;
  return {
    frame: a.frame,
    head: a.head,
    body: a.body,
    legs: a.legs,
    feet: a.feet,
    skin: a.skin,
    hair: a.hair,
  } as AvatarSpec;
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

  switch (m.t) {
    case 'join': {
      const avatar = parseAvatar(m.avatar);
      if (!isFiniteNumber(m.v) || !isDistrict(m.district) || !avatar || !isString(m.name, 80))
        return undefined;
      if (m.token !== undefined && !isString(m.token, 4000)) return undefined;
      if (m.guestId !== undefined && !isString(m.guestId, 80)) return undefined;
      return {
        t: 'join',
        v: m.v,
        ...(m.token !== undefined ? { token: m.token as string } : {}),
        ...(m.guestId !== undefined ? { guestId: m.guestId as string } : {}),
        name: m.name,
        district: m.district,
        avatar,
      };
    }
    case 'move': {
      const { seq, x, z, yaw, mode, motion } = m;
      if (
        isFiniteNumber(seq) &&
        isFiniteNumber(x) &&
        isFiniteNumber(z) &&
        isFiniteNumber(yaw) &&
        (MODES as readonly unknown[]).includes(mode) &&
        (MOTION_CODES as readonly unknown[]).includes(motion)
      ) {
        return {
          t: 'move',
          seq,
          x,
          z,
          yaw,
          mode: mode as MoveMode,
          motion: motion as (typeof MOTION_CODES)[number],
        };
      }
      return undefined;
    }
    case 'chat':
      return isString(m.text, 600) ? { t: 'chat', text: m.text } : undefined;
    case 'emote':
      return (EMOTES as readonly unknown[]).includes(m.emote)
        ? { t: 'emote', emote: m.emote as Emote }
        : undefined;
    case 'avatar': {
      const avatar = parseAvatar(m.avatar);
      return avatar ? { t: 'avatar', avatar } : undefined;
    }
    case 'block':
      return isString(m.targetId, 32) && m.targetId
        ? { t: 'block', targetId: m.targetId }
        : undefined;
    case 'unblock':
      return isString(m.ref, 80) && m.ref ? { t: 'unblock', ref: m.ref } : undefined;
    case 'report':
      if (
        isString(m.targetId, 32) &&
        m.targetId &&
        (REPORT_REASONS as readonly unknown[]).includes(m.reason) &&
        (m.details === undefined || isString(m.details, 500))
      ) {
        return {
          t: 'report',
          targetId: m.targetId,
          reason: m.reason as ReportReason,
          ...(m.details !== undefined ? { details: m.details as string } : {}),
        };
      }
      return undefined;
    case 'ping':
      return isFiniteNumber(m.ts) ? { t: 'ping', ts: m.ts } : undefined;
    default:
      return undefined;
  }
}
