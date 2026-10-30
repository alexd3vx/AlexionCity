import { useEffect } from 'react';
import { BILL_PERIOD_SECONDS, EVICT_AFTER_MISSED } from '@alexioncity/shared';
import type { Multiplayer } from '../../net/useMultiplayer';
import { alex, heading, primary } from './life';

const when = (at: number) =>
  new Date(at).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

/** Balance, upcoming bills and what came in and went out. The ATM and the Bank tab both open this. */
export function BankSheet({ mp }: { mp: Multiplayer }) {
  const life = mp.room.life;
  const statement = mp.room.statement;
  useEffect(() => {
    mp.act.statement();
  }, [life?.balance]);

  if (!life)
    return <p className="text-sm text-[#1b2340]/65">Connect to the city to see your account.</p>;
  const { bills } = life;
  const minutes = Math.ceil(bills.dueIn / 60);
  return (
    <div className="space-y-6">
      <section aria-label="Balance" className="rounded-2xl bg-[#1b2340] p-5 text-white">
        <p className="text-[11px] font-extrabold uppercase tracking-wider text-white/60">Balance</p>
        <p className="font-display text-4xl font-extrabold tabular-nums" data-testid="balance">
          {alex(life.balance)}
        </p>
        {life.debt > 0 && (
          <p className="mt-1 text-sm text-white/70">Loan left to repay: {alex(life.debt)}</p>
        )}
      </section>

      <section aria-label="Bills" className="space-y-2">
        <h3 className={heading}>Bills</h3>
        {life.home.unit ? (
          <>
            <ul className="space-y-1.5">
              {bills.lines.map((l) => (
                <li
                  key={l.kind}
                  className="flex justify-between rounded-2xl bg-black/5 px-4 py-2.5 text-[15px] font-bold"
                >
                  <span>{l.label}</span>
                  <span className="tabular-nums">{alex(l.amount)}</span>
                </li>
              ))}
            </ul>
            <p className="text-sm text-[#1b2340]/65">
              Next bill in about <b>{minutes}</b> minute{minutes === 1 ? '' : 's'} in the city (
              {alex(bills.total)}). A bill comes after every {BILL_PERIOD_SECONDS / 60} minutes you
              spend here, and paying is automatic.
            </p>
          </>
        ) : (
          <p className="text-sm text-[#1b2340]/65">
            No home, no rent. Rent a place in Me, under Housing.
          </p>
        )}
        {bills.owing > 0 && (
          <div role="alert" className="space-y-2 rounded-2xl bg-rose-50 p-4 text-rose-900">
            <p className="font-extrabold">You owe {alex(bills.owing)}</p>
            <p className="text-sm">
              Missed rent: {bills.overdue} of {EVICT_AFTER_MISSED}. At {EVICT_AFTER_MISSED} you lose
              your home.
            </p>
            <button
              className={primary}
              disabled={life.balance < bills.owing}
              onClick={() => mp.act.payBills()}
            >
              Pay {alex(bills.owing)}
            </button>
          </div>
        )}
      </section>

      <section aria-label="Statement" className="space-y-2">
        <h3 className={heading}>Statement</h3>
        {!statement ? (
          <p className="text-sm text-[#1b2340]/60">Loading…</p>
        ) : statement.length === 0 ? (
          <p className="text-sm text-[#1b2340]/60">Nothing yet.</p>
        ) : (
          <ul className="divide-y divide-black/5">
            {statement.map((r, i) => (
              <li key={`${r.at}-${i}`} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-bold">{r.reason}</p>
                  <p className="text-[12px] text-[#1b2340]/50">{when(r.at)}</p>
                </div>
                <p
                  className={`shrink-0 tabular-nums font-extrabold ${r.delta > 0 ? 'text-emerald-600' : 'text-[#1b2340]'}`}
                >
                  {r.delta > 0 ? '+' : '−'}
                  {alex(Math.abs(r.delta))}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
