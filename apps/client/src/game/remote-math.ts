/** How quickly a remote player's drawn position catches up with the last position the server sent. */
export const FOLLOW_RATE = 14;

/** Move `current` toward `target`; the step is exponential, so it is the same at any frame rate. */
export function follow(current: number, target: number, dt: number, rate = FOLLOW_RATE): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

/** Same, for an angle: takes the short way round. */
export function followAngle(
  current: number,
  target: number,
  dt: number,
  rate = FOLLOW_RATE,
): number {
  const diff = ((((target - current) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return current + diff * (1 - Math.exp(-rate * dt));
}

/** A jump this big is a teleport or a first sighting: show the player there at once. */
export const SNAP_DISTANCE = 12;

/** Which avatar motion fits how fast a peer is really moving, when the server said they were walking. */
export function motionFromSpeed(speed: number): 'idle' | 'walk' | 'run' {
  return speed < 0.15 ? 'idle' : speed < 3.6 ? 'walk' : 'run';
}

/** Longest a chat bubble stays up: longer messages get a little longer, capped. */
export const bubbleMs = (text: string): number => Math.min(9000, 3500 + text.length * 45);
