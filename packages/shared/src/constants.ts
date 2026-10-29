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
