import * as THREE from 'three';
import type { AvatarCatalog, Emote, Peer, PosUpdate, QualityTier } from '@alexioncity/shared';
import { MOTION_CODES } from '@alexioncity/shared';
import { assembleAvatar, AVATAR_HEIGHT, type Avatar } from '../avatar/assemble';
import { HAIR_COLORS, SKIN_TONES, swatch, type AvatarSpec } from '../avatar/catalog';
import type { AssetStore } from './assets';
import type { Labels } from './labels';
import { follow, followAngle, motionFromSpeed, SNAP_DISTANCE } from './remote-math';

export interface Assets {
  store: AssetStore;
  catalog: AvatarCatalog;
}

interface Remote {
  info: Peer;
  group: THREE.Group;
  placeholder: THREE.Mesh;
  avatar?: Avatar;
  building: boolean;
  x: number;
  z: number;
  yaw: number;
  tx: number;
  tz: number;
  tyaw: number;
  speed: number;
  hidden: boolean;
}

/** Most real avatars drawn at once; the rest are simple capsules. Keeps weak phones within budget. */
const MAX_AVATARS: Record<QualityTier, number> = { low: 8, high: 24 };
const TAG_RANGE = 38;
const MAX_TAGS = 14;
const EMOTE_TEXT: Record<Emote, string> = {
  wave: 'waves',
  clap: 'claps',
  dance: 'dances',
  laugh: 'laughs',
};

const capsule = new THREE.CapsuleGeometry(0.4, AVATAR_HEIGHT - 0.8, 4, 8);

/**
 * Other players in the world. Positions arrive a few times a second and are smoothed here. A player
 * appears at once as a capsule in their skin colour, and becomes their real avatar as soon as it is built.
 */
export class RemotePlayers {
  readonly group = new THREE.Group();
  private readonly peers = new Map<string, Remote>();
  private readonly materials = new Map<string, THREE.MeshLambertMaterial>();
  private readonly queue: string[] = [];
  private building = false;
  private lastRank = 0;
  private tapHandler: ((id: string) => void) | undefined;
  private readonly tmp = new THREE.Vector3();

  constructor(
    private readonly tier: QualityTier,
    private readonly labels: Labels,
    private readonly assets: () => Assets | undefined,
  ) {
    labels.onTap((id) => this.tapHandler?.(id));
  }

  onTap(handler: (id: string) => void): void {
    this.tapHandler = handler;
  }

  get count(): number {
    return this.peers.size;
  }

  info(id: string): Peer | undefined {
    return this.peers.get(id)?.info;
  }

  private material(skin: string): THREE.MeshLambertMaterial {
    let m = this.materials.get(skin);
    if (!m) {
      m = new THREE.MeshLambertMaterial({ color: swatch(SKIN_TONES, skin).hex });
      this.materials.set(skin, m);
    }
    return m;
  }

  apply(add: readonly Peer[], remove: readonly string[]): void {
    for (const id of remove) this.drop(id);
    for (const peer of add) {
      const existing = this.peers.get(peer.id);
      if (existing) {
        const lookChanged = JSON.stringify(existing.info.avatar) !== JSON.stringify(peer.avatar);
        existing.info = peer;
        existing.tx = peer.x;
        existing.tz = peer.z;
        existing.tyaw = peer.yaw;
        existing.hidden = Boolean(peer.blocked);
        existing.group.visible = !existing.hidden;
        this.labels.set(peer.id, peer.name, existing.hidden);
        if (lookChanged) this.rebuild(existing);
        continue;
      }
      const placeholder = new THREE.Mesh(capsule, this.material(peer.avatar.skin));
      placeholder.position.y = AVATAR_HEIGHT / 2;
      const group = new THREE.Group();
      group.add(placeholder);
      group.position.set(peer.x, 0, peer.z);
      group.rotation.y = peer.yaw;
      group.visible = !peer.blocked;
      this.group.add(group);
      const remote: Remote = {
        info: peer,
        group,
        placeholder,
        building: false,
        x: peer.x,
        z: peer.z,
        yaw: peer.yaw,
        tx: peer.x,
        tz: peer.z,
        tyaw: peer.yaw,
        speed: 0,
        hidden: Boolean(peer.blocked),
      };
      this.peers.set(peer.id, remote);
      this.labels.set(peer.id, peer.name, remote.hidden);
      this.queue.push(peer.id);
    }
    void this.pump();
  }

  move(updates: readonly PosUpdate[]): void {
    for (const [id, x, z, yaw, motion] of updates) {
      const p = this.peers.get(id);
      if (!p) continue;
      p.tx = x;
      p.tz = z;
      p.tyaw = yaw;
      p.info = { ...p.info, motion: MOTION_CODES[motion] ?? 'idle' };
      if (Math.hypot(x - p.x, z - p.z) > SNAP_DISTANCE) {
        p.x = x;
        p.z = z;
      }
    }
  }

  say(id: string, text: string, emote = false): void {
    this.labels.say(id, emote ? `* ${text} *` : text, emote);
  }

