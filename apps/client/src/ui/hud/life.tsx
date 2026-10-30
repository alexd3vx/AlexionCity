import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import {
  BACKGROUNDS,
  JOBS,
  NEED_KEYS,
  TUTORIAL,
  UNITS,
  UNIT_IDS,
  currentLevel,
  depositFor,
  rentFor,
  tokens,
  type LifeSnapshot,
  type NeedKey,
  type Needs,
} from '@alexioncity/shared';
import type { Multiplayer } from '../../net/useMultiplayer';
import { Icon } from './icons';

export const alex = (n: number): string => `₳${Math.round(n).toLocaleString('en-US')}`;

export const NEED_LABEL: Record<NeedKey, string> = {
  hunger: 'Hunger',
  energy: 'Energy',
  mood: 'Mood',
  hygiene: 'Hygiene',
};

const NEED_COLOR: Record<NeedKey, string> = {
  hunger: tokens.need.hunger,
  energy: tokens.need.energy,
  mood: tokens.need.mood,
  hygiene: tokens.need.hygiene,
};

export const glass =
  'pointer-events-auto rounded-full bg-white/92 text-[#1b2340] shadow-[0_6px_18px_rgba(27,35,64,0.22)] backdrop-blur';
export const chip = (on: boolean) =>
  `rounded-full px-3 py-1.5 text-sm font-extrabold active:scale-95 ${on ? 'bg-[#1b2340] text-white' : 'bg-black/5 text-[#1b2340]'}`;
export const primary =
  'rounded-full bg-[#ff7a1a] px-4 py-2 text-sm font-extrabold text-white shadow-[0_4px_12px_rgba(255,122,26,0.4)] active:scale-95 disabled:opacity-40 disabled:shadow-none';
export const heading = 'text-sm font-extrabold uppercase tracking-wider text-[#1b2340]/55';

