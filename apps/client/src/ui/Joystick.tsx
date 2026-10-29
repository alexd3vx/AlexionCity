import { useRef, useState } from 'react';

const RADIUS = 52;

/** On-screen stick for phones. `onChange` gets x (right) and y (forward), each from -1 to 1. */
export function Joystick({ onChange }: { onChange: (x: number, y: number) => void }) {
  const base = useRef<HTMLDivElement>(null);
  const pointer = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  const move = (e: React.PointerEvent) => {
    const rect = base.current!.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    const m = Math.min(1, Math.hypot(dx, dy) / RADIUS);
    const a = Math.atan2(dy, dx);
    setKnob({ x: Math.cos(a) * m * RADIUS, y: Math.sin(a) * m * RADIUS });
    onChange(Math.cos(a) * m, -Math.sin(a) * m);
  };
  const end = (e: React.PointerEvent) => {
    if (e.pointerId !== pointer.current) return;
    pointer.current = null;
    setKnob({ x: 0, y: 0 });
    onChange(0, 0);
  };

  return (
    <div
      ref={base}
      role="application"
      aria-label="Move"
      className="relative h-28 w-28 touch-none rounded-full border-2 border-white/80 bg-white/25"
      onPointerDown={(e) => {
        pointer.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        move(e);
      }}
      onPointerMove={(e) => e.pointerId === pointer.current && move(e)}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div
        className="absolute left-1/2 top-1/2 h-12 w-12 rounded-full bg-white shadow-lg"
        style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }}
      />
    </div>
  );
}
