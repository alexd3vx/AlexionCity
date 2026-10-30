import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { Emote, Peer, ReportReason } from '@alexioncity/shared';
import { supabase, type GuestSession } from '../auth/guest';
import type { AvatarSpec } from '../avatar/catalog';
import { config } from '../config';
import { playerSpec, type Content } from '../game/content';
import type { World } from '../game/world';
import { GameClient, type Credentials } from './client';
import { initialRoom, roomReducer, type RoomState } from './room';

/** What other players see before the avatar packs are downloaded: their skin colour, as a capsule. */
export function plainSpec(): AvatarSpec {
  let skin = 's5';
  try {
    skin = localStorage.getItem('alexion.skin') ?? `s${1 + Math.floor(Math.random() * 10)}`;
    localStorage.setItem('alexion.skin', skin);
  } catch {
    // storage blocked: a fresh colour each visit
  }
  return {
    frame: 'none',
    head: 'none',
    body: 'none',
    legs: 'none',
    feet: 'none',
    skin,
    hair: 'h2',
  };
}

async function credentialsFor(guest: GuestSession): Promise<Credentials> {
  const sb = supabase();
  if (sb) {
    const { data } = await sb.auth.getSession();
    if (data.session) return { token: data.session.access_token };
  }
  return { guestId: guest.id };
}

export interface Multiplayer {
  room: RoomState;
  /** The player whose card is open, if any. */
  selected: Peer | undefined;
  select(id: string | undefined): void;
  chat(text: string): void;
  emote(emote: Emote): void;
  mute(id: string): void;
  unmute(id: string): void;
  isMuted(id: string): boolean;
  block(id: string): void;
  unblock(ref: string): void;
  report(id: string, reason: ReportReason, details: string): void;
  markRead(): void;
}

/**
 * Connects the world to the game server for as long as the player has a name and a world exists.
 * The world draws other players; this hook only moves messages between the two.
 */
export function useMultiplayer(
  world: World | undefined,
  guest: GuestSession | undefined,
  name: string | undefined,
  content: Content | undefined,
): Multiplayer {
  const [room, dispatch] = useReducer(roomReducer, initialRoom);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const client = useRef<GameClient | undefined>(undefined);
  const muted = useRef(new Set<string>());
  const known = useRef(new Set<string>());
  const names = useRef(new Map<string, Peer>());
  const nameRef = useRef(name);
  nameRef.current = name;
  const contentRef = useRef(content);
  contentRef.current = content;

  useEffect(() => {
    if (!world || !guest || !name) return;
    const gc = new GameClient({
      url: config.gameWsUrl,
      credentials: () => credentialsFor(guest),
      name: () => nameRef.current ?? 'Guest',
      avatar: () => {
        const catalog = contentRef.current?.catalog;
        return catalog ? playerSpec(catalog) : plainSpec();
      },
    });
    client.current = gc;

    const clearCrowd = () => {
      world.applyPeers([], [...known.current]);
      known.current.clear();
      names.current.clear();
    };

    const off = [
      gc.subscribe((e) => {
        if (e.kind === 'status') {
          if (e.status !== 'online') clearCrowd();
          dispatch({ type: 'status', status: e.status, reason: e.reason });
          return;
        }
        const m = e.message;
        switch (m.t) {
          case 'welcome':
            clearCrowd();
            break;
          case 'peers':
            for (const id of m.remove) {
              known.current.delete(id);
              names.current.delete(id);
            }
            for (const p of m.add) {
              known.current.add(p.id);
              names.current.set(p.id, p);
            }
            world.applyPeers(m.add, m.remove);
            break;
          case 'pos':
            world.applyPositions(m.u);
            break;
          case 'chat':
            if (m.from === gc.selfId) world.saySelf(m.text);
            else if (!muted.current.has(m.from)) world.peerSay(m.from, m.text);
            break;
          case 'emote':
            if (m.from === gc.selfId) world.saySelf(m.emote, true);
            else if (!muted.current.has(m.from)) world.peerEmote(m.from, m.emote);
            break;
          case 'correct':
            world.teleport(m.x, m.z);
            break;
        }
        dispatch({ type: 'message', message: m, muted: muted.current });
      }),
      world.onLocal((pose) => gc.updateLocal(pose)),
      world.onAvatarChange((spec) => void gc.setAvatar(spec)),
    ];
    world.onPeerTap((id) => setSelectedId(id));
    gc.connect();

    return () => {
      off.forEach((o) => o());
      gc.close();
      client.current = undefined;
      clearCrowd();
    };
  }, [world, guest, name]);

  const select = useCallback((id: string | undefined) => setSelectedId(id), []);

  const selected = selectedId
    ? (world?.peerInfo(selectedId) ?? names.current.get(selectedId))
    : undefined;

  return useMemo<Multiplayer>(
    () => ({
      room,
      selected,
      select,
      chat: (text) => void client.current?.chat(text),
      emote: (emote) => void client.current?.emote(emote),
      mute: (id) => (muted.current.add(id), bump()),
      unmute: (id) => (muted.current.delete(id), bump()),
      isMuted: (id) => muted.current.has(id),
      block: (id) => void client.current?.block(id),
      unblock: (ref) => void client.current?.unblock(ref),
      report: (id, reason, details) => void client.current?.report(id, reason, details),
      markRead: () => dispatch({ type: 'read' }),
    }),
    // `bump` re-renders when the mute list changes, which is why it is not in the list
    [room, selected, select],
  );
}
