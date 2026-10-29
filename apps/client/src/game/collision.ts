export interface Circle {
  x: number;
  z: number;
  r: number;
}

export interface Resolved {
  x: number;
  z: number;
  hit: boolean;
}

/**
 * Push a moving circle out of fixed circles so players cannot walk through props, cars or walls.
 * Two passes settle a circle that touches two obstacles at once. Walls and buildings become rows of
 * circles for now; Phase 1 can swap in boxes without changing callers.
 */
export function resolveCircles(
  x: number,
  z: number,
  radius: number,
  obstacles: readonly Circle[],
): Resolved {
  let hit = false;
  for (let pass = 0; pass < 2; pass++) {
    for (const o of obstacles) {
      const dx = x - o.x;
      const dz = z - o.z;
      const distance = Math.hypot(dx, dz);
      const minimum = o.r + radius;
      if (distance >= minimum) continue;
      hit = true;
      if (distance < 1e-6) {
        x = o.x + minimum;
      } else {
        x = o.x + (dx / distance) * minimum;
        z = o.z + (dz / distance) * minimum;
      }
    }
  }
  return { x, z, hit };
}
