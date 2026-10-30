/**
 * Every model the district uses, with its measured native size and how big it should be in the world.
 * Native sizes come from the source files (they differ wildly: a bus is 157 units long, a tree 509
 * tall), so each model says which dimension to fit and the rest follows its proportions.
 * Buildings and vehicles face +z in their source files.
 */
export type ModelId =
  | 'pizza'
  | 'bldg-green'
  | 'bldg-red'
  | 'bldg-red-corner'
  | 'bldg-brown'
  | 'bldg-big'
  | 'apartment'
  | 'bar'
  | 'hospital'
  | 'hotel'
  | 'house'
  | 'bldg-large'
  | 'skyscraper'
  | 'car'
  | 'sports'
  | 'suv'
  | 'van'
  | 'pickup'
  | 'bus'
  | 'convertible'
  | 'tree'
  | 'hydrant'
  | 'bench'
  | 'trash'
  | 'cone'
  | 'atm'
  | 'planter'
  | 'stop-sign'
  | 'mailbox'
  | 'bus-stop'
  | 'traffic-light';

export type ModelKind = 'building' | 'vehicle' | 'prop';

export interface ModelDef {
  pack: 'city-core' | 'city-extras';
  /** Path inside the pack, as written by the pack builder. */
  file: string;
  /** Size in the source file's own units. */
  native: { w: number; h: number; d: number };
  /** Exactly one of these sets the scale; the other dimensions follow the native proportions. */
  fit: { width: number } | { height: number } | { length: number } | { depth: number };
  kind: ModelKind;
  /** Colour of the stand-in shown before the packs are downloaded. */
  color: number;
}

const core = (file: string) => ({ pack: 'city-core' as const, file: `city-pack-1/${file}.glb` });
const extra = (file: string) => ({ pack: 'city-extras' as const, file: `city-pack-2/${file}.glb` });

