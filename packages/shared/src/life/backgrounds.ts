import type { Placed } from './home';
import type { UnitId } from './home';

export type BackgroundId = 'comfortable' | 'loan' | 'newcomer' | 'student';

export interface BackgroundDef {
  id: BackgroundId;
  name: string;
  blurb: string;
  /** Money in the bank on day one. */
  money: number;
  /** Owed at the start; repaid in installments with the bills. */
  debt: number;
  /** Fraction off the rent (a student discount). */
  rentDiscount: number;
  unit: UnitId;
  /** What stands in the home on day one, also given to the player as items. */
  starter: Omit<Placed, 'id'>[];
}

const bed = { item: 'bed-single', x: 0, z: 3, rot: 0 } as const;
const shower = { item: 'shower', x: 7, z: 0, rot: 0 } as const;

export const BACKGROUNDS: Record<BackgroundId, BackgroundDef> = {
  comfortable: {
    id: 'comfortable',
    name: 'Comfortable start',
    blurb: 'A cushion in the bank and a tidy studio. Plenty of room to make mistakes.',
    money: 2500,
    debt: 0,
    rentDiscount: 0,
    unit: 'studio',
    starter: [
      bed,
      shower,
      { item: 'sofa', x: 4, z: 4, rot: 0 },
      { item: 'plant', x: 7, z: 5, rot: 0 },
    ],
  },
  loan: {
    id: 'loan',
    name: 'Fresh from a loan',
    blurb: 'You borrowed to get started. There is money now, and an installment with every bill.',
    money: 1500,
    debt: 3000,
    rentDiscount: 0,
    unit: 'studio',
    starter: [bed, shower],
  },
  newcomer: {
    id: 'newcomer',
    name: 'New in town',
    blurb: 'Just arrived with a bag and a little cash. A bed, a shower, and a lot to prove.',
    money: 400,
    debt: 0,
    rentDiscount: 0,
    unit: 'studio',
    starter: [bed, shower],
  },
  student: {
    id: 'student',
    name: 'Student',
    blurb: 'Not much money, but cheaper rent and a desk to work at.',
    money: 700,
    debt: 0,
    rentDiscount: 0.25,
    unit: 'studio',
    starter: [
      bed,
      shower,
      { item: 'desk', x: 0, z: 0, rot: 0 },
      { item: 'desk-chair', x: 0, z: 1, rot: 0 },
    ],
  },
};

export const BACKGROUND_IDS = Object.keys(BACKGROUNDS) as BackgroundId[];
export const isBackgroundId = (v: unknown): v is BackgroundId =>
  typeof v === 'string' && v in BACKGROUNDS;

/** A random starting background; `rng` returns 0 to 1. */
export const randomBackground = (rng: () => number): BackgroundId =>
  BACKGROUND_IDS[Math.min(BACKGROUND_IDS.length - 1, Math.floor(rng() * BACKGROUND_IDS.length))]!;
