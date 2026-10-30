/**
 * Time of day: sky, fog and light colours, how strong the sun is, and how much windows and street
 * lamps glow. Everything is a pure function of the minute of the day, so every player sees the same
 * sky at the same real time, and tests can check any hour.
 */
export interface Sky {
  /** Direction the light comes FROM, unit length. */
  sunDir: [number, number, number];
  sunColor: number;
  sunIntensity: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  background: number;
  fog: number;
  /** 0 in full daylight, 1 at night: windows and lamps use this. */
  glow: number;
}

interface Key {
  /** Hour of day, 0 to 24. */
  t: number;
  background: number;
  fog: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  sunColor: number;
  sunIntensity: number;
  glow: number;
}

const KEYS: Key[] = [
  {
    t: 0,
    background: 0x0c1230,
    fog: 0x141a3d,
    hemiSky: 0x5a6aa8,
    hemiGround: 0x1d2138,
    hemiIntensity: 0.45,
    sunColor: 0x8da2ff,
    sunIntensity: 0.25,
    glow: 1,
  },
  {
    t: 5,
    background: 0x1c2250,
    fog: 0x2a2f5e,
    hemiSky: 0x6671ad,
    hemiGround: 0x262a40,
    hemiIntensity: 0.5,
    sunColor: 0x9aa8ff,
    sunIntensity: 0.3,
    glow: 1,
  },
  {
    t: 6.5,
    background: 0xf5a56b,
    fog: 0xf0b98c,
    hemiSky: 0xffc9a0,
    hemiGround: 0x8a7b64,
    hemiIntensity: 0.7,
    sunColor: 0xffb070,
    sunIntensity: 0.9,
    glow: 0.6,
  },
  {
    t: 8.5,
    background: 0x9ad0f0,
    fog: 0xbfdcf0,
    hemiSky: 0xcfe8ff,
    hemiGround: 0x8a7b64,
    hemiIntensity: 0.9,
    sunColor: 0xfff0d0,
    sunIntensity: 1.25,
    glow: 0,
  },
  {
    t: 16.5,
    background: 0x9ad0f0,
    fog: 0xbfdcf0,
    hemiSky: 0xcfe8ff,
    hemiGround: 0x8a7b64,
    hemiIntensity: 0.9,
    sunColor: 0xfff0d0,
    sunIntensity: 1.25,
    glow: 0,
  },
  {
    t: 18.5,
    background: 0xf28a54,
    fog: 0xf2a679,
    hemiSky: 0xffb48a,
    hemiGround: 0x7a6a58,
    hemiIntensity: 0.7,
    sunColor: 0xff8f4f,
    sunIntensity: 0.95,
    glow: 0.55,
  },
  {
    t: 20,
    background: 0x3a2f6b,
    fog: 0x4b3f7a,
    hemiSky: 0x7a73b8,
    hemiGround: 0x2a2a44,
    hemiIntensity: 0.5,
    sunColor: 0xa08fff,
    sunIntensity: 0.35,
    glow: 1,
  },
  {
    t: 24,
    background: 0x0c1230,
    fog: 0x141a3d,
    hemiSky: 0x5a6aa8,
    hemiGround: 0x1d2138,
    hemiIntensity: 0.45,
    sunColor: 0x8da2ff,
    sunIntensity: 0.25,
    glow: 1,
  },
];

const mix = (a: number, b: number, k: number) => a + (b - a) * k;

function mixColor(a: number, b: number, k: number): number {
  const r = Math.round(mix((a >> 16) & 255, (b >> 16) & 255, k));
  const g = Math.round(mix((a >> 8) & 255, (b >> 8) & 255, k));
  const bl = Math.round(mix(a & 255, b & 255, k));
  return (r << 16) | (g << 8) | bl;
}

/** Minutes since midnight to a sky. Values outside 0 to 1440 wrap around. */
export function skyAt(minutes: number): Sky {
  const hour = (((minutes / 60) % 24) + 24) % 24;
  let i = 0;
  while (i < KEYS.length - 2 && hour >= KEYS[i + 1]!.t) i++;
  const a = KEYS[i]!;
  const b = KEYS[i + 1]!;
  const k = (hour - a.t) / (b.t - a.t);

  // the sun climbs from 6:00 to 18:00; at night a dim moon takes its place from the other side
  const day = hour >= 6 && hour <= 18;
  const phase = day ? (hour - 6) / 12 : ((hour + 6) % 12) / 12;
  const elevation = Math.max(0.12, Math.sin(phase * Math.PI));
  const azimuth = (day ? phase : 1 - phase) * Math.PI - Math.PI / 2 + (day ? 0 : Math.PI);
  const horizontal = Math.sqrt(1 - elevation * elevation);

  return {
    sunDir: [Math.sin(azimuth) * horizontal, elevation, Math.cos(azimuth) * horizontal],
    sunColor: mixColor(a.sunColor, b.sunColor, k),
    sunIntensity: mix(a.sunIntensity, b.sunIntensity, k),
    hemiSky: mixColor(a.hemiSky, b.hemiSky, k),
    hemiGround: mixColor(a.hemiGround, b.hemiGround, k),
    hemiIntensity: mix(a.hemiIntensity, b.hemiIntensity, k),
    background: mixColor(a.background, b.background, k),
    fog: mixColor(a.fog, b.fog, k),
    glow: mix(a.glow, b.glow, k),
  };
}

/** Current local time as minutes since midnight. */
export function nowMinutes(date = new Date()): number {
  return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
}

export function clockLabel(minutes: number): string {
  const total = Math.floor(((minutes % 1440) + 1440) % 1440);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
