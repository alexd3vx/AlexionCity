import { generateLayout, type Layout, type Poi, type PoiIcon } from '@alexioncity/shared';

let layout: Layout | undefined;

/** The city as the server knows it. It is built from the same seed as every client, so places line up. */
export function cityLayout(): Layout {
  layout ??= generateLayout({ seed: 1, density: 1 });
  return layout;
}

/** The closest place of a kind within `range` metres of a point, if any. */
export function placeNear(x: number, z: number, icon: PoiIcon, range: number): Poi | undefined {
  let best: Poi | undefined;
  let bestD = range;
  for (const poi of cityLayout().pois) {
    if (poi.icon !== icon) continue;
    const d = Math.hypot(poi.x - x, poi.z - z);
    if (d <= bestD) {
      best = poi;
      bestD = d;
    }
  }
  return best;
}

/** Any place within range that sells something, nearest first. */
export function placesNear(x: number, z: number, range: number): Poi[] {
  return cityLayout()
    .pois.map((poi) => ({ poi, d: Math.hypot(poi.x - x, poi.z - z) }))
    .filter((p) => p.d <= range)
    .sort((a, b) => a.d - b.d)
    .map((p) => p.poi);
}
