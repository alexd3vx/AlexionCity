export const GAME_NAME = 'AlexionCity';

/** In-game currency. Fictional, no cash-out. */
export const CURRENCY = { code: 'ALEX', symbol: '₳', name: 'Alex' } as const;

/** Players per district channel. */
export const CHANNEL_CAPACITY = 100;

/** Players must be at least this old (self-declared). */
export const MIN_PLAYER_AGE = 13;

/** Server-side movement limits in metres per second. Movement is trusted but speed-checked. */
export const SPEED_LIMITS = {
  walk: 2.2,
  run: 5.2,
  vehicle: 30,
  /** Extra headroom for network jitter, as a multiplier on the limit. */
  tolerance: 1.5,
} as const;

/** Working names for the Phase 1 districts. */
export const DISTRICTS = ['downtown', 'residential', 'market', 'harbor', 'airport'] as const;
export type District = (typeof DISTRICTS)[number];

/** How far away, in metres, other players are sent to you. Beyond this they are not drawn. */
/** Where a player first appears in the downtown district. Client and server agree on it. */
export const SPAWN = { x: 0, z: 17, yaw: Math.PI } as const;

export const INTEREST_RADIUS = 90;

/** Chat is heard this far around the speaker. */
export const CHAT_RADIUS = 80;

export const CHAT_MAX_LENGTH = 160;
export const NAME_MIN_LENGTH = 2;
export const NAME_MAX_LENGTH = 20;
