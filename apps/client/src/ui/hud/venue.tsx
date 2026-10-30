import {
  JOBS,
  canTakeJob,
  canWork,
  currentLevel,
  jobsAt,
  menuFor,
  newCareer,
  shiftPay,
  type JobDef,
  type MenuItem,
  type Needs,
  type Poi,
} from '@alexioncity/shared';
import type { Multiplayer } from '../../net/useMultiplayer';
import { NEED_LABEL, alex, clock, heading, primary, useRemaining } from './life';

/** "+25 Hunger" and "-3 Energy", for what a meal does. */
export function effectChips(effect: Partial<Needs>): string[] {
  return Object.entries(effect)
    .filter(([, v]) => v)
    .map(([k, v]) => `${v! > 0 ? '+' : '−'}${Math.abs(v!)} ${NEED_LABEL[k as keyof Needs]}`);
}

function MenuRow({ item, mp, disabled }: { item: MenuItem; mp: Multiplayer; disabled: boolean }) {
  const broke = (mp.room.life?.balance ?? 0) < item.price;
  return (
    <li className="flex items-center justify-between gap-3 rounded-2xl bg-black/5 px-4 py-3">
      <div className="min-w-0">
        <p className="font-extrabold">{item.name}</p>
        <p className="text-[13px] text-[#1b2340]/60">{item.blurb}</p>
        <p className="mt-0.5 flex flex-wrap gap-x-2 text-[12px] font-bold text-emerald-700">
          {effectChips(item.effect).map((c) => (
            <span key={c} className={c.startsWith('−') ? 'text-rose-600' : ''}>
              {c}
            </span>
          ))}
        </p>
      </div>
      <button
        className={primary}
        disabled={disabled || broke}
        aria-label={`Buy ${item.name} for ${alex(item.price)}`}
        onClick={() => mp.act.order(item.id)}
      >
        {alex(item.price)}
      </button>
    </li>
  );
}

function JobCard({ def, mp }: { def: JobDef; mp: Multiplayer }) {
  const { life, lifeAt } = mp.room;
  const remaining = useRemaining(life, lifeAt);
  if (!life) return null;
  const career = life.careers[def.id] ?? newCareer();
  const level = currentLevel(def, career);
  const open = canTakeJob(def, life.totalShifts);
  const fit = canWork(life.needs);
  const onShift = life.activity?.kind === 'shift' && life.activity.job === def.id;
  const busy = Boolean(life.activity);
  const blocked = !open.ok ? open.reason : !fit.ok ? fit.reason : undefined;
  const mine = life.job === def.id;
  const pay = shiftPay(def, career, life.needs.mood);
  return (
    <li className="space-y-2 rounded-2xl bg-[#fff3e0] px-4 py-3.5" aria-label={`${def.name} job`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-[#d9600a]">
            {mine ? 'Your job' : 'Job'}
          </p>
          <p className="font-extrabold">{level.title}</p>
          <p className="text-[13px] text-[#1b2340]/65">{def.blurb}</p>
        </div>
        <p className="shrink-0 text-right text-[13px] font-bold">
          {alex(pay)}
          <span className="block font-semibold text-[#1b2340]/55">
            {clock(def.shiftSeconds)} shift
          </span>
        </p>
      </div>
      {level.shiftsToNext > 0 && (
        <div>
          <div className="h-1.5 overflow-hidden rounded-full bg-black/10">
            <div
              className="h-full rounded-full bg-[#ff7a1a]"
              style={{ width: `${Math.min(100, (career.shifts / level.shiftsToNext) * 100)}%` }}
            />
          </div>
          <p className="mt-1 text-[12px] font-semibold text-[#1b2340]/55">
            {career.shifts}/{level.shiftsToNext} shifts to the next level
          </p>
        </div>
      )}
      {onShift ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-extrabold tabular-nums">Working… {clock(remaining)} left</p>
          <button className={primary} onClick={() => mp.act.stop()}>
            Stop
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px] font-semibold text-rose-700">
            {blocked ?? (busy ? 'Finish what you are doing first.' : '')}
          </p>
          <div className="flex shrink-0 gap-2">
            {mine && (
              <button
                className="rounded-full bg-black/5 px-3 py-2 text-sm font-extrabold active:scale-95"
                onClick={() => mp.act.quitJob()}
              >
                Quit
              </button>
            )}
            <button
              className={primary}
              disabled={Boolean(blocked) || busy}
              onClick={() => mp.act.work(def.id)}
            >
              {mine ? 'Start shift' : 'Apply and start'}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

/** What you can do at a restaurant, bar, hospital or office: eat or drink, and work. */
export function VenueSheet({ poi, mp }: { poi: Poi; mp: Multiplayer }) {
  const life = mp.room.life;
  const menu = menuFor(poi.icon);
  const jobs = jobsAt(poi.icon);
  if (!life)
    return <p className="text-sm text-[#1b2340]/65">Connect to the city to use this place.</p>;
  const busy = Boolean(life.activity);
  return (
    <div className="space-y-5">
      <p className="text-sm text-[#1b2340]/65">
        You have <b className="text-[#1b2340]">{alex(life.balance)}</b>.
        {busy && ' You are busy right now.'}
      </p>
      {menu.length > 0 && (
        <section aria-label="Menu" className="space-y-2">
          <h3 className={heading}>Menu</h3>
          <ul className="space-y-2">
            {menu.map((m) => (
              <MenuRow key={m.id} item={m} mp={mp} disabled={busy} />
            ))}
          </ul>
        </section>
      )}
      {jobs.length > 0 && (
        <section aria-label="Work here" className="space-y-2">
          <h3 className={heading}>Work here</h3>
          <ul className="space-y-2">
            {jobs.map((j) => (
              <JobCard key={j.id} def={JOBS[j.id]} mp={mp} />
            ))}
          </ul>
        </section>
      )}
      {menu.length === 0 && jobs.length === 0 && (
        <p className="text-sm text-[#1b2340]/65">Nothing to do here yet.</p>
      )}
    </div>
  );
}
