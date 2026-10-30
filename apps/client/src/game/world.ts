import * as THREE from 'three';
import type { AvatarCatalog, QualityTier } from '@alexioncity/shared';
import { assembleAvatar, AVATAR_HEIGHT, type Avatar } from '../avatar/assemble';
import type { AvatarSpec } from '../avatar/catalog';
import type { AssetStore } from './assets';
import { approachAngle, cameraPose, nextView, type ViewMode } from './cameras';
import { resolveBoxes, resolveCircles } from './collision';
import { nowMinutes, skyAt } from './daynight';
import { generateLayout, type Layout, type Poi, type PoiIcon } from './district/layout';
import { DISTRICT_PACKS } from './district/models';
import { createDistrictView, type DistrictView } from './district/blocks';
import { buildBase } from './district/scene';
import { Pedestrians } from './pedestrians';

export interface Input {
  /** -1 (left) to 1 (right) */
  x: number;
  /** -1 (back) to 1 (forward) */
  y: number;
  run: boolean;
}

export interface Action {
  label: string;
  poiId?: string;
}

export interface WorldState {
  x: number;
  z: number;
  /** Direction the player faces, radians. */
  yaw: number;
  /** Minutes since midnight. */
  minutes: number;
  view: ViewMode;
  street: string;
  /** Closest places first, with distances in metres. */
  places: { poi: Poi; distance: number }[];
  /** What the main button would do here, if anything. */
  action?: Action;
  /** A passer-by close enough to talk to. */
  talk?: Action;
  look: 'default' | 'models';
  avatars: boolean;
  stats: { fps: number; calls: number; triangles: number };
}

export interface WorldOptions {
  tier: QualityTier;
  /** Freeze the time of day, in minutes since midnight. Used for screenshots and tests. */
  fixedMinutes?: number;
  seed?: number;
}

export interface World {
  readonly layout: Layout;
  setInput(input: Input): void;
  /** Rotate the camera around the player by `delta` radians. */
  orbit(delta: number): void;
  cycleView(): ViewMode;
  /** Swing the camera back behind the player. */
  recenter(): void;
  resize(width: number, height: number): void;
  /** Swap the stand-in buildings for the real models, once those packs are downloaded. */
  upgradeCity(store: AssetStore): Promise<boolean>;
  /** Replace the stand-in player with a real avatar and add the ambient crowd. */
  upgradeAvatars(store: AssetStore, catalog: AvatarCatalog, spec: AvatarSpec): Promise<void>;
  setAvatarSpec(store: AssetStore, catalog: AvatarCatalog, spec: AvatarSpec): Promise<void>;
  setMinutes(minutes: number | undefined): void;
  onState(listener: (state: WorldState) => void): () => void;
  teleport(x: number, z: number): void;
  dispose(): void;
}

const WALK = 2.2;
const RUN = 5.2;
const PLAYER_RADIUS = 0.4;
const ACTION_RANGE = 14;

const ACTION_LABEL: Record<PoiIcon, (name: string) => string | undefined> = {
  food: (n) => `Enter ${n}`,
  bar: (n) => `Enter ${n}`,
  hotel: (n) => `Enter ${n}`,
  hospital: (n) => `Enter ${n}`,
  tower: (n) => `Enter ${n}`,
  home: () => 'Go inside',
  atm: () => 'Use ATM',
  bus: () => 'Wait for the bus',
  park: () => undefined,
};

