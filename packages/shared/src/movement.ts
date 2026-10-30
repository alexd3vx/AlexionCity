import { SPEED_LIMITS } from './constants';
import type { MoveMode } from './protocol';

export interface Position {
  x: number;
  z: number;
}

/**
 * Whether moving from `from` to `to` in `dtSeconds` stays within the speed limit for `mode`.
 * Used by the server to catch speed hacks while still trusting client-side movement.
 */
export function isMoveAllowed(
  from: Position,
  to: Position,
  dtSeconds: number,
  mode: MoveMode,
): boolean {
  if (!Number.isFinite(to.x) || !Number.isFinite(to.z) || !(dtSeconds > 0)) return false;
  const distance = Math.hypot(to.x - from.x, to.z - from.z);
  const limit = SPEED_LIMITS[mode] * SPEED_LIMITS.tolerance;
  return distance <= limit * dtSeconds;
}
