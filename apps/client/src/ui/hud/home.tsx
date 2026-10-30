import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ACTIVITIES,
  UNITS,
  canPlace,
  footprint,
  furnitureById,
  placedCounts,
  useRate,
  type ActivityKind,
  type LifeSnapshot,
  type Placed,
  type Rotation,
} from '@alexioncity/shared';
import type { Multiplayer } from '../../net/useMultiplayer';
import type { World } from '../../game/world';
import { Icon, type IconName } from './icons';
import { glass, primary } from './life';

interface Draft {
  item: string;
  x: number;
  z: number;
  rot: Rotation;
  /** Set when an existing piece is being moved rather than a new one placed. */
  movingId?: string;
}

const turned = (rot: Rotation): Rotation => ((rot + 1) % 4) as Rotation;

/** Keep a piece's top-left cell so that it stays fully inside the room. */
function clampInside(
  unit: (typeof UNITS)[keyof typeof UNITS],
  item: string,
  x: number,
  z: number,
  rot: Rotation,
) {
  const def = furnitureById(item)!;
  const fp = footprint(def, rot);
  return {
    x: Math.max(0, Math.min(unit.w - fp.w, x)),
    z: Math.max(0, Math.min(unit.d - fp.d, z)),
  };
}

/** The furniture waiting in storage: owned, but not standing in the home. */
export function storedItems(life: LifeSnapshot): { id: string; qty: number }[] {
  const placed = placedCounts(life.home.layout);
  return Object.entries(life.owned)
    .map(([id, owned]) => ({ id, qty: owned - (placed.get(id) ?? 0) }))
    .filter((s) => s.qty > 0 && furnitureById(s.id));
}

const ACTION_ICON: Record<ActivityKind, IconName> = {
  sleep: 'hotel',
  wash: 'drop',
  relax: 'sofa',
  stroll: 'park',
};
const NEEDS_TEXT = {
  sleep: 'Needs a bed',
  wash: 'Needs a shower or bath',
  relax: 'Needs a sofa or TV',
} as const;

/**
 * Everything on screen while the player is inside their home: leave, turn the view, sleep, wash and
 * relax, and arrange furniture on the grid. The 3D room itself is drawn by the world.
 */