export function createWorld(canvas: HTMLCanvasElement, options: WorldOptions): World {
  const { tier } = options;
  const layout = generateLayout({ seed: options.seed ?? 1, density: tier === 'high' ? 1 : 0.5 });

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: tier === 'high',
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(tier === 'high' ? Math.min(window.devicePixelRatio, 2) : 1);
  renderer.shadowMap.enabled = tier === 'high';
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color();
  scene.fog = new THREE.Fog(0xffffff, tier === 'high' ? 45 : 32, tier === 'high' ? 170 : 115);
  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, tier === 'high' ? 220 : 150);

  const hemi = new THREE.HemisphereLight();
  const sun = new THREE.DirectionalLight();
  sun.castShadow = tier === 'high';
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -48;
  sc.right = sc.top = 48;
  sc.near = 1;
  sc.far = 220;
  sun.shadow.bias = -0.0005;
  scene.add(hemi, sun, sun.target);

  if (import.meta.env.DEV) Object.assign(window, { __scene: scene, __camera: camera });

  const base = buildBase(layout, tier);
  const city: DistrictView = createDistrictView(layout, tier);
  scene.add(base.group, city.group);

  // the player: a capsule until an avatar is ready
  const standIn = new THREE.Mesh(
    new THREE.CapsuleGeometry(PLAYER_RADIUS, AVATAR_HEIGHT - PLAYER_RADIUS * 2, 4, 8),
    new THREE.MeshLambertMaterial({ color: 0xff7a1a }),
  );
  standIn.position.y = AVATAR_HEIGHT / 2;
  const playerGroup = new THREE.Group();
  playerGroup.add(standIn);
  scene.add(playerGroup);
  let avatar: Avatar | undefined;
  let crowd: Pedestrians | undefined;

  let input: Input = { x: 0, y: 0, run: false };
  let px = layout.spawn.x;
  let pz = layout.spawn.z;
  let facing = layout.spawn.yaw;
  let camYaw = layout.spawn.yaw;
  let camYawTarget = camYaw;
  let view: ViewMode = 'chase';
  let fixedMinutes = options.fixedMinutes;
  let skyFor = Number.NaN;
  let moving: 'idle' | 'walk' | 'run' = 'idle';
  let fps = 60;
  let lastEmit = 0;
  const listeners = new Set<(s: WorldState) => void>();

  const applySky = (minutes: number) => {
    const sky = skyAt(minutes);
    (scene.background as THREE.Color).setHex(sky.background);
    scene.fog!.color.setHex(sky.fog);
    hemi.color.setHex(sky.hemiSky);
    hemi.groundColor.setHex(sky.hemiGround);
    hemi.intensity = sky.hemiIntensity;
    sun.color.setHex(sky.sunColor);
    sun.intensity = sky.sunIntensity;
    sunDir.set(...sky.sunDir);
    base.setGlow(sky.glow);
    city.setGlow(sky.glow);
  };
  const sunDir = new THREE.Vector3(0.4, 0.8, 0.4);

  const nearestStreet = () => {
    let best = layout.streets[0]!;
    let bestD = Infinity;
    for (const s of layout.streets) {
      const d = Math.abs((s.axis === 'x' ? pz : px) - s.at);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best.name;
  };

  const buildState = (minutes: number): WorldState => {
    const places = layout.pois
      .map((poi) => ({ poi, distance: Math.hypot(poi.x - px, poi.z - pz) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 5);
    const near = places.find(
      (p) => p.distance <= ACTION_RANGE && ACTION_LABEL[p.poi.icon](p.poi.name),
    );
    const passer = crowd?.nearest(px, pz, 3);
    const info = renderer.info.render;
    return {
      x: px,
      z: pz,
      yaw: facing,
      minutes,
      view,
      street: nearestStreet(),
      places,
      ...(near
        ? { action: { label: ACTION_LABEL[near.poi.icon](near.poi.name)!, poiId: near.poi.id } }
        : {}),
      ...(passer ? { talk: { label: 'Talk · Passer-by' } } : {}),
      look: city.detailed ? 'models' : 'default',
      avatars: Boolean(avatar),
      stats: { fps: Math.round(fps), calls: info.calls, triangles: info.triangles },
    };
  };

  const camTarget = new THREE.Vector3();
  const lookAt = new THREE.Vector3();
  let last = performance.now();
  let raf = 0;

  const tick = (now: number) => {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    fps += (1 / Math.max(dt, 0.001) - fps) * 0.05;

    const minutes = fixedMinutes ?? nowMinutes();
    if (Math.abs(minutes - skyFor) > 0.25 || Number.isNaN(skyFor)) {
      skyFor = minutes;
      applySky(minutes);
    }

    // movement relative to the camera, then collision
    const magnitude = Math.min(1, Math.hypot(input.x, input.y));
    let motion: typeof moving = 'idle';
    if (magnitude > 0.08) {
      const forward = { x: Math.sin(camYaw), z: Math.cos(camYaw) };
      const right = { x: -Math.cos(camYaw), z: Math.sin(camYaw) };
      let dx = forward.x * input.y + right.x * input.x;
      let dz = forward.z * input.y + right.z * input.x;
      const len = Math.hypot(dx, dz);
      dx /= len;
      dz /= len;
      const running = input.run || magnitude > 0.85;
      const speed = (running ? RUN : WALK) * magnitude;
      const slid = resolveCircles(
        px + dx * speed * dt,
        pz + dz * speed * dt,
        PLAYER_RADIUS,
        layout.circles,
      );
      const moved = resolveBoxes(slid.x, slid.z, PLAYER_RADIUS, layout.boxes);
      px = moved.x;
      pz = moved.z;
      facing = approachAngle(facing, Math.atan2(dx, dz), dt, 14);
      motion = running ? 'run' : 'walk';
    }
    if (motion !== moving) {
      moving = motion;
      avatar?.play(motion);
    }
    playerGroup.position.set(px, 0, pz);
    playerGroup.rotation.y = facing;
    avatar?.update(dt);
    crowd?.update(dt);
    city.update(px, pz);

    // camera: smooth behind the player, kept out of buildings
    camYaw = approachAngle(camYaw, camYawTarget, dt, 12);
    const pose = cameraPose(view, { x: px, z: pz }, camYaw);
    camTarget.set(...pose.position);
    if (pose.position[1] < 22) {
      const pushed = resolveBoxes(camTarget.x, camTarget.z, 0.7, layout.boxes);
      camTarget.x = pushed.x;
      camTarget.z = pushed.z;
    }
    camera.position.lerp(camTarget, Math.min(1, dt * 9));
    if (Math.abs(camera.fov - pose.fov) > 0.05) {
      camera.fov += (pose.fov - camera.fov) * Math.min(1, dt * 6);
      camera.updateProjectionMatrix();
    }
    lookAt.set(...pose.lookAt);
    camera.lookAt(lookAt);

    sun.position.set(px + sunDir.x * 90, sunDir.y * 90, pz + sunDir.z * 90);
    sun.target.position.set(px, 0, pz);

    renderer.render(scene, camera);

    if (now - lastEmit > 180 && listeners.size > 0) {
      lastEmit = now;
      const state = buildState(minutes);
      listeners.forEach((l) => l(state));
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  const world: World = {
    layout,
    setInput: (next) => void (input = next),
    orbit: (delta) => void (camYawTarget += delta),
    cycleView: () => (view = nextView(view)),
    recenter: () => void (camYawTarget = facing),
    resize(width, height) {
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
    },
    async upgradeCity(store) {
      if (city.detailed || !DISTRICT_PACKS.every((p) => store.has(p))) return false;
      await city.upgrade(store);
      return true;
    },
    async setAvatarSpec(store, catalog, spec) {
      const next = await assembleAvatar(store, catalog, spec);
      avatar?.dispose();
      avatar = next;
      standIn.visible = false;
      playerGroup.add(next.root);
      next.play(moving);
    },
    async upgradeAvatars(store, catalog, spec) {
      await world.setAvatarSpec(store, catalog, spec);
      if (!crowd) {
        crowd = new Pedestrians(layout, tier);
        scene.add(crowd.group);
        await crowd.spawn(store, catalog);
      }
    },
    setMinutes: (minutes) => {
      fixedMinutes = minutes;
      skyFor = Number.NaN;
    },
    onState(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    teleport(x, z) {
      px = x;
      pz = z;
    },
    dispose() {
      cancelAnimationFrame(raf);
      avatar?.dispose();
      crowd?.dispose();
      city.dispose();
      base.dispose();
      standIn.geometry.dispose();
      (standIn.material as THREE.Material).dispose();
      renderer.dispose();
    },
  };
  return world;
}
