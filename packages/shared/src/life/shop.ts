import type { PoiIcon } from '../world/layout';
import type { Needs } from './needs';

export interface MenuItem {
  id: string;
  name: string;
  /** In Alex. */
  price: number;
  /** What it does to needs (positive helps). */
  effect: Partial<Needs>;
  blurb: string;
}

/** What each kind of place sells over the counter. Prices live here so the server, not the browser, decides them. */
export const MENUS: Partial<Record<PoiIcon, MenuItem[]>> = {
  food: [
    {
      id: 'slice',
      name: 'Pizza slice',
      price: 6,
      effect: { hunger: 25, mood: 2 },
      blurb: 'Hot and quick.',
    },
    {
      id: 'whole-pizza',
      name: 'Whole pizza',
      price: 18,
      effect: { hunger: 60, mood: 6 },
      blurb: 'Enough for a very long afternoon.',
    },
    {
      id: 'salad',
      name: 'Garden salad',
      price: 8,
      effect: { hunger: 30, hygiene: 2 },
      blurb: 'Fresh and light.',
    },
    {
      id: 'soda',
      name: 'Fizzy drink',
      price: 3,
      effect: { hunger: 4, energy: 4, mood: 3 },
      blurb: 'A small lift.',
    },
  ],
  bar: [
    {
      id: 'snacks',
      name: 'Bar snacks',
      price: 4,
      effect: { hunger: 12 },
      blurb: 'Salty and crunchy.',
    },
    {
      id: 'beer',
      name: 'Cold beer',
      price: 5,
      effect: { mood: 10, energy: -3 },
      blurb: 'Takes the edge off.',
    },
    {
      id: 'cocktail',
      name: 'House cocktail',
      price: 9,
      effect: { mood: 16, energy: -4 },
      blurb: 'Made the way the regulars like it.',
    },
    {
      id: 'coffee',
      name: 'Strong coffee',
      price: 4,
      effect: { energy: 12, mood: 2 },
      blurb: 'Wakes you right up.',
    },
  ],
  hospital: [
    {
      id: 'vitamins',
      name: 'Vitamin shot',
      price: 20,
      effect: { energy: 20, mood: 2 },
      blurb: 'A quick pick-me-up.',
    },
    {
      id: 'checkup',
      name: 'Full check-up',
      price: 60,
      effect: { energy: 15, hunger: 15, hygiene: 20, mood: 10 },
      blurb: 'A little of everything.',
    },
  ],
};

export const menuFor = (icon: PoiIcon): MenuItem[] => MENUS[icon] ?? [];

export const findMenuItem = (icon: PoiIcon, id: string): MenuItem | undefined =>
  menuFor(icon).find((m) => m.id === id);

export type ActivityKind = 'sleep' | 'wash' | 'relax' | 'stroll';
export const ACTIVITY_KINDS: readonly ActivityKind[] = ['sleep', 'wash', 'relax', 'stroll'];

/** Something furniture can be used for. */
export type FurnitureUse = 'sleep' | 'wash' | 'relax';

export interface ActivityDef {
  kind: ActivityKind;
  label: string;
  /** Longest it runs, in real seconds; the player can stop sooner. */
  seconds: number;
  /** Change to needs per second, before the furniture's rate is applied. */
  perSecond: Partial<Needs>;
  /** Where it happens: at home with matching furniture, or out at the plaza. */
  place: { home: FurnitureUse } | { poi: PoiIcon };
  /** The activity is pointless (and refused) when this need is already at least this full. */
  skipIfAtLeast?: { key: keyof Needs; value: number };
}

export const ACTIVITIES: Record<ActivityKind, ActivityDef> = {
  sleep: {
    kind: 'sleep',
    label: 'Sleep',
    seconds: 90,
    perSecond: { energy: 1.1, hunger: -0.05 },
    place: { home: 'sleep' },
    skipIfAtLeast: { key: 'energy', value: 92 },
  },
  wash: {
    kind: 'wash',
    label: 'Wash',
    seconds: 8,
    perSecond: { hygiene: 12, mood: 0.5 },
    place: { home: 'wash' },
    skipIfAtLeast: { key: 'hygiene', value: 92 },
  },
  relax: {
    kind: 'relax',
    label: 'Relax',
    seconds: 20,
    perSecond: { mood: 0.6, energy: 0.1 },
    place: { home: 'relax' },
    skipIfAtLeast: { key: 'mood', value: 95 },
  },
  stroll: {
    kind: 'stroll',
    label: 'Sit in the plaza',
    seconds: 20,
    perSecond: { mood: 0.4, hunger: -0.1 },
    place: { poi: 'park' },
    skipIfAtLeast: { key: 'mood', value: 95 },
  },
};

export const isActivityKind = (v: unknown): v is ActivityKind =>
  typeof v === 'string' && (ACTIVITY_KINDS as readonly string[]).includes(v);