  emote(id: string, emote: Emote): void {
    this.say(id, EMOTE_TEXT[emote], true);
  }

  private drop(id: string): void {
    const p = this.peers.get(id);
    if (!p) return;
    p.avatar?.dispose();
    p.group.removeFromParent();
    this.peers.delete(id);
    this.labels.remove(id);
  }

  /** Called when more content has been downloaded: players still shown as capsules can become avatars. */
  refreshAssets(): void {
    for (const [id, p] of this.peers)
      if (!p.avatar && !this.queue.includes(id)) this.queue.push(id);
    void this.pump();
  }

  private rebuild(p: Remote): void {
    p.avatar?.dispose();
    p.avatar = undefined;
    p.placeholder.visible = true;
    p.placeholder.material = this.material(p.info.avatar.skin);
    if (!this.queue.includes(p.info.id)) this.queue.push(p.info.id);
    void this.pump();
  }

  private realCount(): number {
    let n = 0;
    for (const p of this.peers.values()) if (p.avatar) n++;
    return n;
  }

  /** Build real avatars one at a time, nearest first, without blocking the frame. */
  private async pump(): Promise<void> {
    if (this.building) return;
    const assets = this.assets();
    if (!assets) return;
    this.building = true;
    try {
      while (this.queue.length > 0 && this.realCount() < MAX_AVATARS[this.tier]) {
        const id = this.queue.shift()!;
        const p = this.peers.get(id);
        if (!p || p.avatar || p.hidden) continue;
        p.building = true;
        const spec = p.info.avatar as AvatarSpec;
        try {
          const avatar = await assembleAvatar(assets.store, assets.catalog, spec);
          // the player may have left or changed look while it was being built
          if (this.peers.get(id) === p && JSON.stringify(p.info.avatar) === JSON.stringify(spec)) {
            p.avatar = avatar;
            p.group.add(avatar.root);
            p.placeholder.visible = false;
            avatar.play(p.info.motion);
          } else avatar.dispose();
        } catch {
          // an outfit this device does not have yet: stay a capsule
        } finally {
          p.building = false;
        }
        await new Promise((r) => setTimeout(r, 0));
      }
    } finally {
      this.building = false;
    }
  }

  update(
    dt: number,
    camera: THREE.Camera,
    viewport: { width: number; height: number },
    player: { x: number; z: number },
  ): void {
    const near: { id: string; d: number }[] = [];
    for (const [id, p] of this.peers) {
      const px = p.x;
      const pz = p.z;
      p.x = follow(p.x, p.tx, dt);
      p.z = follow(p.z, p.tz, dt);
      p.yaw = followAngle(p.yaw, p.tyaw, dt);
      p.speed = Math.hypot(p.x - px, p.z - pz) / Math.max(dt, 0.001);
      p.group.position.set(p.x, 0, p.z);
      p.group.rotation.y = p.yaw;
      if (p.avatar) {
        // trust the server's word for walking vs running, but stop the legs when the player is not moving
        p.avatar.play(
          p.info.motion === 'idle'
            ? 'idle'
            : p.speed < 0.15
              ? 'idle'
              : p.info.motion === 'run'
                ? 'run'
                : motionFromSpeed(p.speed) === 'run'
                  ? 'run'
                  : 'walk',
        );
        p.avatar.update(dt);
      }
      if (!p.hidden) near.push({ id, d: Math.hypot(p.x - player.x, p.z - player.z) });
    }

    near.sort((a, b) => a.d - b.d);
    const shown = new Set<string>();
    for (const { id, d } of near.slice(0, MAX_TAGS)) {
      if (d > TAG_RANGE) break;
      const p = this.peers.get(id)!;
      this.tmp.set(p.x, AVATAR_HEIGHT + 0.35, p.z).project(camera);
      const visible = this.tmp.z < 1 && Math.abs(this.tmp.x) < 1.05 && Math.abs(this.tmp.y) < 1.1;
      this.labels.place(
        id,
        (this.tmp.x * 0.5 + 0.5) * viewport.width,
        (-this.tmp.y * 0.5 + 0.5) * viewport.height,
        visible,
        Math.max(0.7, 1 - d / 90),
      );
      if (visible) shown.add(id);
    }
    this.labels.hideAllExcept(new Set([...shown, 'self']));

    // when the nearest players change, queue the closest capsules to become avatars
    this.lastRank += dt;
    if (this.lastRank > 1) {
      this.lastRank = 0;
      for (const { id } of near.slice(0, MAX_AVATARS[this.tier])) {
        const p = this.peers.get(id)!;
        if (!p.avatar && !p.building && !this.queue.includes(id)) this.queue.push(id);
      }
      void this.pump();
    }
  }

  dispose(): void {
    for (const id of [...this.peers.keys()]) this.drop(id);
    this.group.removeFromParent();
    this.materials.forEach((m) => m.dispose());
    void HAIR_COLORS;
  }
}
