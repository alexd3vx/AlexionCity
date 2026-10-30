import type { District } from './constants';
import type { AvatarSpec } from './types';

/** Bumped when messages change in a way old clients cannot read. */
export const PROTOCOL_VERSION = 1;

export type MoveMode = 'walk' | 'run' | 'vehicle';
/** What the avatar looks like it is doing; sent so other players can animate it. */
export type Motion = 'idle' | 'walk' | 'run';
export const MOTION_CODES: readonly Motion[] = ['idle', 'walk', 'run'];

export type Emote = 'wave' | 'clap' | 'dance' | 'laugh';
export const EMOTES: readonly Emote[] = ['wave', 'clap', 'dance', 'laugh'];

export type ReportReason = 'harassment' | 'spam' | 'inappropriate_name' | 'cheating' | 'other';
export const REPORT_REASONS: readonly ReportReason[] = [
  'harassment',
  'spam',
  'inappropriate_name',
  'cheating',
  'other',
];

export type ErrorCode =
  | 'bad_message'
  | 'bad_district'
  | 'not_joined'
  | 'auth_failed'
  | 'banned'
  | 'rate_limited'
  | 'bad_version';

/** A player in the same area. `id` is only for this session and is what chat, block and report refer to. */
export interface Peer {
  id: string;
  name: string;
  avatar: AvatarSpec;
  x: number;
  z: number;
  yaw: number;
  motion: Motion;
  /** The receiving player has blocked this one: hide their avatar and never show their chat. */
  blocked?: boolean;
}

/** Position update for a peer: [id, x, z, yaw, motion code]. Arrays keep the message small. */
export type PosUpdate = [string, number, number, number, number];

export interface BlockEntry {
  /** Opaque reference used to unblock later, even when that player is offline. */
  ref: string;
  name: string;
}

export type ClientMessage =
  | {
      t: 'join';
      v: number;
      token?: string;
      guestId?: string;
      name: string;
      district: District;
      avatar: AvatarSpec;
    }
  | { t: 'move'; seq: number; x: number; z: number; yaw: number; mode: MoveMode; motion: Motion }
  | { t: 'chat'; text: string }
  | { t: 'emote'; emote: Emote }
  | { t: 'avatar'; avatar: AvatarSpec }
  | { t: 'block'; targetId: string }
  | { t: 'unblock'; ref: string }
  | { t: 'report'; targetId: string; reason: ReportReason; details?: string }
  | { t: 'ping'; ts: number };

export type ServerMessage =
  | { t: 'welcome'; id: string; channel: string; name: string; v: number; blocks: BlockEntry[] }
  | { t: 'peers'; add: Peer[]; remove: string[] }
  | { t: 'pos'; u: PosUpdate[] }
  | { t: 'chat'; from: string; name: string; text: string; ts: number }
  | { t: 'emote'; from: string; emote: Emote }
  | { t: 'notice'; text: string; level: 'info' | 'warning' }
  | { t: 'blocks'; blocks: BlockEntry[] }
  | { t: 'correct'; seq: number; x: number; z: number }
  | { t: 'error'; code: ErrorCode }
  | { t: 'pong'; ts: number };
