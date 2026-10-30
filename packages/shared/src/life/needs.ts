export const NEED_KEYS = ['hunger', 'energy', 'mood', 'hygiene'] as const;
export type NeedKey = (typeof NEED_KEYS)[number];
/** Each need is 0 (empty) to 100 (full). */
export type Needs = Record<NeedKey, number>;

export const NEED_MAX = 100;

export const START_NEEDS: Needs = { hunger: 80, energy: 85, mood: 70, hygiene: 85 };

/**
 * Points lost per minute spent in the city. A full bar lasts about 2.5 hours (hunger), 3 hours (energy)
 * and 4.5 hours (hygiene): slow enough that needs are a rhythm, not a chore. Needs stand still while a
 * player is away.
 */
export const DECAY_PER_MINUTE = { hunger: 0.6, energy: 0.5, hygiene: 0.35 } as const;

/** How long mood takes to settle toward what the other needs and the home deserve. */
const MOOD_SETTLE_SECONDS = 180;
/** Most mood a comfortable home can add. */
export const MAX_COMFORT_MOOD = 15;

export const clampNeed = (value: number): number => Math.max(0, Math.min(NEED_MAX, value));

/** Add a change (negative or positive) to needs, keeping each between 0 and 100. */
export function applyEffect(needs: Needs, effect: Partial<Needs>): Needs {
  const next = { ...needs };
  for (const key of NEED_KEYS) next[key] = clampNeed(needs[key] + (effect[key] ?? 0));
  return next;
}

/** Furniture comfort points turn into a small steady mood bonus. */
export const comfortMood = (comfort: number): number =>
  Math.min(MAX_COMFORT_MOOD, Math.max(0, comfort) * 0.5);

/** Where mood is heading: the weakest basic need counts most, and a comfortable home helps. */
export function moodTarget(needs: Needs, comfort: number): number {
  const basics = [needs.hunger, needs.energy, needs.hygiene];
  const low = Math.min(...basics);
  const avg = basics.reduce((a, b) => a + b, 0) / basics.length;
  return clampNeed(0.45 * low + 0.55 * avg * 0.9 + comfortMood(comfort));
}

/** Needs after `seconds` in the city. `comfort` is the home's furniture comfort. */
export function decay(needs: Needs, seconds: number, comfort = 0): Needs {
  const minutes = seconds / 60;
  const next: Needs = {
    hunger: clampNeed(needs.hunger - DECAY_PER_MINUTE.hunger * minutes),
    energy: clampNeed(needs.energy - DECAY_PER_MINUTE.energy * minutes),
    hygiene: clampNeed(needs.hygiene - DECAY_PER_MINUTE.hygiene * minutes),
    mood: needs.mood,
  };
  const target = moodTarget(next, comfort);
  next.mood = clampNeed(
    needs.mood + (target - needs.mood) * (1 - Math.exp(-seconds / MOOD_SETTLE_SECONDS)),
  );
  return next;
}

export type WorkCheck = { ok: true } | { ok: false; reason: string };

/** Too tired or hungry to start a shift. */
export function canWork(needs: Needs): WorkCheck {
  if (needs.energy < 25)
    return { ok: false, reason: 'You are too tired to work. Get some sleep first.' };
  if (needs.hunger < 15)
    return { ok: false, reason: 'You are too hungry to work. Eat something first.' };
  return { ok: true };
}

/** Happy workers earn a little more, unhappy ones a little less: 0.9 at mood 0 up to 1.1 at mood 100. */
export const payMultiplier = (mood: number): number => 0.9 + 0.2 * (clampNeed(mood) / NEED_MAX);

export function sameNeeds(a: Needs, b: Needs): boolean {
  return NEED_KEYS.every((k) => Math.round(a[k]) === Math.round(b[k]));
}
