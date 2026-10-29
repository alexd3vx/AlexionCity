import { GAME_NAME } from '@alexioncity/shared';

/** "Alexion" in navy, "City" in sunrise orange, set in Baloo 2. */
export function Wordmark({ className = '' }: { className?: string }) {
  const [first, second] = [GAME_NAME.slice(0, 7), GAME_NAME.slice(7)];
  return (
    <span
      className={`font-display font-extrabold leading-none ${className}`}
      aria-label={GAME_NAME}
    >
      <span className="text-[#1b2340]">{first}</span>
      <span className="text-[#ff7a1a]">{second}</span>
    </span>
  );
}
