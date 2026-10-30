import { type PoiIcon } from '@alexioncity/shared';
const PATHS = {
  home: 'M4 11l8-7 8 7v9H4z M10 20v-6h4v6',
  pin: 'M12 21s7-6 7-11a7 7 0 0 0-14 0c0 5 7 11 7 11z M12 12.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4z',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M19 5l-2 2 M7 17l-2 2',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z',
  target:
    'M12 19a7 7 0 1 0 0-14 7 7 0 0 0 0 14z M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M12 2v3 M12 19v3 M2 12h3 M19 12h3',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M12 3v3 M12 18v3 M3 12h3 M18 12h3 M5.6 5.6l2.1 2.1 M16.3 16.3l2.1 2.1 M18.4 5.6l-2.1 2.1 M7.7 16.3l-2.1 2.1',
  plus: 'M12 5v14 M5 12h14',
  close: 'M6 6l12 12 M18 6L6 18',
  person: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7',
  bag: 'M5 8h14l-1 12H6z M9 8V6a3 3 0 0 1 6 0v2',
  map: 'M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z M9 4v14 M15 6v14',
  phone: 'M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z M11 18h2',
  food: 'M3 5c6-3 12-3 18 0L12 21z M10 9h.01 M14 11h.01 M11 14h.01',
  bar: 'M5 4h14l-7 8z M12 12v8 M8 20h8',
  hospital: 'M5 4h14v16H5z M12 8v8 M8 12h8',
  hotel: 'M3 18V7 M3 14h18v4 M21 14v-3a3 3 0 0 0-3-3h-7v6',
  tower: 'M12 3l5 18H7z M9.5 12h5',
  atm: 'M4 5h16v14H4z M8 10h8 M8 14h4',
  bus: 'M5 4h14a1 1 0 0 1 1 1v12H4V5a1 1 0 0 1 1-1z M4 11h16 M7 17v3 M17 17v3',
  park: 'M12 14a5 5 0 1 0 0-10 5 5 0 0 0 0 10z M12 14v7 M9 21h6',
  arrow: 'M12 19V5 M6 11l6-6 6 6',
  shuffle: 'M4 7h4l8 10h4 M4 17h4l3-4 M13 11l3-4h4 M18 5l2 2-2 2 M18 15l2 2-2 2',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  chat: 'M4 5h16v11H9l-5 4z M8 9.5h8 M8 12.5h5',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  className = 'h-5 w-5',
}: {
  name: IconName | PoiIcon;
  className?: string;
}) {
  const key = (name === 'home' ? 'home' : name) as IconName;
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[key]} />
    </svg>
  );
}
