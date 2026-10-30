import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { AvatarPart } from '@alexioncity/shared';
import {
  frameOf,
  HAIR_COLORS,
  loadSpec,
  normalizeSpec,
  outfitsFor,
  randomSpec,
  saveSpec,
  SKIN_TONES,
  SLOTS,
  type AvatarSpec,
  type Swatch,
} from '../../avatar/catalog';
import type { Content } from '../../game/content';
import type { PoiIcon } from '../../game/district/layout';
import type { World, WorldState } from '../../game/world';
import { config } from '../../config';
import { Icon, type IconName } from './icons';
import { drawMap } from './minimap';

const chip = (on: boolean) =>
  `shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-extrabold active:scale-95 ${on ? 'bg-[#1b2340] text-white' : 'bg-[#1b2340]/8 text-[#1b2340]'}`;

const SLOT_LABEL: Record<AvatarPart, string> = {
  head: 'Head and hair',
  body: 'Top',
  legs: 'Bottoms',
  feet: 'Shoes',
};

function Swatches({
  label,
  list,
  value,
  onPick,
}: {
  label: string;
  list: readonly Swatch[];
  value: string;
  onPick: (id: string) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-extrabold uppercase tracking-wider text-[#1b2340]/55">
        {label}
      </p>
      <div className="flex flex-wrap gap-2.5" role="radiogroup" aria-label={label}>
        {list.map((s) => (
          <button
            key={s.id}
            role="radio"
            aria-checked={s.id === value}
            aria-label={s.name}
            title={s.name}
            onClick={() => onPick(s.id)}
            className={`h-9 w-9 rounded-full border-2 transition-transform active:scale-90 ${s.id === value ? 'scale-110 border-[#ff7a1a] ring-2 ring-[#ff7a1a]/30' : 'border-white shadow-[0_0_0_1px_rgba(27,35,64,0.2)]'}`}
            style={{ background: s.hex }}
          />
        ))}
      </div>
    </div>
  );
}

function AvatarEditor({
  world,
  content,
}: {
  world: World;
  content: Content & { catalog: NonNullable<Content['catalog']> };
}) {
  const { catalog, store } = content;
  const [spec, setSpec] = useState<AvatarSpec>(() => loadSpec(catalog));
  const busy = useRef(false);
  const pending = useRef<AvatarSpec | undefined>(undefined);

  // rebuild the avatar one at a time; if several changes arrive, only the latest is applied
  const apply = useCallback(
    async (next: AvatarSpec) => {
      if (busy.current) {
        pending.current = next;
        return;
      }
      busy.current = true;
      try {
        await world.setAvatarSpec(store, catalog, next);
      } finally {
        busy.current = false;
        const queued = pending.current;
        pending.current = undefined;
        if (queued) void apply(queued);
      }
    },
    [world, store, catalog],
  );

  const change = (next: AvatarSpec) => {
    const clean = normalizeSpec(catalog, next);
    setSpec(clean);
    saveSpec(clean);
    void apply(clean);
  };

  const frame = frameOf(catalog, spec.frame)!;
  return (
    <section aria-label="Your look" className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-extrabold uppercase tracking-wider text-[#1b2340]/55">
          Your look
        </h3>
        <button
          className="flex items-center gap-1.5 rounded-full bg-[#ff7a1a] px-3.5 py-1.5 text-[13px] font-extrabold text-white active:scale-95"
          onClick={() => change(randomSpec(catalog, Math.random))}
        >
          <Icon name="shuffle" className="h-4 w-4" />
          Shuffle
        </button>
      </div>

      <div className="flex gap-2" role="radiogroup" aria-label="Build">
        {catalog.frames.map((f, i) => (
          <button
            key={f.id}
            role="radio"
            aria-checked={f.id === spec.frame}
            className={chip(f.id === spec.frame)}
            onClick={() => change({ ...spec, frame: f.id })}
          >
            Build {i + 1}
          </button>
        ))}
      </div>

      {SLOTS.map((slot) => (
        <div key={slot}>
          <p className="mb-1.5 text-xs font-extrabold uppercase tracking-wider text-[#1b2340]/55">
            {SLOT_LABEL[slot]}
          </p>
          <div
            className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            role="radiogroup"
            aria-label={SLOT_LABEL[slot]}
          >
            {outfitsFor(frame, slot).map((o) => (
              <button
                key={o.id}
                role="radio"
                aria-checked={spec[slot] === o.id}
                className={chip(spec[slot] === o.id)}
                onClick={() => change({ ...spec, [slot]: o.id })}
              >
                {o.name}
              </button>
            ))}
          </div>
        </div>
      ))}

      <Swatches
        label="Skin tone"
        list={SKIN_TONES}
        value={spec.skin}
        onPick={(skin) => change({ ...spec, skin })}
      />
      <Swatches
        label="Hair colour"
        list={HAIR_COLORS}
        value={spec.hair}
        onPick={(hair) => change({ ...spec, hair })}
      />
    </section>
  );
}

const QUALITY_KEY = 'alexion.quality';

function readQuality(): 'auto' | 'low' | 'high' {
  try {
    const v = localStorage.getItem(QUALITY_KEY);
    return v === 'low' || v === 'high' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

export function MePanel({
  world,
  content,
  guestLabel,
  onOpenDownloads,
  account,
}: {
  world: World;
  content: Content | undefined;
  guestLabel: string;
  onOpenDownloads: () => void;
  account?: ReactNode;
}) {
  const [quality, setQuality] = useState(readQuality);
  const [changed, setChanged] = useState(false);
  const setGraphics = (q: typeof quality) => {
    try {
      if (q === 'auto') localStorage.removeItem(QUALITY_KEY);
      else localStorage.setItem(QUALITY_KEY, q);
    } catch {
      // storage blocked: the choice just is not remembered
    }
    setQuality(q);
    setChanged(true);
  };

  return (
    <div className="space-y-6">
      {content?.catalog ? (
        <AvatarEditor world={world} content={{ ...content, catalog: content.catalog }} />
      ) : (
        <section className="rounded-2xl bg-[#fff3e0] p-4">
          <h3 className="font-extrabold">Make your own look</h3>
          <p className="mt-1 text-sm text-[#1b2340]/75">
            Download the avatar parts to mix outfits, skin tones and hair colours.
          </p>
          <button
            className="mt-3 rounded-full bg-[#ff7a1a] px-4 py-2 text-sm font-extrabold text-white active:scale-95"
            onClick={onOpenDownloads}
          >
            Open Downloads
          </button>
        </section>
      )}

      {account}

      <section aria-label="Settings" className="space-y-4">
        <h3 className="text-sm font-extrabold uppercase tracking-wider text-[#1b2340]/55">
          Settings
        </h3>
        <div>
          <p className="mb-1.5 text-sm font-bold">Graphics</p>
          <div className="flex gap-2" role="radiogroup" aria-label="Graphics">
            {(['auto', 'low', 'high'] as const).map((q) => (
              <button
                key={q}
                role="radio"
                aria-checked={quality === q}
                className={chip(quality === q)}
                onClick={() => setGraphics(q)}
              >
                {q === 'auto' ? 'Auto' : q === 'low' ? 'Low (saves battery)' : 'High'}
              </button>
            ))}
          </div>
          {changed && (
            <button
              className="mt-2 text-sm font-extrabold text-[#ff7a1a] underline"
              onClick={() => location.reload()}
            >
              Restart to apply
            </button>
          )}
        </div>
        <div className="flex items-center justify-between rounded-2xl bg-black/5 px-4 py-3 text-sm">
          <span data-testid="guest-status" className="font-bold">
            {guestLabel}
          </span>
          <button className="font-extrabold text-[#ff7a1a]" onClick={onOpenDownloads}>
            Downloads
          </button>
        </div>
        <p className="text-xs text-[#1b2340]/50">AlexionCity v{config.appVersion}</p>
      </section>
    </div>
  );
}

export function MapPanel({
  world,
  state,
  onPick,
}: {
  world: World;
  state: WorldState;
  onPick: (poiId: string) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current)
      drawMap(ref.current, world.layout, state, { scale: 2.1, rotate: false, labels: true });
  }, [world, state]);

  const places = [...world.layout.pois]
    .filter((p) => p.name !== 'Bus stop' && p.name !== 'ATM')
    .map((poi) => ({ poi, distance: Math.hypot(poi.x - state.x, poi.z - state.z) }))
    .sort((a, b) => a.distance - b.distance);

  return (
    <div className="space-y-4">
      <canvas
        ref={ref}
        width={760}
        height={420}
        aria-label="District map"
        className="h-auto w-full rounded-2xl border border-black/10"
      />
      <ul className="space-y-1.5" aria-label="Places">
        {places.map(({ poi, distance }) => (
          <li key={poi.id}>
            <button
              className="flex w-full items-center gap-3 rounded-2xl bg-black/5 px-3 py-2.5 text-left active:bg-black/10"
              onClick={() => onPick(poi.id)}
            >
              <span className="grid h-9 w-9 place-items-center rounded-full bg-[#ff7a1a] text-white">
                <Icon name={poi.icon as PoiIcon} />
              </span>
              <span className="flex-1 font-extrabold">{poi.name}</span>
              <span className="text-sm font-bold text-[#1b2340]/55">{Math.round(distance)} m</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SoonPanel({
  icon,
  title,
  phase,
  text,
}: {
  icon: IconName;
  title: string;
  phase: string;
  text: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <span className="grid h-16 w-16 place-items-center rounded-full bg-[#fff3e0] text-[#ff7a1a]">
        <Icon name={icon} className="h-8 w-8" />
      </span>
      <h3 className="font-display text-xl font-extrabold">{title}</h3>
      <p className="max-w-xs text-sm text-[#1b2340]/70">{text}</p>
      <span className="rounded-full bg-[#1b2340]/8 px-3 py-1 text-xs font-extrabold uppercase tracking-wider">
        {phase}
      </span>
    </div>
  );
}
