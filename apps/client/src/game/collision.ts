export interface Circle {
  x: number;
  z: number;
  r: number;
}

/** Axis-aligned box: centre and half sizes along x and z. */
export interface Box {
  x: number;
  z: number;
  hw: number;
  hd: number;
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

/** Push a moving circle out of axis-aligned boxes (buildings, bus stops, the edge walls). */
export function resolveBoxes(
  x: number,
  z: number,
  radius: number,
  boxes: readonly Box[],
): Resolved {
  let hit = false;
  for (let pass = 0; pass < 2; pass++) {
    for (const b of boxes) {
      const nx = Math.max(b.x - b.hw, Math.min(b.x + b.hw, x));
      const nz = Math.max(b.z - b.hd, Math.min(b.z + b.hd, z));
      const dx = x - nx;
      const dz = z - nz;
      const distance = Math.hypot(dx, dz);
      if (distance >= radius) continue;
      hit = true;
      if (distance > 1e-6) {
        x = nx + (dx / distance) * radius;
        z = nz + (dz / distance) * radius;
      } else {
        // the centre is inside the box: leave by the nearest face
        const left = x - (b.x - b.hw);
        const right = b.x + b.hw - x;
        const back = z - (b.z - b.hd);
        const front = b.z + b.hd - z;
        const least = Math.min(left, right, back, front);
        if (least === left) x = b.x - b.hw - radius;
        else if (least === right) x = b.x + b.hw + radius;
        else if (least === back) z = b.z - b.hd - radius;
        else z = b.z + b.hd + radius;
      }
    }
  }
  return { x, z, hit };
}
