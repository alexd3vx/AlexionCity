import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { clockLabel, skyAt } from '../../game/daynight';
import type { Content } from '../../game/content';
import type { PoiIcon } from '../../game/district/layout';
import type { World, WorldState } from '../../game/world';
import { VIEW_LABELS } from '../../game/cameras';
import { tokens } from '@alexioncity/shared';
import { Icon } from './icons';
import { drawMap } from './minimap';
import { MapPanel, MePanel, SoonPanel } from './panels';

export type Tab = 'me' | 'buy' | 'map' | 'phone';

interface Props {
  world: World;
  state: WorldState;
  content: Content | undefined;
  guestLabel: string;
  onOpenDownloads: () => void;
}

const NEEDS = [
  { key: 'Hunger', value: 0.72, color: tokens.need.hunger },
  { key: 'Energy', value: 0.48, color: tokens.need.energy },
  { key: 'Mood', value: 0.85, color: tokens.need.mood },
  { key: 'Hygiene', value: 0.31, color: tokens.need.hygiene },
] as const;

const glass =
  'pointer-events-auto rounded-full bg-white/92 text-[#1b2340] shadow-[0_6px_18px_rgba(27,35,64,0.22)] backdrop-blur';

function TopPill({
  world,
  state,
  onWhere,
}: {
  world: World;
  state: WorldState;
  onWhere: () => void;
}) {
  const night = skyAt(state.minutes).glow > 0.5;
  const home = world.layout.pois.find((p) => p.icon === 'home');
  return (
    <div className={`${glass} flex w-full max-w-lg items-center gap-2 py-1.5 pl-2 pr-1.5`}>
      <button
        aria-label="Go home"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full active:bg-black/10"
        onClick={() => home && world.teleport(home.x, home.z)}
      >
        <Icon name="home" />
      </button>
      <span className="flex shrink-0 items-center gap-1.5 text-sm font-extrabold">
        <Icon name={night ? 'moon' : 'sun'} className="h-4 w-4 text-[#ff7a1a]" />
        {clockLabel(state.minutes)}
      </span>
      <span className="h-5 w-px shrink-0 bg-black/15" />
      <button
        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        onClick={onWhere}
        aria-label="Choose a destination"
      >
        <Icon name="pin" className="h-4 w-4 shrink-0 text-[#ff7a1a]" />
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-[13px] font-bold text-[#1b2340]/70">Where to?</span>
          <span className="block truncate text-[10px] font-bold uppercase tracking-wider text-[#1b2340]/45">
            {state.street}
          </span>
        </span>
      </button>
      <span className="shrink-0 text-sm font-extrabold" title="Money arrives in Phase 3">
        ₳ 0
      </span>
      <button
        aria-label="Add money"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#ff7a1a] text-white active:scale-95"
        onClick={onWhere}
      >
        <Icon name="plus" className="h-5 w-5" />
      </button>
    </div>
  );
}

function SideButtons({
  world,
  state,
  onSettings,
  show,
}: {
  world: World;
  state: WorldState;
  onSettings: () => void;
  show: (m: string) => void;
}) {
  const btn = 'grid h-10 w-10 place-items-center rounded-full active:bg-black/10';
  return (
    <div className={`${glass} flex flex-col p-1`}>
      <button
        aria-label="Recenter camera"
        className={btn}
        onClick={() => (world.recenter(), show('Camera behind you'))}
      >
        <Icon name="target" />
      </button>
      <button
        aria-label={`Change view, now ${VIEW_LABELS[state.view]}`}
        className={btn}
        onClick={() => show(VIEW_LABELS[world.cycleView()])}
      >
        <Icon name="eye" />
      </button>
      <button aria-label="Settings" className={btn} onClick={onSettings}>
        <Icon name="gear" />
      </button>
    </div>
  );
}

function Needs() {
  return (
    <div
      className="pointer-events-none w-[152px] rounded-2xl bg-[#1b2340]/72 px-3 py-2.5 text-white backdrop-blur"
      aria-label="Needs preview"
      title="Needs start working in Phase 3"
    >
      {NEEDS.map((n) => (
        <div key={n.key} className="grid grid-cols-[52px_1fr] items-center gap-2 py-[3px]">
          <span className="text-[9px] font-extrabold uppercase tracking-[0.1em] text-white/80">
            {n.key}
          </span>
          <span className="h-[5px] overflow-hidden rounded-full bg-white/20">
            <span
              className="block h-full rounded-full"
              style={{ width: `${n.value * 100}%`, background: n.color }}
            />
          </span>
        </div>
      ))}
    </div>
  );
}

function MiniMap({ world, state }: { world: World; state: WorldState }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) drawMap(ref.current, world.layout, state, { scale: 1.15, rotate: true });
  }, [world, state]);
  return (
    <canvas
      ref={ref}
      width={192}
      height={192}
      aria-label="Minimap"
      className="pointer-events-none h-24 w-24 rounded-2xl border-2 border-white shadow-[0_6px_18px_rgba(27,35,64,0.25)]"
    />
  );
}

