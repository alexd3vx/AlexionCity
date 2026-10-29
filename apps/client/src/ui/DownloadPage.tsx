import { useCallback, useEffect, useState } from 'react';
import { PackLoader } from '../packs/loader';
import { formatBytes, requiredFirst, type PackPlan } from '../packs/plan';
import { config } from '../config';

type Status =
  | { kind: 'loading' }
  | { kind: 'unavailable'; message: string }
  | { kind: 'ready'; plans: PackPlan[]; current: string[] };

export function DownloadPage({ onClose }: { onClose: () => void }) {
  const [loader] = useState(() => new PackLoader({ base: config.assetBase }));
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const [busy, setBusy] = useState<string | undefined>();
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | undefined>();

  const refresh = useCallback(async () => {
    try {
      const manifest = await loader.fetchManifest();
      const plan = await loader.plan(manifest);
      setStatus({ kind: 'ready', plans: requiredFirst(plan.needed), current: plan.current });
    } catch (e) {
      setStatus({
        kind: 'unavailable',
        message: e instanceof Error ? e.message : 'Content is not available yet',
      });
    }
  }, [loader]);

  useEffect(() => void refresh(), [refresh]);

  const run = async (plans: PackPlan[], label: string) => {
    setBusy(label);
    setError(undefined);
    setProgress(0);
    try {
      await loader.download(plans, (p) => setProgress(p.doneBytes / p.totalBytes));
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Download failed');
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 overflow-auto bg-slate-950/90 p-4 text-white backdrop-blur"
      role="dialog"
      aria-label="Downloads"
    >
      <div className="mx-auto max-w-lg">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-extrabold">Downloads</h2>
          <button
            className="rounded-full bg-white/10 px-4 py-2 text-sm font-bold"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <p className="mt-1 text-sm text-slate-300">
          Extra content is downloaded once and kept on this device. Updates only fetch what changed.
        </p>

        {status.kind === 'loading' && <p className="mt-6 text-slate-300">Checking for content…</p>}
        {status.kind === 'unavailable' && (
          <p className="mt-6 rounded-xl bg-white/10 p-4 text-sm text-slate-200">
            No content server is set up yet ({status.message}). Build packs with{' '}
            <code>pnpm assets:build</code> or set <code>VITE_ASSET_BASE</code>.
          </p>
        )}
        {status.kind === 'ready' && (
          <>
            {status.plans.length === 0 && (
              <p className="mt-6 text-slate-300">Everything is downloaded and up to date.</p>
            )}
            <ul className="mt-4 space-y-3">
              {status.plans.map((p) => (
                <li key={p.pack.id} className="flex items-center gap-3 rounded-xl bg-white/10 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{p.pack.title}</p>
                    <p className="text-xs text-slate-300">
                      {formatBytes(p.bytes)} · {p.pack.required ? 'needed' : 'optional'}
                    </p>
                    {busy === p.pack.id && (
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/20">
                        <div
                          className="h-full bg-orange-400 transition-[width]"
                          style={{ width: `${Math.round(progress * 100)}%` }}
                        />
                      </div>
                    )}
                  </div>
                  <button
                    disabled={busy !== undefined}
                    className="rounded-full bg-orange-500 px-4 py-2 text-sm font-extrabold disabled:opacity-50"
                    onClick={() => void run([p], p.pack.id)}
                  >
                    Download
                  </button>
                </li>
              ))}
            </ul>
            {status.plans.length > 1 && (
              <button
                disabled={busy !== undefined}
                className="mt-4 w-full rounded-full bg-white px-4 py-3 font-extrabold text-slate-900 disabled:opacity-50"
                onClick={() => void run(status.plans, 'all')}
              >
                Download everything ({formatBytes(status.plans.reduce((s, p) => s + p.bytes, 0))})
              </button>
            )}
            {status.current.length > 0 && (
              <p className="mt-4 text-xs text-slate-400">Up to date: {status.current.join(', ')}</p>
            )}
          </>
        )}
        {error && <p className="mt-4 rounded-xl bg-red-500/20 p-3 text-sm text-red-100">{error}</p>}
      </div>
    </div>
  );
}
