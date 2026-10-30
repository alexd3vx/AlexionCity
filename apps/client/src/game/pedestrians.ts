import * as THREE from 'three';
import type { AvatarCatalog, QualityTier } from '@alexioncity/shared';
import { assembleAvatar, type Avatar } from '../avatar/assemble';
import { randomSpec } from '../avatar/catalog';
import type { AssetStore } from './assets';
import { PITCH } from './district/layout';
import type { Layout } from './district/layout';
import { mulberry32 } from './district/layout';

/** Pavement loop around a block: a square of half-size `half`, walked clockwise or the other way. */
export interface Loop {
  cx: number;
  cz: number;
  half: number;
}

/**
 * Position and heading after walking `s` metres along a loop, starting at its north-west corner and
 * going clockwise seen from above. A negative speed walks it the other way round.
 */
export function loopPoint(loop: Loop, s: number): { x: number; z: number; yaw: number } {
  const side = loop.half * 2;
  const perimeter = side * 4;
  const d = ((s % perimeter) + perimeter) % perimeter;
  const edge = Math.floor(d / side);
  const t = d - edge * side;
  const { cx, cz, half } = loop;
  // clockwise from above (x east, z south): north edge east, east edge south, south edge west, west edge north
  switch (edge) {
    case 0:
      return { x: cx - half + t, z: cz - half, yaw: Math.PI / 2 };
    case 1:
      return { x: cx + half, z: cz - half + t, yaw: 0 };
    case 2:
      return { x: cx + half - t, z: cz + half, yaw: -Math.PI / 2 };
    default:
      return { x: cx - half, z: cz + half - t, yaw: Math.PI };
  }
}

/** Half-size of the walking loop around a block, between the tree line and the building fronts. */
export const LOOP_HALF = PITCH / 2 - 7.2;

const COUNT: Record<QualityTier, number> = { low: 4, high: 10 };

interface Walker {
  avatar: Avatar;
  loop: Loop;
  s: number;
  speed: number;
  direction: 1 | -1;
}

/** Ambient crowd: avatars walking loops around the blocks, so the city is never empty. */
export class Pedestrians {
  private walkers: Walker[] = [];
  readonly group = new THREE.Group();

  constructor(
    private readonly layout: Layout,
    private readonly tier: QualityTier,
    private readonly seed = 11,
  ) {}

  async spawn(store: AssetStore, catalog: AvatarCatalog): Promise<void> {
    const rng = mulberry32(this.seed);
    const blocks = this.layout.blocks;
    for (let i = 0; i < COUNT[this.tier]; i++) {
      const block = blocks[Math.floor(rng() * blocks.length)]!;
      const avatar = await assembleAvatar(store, catalog, randomSpec(catalog, rng));
      avatar.play('walk');
      this.group.add(avatar.root);
      this.walkers.push({
        avatar,
        loop: { cx: block.cx, cz: block.cz, half: LOOP_HALF },
        s: rng() * LOOP_HALF * 8,
        speed: 1.1 + rng() * 0.5,
        direction: rng() < 0.5 ? 1 : -1,
      });
    }
  }

  update(dt: number): void {
    for (const w of this.walkers) {
      w.s += w.speed * dt * w.direction;
      const p = loopPoint(w.loop, w.s);
      w.avatar.root.position.set(p.x, 0, p.z);
      w.avatar.root.rotation.y = w.direction > 0 ? p.yaw : p.yaw + Math.PI;
      w.avatar.update(dt);
    }
  }

  /** The closest walker within `range` metres of a point, if any. */
  nearest(x: number, z: number, range: number): { x: number; z: number } | undefined {
    let best: { x: number; z: number } | undefined;
    let bestDistance = range;
    for (const w of this.walkers) {
      const d = Math.hypot(w.avatar.root.position.x - x, w.avatar.root.position.z - z);
      if (d < bestDistance) {
        bestDistance = d;
        best = { x: w.avatar.root.position.x, z: w.avatar.root.position.z };
      }
    }
    return best;
  }

  dispose(): void {
    this.walkers.forEach((w) => w.avatar.dispose());
    this.walkers = [];
    this.group.removeFromParent();
  }
}
