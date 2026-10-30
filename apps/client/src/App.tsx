import { useCallback, useEffect, useMemo, useState } from 'react';
import { ensureGuest, type GuestSession } from './auth/guest';
import { config } from './config';
import { applyContent, openContent } from './game/content';
import { GameView } from './game/GameView';
import type { World } from './game/world';
import { PackLoader } from './packs/loader';
import { DownloadPage } from './ui/DownloadPage';
import { Wordmark } from './ui/Wordmark';
import { UpdateNotice } from './update/UpdateNotice';

/**
 * Phase 0 shell. First load shows the default look straight away; extra packs live on the
 * Downloads page. The real HUD, chosen from the LagosLife screenshots, replaces the top pill in Phase 1.
 */
export default function App() {
  const [guest, setGuest] = useState<GuestSession | undefined>();
  const [showDownloads, setShowDownloads] = useState(false);
  const [world, setWorld] = useState<World | undefined>();
  const loader = useMemo(() => new PackLoader({ base: config.assetBase }), []);

  // use whatever is downloaded: swap stand-ins for real models and add the avatar and crowd
  const refreshContent = useCallback(async () => {
    if (!world) return;
    const content = await openContent(loader);
    if (content) await applyContent(world, content);
  }, [world, loader]);
  useEffect(() => void refreshContent(), [refreshContent]);

  // developer shortcut: /?autodl downloads every pack at start
  useEffect(() => {
    if (!import.meta.env.DEV || !world || !location.search.includes('autodl')) return;
    void (async () => {
      const plan = await loader.plan(await loader.fetchManifest());
      await loader.download(plan.needed);
      await refreshContent();
    })();
  }, [world, loader, refreshContent]);

  useEffect(() => {
    void ensureGuest().then(setGuest);
  }, []);

  return (
    <div className="relative h-dvh w-dvw overflow-hidden bg-slate-900 font-sans">
      <GameView onWorld={setWorld} />

      <header className="pointer-events-none absolute inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-10 flex justify-center px-3">
        <div className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-full bg-white/90 px-4 py-2 text-sm font-bold text-slate-900 shadow-lg">
          <Wordmark className="text-lg" />
          <span className="flex-1 truncate font-medium text-slate-500" data-testid="guest-status">
            {guest
              ? `Guest ${guest.id.slice(0, 6)} · ${guest.mode === 'supabase' ? 'online' : 'offline mode'}`
              : 'Starting…'}
          </span>
          <button
            className="rounded-full bg-orange-500 px-3 py-1 text-xs font-extrabold text-white"
            onClick={() => setShowDownloads(true)}
          >
            Downloads
          </button>
        </div>
      </header>

      <p className="pointer-events-none absolute bottom-2 right-3 z-10 text-[10px] text-white/70">
        v{config.appVersion}
      </p>

      {showDownloads && (
        <DownloadPage
          loader={loader}
          onChanged={() => void refreshContent()}
          onClose={() => setShowDownloads(false)}
        />
      )}
      <UpdateNotice />
    </div>
  );
}
