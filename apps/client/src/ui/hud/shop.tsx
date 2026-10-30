import { useState } from 'react';
import {
  FURNITURE,
  FURNITURE_CATEGORIES,
  placedCounts,
  type FurnitureCategory,
  type FurnitureDef,
} from '@alexioncity/shared';
import type { Multiplayer } from '../../net/useMultiplayer';
import { alex, chip, primary } from './life';

const USE_TEXT = { sleep: 'Sleep here', wash: 'Wash here', relax: 'Relax here' } as const;

function Item({ def, mp }: { def: FurnitureDef; mp: Multiplayer }) {
  const life = mp.room.life!;
  const owned = life.owned[def.id] ?? 0;
  const placed = placedCounts(life.home.layout).get(def.id) ?? 0;
  const storage = owned - placed;
  return (
    <li className="flex items-center justify-between gap-3 rounded-2xl bg-black/5 px-4 py-3">
      <div className="min-w-0">
        <p className="font-extrabold">{def.name}</p>
        <p className="text-[13px] text-[#1b2340]/60">
          {def.w}×{def.d} m · comfort {def.comfort}
          {def.use && ` · ${USE_TEXT[def.use]}`}
        </p>
        {owned > 0 && (
          <p className="text-[12px] font-bold text-emerald-700">
            You own {owned}
            {storage > 0 ? ` · ${storage} in storage` : ''}
          </p>
        )}
      </div>
      <button
        className={primary}
        disabled={life.balance < def.price}
        aria-label={`Buy ${def.name} for ${alex(def.price)}`}
        onClick={() => mp.act.buy(def.id)}
      >
        {alex(def.price)}
      </button>
    </li>
  );
}

/** The home goods catalogue. What you buy goes into storage; arrange it from inside your home. */
export function ShopSheet({ mp }: { mp: Multiplayer }) {
  const [category, setCategory] = useState<FurnitureCategory>('bedroom');
  const life = mp.room.life;
  if (!life) return <p className="text-sm text-[#1b2340]/65">Connect to the city to shop.</p>;
  const items = FURNITURE.filter((f) => f.category === category);
  return (
    <div className="space-y-4">
      <p className="text-sm text-[#1b2340]/65">
        You have <b className="text-[#1b2340]">{alex(life.balance)}</b>. Everything is delivered to
        your storage; go home and tap <b>Arrange</b> to place it.
      </p>
      <div
        className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
        aria-label="Categories"
      >
        {FURNITURE_CATEGORIES.map((c) => (
          <button
            key={c.id}
            role="tab"
            aria-selected={category === c.id}
            className={`${chip(category === c.id)} shrink-0`}
            onClick={() => setCategory(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>
      <ul className="space-y-2">
        {items.map((d) => (
          <Item key={d.id} def={d} mp={mp} />
        ))}
      </ul>
    </div>
  );
}