export function HomeHud({
  world,
  mp,
  show,
  columnTop,
}: {
  world: World;
  mp: Multiplayer;
  show: (message: string) => void;
  /** Tailwind `top-` class that clears whatever bars are showing under the top pill. */
  columnTop: string;
}) {
  const life = mp.room.life!;
  const unit = UNITS[life.home.unit!];
  const [arranging, setArranging] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [selected, setSelected] = useState<string | undefined>();
  const layout = life.home.layout;

  // show the home in the world, and bring the city back when the player leaves
  useEffect(() => {
    world.enterHome(unit.id, layout);
  }, [world, unit.id, layout]);
  useEffect(() => () => world.leaveHome(), [world]);

  const activity = life.activity?.kind;
  useEffect(() => {
    world.homeActivity(activity);
    return () => world.homeActivity(undefined);
  }, [world, activity]);

  useEffect(() => {
    world.homeEditing(arranging);
    if (!arranging) {
      setDraft(null);
      setSelected(undefined);
    }
  }, [world, arranging]);

  const check = useMemo(
    () =>
      draft
        ? canPlace(
            unit,
            layout,
            { item: draft.item, x: draft.x, z: draft.z, rot: draft.rot },
            draft.movingId,
          )
        : undefined,
    [draft, unit, layout],
  );
  useEffect(() => {
    world.homeGhost(draft ? { ...draft, valid: Boolean(check?.ok) } : undefined);
  }, [world, draft, check]);
  useEffect(() => {
    world.homeSelect(selected);
  }, [world, selected, layout]);
  // a piece that was stored or moved elsewhere is no longer selected
  useEffect(() => {
    if (selected && !layout.some((p) => p.id === selected)) setSelected(undefined);
  }, [layout, selected]);

  const draftRef = useRef(draft);
  draftRef.current = draft;

  // taps on the room: choose a spot for the piece being placed, or pick a piece
  useEffect(() => {
    if (!arranging) return;
    const canvas = world.canvas;
    let down: { x: number; y: number; t: number } | undefined;
    const onDown = (e: PointerEvent) =>
      (down = { x: e.clientX, y: e.clientY, t: performance.now() });
    const onUp = (e: PointerEvent) => {
      if (
        !down ||
        Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8 ||
        performance.now() - down.t > 600
      )
        return;
      const rect = canvas.getBoundingClientRect();
      const hit = world.homePick(e.clientX - rect.left, e.clientY - rect.top);
      const d = draftRef.current;
      if (d) {
        if (!hit.cell) return;
        const fp = footprint(furnitureById(d.item)!, d.rot);
        const at = clampInside(
          unit,
          d.item,
          hit.cell.x - Math.floor((fp.w - 1) / 2),
          hit.cell.z - Math.floor((fp.d - 1) / 2),
          d.rot,
        );
        setDraft({ ...d, ...at });
      } else setSelected(hit.pieceId);
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerup', onUp);
    return () => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
    };
  }, [world, arranging, unit]);

  const begin = useCallback(
    (item: string) => {
      const def = furnitureById(item)!;
      // start in the middle of the room, away from the doorway
      const x = Math.floor((unit.w - def.w) / 2);
      const z = Math.floor((unit.d - def.d) / 2) + 1;
      setSelected(undefined);
      setDraft({ item, ...clampInside(unit, item, x, z, 0), rot: 0 });
    },
    [unit],
  );

  const rotateDraft = () =>
    setDraft((d) => {
      if (!d) return d;
      const rot = turned(d.rot);
      return { ...d, rot, ...clampInside(unit, d.item, d.x, d.z, rot) };
    });

  const confirm = () => {
    if (!draft || !check?.ok) return;
    if (draft.movingId) mp.act.moveItem(draft.movingId, draft.x, draft.z, draft.rot);
    else mp.act.place(draft.item, draft.x, draft.z, draft.rot);
    setDraft(null);
  };

  const piece: Placed | undefined = layout.find((p) => p.id === selected);
  const rotatePiece = () => {
    if (!piece) return;
    const rot = turned(piece.rot);
    const at = clampInside(unit, piece.item, piece.x, piece.z, rot);
    const ok = canPlace(unit, layout, { item: piece.item, ...at, rot }, piece.id);
    if (!ok.ok) return show(ok.reason);
    mp.act.moveItem(piece.id, at.x, at.z, rot);
  };

  const stored = storedItems(life);
  const busy = Boolean(life.activity);
  const sideBtn = 'grid h-10 w-10 place-items-center rounded-full active:bg-black/10';

  return (
    <>
      <div className={`absolute right-3 flex flex-col items-end gap-2 pt-1 ${columnTop}`}>
        <div className={`${glass} flex flex-col p-1`}>
          <button
            aria-label="Turn the view"
            className={sideBtn}
            onClick={() => world.turnHomeView()}
          >
            <Icon name="turn" />
          </button>
          <button aria-label="Leave home" className={sideBtn} onClick={() => mp.act.home('exit')}>
            <Icon name="door" />
          </button>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-[calc(max(0.6rem,env(safe-area-inset-bottom))+4.6rem)] flex flex-col items-center gap-2 px-3">
        {arranging ? (
          <div
            className="pointer-events-auto w-full max-w-md space-y-2 rounded-3xl bg-white/95 p-3 text-[#1b2340] shadow-[0_8px_24px_rgba(27,35,64,0.28)] backdrop-blur"
            aria-label="Arrange furniture"
          >
            {draft ? (
              <>
                <p className="text-center text-sm font-bold">
                  {furnitureById(draft.item)!.name}
                  <span
                    className={`block text-[12px] font-semibold ${check?.ok ? 'text-emerald-700' : 'text-rose-700'}`}
                  >
                    {check?.ok ? 'Tap the floor to move it, then place it.' : check?.reason}
                  </span>
                </p>
                <div className="flex gap-2">
                  <button
                    className="flex-1 rounded-full bg-black/5 py-2.5 text-sm font-extrabold active:scale-95"
                    onClick={() => setDraft(null)}
                  >
                    Cancel
                  </button>
                  <button
                    aria-label="Rotate"
                    className="grid w-12 place-items-center rounded-full bg-black/5 active:scale-95"
                    onClick={rotateDraft}
                  >
                    <Icon name="rotate" />
                  </button>
                  <button className={`${primary} flex-1`} disabled={!check?.ok} onClick={confirm}>
                    Place
                  </button>
                </div>
              </>
            ) : piece ? (
              <>
                <p className="text-center text-sm font-bold">{furnitureById(piece.item)!.name}</p>
                <div className="flex gap-2">
                  <button
                    className="flex-1 rounded-full bg-black/5 py-2.5 text-sm font-extrabold active:scale-95"
                    onClick={() => (mp.act.storeItem(piece.id), setSelected(undefined))}
                  >
                    Store
                  </button>
                  <button
                    aria-label="Rotate piece"
                    className="grid w-12 place-items-center rounded-full bg-black/5 active:scale-95"
                    onClick={rotatePiece}
                  >
                    <Icon name="rotate" />
                  </button>
                  <button
                    className={`${primary} flex-1`}
                    onClick={() => {
                      setDraft({
                        item: piece.item,
                        x: piece.x,
                        z: piece.z,
                        rot: piece.rot,
                        movingId: piece.id,
                      });
                      setSelected(undefined);
                    }}
                  >
                    Move
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-center text-[13px] font-semibold text-[#1b2340]/65">
                  {stored.length > 0
                    ? 'Pick something from storage, or tap a piece in the room.'
                    : 'Storage is empty. Buy furniture in the Buy tab, or tap a piece in the room.'}
                </p>
                {stored.length > 0 && (
                  <ul
                    className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                    aria-label="Storage"
                  >
                    {stored.map((s) => (
                      <li key={s.id} className="shrink-0">
                        <button
                          className="flex items-center gap-1.5 rounded-full bg-[#fff3e0] px-3 py-2 text-[13px] font-extrabold active:scale-95"
                          onClick={() => begin(s.id)}
                        >
                          <Icon name="box" className="h-4 w-4" />
                          {furnitureById(s.id)!.name}
                          {s.qty > 1 && <span className="text-[#d9600a]">×{s.qty}</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <button className={`${primary} w-full`} onClick={() => setArranging(false)}>
                  Done
                </button>
              </>
            )}
          </div>
        ) : (
          <div
            className="pointer-events-auto flex w-full max-w-md flex-wrap justify-center gap-2"
            aria-label="At home"
          >
            {(['sleep', 'wash', 'relax'] as const).map((kind) => {
              const def = ACTIVITIES[kind];
              const can = 'home' in def.place && useRate(layout, def.place.home) !== undefined;
              return (
                <button
                  key={kind}
                  disabled={busy}
                  onClick={() => (can ? mp.act.start(kind) : show(NEEDS_TEXT[kind]))}
                  className={`flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-extrabold shadow-[0_4px_12px_rgba(27,35,64,0.2)] active:scale-95 disabled:opacity-50 ${can ? 'bg-white text-[#1b2340]' : 'bg-white/70 text-[#1b2340]/55'}`}
                >
                  <Icon name={ACTION_ICON[kind]} className="h-4 w-4" />
                  {def.label}
                </button>
              );
            })}
            <button
              className="flex items-center gap-1.5 rounded-full bg-[#ff7a1a] px-4 py-2.5 text-sm font-extrabold text-white shadow-[0_4px_12px_rgba(255,122,26,0.4)] active:scale-95"
              onClick={() => setArranging(true)}
            >
              <Icon name="grid" className="h-4 w-4" />
              Arrange
            </button>
          </div>
        )}
      </div>
    </>
  );
}