/** The four need bars. Before the server has sent them the bars sit empty and dim. */
export function NeedsPanel({ needs }: { needs: Needs | undefined }) {
  return (
    <div
      className="pointer-events-none w-[152px] rounded-2xl bg-[#1b2340]/72 px-3 py-2.5 text-white backdrop-blur"
      aria-label="Needs"
    >
      {NEED_KEYS.map((key) => {
        const value = needs?.[key];
        const low = value !== undefined && value < 25;
        return (
          <div key={key} className="grid grid-cols-[52px_1fr] items-center gap-2 py-[3px]">
            <span className="text-[9px] font-extrabold uppercase tracking-[0.1em] text-white/80">
              {NEED_LABEL[key]}
            </span>
            <span
              className="h-[5px] overflow-hidden rounded-full bg-white/20"
              role="meter"
              aria-label={NEED_LABEL[key]}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={value ?? 0}
            >
              <span
                className={`block h-full rounded-full transition-[width] duration-700 ${low ? 'animate-pulse' : ''}`}
                style={{
                  width: `${value ?? 0}%`,
                  background: low ? '#ff5a5a' : NEED_COLOR[key],
                  opacity: value === undefined ? 0.3 : 1,
                }}
              />
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Seconds left on what the player is doing, counted down on this device between server updates. */
export function useRemaining(life: LifeSnapshot | undefined, lifeAt: number | undefined): number {
  const [, tick] = useState(0);
  const active = Boolean(life?.activity);
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => tick((n) => n + 1), 250);
    return () => window.clearInterval(id);
  }, [active]);
  if (!life?.activity) return 0;
  return Math.max(0, life.activity.remaining - (Date.now() - (lifeAt ?? Date.now())) / 1000);
}

export const clock = (seconds: number): string => {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const ACTIVITY_NAME = {
  sleep: 'Sleeping',
  wash: 'Washing',
  relax: 'Relaxing',
  stroll: 'Sitting in the plaza',
} as const;

/** What the player is doing right now, with time left and a way to stop. */
export function ActivityBar({ mp }: { mp: Multiplayer }) {
  const { life, lifeAt } = mp.room;
  const remaining = useRemaining(life, lifeAt);
  const a = life?.activity;
  if (!life || !a) return null;
  const shift = a.kind === 'shift' && a.job;
  const label = shift
    ? `${currentLevel(JOBS[a.job!], life.careers[a.job!] ?? { level: 0, shifts: 0 }).title}`
    : ACTIVITY_NAME[a.kind as keyof typeof ACTIVITY_NAME];
  const done = a.total > 0 ? 1 - remaining / a.total : 0;
  return (
    <motion.div
      initial={{ y: -10, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className={`${glass} relative flex items-center gap-2 overflow-hidden py-1 pl-3 pr-1 text-sm font-extrabold`}
      role="status"
      aria-label="Current activity"
    >
      <span
        className="absolute inset-y-0 left-0 bg-[#ff7a1a]/18"
        style={{ width: `${Math.round(done * 100)}%` }}
      />
      <span className="relative max-w-[34vw] truncate">{label}</span>
      <span className="relative tabular-nums text-[#1b2340]/60">{clock(remaining)}</span>
      {shift && a.pay !== undefined && (
        <span className="relative text-[#d9600a]">+{alex(a.pay)}</span>
      )}
      <button
        aria-label="Stop"
        className="relative grid h-8 w-8 place-items-center rounded-full active:bg-black/10"
        onClick={() => mp.act.stop()}
      >
        <Icon name="close" className="h-4 w-4" />
      </button>
    </motion.div>
  );
}

/** A small nudge toward the next getting-started step; gone once they are all done. */
export function TutorialChip({
  life,
  onOpen,
}: {
  life: LifeSnapshot | undefined;
  onOpen: () => void;
}) {
  if (!life) return null;
  const done = TUTORIAL.filter((t) => life.tutorial[t.id]).length;
  const next = TUTORIAL.find((t) => !life.tutorial[t.id]);
  if (!next) return null;
  return (
    <button
      onClick={onOpen}
      className="pointer-events-auto flex w-[152px] flex-col rounded-2xl bg-white/92 px-3 py-2 text-left text-[#1b2340] shadow-[0_4px_12px_rgba(27,35,64,0.2)] active:scale-95"
      aria-label={`Getting started, ${done} of ${TUTORIAL.length} done. Next: ${next.title}`}
    >
      <span className="text-[9px] font-extrabold uppercase tracking-[0.1em] text-[#ff7a1a]">
        Getting started {done}/{TUTORIAL.length}
      </span>
      <span className="text-[12px] font-extrabold leading-tight">{next.title}</span>
    </button>
  );
}

/** Who the player is in the city: background, work and the getting-started list. */
export function CareerCard({ life }: { life: LifeSnapshot | undefined }) {
  if (!life) {
    return (
      <section className="rounded-2xl bg-[#f3f5fa] p-4 text-sm text-[#1b2340]/65">
        Connect to the city to see your life here.
      </section>
    );
  }
  const bg = BACKGROUNDS[life.background];
  const job = life.job ? JOBS[life.job] : undefined;
  const career = life.job ? life.careers[life.job] : undefined;
  const level = job && career ? currentLevel(job, career) : undefined;
  return (
    <div className="space-y-5">
      <section aria-label="Your story" className="rounded-2xl bg-[#fff3e0] p-4">
        <p className="text-[11px] font-extrabold uppercase tracking-wider text-[#d9600a]">
          Your story
        </p>
        <h3 className="font-display text-lg font-extrabold">{bg.name}</h3>
        <p className="mt-1 text-sm text-[#1b2340]/75">{bg.blurb}</p>
        {life.debt > 0 && (
          <p className="mt-2 text-sm font-bold">You still owe {alex(life.debt)} on your loan.</p>
        )}
      </section>

      <section aria-label="Work" className="space-y-1">
        <h3 className={heading}>Work</h3>
        {job && level ? (
          <p className="text-[15px] font-bold">
            {level.title}, {job.name}
            <span className="font-semibold text-[#1b2340]/60">
              {' '}
              · {alex(level.pay)} a shift
              {level.shiftsToNext > 0 && ` · ${career!.shifts}/${level.shiftsToNext} to promotion`}
            </span>
          </p>
        ) : (
          <p className="text-sm text-[#1b2340]/65">
            No job yet. Visit the kitchen, the bar or the hospital.
          </p>
        )}
        <p className="text-sm text-[#1b2340]/60">{life.totalShifts} shift(s) worked in all.</p>
      </section>

      <section aria-label="Getting started" className="space-y-2">
        <h3 className={heading}>Getting started</h3>
        <ol className="space-y-1.5">
          {TUTORIAL.map((t) => (
            <li key={t.id} className="flex items-start gap-2.5">
              <span
                className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full ${life.tutorial[t.id] ? 'bg-emerald-500 text-white' : 'bg-black/10'}`}
              >
                {life.tutorial[t.id] && <Icon name="check" className="h-3 w-3" />}
              </span>
              <span className={life.tutorial[t.id] ? 'text-[#1b2340]/45 line-through' : ''}>
                <b className="text-[14px]">{t.title}</b>
                <span className="block text-[13px] text-[#1b2340]/60">{t.hint}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

/** The home in Me: what you rent, what it costs, and moving somewhere else. */
export function HousingSection({ mp }: { mp: Multiplayer }) {
  const life = mp.room.life;
  if (!life) return null;
  const unit = life.home.unit;
  return (
    <section aria-label="Housing" className="space-y-3">
      <h3 className={heading}>Housing</h3>
      <p className="text-[15px] font-bold">
        {unit
          ? `${UNITS[unit].name} · ${alex(rentFor(unit, life.background))} rent`
          : 'You have no home right now.'}
        {unit && (
          <span className="font-semibold text-[#1b2340]/60"> · comfort {life.home.comfort}</span>
        )}
      </p>
      <div className="space-y-2">
        {UNIT_IDS.map((id) => {
          const def = UNITS[id];
          const here = unit === id;
          return (
            <div
              key={id}
              className="flex items-center justify-between gap-3 rounded-2xl bg-black/5 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="font-extrabold">
                  {def.name}{' '}
                  <span className="font-semibold text-[#1b2340]/55">
                    {def.w}×{def.d} m
                  </span>
                </p>
                <p className="truncate text-[13px] text-[#1b2340]/60">
                  {alex(rentFor(id, life.background))} + {alex(def.utilities)} a month · {def.blurb}
                </p>
              </div>
              <button
                className={primary}
                disabled={here || life.balance < depositFor(id, life.background)}
                onClick={() => mp.act.moveUnit(id)}
              >
                {here ? 'Your home' : `Move · ${alex(depositFor(id, life.background))}`}
              </button>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-[#1b2340]/55">
        Moving costs one month&apos;s rent as a deposit. A month is an hour spent in the city.
      </p>
    </section>
  );
}
