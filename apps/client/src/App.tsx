import { useCallback, useEffect, useMemo, useState } from 'react';
import { ensureGuest, supabase, type GuestSession } from './auth/guest';
import { config } from './config';
import { applyContent, openContent, type Content } from './game/content';
import { GameView } from './game/GameView';
import type { World } from './game/world';
import { PackLoader } from './packs/loader';
import { useMultiplayer } from './net/useMultiplayer';
import { Hud } from './ui/hud/Hud';
import { NamePrompt } from './ui/hud/social';
import { useWorldState } from './ui/hud/useWorldState';
import { DownloadPage } from './ui/DownloadPage';
import { UpdateNotice } from './update/UpdateNotice';

const NAME_KEY = 'alexion.name';

function storedName(): string | undefined {
  try {
    return localStorage.getItem(NAME_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * The game screen. The first load shows the default look straight away; extra packs live on the
 * Downloads page and are used the moment they finish, with no reload.
 */
export default function App() {
  const [guest, setGuest] = useState<GuestSession | undefined>();
  const [showDownloads, setShowDownloads] = useState(false);
  const [world, setWorld] = useState<World | undefined>();
  const [content, setContent] = useState<Content | undefined>();
  const [name, setName] = useState(storedName);
  const worldState = useWorldState(world);
  const mp = useMultiplayer(world, guest, name, content);
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

  const chooseName = useCallback(
    (next: string) => {
      setName(next);
      try {
        localStorage.setItem(NAME_KEY, next);
      } catch {
        // storage blocked: the name is asked for again next visit
      }
      // keep it on the account too, so it follows the player to another device; a failure only means it stays local
      const sb = supabase();
      if (sb && guest?.mode === 'supabase')
        void sb
          .from('profiles')
          .update({ display_name: next })
          .eq('id', guest.id)
          .then(() => undefined);
    },
    [guest],
  );

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
          mp={mp}
          name={name ?? ''}
          onRename={chooseName}
          onOpenDownloads={() => setShowDownloads(true)}
        />
      )}

      {world && !name && (
        <NamePrompt
          initial={`Guest${Math.floor(1000 + Math.random() * 9000)}`}
          onDone={chooseName}
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
