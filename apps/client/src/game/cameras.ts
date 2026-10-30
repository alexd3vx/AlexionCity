export type ViewMode = 'chase' | 'high' | 'overhead';

export interface ViewSpec {
  /** How far behind the player the camera sits, along the ground. */
  distance: number;
  height: number;
  fov: number;
  /** Height of the point the camera looks at, above the player's feet. */
  look: number;
}

/** The three views. The eye button cycles them; first-person comes later. */
export const VIEWS: Record<ViewMode, ViewSpec> = {
  chase: { distance: 6, height: 3.2, fov: 62, look: 1.2 },
  high: { distance: 11, height: 9, fov: 58, look: 1 },
  overhead: { distance: 12, height: 26, fov: 46, look: 0 },
};

export const VIEW_LABELS: Record<ViewMode, string> = {
  chase: 'Chase view',
  high: 'High view',
  overhead: 'Overhead view',
};

const ORDER: ViewMode[] = ['chase', 'high', 'overhead'];

export const nextView = (mode: ViewMode): ViewMode =>
  ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length]!;

export interface Pose {
  position: [number, number, number];
  lookAt: [number, number, number];
  fov: number;
}

/**
 * Where the camera should be for a view. `yaw` is the direction the camera looks along the ground:
 * forward is (sin yaw, cos yaw), so the camera sits behind the player on the opposite side.
 */
export function cameraPose(mode: ViewMode, player: { x: number; z: number }, yaw: number): Pose {
  const v = VIEWS[mode];
  return {
    position: [
      player.x - Math.sin(yaw) * v.distance,
      v.height,
      player.z - Math.cos(yaw) * v.distance,
    ],
    lookAt: [player.x, v.look, player.z],
    fov: v.fov,
  };
}

/** Turn an angle toward a target by the shortest way. `rate` is the fraction per second. */
export function approachAngle(from: number, to: number, dt: number, rate: number): number {
  const diff = ((((to - from) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return from + diff * Math.min(1, dt * rate);
}
