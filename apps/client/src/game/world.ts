import * as THREE from 'three';
import type { QualityTier } from '@alexioncity/shared';
import { resolveCircles, type Circle } from './collision';

export interface Input {
  /** -1 (left) to 1 (right) */
  x: number;
  /** -1 (back) to 1 (forward) */
  y: number;
  run: boolean;
}

export interface World {
  setInput(input: Input): void;
  /** Rotate the chase camera around the player by `delta` radians. */
  orbit(delta: number): void;
  resize(width: number, height: number): void;
  dispose(): void;
}

const WALK = 2.2;
const RUN = 5.2;
const PLAYER_RADIUS = 0.4;

/**
 * Phase 0 scaffold: a ground, a few obstacles and a stand-in player, with the chase camera,
 * collision and quality tiers that Phase 1 builds the real district on.
 */
export function createWorld(canvas: HTMLCanvasElement, tier: QualityTier): World {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: tier === 'high' });
  renderer.setPixelRatio(tier === 'high' ? Math.min(window.devicePixelRatio, 2) : 1);
  renderer.shadowMap.enabled = tier === 'high';

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9ad0f0);
  scene.fog = new THREE.Fog(0xbfdcf0, 40, 150);

  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 300);
  scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x8a7b64, 0.9));
  const sun = new THREE.DirectionalLight(0xfff0d0, 1);
  sun.position.set(30, 50, -20);
  sun.castShadow = tier === 'high';
  scene.add(sun);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.MeshStandardMaterial({ color: 0x8fae78 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 400),
    new THREE.MeshStandardMaterial({ color: 0x3c3f46 }),
  );
  road.rotation.x = -Math.PI / 2;
  road.position.y = 0.01;
  scene.add(road);

  const obstacles: Circle[] = [
    { x: 3, z: 8, r: 1.2 },
    { x: -3, z: 16, r: 1.2 },
    { x: 2, z: 26, r: 1.2 },
  ];
  for (const o of obstacles) {
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(o.r, o.r, 2, 16),
      new THREE.MeshStandardMaterial({ color: 0xe5483b }),
    );
    m.position.set(o.x, 1, o.z);
    m.castShadow = true;
    scene.add(m);
  }

  const player = new THREE.Mesh(
    new THREE.CapsuleGeometry(PLAYER_RADIUS, 1, 4, 8),
    new THREE.MeshStandardMaterial({ color: 0xffcf4a }),
  );
  player.position.y = 0.9;
  player.castShadow = true;
  scene.add(player);

  let input: Input = { x: 0, y: 0, run: false };
  let camYaw = 0;
  let px = 0;
  let pz = 0;
  let facing = 0;
  let raf = 0;
  let last = performance.now();

  const tick = (now: number) => {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    const magnitude = Math.min(1, Math.hypot(input.x, input.y));
    if (magnitude > 0.08) {
      const speed = (input.run ? RUN : WALK) * magnitude;
      const forward = { x: Math.sin(camYaw), z: Math.cos(camYaw) };
      const right = { x: -Math.cos(camYaw), z: Math.sin(camYaw) };
      let dx = forward.x * input.y + right.x * input.x;
      let dz = forward.z * input.y + right.z * input.x;
      const len = Math.hypot(dx, dz);
      dx /= len;
      dz /= len;
      const next = resolveCircles(
        px + dx * speed * dt,
        pz + dz * speed * dt,
        PLAYER_RADIUS,
        obstacles,
      );
      px = next.x;
      pz = next.z;
      facing = Math.atan2(dx, dz);
    }
    player.position.set(px, 0.9, pz);
    player.rotation.y = facing;

    camera.position.lerp(
      new THREE.Vector3(px - Math.sin(camYaw) * 6, 3.4, pz - Math.cos(camYaw) * 6),
      Math.min(1, dt * 8),
    );
    camera.lookAt(px, 1.2, pz);
    sun.position.set(px + 30, 50, pz - 20);
    sun.target.position.set(px, 0, pz);
    sun.target.updateMatrixWorld();

    renderer.render(scene, camera);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return {
    setInput: (next) => void (input = next),
    orbit: (delta) => void (camYaw += delta),
    resize(width, height) {
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
    },
    dispose() {
      cancelAnimationFrame(raf);
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
        }
      });
      renderer.dispose();
    },
  };
}
