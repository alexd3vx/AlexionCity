import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { type AvatarCatalog, type AvatarPart } from '@alexioncity/shared';
import { assembleAvatar, type Avatar } from '../avatar/assemble';
import { HAIR_COLORS, SKIN_TONES, type AvatarSpec } from '../avatar/catalog';
import { config } from '../config';
import { AssetStore } from '../game/assets';
import { PackLoader } from '../packs/loader';

declare global {
  interface Window {
    __lab?: { ready: boolean; specs: AvatarSpec[]; error?: string };
  }
}

/**
 * Developer page at /#lab: downloads the avatar pack and shows twenty avatars with parts mixed
 * across every outfit in a frame (costumes included). Used to check that parts fit one skeleton.
 */
export function AvatarLab() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [message, setMessage] = useState('Loading avatar pack…');

  useEffect(() => {
    window.__lab = { ready: false, specs: [] };
    let cancelled = false;
    const renderer = new THREE.WebGLRenderer({ canvas: canvas.current!, antialias: true });
    renderer.setPixelRatio(1);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xbfe3ff);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7b64, 1.1));
    const sun = new THREE.DirectionalLight(0xfff0d0, 1.4);
    sun.position.set(4, 8, 6);
    scene.add(sun);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 20),
      new THREE.MeshStandardMaterial({ color: 0xcfe3b0 }),
    );
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    camera.position.set(0, 3.2, 10.5);
    camera.lookAt(0, 1.1, 0);
    const resize = () => {
      const el = canvas.current!;
      renderer.setSize(el.clientWidth, el.clientHeight, false);
      camera.aspect = el.clientWidth / Math.max(el.clientHeight, 1);
      camera.updateProjectionMatrix();
    };
    resize();
    addEventListener('resize', resize);

    const avatars: Avatar[] = [];
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      avatars.forEach((a) => a.update(dt));
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    (async () => {
      if (cancelled) return;
      const loader = new PackLoader({ base: config.assetBase });
      const manifest = await loader.fetchManifest();
      const plan = await loader.plan(manifest);
      const need = plan.needed.filter((p) => p.pack.id === 'avatars');
      if (need.length > 0)
        await loader.download(need, (p) =>
          setMessage(`Downloading ${Math.round((p.doneBytes / p.totalBytes) * 100)}%`),
        );
      const store = await AssetStore.open(loader, manifest);
      const catalog = await store.json<AvatarCatalog>('avatars', 'catalog.json');

      let seed = 7;
      const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      const choose = <T,>(list: readonly T[]) => list[Math.floor(rng() * list.length)]!;
      const motions = ['idle', 'walk', 'run'] as const;

      for (let i = 0; i < 20 && !cancelled; i++) {
        const frame = catalog.frames[i % catalog.frames.length]!;
        const any = (slot: AvatarPart) => choose(frame.outfits.filter((o) => o.parts[slot])).id;
        const spec: AvatarSpec = {
          frame: frame.id,
          head: any('head'),
          body: any('body'),
          legs: any('legs'),
          feet: any('feet'),
          skin: SKIN_TONES[i % SKIN_TONES.length]!.id,
          hair: choose(HAIR_COLORS).id,
        };
        const avatar = await assembleAvatar(store, catalog, spec);
        avatar.root.position.set(-9 + (i % 10) * 2, 0, i < 10 ? 1.2 : -1.6);
        avatar.root.rotation.y = i < 10 ? 0 : 0;
        avatar.play(motions[i % 3]!);
        scene.add(avatar.root);
        avatars.push(avatar);
        window.__lab!.specs.push(spec);
      }
      if (cancelled) return;
      window.__lab!.ready = true;
      setMessage('');
    })().catch((e: unknown) => {
      const error = e instanceof Error ? e.message : String(e);
      window.__lab!.error = error;
      setMessage(`Error: ${error}`);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      removeEventListener('resize', resize);
      avatars.forEach((a) => a.dispose());
      renderer.dispose();
    };
  }, []);

  return (
    <div className="fixed inset-0">
      <canvas ref={canvas} className="block h-full w-full" />
      {message && (
        <p className="absolute left-4 top-4 rounded bg-white/90 px-3 py-2 text-sm font-bold">
          {message}
        </p>
      )}
    </div>
  );
}