export const MODELS: Record<ModelId, ModelDef> = {
  pizza: {
    ...core('pizza-corner'),
    native: { w: 1.33, h: 3.47, d: 1.34 },
    fit: { width: 8.5 },
    kind: 'building',
    color: 0xd9a05b,
  },
  'bldg-green': {
    ...core('building-green'),
    native: { w: 2.42, h: 3.48, d: 1.34 },
    fit: { width: 15 },
    kind: 'building',
    color: 0x8fa77a,
  },
  'bldg-red': {
    ...core('building-red'),
    native: { w: 2.42, h: 3.48, d: 1.34 },
    fit: { width: 15 },
    kind: 'building',
    color: 0xb4584a,
  },
  'bldg-red-corner': {
    ...core('building-red-corner'),
    native: { w: 1.33, h: 3.47, d: 1.34 },
    fit: { width: 8.5 },
    kind: 'building',
    color: 0xa84f42,
  },
  'bldg-brown': {
    ...core('brown-building'),
    native: { w: 2.28, h: 4.08, d: 2.2 },
    fit: { width: 13 },
    kind: 'building',
    color: 0x8c6a55,
  },
  'bldg-big': {
    ...core('big-building'),
    native: { w: 4.71, h: 5.68, d: 4.39 },
    fit: { width: 18 },
    kind: 'building',
    color: 0x9a9577,
  },
  apartment: {
    ...extra('apartment-building'),
    native: { w: 10.32, h: 18.1, d: 5.79 },
    fit: { width: 16 },
    kind: 'building',
    color: 0xc7b9a6,
  },
  bar: {
    ...extra('bar'),
    native: { w: 271.85, h: 231.45, d: 283.35 },
    fit: { width: 16 },
    kind: 'building',
    color: 0x7e8fa0,
  },
  hospital: {
    ...extra('hospital'),
    native: { w: 334.48, h: 329.21, d: 625.13 },
    fit: { depth: 38 },
    kind: 'building',
    color: 0xbfd3dd,
  },
  hotel: {
    ...extra('hotel-building'),
    native: { w: 6.95, h: 2.39, d: 2.84 },
    fit: { width: 22 },
    kind: 'building',
    color: 0x9aa3b5,
  },
  house: {
    ...extra('house-with-driveway'),
    native: { w: 23.31, h: 16.15, d: 34.1 },
    fit: { depth: 16 },
    kind: 'building',
    color: 0xc9a98a,
  },
  'bldg-large': {
    ...extra('large-building'),
    native: { w: 2.32, h: 2.48, d: 1.82 },
    fit: { width: 18 },
    kind: 'building',
    color: 0xa7a39a,
  },
  skyscraper: {
    ...extra('skyscraper'),
    native: { w: 6.72, h: 32.08, d: 10.26 },
    fit: { height: 55 },
    kind: 'building',
    color: 0xb9a37a,
  },
  car: {
    ...core('car'),
    native: { w: 1.81, h: 1.18, d: 4.22 },
    fit: { length: 4.3 },
    kind: 'vehicle',
    color: 0x8ab0d8,
  },
  sports: {
    ...core('sports-car'),
    native: { w: 1.87, h: 1.2, d: 3.93 },
    fit: { length: 4.4 },
    kind: 'vehicle',
    color: 0xe5483b,
  },
  suv: {
    ...core('suv'),
    native: { w: 2.11, h: 1.53, d: 4.21 },
    fit: { length: 4.7 },
    kind: 'vehicle',
    color: 0x6d7683,
  },
  van: {
    ...core('van'),
    native: { w: 43.89, h: 34.33, d: 80.23 },
    fit: { length: 5.2 },
    kind: 'vehicle',
    color: 0x2f7fb8,
  },
  pickup: {
    ...core('pickup-truck'),
    native: { w: 2.31, h: 1.85, d: 5.18 },
    fit: { length: 5.4 },
    kind: 'vehicle',
    color: 0x3f7f9c,
  },
  bus: {
    ...core('bus'),
    native: { w: 50.06, h: 48.81, d: 157.46 },
    fit: { length: 10 },
    kind: 'vehicle',
    color: 0xf2c14e,
  },
  convertible: {
    ...extra('convertible'),
    native: { w: 4.32, h: 3.06, d: 10.14 },
    fit: { length: 4.5 },
    kind: 'vehicle',
    color: 0x2a4f9e,
  },
  tree: {
    ...core('tree'),
    native: { w: 308.41, h: 509.09, d: 323.74 },
    fit: { height: 6.5 },
    kind: 'prop',
    color: 0x5a9a4c,
  },
  hydrant: {
    ...core('fire-hydrant'),
    native: { w: 107.06, h: 232.62, d: 108.58 },
    fit: { height: 0.9 },
    kind: 'prop',
    color: 0xc0392b,
  },
  bench: {
    ...core('bench'),
    native: { w: 2.51, h: 1.62, d: 1.23 },
    fit: { width: 1.9 },
    kind: 'prop',
    color: 0xc8933f,
  },
  trash: {
    ...core('trash-can'),
    native: { w: 3.15, h: 3.63, d: 3.31 },
    fit: { height: 1.0 },
    kind: 'prop',
    color: 0x333333,
  },
  cone: {
    ...core('cone'),
    native: { w: 0.6, h: 0.9, d: 0.6 },
    fit: { height: 0.7 },
    kind: 'prop',
    color: 0xe8743b,
  },
  atm: {
    ...core('atm'),
    native: { w: 0.22, h: 0.55, d: 0.23 },
    fit: { height: 2.3 },
    kind: 'prop',
    color: 0x4a86a8,
  },
  planter: {
    ...core('planter-and-bushes'),
    native: { w: 2.37, h: 1.12, d: 0.77 },
    fit: { width: 2.4 },
    kind: 'prop',
    color: 0x6a8f4e,
  },
  'stop-sign': {
    ...core('stop-sign'),
    native: { w: 8.01, h: 230.86, d: 75.23 },
    fit: { height: 2.6 },
    kind: 'prop',
    color: 0xc0392b,
  },
  mailbox: {
    ...core('mailbox'),
    native: { w: 0.22, h: 0.46, d: 0.23 },
    fit: { height: 1.2 },
    kind: 'prop',
    color: 0x3b5bdb,
  },
  'bus-stop': {
    ...core('bus-stop'),
    native: { w: 38.31, h: 27.2, d: 24.76 },
    fit: { width: 5 },
    kind: 'prop',
    color: 0x4d8fd6,
  },
  'traffic-light': {
    ...core('traffic-light'),
    native: { w: 5.34, h: 4.66, d: 1.92 },
    fit: { height: 6 },
    kind: 'prop',
    color: 0x2b2f38,
  },
};

export interface Dims {
  scale: number;
  /** Size in metres once placed with yaw 0. */
  w: number;
  h: number;
  d: number;
}

export function dims(id: ModelId): Dims {
  const { native, fit } = MODELS[id];
  const scale =
    'width' in fit
      ? fit.width / native.w
      : 'height' in fit
        ? fit.height / native.h
        : 'length' in fit
          ? fit.length / native.d
          : fit.depth / native.d;
  return { scale, w: native.w * scale, h: native.h * scale, d: native.d * scale };
}

/** Packs the district's models come from; the first is required, the rest are optional. */
export const DISTRICT_PACKS = ['city-core', 'city-extras'] as const;
