import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import type { WhatsNewItem } from '@alexioncity/shared';

/**
 * Shows an animated "update available" card with what is new. The old version keeps running until
 * the player taps Update, so a live session is never reloaded without warning.
 */
export function UpdateNotice() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // check for a new version every 10 minutes while the game is open
      if (registration) setInterval(() => void registration.update(), 10 * 60 * 1000);
    },
  });
  const [latest, setLatest] = useState<WhatsNewItem | undefined>();

  useEffect(() => {
    if (!needRefresh) return;
    fetch('/whats-new.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? (r.json() as Promise<WhatsNewItem[]>) : []))
      .then((items) => setLatest(items[0]))
      .catch(() => setLatest(undefined));
  }, [needRefresh]);

  return (
    <AnimatePresence>
      {needRefresh && (
        <motion.aside
          role="status"
          aria-live="polite"
          initial={{ y: 80, opacity: 0, scale: 0.96 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 28 }}
          className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-50 mx-auto max-w-sm rounded-2xl bg-white p-4 text-slate-900 shadow-2xl"
        >
          <p className="text-sm font-extrabold">
            {latest ? `Update ${latest.version}: ${latest.title}` : 'A new version is ready'}
          </p>
          {latest && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
              {latest.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex gap-2">
            <button
              className="flex-1 rounded-full bg-orange-500 px-4 py-2 text-sm font-extrabold text-white active:scale-95"
              onClick={() => {
                void updateServiceWorker(true);
                // on a first visit the page is not yet controlled by the worker, so the automatic reload
                // never fires; reload ourselves if it has not happened shortly
                setTimeout(() => location.reload(), 1500);
              }}
            >
              Update now
            </button>
            <button
              className="rounded-full bg-slate-100 px-4 py-2 text-sm font-bold active:scale-95"
              onClick={() => setNeedRefresh(false)}
            >
              Later
            </button>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
