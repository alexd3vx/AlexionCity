import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { config } from '../config';
import { AssetStore } from '../game/assets';
import { PackLoader } from '../packs/loader';

declare global {
  interface Window {
    __gallery?: { ready: boolean; error?: string; count: number };
  }
}

/**
 * Developer page at /#gallery: every model in the city packs at the same size, with red (x) and
 * blue (z) arrows, to judge scale and which way each one faces.
 */
export function ModelGallery() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState('Loading city packs…');

  useEffect(() => {
    window.__gallery = { ready: false, count: 0 };
    let cancelled = false;
    const renderer = new THREE.WebGLRenderer({ canvas: canvas.current!, antialias: true });
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xdfe9f2);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7b64, 1.2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.3);
    sun.position.set(6, 10, 8);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 500);
    const anchors: { name: string; pos: THREE.Vector3 }[] = [];

    const render = () => {
      renderer.render(scene, camera);
      const el = labels.current!;
      el.replaceChildren(
        ...anchors.map((a) => {
          const p = a.pos.clone().project(camera);
          const d = document.createElement('div');
          d.textContent = a.name;
          d.style.cssText = `position:absolute;left:${(p.x * 0.5 + 0.5) * el.clientWidth}px;top:${(-p.y * 0.5 + 0.5) * el.clientHeight}px;transform:translate(-50%,0);font:600 10px system-ui;color:#1b2340;white-space:nowrap;text-shadow:0 0 3px #fff`;
          return d;
        }),
      );
    };

    (async () => {
      const loader = new PackLoader({ base: config.assetBase });
      const manifest = await loader.fetchManifest();
      const plan = await loader.plan(manifest);
      const need = plan.needed.filter((p) => ['city-core', 'city-extras'].includes(p.pack.id));
      if (need.length > 0) await loader.download(need);
      const store = await AssetStore.open(loader, manifest);
      const entries = manifest.packs
        .filter((p) => ['city-core', 'city-extras'].includes(p.id))
        .flatMap((p) =>
          p.files.filter((f) => f.path.endsWith('.glb')).map((f) => ({ pack: p.id, path: f.path })),
        );

      const cols = 8;
      const gap = 7;
      let i = 0;
      for (const { pack, path } of entries) {
        if (cancelled) return;
        const gltf = await store.gltf(pack, path);
        const obj = gltf.scene.clone(true);
        const box = new THREE.Box3().setFromObject(obj);
        const size = box.getSize(new THREE.Vector3());
        const k = 5 / Math.max(size.x, size.y, size.z);
        obj.scale.multiplyScalar(k);
        const b2 = new THREE.Box3().setFromObject(obj);
        const c = b2.getCenter(new THREE.Vector3());
        obj.position.set(-c.x, -b2.min.y, -c.z);
        const holder = new THREE.Group();
        holder.add(obj);
        const col = i % cols;
        const row = Math.floor(i / cols);
        holder.position.set((col - (cols - 1) / 2) * gap, 0, row * gap);
        scene.add(holder);
        scene.add(
          new THREE.ArrowHelper(
            new THREE.Vector3(1, 0, 0),
            new THREE.Vector3(holder.position.x - 3, 0.05, holder.position.z + 3),
            2,
            0xff3030,
            0.5,
            0.3,
          ),
        );
        scene.add(
          new THREE.ArrowHelper(
            new THREE.Vector3(0, 0, 1),
            new THREE.Vector3(holder.position.x - 3, 0.05, holder.position.z + 3),
            2,
            0x3050ff,
            0.5,
            0.3,
          ),
        );
        anchors.push({
          name: `${path.replace(/\.glb$/, '')} (${(size.x * k).toFixed(1)}×${(size.y * k).toFixed(1)}×${(size.z * k).toFixed(1)} → ×${k.toFixed(3)})`,
          pos: new THREE.Vector3(holder.position.x, 0, holder.position.z + 3.4),
        });
        i++;
      }
      const rows = Math.ceil(i / cols);
      renderer.setSize(canvas.current!.clientWidth, canvas.current!.clientHeight, false);
      camera.aspect = canvas.current!.clientWidth / canvas.current!.clientHeight;
      camera.updateProjectionMatrix();
      camera.position.set(0, 42 + rows * 3, rows * gap + 18);
      camera.lookAt(0, 0, (rows * gap) / 2 - 1);
      render();
      window.__gallery = { ready: true, count: i };
      setMessage('');
    })().catch((e: unknown) => {
      window.__gallery = {
        ready: false,
        count: 0,
        error: e instanceof Error ? e.message : String(e),
      };
      setMessage(`Error: ${window.__gallery.error}`);
    });
    return () => {
      cancelled = true;
      renderer.dispose();
    };
  }, []);

  return (
    <div className="fixed inset-0">
      <canvas ref={canvas} className="block h-full w-full" />
      <div ref={labels} className="pointer-events-none absolute inset-0 overflow-hidden" />
      {message && (
        <p className="absolute left-4 top-4 rounded bg-white/90 px-3 py-2 text-sm font-bold">
          {message}
        </p>
      )}
    </div>
  );
}
