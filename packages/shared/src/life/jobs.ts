import type { PoiIcon } from '../world/layout';
import type { Needs } from './needs';
import { payMultiplier } from './needs';

export type JobId = 'kitchen' | 'bartender' | 'orderly' | 'clerk';

export interface JobLevel {
  title: string;
  /** Base pay for one finished shift, in Alex. */
  pay: number;
  /** Shifts finished at this level before the next level. The last level has none. */
  shiftsToNext: number;
}

export interface JobDef {
  id: JobId;
  name: string;
  /** The kind of place where this job is done. */
  workplace: PoiIcon;
  /** Real seconds one shift takes. */
  shiftSeconds: number;
  /** What a shift costs the worker. */
  cost: Partial<Needs>;
  /** Shifts finished in any job before this one opens up. */
  minShifts: number;
  blurb: string;
  levels: JobLevel[];
}

export const JOBS: Record<JobId, JobDef> = {
  kitchen: {
    id: 'kitchen',
    name: 'Kitchen',
    workplace: 'food',
    shiftSeconds: 90,
    cost: { energy: -10, hunger: -6, hygiene: -4, mood: -2 },
    minShifts: 0,
    blurb: 'Prep, cook and plate. Hot work, honest pay.',
    levels: [
      { title: 'Kitchen hand', pay: 36, shiftsToNext: 3 },
      { title: 'Line cook', pay: 46, shiftsToNext: 5 },
      { title: 'Sous chef', pay: 60, shiftsToNext: 8 },
      { title: 'Head chef', pay: 80, shiftsToNext: 0 },
    ],
  },
  bartender: {
    id: 'bartender',
    name: 'Bar',
    workplace: 'bar',
    shiftSeconds: 90,
    cost: { energy: -9, hunger: -5, hygiene: -3, mood: 0 },
    minShifts: 0,
    blurb: 'Pour, chat and keep the evening going.',
    levels: [
      { title: 'Barback', pay: 38, shiftsToNext: 3 },
      { title: 'Bartender', pay: 48, shiftsToNext: 5 },
      { title: 'Head bartender', pay: 62, shiftsToNext: 8 },
      { title: 'Bar manager', pay: 82, shiftsToNext: 0 },
    ],
  },
  orderly: {
    id: 'orderly',
    name: 'Hospital',
    workplace: 'hospital',
    shiftSeconds: 120,
    cost: { energy: -12, hunger: -6, hygiene: -6, mood: -3 },
    minShifts: 0,
    blurb: 'Keep the wards moving and the patients comfortable.',
    levels: [
      { title: 'Orderly', pay: 52, shiftsToNext: 3 },
      { title: 'Care assistant', pay: 66, shiftsToNext: 5 },
      { title: 'Nurse', pay: 86, shiftsToNext: 8 },
      { title: 'Ward lead', pay: 112, shiftsToNext: 0 },
    ],
  },
  clerk: {
    id: 'clerk',
    name: 'Alexion Tower',
    workplace: 'tower',
    shiftSeconds: 120,
    cost: { energy: -8, hunger: -5, hygiene: -2, mood: -4 },
    minShifts: 5,
    blurb: 'Desk work upstairs. Needs a little experience first.',
    levels: [
      { title: 'Junior clerk', pay: 64, shiftsToNext: 4 },
      { title: 'Analyst', pay: 82, shiftsToNext: 6 },
      { title: 'Team lead', pay: 106, shiftsToNext: 9 },
      { title: 'Department head', pay: 140, shiftsToNext: 0 },
    ],
  },
};

export const JOB_IDS = Object.keys(JOBS) as JobId[];
export const isJobId = (v: unknown): v is JobId => typeof v === 'string' && v in JOBS;

export const jobsAt = (icon: PoiIcon): JobDef[] =>
  JOB_IDS.map((id) => JOBS[id]).filter((j) => j.workplace === icon);

/** How far someone has got in one job. */
export interface Career {
  level: number;
  /** Shifts finished at this level. */
  shifts: number;
}

export const newCareer = (): Career => ({ level: 0, shifts: 0 });

export function currentLevel(def: JobDef, career: Career): JobLevel {
  return def.levels[Math.min(career.level, def.levels.length - 1)]!;
}

/** Pay for the next shift, with the worker's mood taken into account. */
export const shiftPay = (def: JobDef, career: Career, mood: number): number =>
  Math.round(currentLevel(def, career).pay * payMultiplier(mood));

/** The career after one more finished shift, and whether that earned a promotion. */
export function afterShift(def: JobDef, career: Career): { career: Career; promoted: boolean } {
  const level = currentLevel(def, career);
  const shifts = career.shifts + 1;
  if (
    level.shiftsToNext > 0 &&
    shifts >= level.shiftsToNext &&
    career.level < def.levels.length - 1
  )
    return { career: { level: career.level + 1, shifts: 0 }, promoted: true };
  return { career: { level: career.level, shifts }, promoted: false };
}

export type JobCheck = { ok: true } | { ok: false; reason: string };

/** Whether someone with this much experience may take the job. */
export function canTakeJob(def: JobDef, totalShifts: number): JobCheck {
  return totalShifts >= def.minShifts
    ? { ok: true }
    : {
        ok: false,
        reason: `Finish ${def.minShifts - totalShifts} more shift(s) anywhere to apply here.`,
      };
}
