import { type Layout } from '@alexioncity/shared';
import type { WorldState } from '../../game/world';

export interface MapStyle {
  /** Pixels per metre. */
  scale: number;
  /** Turn the map so the camera's forward direction points up. */
  rotate: boolean;
  /** Draw labels next to places. */
  labels?: boolean;
}

const COLORS = {
  ground: '#dfe9d3',
  slab: '#f1e6d2',
  road: '#ffffff',
  poi: '#ff7a1a',
  player: '#1b2340',
  waypoint: '#1b2340',
};

/**
 * Draw the district on a canvas centred on the player. The map is just rectangles and dots, so it
 * costs nothing next to the 3D view.
 */
export function drawMap(
  canvas: HTMLCanvasElement,
  layout: Layout,
  state: WorldState,
  style: MapStyle,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { width: w, height: h } = canvas;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = COLORS.ground;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.translate(w / 2, h / 2);
  if (style.rotate) ctx.rotate(state.camYaw + Math.PI);
  ctx.scale(style.scale, style.scale);
  ctx.translate(-state.x, -state.z);

  ctx.fillStyle = COLORS.slab;
  for (const s of layout.slabs) ctx.fillRect(s.x - s.w / 2, s.z - s.d / 2, s.w, s.d);
  ctx.fillStyle = COLORS.road;
  for (const r of layout.roads) ctx.fillRect(r.x - r.w / 2, r.z - r.d / 2, r.w, r.d);
  ctx.fillStyle = '#d4c7ad';
  for (const b of layout.boxes) {
    if (b.hw > 100 || b.hd > 100) continue;
    ctx.fillRect(b.x - b.hw, b.z - b.hd, b.hw * 2, b.hd * 2);
  }

  const dot = 3.2 / Math.max(style.scale, 0.5);
  for (const p of layout.pois) {
    ctx.fillStyle = COLORS.poi;
    ctx.beginPath();
    ctx.arc(p.x, p.z, dot, 0, Math.PI * 2);
    ctx.fill();
    if (style.labels) {
      ctx.save();
      ctx.translate(p.x, p.z);
      if (style.rotate) ctx.rotate(-(state.camYaw + Math.PI));
      ctx.scale(1 / style.scale, 1 / style.scale);
      ctx.fillStyle = '#1b2340';
      ctx.font = '700 11px system-ui, sans-serif';
      ctx.fillText(p.name, 8, 4);
      ctx.restore();
    }
  }

  const target = state.waypoint && layout.pois.find((p) => p.id === state.waypoint!.poiId);
  if (target) {
    ctx.strokeStyle = COLORS.waypoint;
    ctx.lineWidth = 2 / style.scale;
    ctx.beginPath();
    ctx.arc(target.x, target.z, dot * 2.2, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  // the player: an arrow at the centre, pointing where they face relative to the map
  ctx.save();
  ctx.translate(w / 2, h / 2);
  // canvas angles run clockwise; a world yaw of 180 degrees points up on the unrotated map
  ctx.rotate(style.rotate ? state.camYaw - state.yaw : Math.PI - state.yaw);
  ctx.fillStyle = COLORS.player;
  ctx.beginPath();
  ctx.moveTo(0, -8);
  ctx.lineTo(6, 7);
  ctx.lineTo(0, 4);
  ctx.lineTo(-6, 7);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
