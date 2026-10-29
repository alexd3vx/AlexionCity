import type { District } from './constants';

export type QualityTier = 'low' | 'high';

/** CC-BY and CC-BY-SA models need visible credit; CC0 does not. */
export type LicenceKind = 'CC0' | 'CC-BY' | 'CC-BY-SA' | 'custom';

/**
 * How sure we are about a model's licence.
 * `user-attested` means the owner said so; `verified` means we checked the source page.
 */
export type LicenceStatus = 'verified' | 'user-attested' | 'unknown';

export interface LicenceEntry {
  /** Path relative to assets-src/raw, using forward slashes. */
  file: string;
  pack: string;
  source: string;
  author?: string;
  licence: LicenceKind;
  status: LicenceStatus;
  notes?: string;
}

export interface PackFile {
  path: string;
  bytes: number;
  sha256: string;
}

export interface PackManifestEntry {
  id: string;
  title: string;
  version: string;
  /** Required packs are fetched on first load; the rest appear on the download page. */
  required: boolean;
  tier?: QualityTier;
  bytes: number;
  files: PackFile[];
}

export interface PackManifest {
  schema: 1;
  gameVersion: string;
  generatedAt: string;
  packs: PackManifestEntry[];
}

export interface WhatsNewItem {
  version: string;
  title: string;
  notes: string[];
}

export interface PlayerState {
  id: string;
  name: string;
  x: number;
  z: number;
  yaw: number;
}

export type ClientMessage =
  | { t: 'join'; district: District; name: string }
  | { t: 'move'; seq: number; x: number; z: number; yaw: number; mode: 'walk' | 'run' | 'vehicle' };

export type ServerMessage =
  | { t: 'welcome'; id: string; channel: string; players: PlayerState[] }
  | { t: 'state'; players: PlayerState[] }
  | { t: 'correct'; seq: number; x: number; z: number }
  | { t: 'error'; code: 'bad_message' | 'bad_district' | 'not_joined' };