function WaypointBar({ world, state }: { world: World; state: WorldState }) {
  const wp = state.waypoint;
  if (!wp) return null;
  return (
    <motion.div
      initial={{ y: -10, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className={`${glass} flex items-center gap-2 py-1 pl-3 pr-1 text-sm font-extrabold`}
    >
      <span
        className="grid h-7 w-7 place-items-center rounded-full bg-[#ff7a1a] text-white"
        style={{ transform: `rotate(${wp.angle}rad)` }}
      >
        <Icon name="arrow" className="h-4 w-4" />
      </span>
      <span className="max-w-[30vw] truncate">{wp.name}</span>
      <span className="text-[#1b2340]/60">{Math.round(wp.distance)} m</span>
      <button
        aria-label="Cancel destination"
        className="grid h-8 w-8 place-items-center rounded-full active:bg-black/10"
        onClick={() => world.setWaypoint(undefined)}
      >
        <Icon name="close" className="h-4 w-4" />
      </button>
    </motion.div>
  );
}

function PlacesStrip({ world, state }: { world: World; state: WorldState }) {
  return (
    <div
      className="pointer-events-auto flex w-full max-w-md min-w-0 gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      aria-label="Nearby places"
    >
      {state.places.map(({ poi, distance }) => {
        const chosen = state.waypoint?.poiId === poi.id;
        return (
          <button
            key={poi.id}
            onClick={() => world.setWaypoint(chosen ? undefined : poi.id)}
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-extrabold shadow-[0_4px_12px_rgba(27,35,64,0.2)] active:scale-95 ${chosen ? 'bg-[#ff7a1a] text-white' : 'bg-white/92 text-[#1b2340]'}`}
          >
            <Icon name={poi.icon as PoiIcon} className="h-3.5 w-3.5" />
            {poi.name}
            <span className={chosen ? 'text-white/80' : 'text-[#1b2340]/50'}>
              {Math.round(distance)} m
            </span>
          </button>
        );
      })}
    </div>
  );
}

function BottomBar({ tab, setTab }: { tab: Tab | null; setTab: (t: Tab | null) => void }) {
  const tabs: { id: Tab; label: string; icon: 'person' | 'bag' | 'map' | 'phone' }[] = [
    { id: 'me', label: 'Me', icon: 'person' },
    { id: 'buy', label: 'Buy', icon: 'bag' },
    { id: 'map', label: 'Map', icon: 'map' },
    { id: 'phone', label: 'Phone', icon: 'phone' },
  ];
  return (
    <nav
      className={`${glass} mx-3 flex w-[calc(100%-1.5rem)] max-w-md justify-between p-1.5`}
      aria-label="Menu"
    >
      {tabs.map((t) => (
        <button
          key={t.id}
          aria-current={tab === t.id}
          onClick={() => setTab(tab === t.id ? null : t.id)}
          className={`flex flex-1 flex-col items-center gap-0.5 rounded-full py-1.5 text-[11px] font-extrabold transition-colors ${tab === t.id ? 'bg-[#1b2340] text-white' : 'text-[#1b2340]/75'}`}
        >
          <Icon name={t.icon} className="h-5 w-5" />
          {t.label}
        </button>
      ))}
    </nav>
  );
}

export function Hud({ world, state, content, guestLabel, onOpenDownloads }: Props) {
  const [tab, setTab] = useState<Tab | null>(null);
  const [toast, setToast] = useState<string | undefined>();
  const timer = useRef<number | undefined>(undefined);
  const show = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(undefined), 2200);
  }, []);

  useEffect(() => {
    if (state.arrived) show(`You are at ${state.arrived}`);
  }, [state.arrived, show]);

  const debug = new URLSearchParams(location.search).has('debug');
  // the destination bar sits under the top pill, so the side columns step down to make room
  const columnTop = state.waypoint
    ? 'top-[calc(max(0.6rem,env(safe-area-inset-top))+6.4rem)]'
    : 'top-[calc(max(0.6rem,env(safe-area-inset-top))+3.4rem)]';

  return (
    <div className="pointer-events-none absolute inset-0 z-10 select-none">
      <div className="absolute inset-x-0 top-[max(0.6rem,env(safe-area-inset-top))] flex flex-col items-center gap-2 px-3">
        <TopPill world={world} state={state} onWhere={() => setTab('map')} />
        <WaypointBar world={world} state={state} />
      </div>

      <div
        className={`absolute left-3 flex flex-col gap-2 pt-1 transition-[top] duration-200 ${columnTop}`}
      >
        <Needs />
      </div>
      <div
        className={`absolute right-3 flex flex-col items-end gap-2 pt-1 transition-[top] duration-200 ${columnTop}`}
      >
        <SideButtons world={world} state={state} onSettings={() => setTab('me')} show={show} />
        <MiniMap world={world} state={state} />
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast}
            initial={{ y: -8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ opacity: 0 }}
            role="status"
            className="absolute bottom-[calc(max(0.6rem,env(safe-area-inset-bottom))+16.5rem)] left-1/2 w-max max-w-[86vw] -translate-x-1/2 text-center rounded-full bg-[#1b2340]/88 px-4 py-2 text-sm font-bold text-white"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="absolute inset-x-0 bottom-[max(0.6rem,env(safe-area-inset-bottom))] flex flex-col items-center gap-2">
        {(state.action || state.talk) && (
          <div className="pointer-events-auto flex w-full max-w-md flex-col items-end gap-2 px-3">
            {state.talk && (
              <button
                className="rounded-full bg-white px-4 py-2.5 text-sm font-extrabold text-[#1b2340] shadow-[0_6px_18px_rgba(27,35,64,0.25)] active:scale-95"
                onClick={() =>
                  show('"How far is Pizza Corner?" Conversations arrive with chat in Phase 2.')
                }
              >
                {state.talk.label}
              </button>
            )}
            {state.action && (
              <button
                className="rounded-full bg-[#ff7a1a] px-5 py-3 text-sm font-extrabold text-white shadow-[0_6px_18px_rgba(255,122,26,0.45)] active:scale-95"
                onClick={() =>
                  show(
                    `${state.action!.label.replace(/^Enter /, 'Inside ')} opens in Phase 3. Interiors come with homes.`,
                  )
                }
              >
                {state.action.label}
              </button>
            )}
          </div>
        )}
        <PlacesStrip world={world} state={state} />
        <BottomBar tab={tab} setTab={setTab} />
      </div>

      {debug && (
        <p className="absolute bottom-[calc(max(0.6rem,env(safe-area-inset-bottom))+16.5rem)] left-3 rounded bg-black/60 px-2 py-1 font-mono text-[10px] text-white">
          {state.stats.fps} fps · {state.stats.calls} calls ·{' '}
          {Math.round(state.stats.triangles / 1000)}k tris · {state.look}
        </p>
      )}

      <AnimatePresence>
        {tab && (
          <motion.section
            key={tab}
            role="dialog"
            aria-label={tab}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 340, damping: 34 }}
            className="pointer-events-auto absolute inset-x-0 bottom-0 z-20 mx-auto flex max-h-[82dvh] w-full max-w-xl flex-col rounded-t-3xl bg-white text-[#1b2340] shadow-[0_-10px_40px_rgba(27,35,64,0.35)]"
          >
            <header className="flex items-center justify-between px-5 pb-2 pt-4">
              <h2 className="font-display text-xl font-extrabold">
                {{ me: 'Me', buy: 'Buy', map: 'Map', phone: 'Phone' }[tab]}
              </h2>
              <button
                aria-label="Close"
                className="grid h-9 w-9 place-items-center rounded-full bg-black/5 active:bg-black/10"
                onClick={() => setTab(null)}
              >
                <Icon name="close" />
              </button>
            </header>
            <div className="overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
              {tab === 'me' && (
                <MePanel
                  world={world}
                  content={content}
                  guestLabel={guestLabel}
                  onOpenDownloads={onOpenDownloads}
                />
              )}
              {tab === 'map' && (
                <MapPanel
                  world={world}
                  state={state}
                  onPick={(id) => {
                    world.setWaypoint(id);
                    setTab(null);
                  }}
                />
              )}
              {tab === 'buy' && (
                <SoonPanel
                  icon="bag"
                  title="Shops open with the economy"
                  phase="Phase 3"
                  text="Clothes, furniture and food are bought here once jobs and money work."
                />
              )}
              {tab === 'phone' && (
                <SoonPanel
                  icon="phone"
                  title="Your phone arrives soon"
                  phase="Phase 4"
                  text="Messages, bank, maps, camera and an app store, on a handset that feels real."
                />
              )}
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}
