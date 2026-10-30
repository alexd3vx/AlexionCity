import { useCallback, useEffect, useMemo, useState } from 'react';
import { ensureGuest, type GuestSession } from './auth/guest';
import { config } from './config';
import { applyContent, openContent, type Content } from './game/content';
import { GameView } from './game/GameView';
import type { World } from './game/world';
import { PackLoader } from './packs/loader';
import { Hud } from './ui/hud/Hud';
import { useWorldState } from './ui/hud/useWorldState';
import { DownloadPage } from './ui/DownloadPage';
import { UpdateNotice } from './update/UpdateNotice';

/**
 * The game screen. The first load shows the default look straight away; extra packs live on the
 * Downloads page and are used the moment they finish, with no reload.
 */
export default function App() {
  const [guest, setGuest] = useState<GuestSession | undefined>();
  const [showDownloads, setShowDownloads] = useState(false);
  const [world, setWorld] = useState<World | undefined>();
  const [content, setContent] = useState<Content | undefined>();
  const worldState = useWorldState(world);
  const loader = useMemo(() => new PackLoader({ base: config.assetBase }), []);

  // use whatever is downloaded: swap stand-ins for real models and add the avatar and crowd
  const refreshContent = useCallback(async () => {
    if (!world) return;
    const opened = await openContent(loader);
    setContent(opened);
    if (opened) await applyContent(world, opened);
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

      {world && worldState && (
        <Hud
          world={world}
          state={worldState}
          content={content}
          guestLabel={
            guest
              ? `Guest ${guest.id.slice(0, 6)} · ${guest.mode === 'supabase' ? 'online' : 'offline mode'}`
              : 'Starting…'
          }
          onOpenDownloads={() => setShowDownloads(true)}
        />
      )}

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
