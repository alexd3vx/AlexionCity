import { useEffect, useRef } from 'react';
import { pickQuality, readDeviceHints } from '../quality';
import { Joystick } from '../ui/Joystick';
import { createWorld, type World } from './world';

declare global {
  interface Window {
    __world?: World;
  }
}

/** Mounts the 3D world, wires keyboard and touch input, and drag-to-orbit on the canvas. */
export function GameView({
  onWorld,
  hideControls = false,
}: {
  onWorld: (world: World | undefined) => void;
  /** Indoors there is nothing to steer, so the stick goes away. */
  hideControls?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const world = useRef<World | null>(null);
  const keys = useRef({ x: 0, y: 0, run: false, stickX: 0, stickY: 0 });

  const push = () => {
    const k = keys.current;
    world.current?.setInput({ x: k.x + k.stickX, y: k.y + k.stickY, run: k.run });
  };

  useEffect(() => {
    const el = canvas.current!;
    const params = new URLSearchParams(location.search);
    const time = params.get('t')?.match(/^(\d{1,2}):(\d{2})$/);
    // developer shortcut: ?at=poi:Pizza Corner or ?at=x,z starts the player there
    const at = import.meta.env.DEV ? params.get('at') : null;
    const point = at?.match(/^(-?[\d.]+),(-?[\d.]+)$/);
    const start = at?.startsWith('poi:')
      ? { place: at.slice(4) }
      : point
        ? { x: Number(point[1]), z: Number(point[2]) }
        : undefined;
    const w = createWorld(el, {
      tier: pickQuality(readDeviceHints()),
      overlay: overlay.current!,
      ...(start ? { start } : {}),
      ...(time ? { fixedMinutes: Number(time[1]) * 60 + Number(time[2]) } : {}),
    });
    world.current = w;
    if (import.meta.env.DEV) window.__world = w;
    onWorld(w);

    const fit = () => {
      const r = box.current!.getBoundingClientRect();
      w.resize(r.width, r.height);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box.current!);

    const key = (down: boolean) => (e: KeyboardEvent) => {
      const k = keys.current;
      const v = down ? 1 : 0;
      switch (e.key.toLowerCase()) {
        case 'w':
        case 'arrowup':
          k.y = v;
          break;
        case 's':
        case 'arrowdown':
          k.y = -v;
          break;
        case 'a':
        case 'arrowleft':
          k.x = -v;
          break;
        case 'd':
        case 'arrowright':
          k.x = v;
          break;
        case 'shift':
          k.run = down;
          break;
        default:
          return;
      }
      push();
    };
    const onDown = key(true);
    const onUp = key(false);
    addEventListener('keydown', onDown);
    addEventListener('keyup', onUp);

    let dragId: number | null = null;
    let lastX = 0;
    const pd = (e: PointerEvent) => ((dragId = e.pointerId), (lastX = e.clientX));
    const pm = (e: PointerEvent) => {
      if (e.pointerId !== dragId) return;
      w.orbit(-(e.clientX - lastX) * 0.008);
      lastX = e.clientX;
    };
    const pu = () => (dragId = null);
    el.addEventListener('pointerdown', pd);
    el.addEventListener('pointermove', pm);
    el.addEventListener('pointerup', pu);

    return () => {
      removeEventListener('keydown', onDown);
      removeEventListener('keyup', onUp);
      el.removeEventListener('pointerdown', pd);
      el.removeEventListener('pointermove', pm);
      el.removeEventListener('pointerup', pu);
      ro.disconnect();
      onWorld(undefined);
      w.dispose();
      world.current = null;
    };
  }, [onWorld]);

  return (
    <div ref={box} className="absolute inset-0 touch-none select-none">
      <canvas ref={canvas} className="block h-full w-full" />
      {/* name tags and chat bubbles; only the tags themselves take taps */}
      <div ref={overlay} className="pointer-events-none absolute inset-0 z-[4] overflow-hidden" />
      {!hideControls && (
        <div className="absolute bottom-[calc(max(0.6rem,env(safe-area-inset-bottom))+7.6rem)] left-[max(0.9rem,env(safe-area-inset-left))] z-[5]">
          <Joystick
            onChange={(x, y) => {
              keys.current.stickX = x;
              keys.current.stickY = y;
              push();
            }}
          />
        </div>
      )}
    </div>
  );
}
