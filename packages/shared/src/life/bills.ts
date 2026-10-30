import { UNITS, type UnitId } from './home';
import { BACKGROUNDS, type BackgroundId } from './backgrounds';

/**
 * A "month" is one hour spent in the city. Time away does not count, so a player who is away for a week
 * does not come back to an eviction.
 */
export const BILL_PERIOD_SECONDS = 3600;
/** Added once for each cycle the rent could not be paid. */
export const LATE_FEE = 25;
/** Cycles of unpaid rent before the home is lost. */
export const EVICT_AFTER_MISSED = 3;
/** Taken from the loan with each bill. */
export const LOAN_INSTALLMENT = 150;

export interface BillLine {
  kind: 'rent' | 'utilities' | 'loan';
  label: string;
  amount: number;
}

export function rentFor(unit: UnitId, background: BackgroundId): number {
  return Math.round(UNITS[unit].rent * (1 - BACKGROUNDS[background].rentDiscount));
}

/** What one billing cycle costs. A paid-off loan has no installment. */
export function billLines(unit: UnitId, background: BackgroundId, debt: number): BillLine[] {
  const lines: BillLine[] = [
    { kind: 'rent', label: `${UNITS[unit].name} rent`, amount: rentFor(unit, background) },
    { kind: 'utilities', label: 'Water, power and internet', amount: UNITS[unit].utilities },
  ];
  if (debt > 0)
    lines.push({
      kind: 'loan',
      label: 'Loan installment',
      amount: Math.min(debt, LOAN_INSTALLMENT),
    });
  return lines;
}

export const billTotal = (lines: readonly BillLine[]): number =>
  lines.reduce((sum, l) => sum + l.amount, 0);

/** Moving into a unit costs one cycle of its rent up front. */
export const depositFor = (unit: UnitId, background: BackgroundId): number =>
  rentFor(unit, background);
