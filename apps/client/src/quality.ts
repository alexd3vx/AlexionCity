import type { QualityTier } from '@alexioncity/shared';

export interface DeviceHints {
  /** navigator.deviceMemory, in GB (Chromium only, rounded down to a power of two, capped at 8). */
  deviceMemory?: number | undefined;
  hardwareConcurrency?: number | undefined;
  /** Data saver turned on in the browser or OS. */
  saveData?: boolean | undefined;
  /** A tier the player chose in settings; always wins. */
  override?: QualityTier | undefined;
}

/**
 * Pick Low or High graphics. The floor device is a budget Android with about 3 GB of RAM,
 * so anything at or below that, or with few cores, or with data saver on, starts on Low.
 * Browsers that hide these hints start on High; the player can switch in settings.
 */
export function pickQuality(hints: DeviceHints): QualityTier {
  if (hints.override) return hints.override;
  if (hints.saveData) return 'low';
  if (hints.deviceMemory !== undefined && hints.deviceMemory <= 4) return 'low';
  if (hints.hardwareConcurrency !== undefined && hints.hardwareConcurrency <= 4) return 'low';
  return 'high';
}

export function readDeviceHints(): DeviceHints {
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean };
  };
  let override: QualityTier | undefined;
  try {
    const stored = localStorage.getItem('alexion.quality');
    if (stored === 'low' || stored === 'high') override = stored;
  } catch {
    // storage can be blocked; fall back to detection
  }
  return {
    deviceMemory: nav.deviceMemory,
    hardwareConcurrency: nav.hardwareConcurrency,
    saveData: nav.connection?.saveData,
    override,
  };
}
