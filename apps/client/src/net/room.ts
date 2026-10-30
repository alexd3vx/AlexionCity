import { type BlockEntry, type ServerMessage } from '@alexioncity/shared';
import type { NetStatus } from './client';

export interface ChatLine {
  key: number;
  from: string;
  name: string;
  text: string;
  ts: number;
  self: boolean;
}

export interface Notice {
  key: number;
  text: string;
  level: 'info' | 'warning';
}

export interface RoomState {
  status: NetStatus;
  /** Why the connection was refused, when status is `rejected`. */
  reason?: string;
  selfId?: string;
  channel?: string;
  /** The name the server accepted, which can differ from the one asked for. */
  name?: string;
  lines: ChatLine[];
  blocks: BlockEntry[];
  notice?: Notice;
  /** Chat lines that arrived while the chat sheet was closed. */
  unread: number;
}

export const MAX_LINES = 60;

export const initialRoom: RoomState = { status: 'offline', lines: [], blocks: [], unread: 0 };

export type RoomAction =
  | { type: 'status'; status: NetStatus; reason?: string | undefined }
  | { type: 'message'; message: ServerMessage; muted: ReadonlySet<string> }
  | { type: 'read' };

let counter = 0;
const nextKey = () => ++counter;

/** Pure state update for everything the server tells the player that the interface lists. */
export function roomReducer(state: RoomState, action: RoomAction): RoomState {
  switch (action.type) {
    case 'read':
      return state.unread === 0 ? state : { ...state, unread: 0 };
    case 'status': {
      const next: RoomState = { ...state, status: action.status };
      if (action.reason) next.reason = action.reason;
      else delete next.reason;
      // after a drop, the old crowd is gone: a fresh welcome brings the new one
      if (action.status !== 'online') delete next.selfId;
      return next;
    }
    case 'message': {
      const m = action.message;
      switch (m.t) {
        case 'welcome':
          return { ...state, selfId: m.id, channel: m.channel, name: m.name, blocks: m.blocks };
        case 'blocks':
          return { ...state, blocks: m.blocks };
        case 'notice':
          return { ...state, notice: { key: nextKey(), text: m.text, level: m.level } };
        case 'chat': {
          const self = m.from === state.selfId;
          if (!self && action.muted.has(m.from)) return state;
          const line: ChatLine = {
            key: nextKey(),
            from: m.from,
            name: m.name,
            text: m.text,
            ts: m.ts,
            self,
          };
          return {
            ...state,
            lines: [...state.lines, line].slice(-MAX_LINES),
            unread: self ? state.unread : state.unread + 1,
          };
        }
        case 'error':
          return m.code === 'rate_limited'
            ? {
                ...state,
                notice: { key: nextKey(), text: 'Slow down a little.', level: 'warning' },
              }
            : state;
        default:
          return state;
      }
    }
  }
}

/** Plain words for why the server said no. */
export function rejectionText(reason: string | undefined): string {
  switch (reason) {
    case 'banned':
      return 'This account is suspended from the city.';
    case 'update':
      return 'A new version is out. Refresh the page to keep playing together.';
    default:
      return 'Could not sign you in to the city.';
  }
}
