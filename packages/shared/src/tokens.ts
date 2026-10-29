/**
 * Brand tokens (brand direction A, "Skyline Sun"). The UI reads these, so a brand change is a
 * one-file edit. See docs/BRAND.md for how each colour is used.
 */
export const tokens = {
  color: {
    /** Primary brand colour, buttons, the logo mark. */
    sunrise: '#ff7a1a',
    /** Text and dark surfaces. */
    navy: '#1b2340',
    /** Sky and calm highlights. */
    sky: '#bfe3ff',
    /** Warm light surfaces. */
    sand: '#fff3e0',
    /** Good, healthy, success. */
    leaf: '#2fbf71',
    surface: '#ffffff',
    /** Translucent dark panel over the 3D world. */
    panelDark: 'rgba(27, 35, 64, 0.72)',
    warn: '#f2b84b',
    bad: '#d6343b',
  },
  /** Need meters: each need keeps its colour so players learn them. */
  need: {
    hunger: '#2fbf71',
    energy: '#f2b84b',
    mood: '#4fb8ff',
    hygiene: '#ff6b81',
  },
  radius: { pill: 999, card: 18, button: 12 },
  font: {
    /** Wordmark and headings; bundled with the app. */
    display: "'Baloo 2', system-ui, sans-serif",
    ui: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  },
} as const;
