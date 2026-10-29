/**
 * Placeholder design tokens. The brand pack and HUD style are not final, so every
 * value here is a stand-in that the UI reads, so changing the brand is a one-file edit.
 */
export const tokens = {
  color: {
    brand: '#ff7a1a',
    ink: '#1b1d22',
    surface: '#ffffff',
    surfaceDim: 'rgba(15, 18, 24, 0.55)',
    good: '#1f9d57',
    warn: '#f2b84b',
    bad: '#d6343b',
  },
  radius: { pill: 999, card: 18, button: 12 },
  font: { ui: "'Plus Jakarta Sans', system-ui, sans-serif" },
} as const;
