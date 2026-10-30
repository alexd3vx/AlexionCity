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

/** The slots of an avatar. Each is its own mesh so parts from different outfits can be mixed. */
export type AvatarPart = 'head' | 'body' | 'legs' | 'feet';

/** Written by the asset pipeline into the avatars pack as catalog.json. */
export interface AvatarCatalog {
  schema: 1;
  frames: AvatarFrame[];
}

export interface AvatarFrame {
  /** A body frame: parts only fit characters from the same frame. */
  id: string;
  /** Path to the rig (skeleton and animation clips) inside the pack. */
  rig: string;
  /** Animation clip names, by role. */
  clips: { idle: string; walk: string; run: string };
  outfits: AvatarOutfit[];
}

export interface AvatarOutfit {
  id: string;
  name: string;
  /** `everyday` outfits are offered at the start; others are unlocks. */
  tags: string[];
  /** Pack path of each part's model. */
  parts: Partial<Record<AvatarPart, string>>;
}

/** What a player chose to look like. Outfit ids refer to the avatar catalog. */
export interface AvatarSpec {
  frame: string;
  head: string;
  body: string;
  legs: string;
  feet: string;
  skin: string;
  hair: string;
}
