import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  MODELS,
  dims,
  type Layout,
  type ModelId,
  type Placement,
  type QualityTier,
  type Rect,
} from '@alexioncity/shared';
export interface Built {
  group: THREE.Group;
  /** 0 in daylight to 1 at night: lamps and (for stand-ins) windows glow. */
  setGlow(glow: number): void;
  dispose(): void;
}

const color = (hex: number) => new THREE.Color(hex);

function paint(geometry: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const c = color(hex);
  const count = geometry.getAttribute('position').count;
  const data = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) data.set([c.r, c.g, c.b], i * 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(data, 3));
  return geometry;
}

const lambert = (hex: number, extra: THREE.MeshLambertMaterialParameters = {}) =>
  new THREE.MeshLambertMaterial({ color: hex, ...extra });

function flatRects(rects: readonly Rect[], y: number): THREE.BufferGeometry {
  return mergeGeometries(
    rects.map((r) =>
      new THREE.PlaneGeometry(r.w, r.d).rotateX(-Math.PI / 2).translate(r.x, y, r.z),
    ),
  )!;
}

function slabRects(rects: readonly Rect[], height: number): THREE.BufferGeometry {
  return mergeGeometries(
    rects.map((r) => new THREE.BoxGeometry(r.w, height, r.d).translate(r.x, height / 2, r.z)),
  )!;
}

function billboardTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#ff7a1a';
  g.fillRect(0, 0, 512, 256);
  g.fillStyle = '#1b2340';
  g.fillRect(0, 196, 512, 60);
  g.fillStyle = '#fff3e0';
  g.font = '800 54px system-ui, sans-serif';
  g.textAlign = 'center';
  g.fillText('YOUR BRAND', 256, 108);
  g.fillText('HERE', 256, 168);
  g.font = '700 26px system-ui, sans-serif';
  g.fillText('Book this billboard in AlexionCity', 256, 236);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Everything that is the same in both looks: ground, streets, pavements, road paint, street lamps
 * with their light pools, the plaza fountain and the billboard frames.
 */
export function buildBase(layout: Layout, tier: QualityTier): Built {
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(item: T): T => (disposables.push(item), item);

  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, y = 0) => {
    const mesh = new THREE.Mesh(own(geometry), own(material));
    mesh.position.y = y;
    mesh.receiveShadow = tier === 'high';
    group.add(mesh);
    return mesh;
  };

  add(new THREE.PlaneGeometry(900, 900).rotateX(-Math.PI / 2), lambert(0x8fae78), -0.03);
  add(slabRects(layout.roads, 0.04), lambert(0x3c3f46));
  add(slabRects(layout.slabs, 0.16), lambert(0xcdc3b2));
  add(flatRects(layout.markings, 0.06), lambert(0xf3ead0));

  // street lamps: pole, glowing head, and a pool of light on the ground
  const poles = new THREE.InstancedMesh(
    own(new THREE.CylinderGeometry(0.07, 0.1, 4.6, 6).translate(0, 2.3, 0)),
    own(lambert(0x2b2f38)),
    layout.lamps.length,
  );
  const headMaterial = own(new THREE.MeshBasicMaterial({ color: 0xdad7c8 }));
  const heads = new THREE.InstancedMesh(
    own(new THREE.BoxGeometry(0.5, 0.18, 0.28).translate(0, 4.65, 0)),
    headMaterial,
    layout.lamps.length,
  );
  const poolMaterial = own(
    new THREE.MeshBasicMaterial({
      color: 0xffd890,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    }),
  );
  const pools = new THREE.InstancedMesh(
    own(new THREE.CircleGeometry(3.4, 20).rotateX(-Math.PI / 2).translate(0, 0.07, 0)),
    poolMaterial,
    layout.lamps.length,
  );
  const m = new THREE.Matrix4();
  layout.lamps.forEach((l, i) => {
    m.makeTranslation(l.x, 0, l.z);
    poles.setMatrixAt(i, m);
    heads.setMatrixAt(i, m);
    pools.setMatrixAt(i, m);
  });
  for (const mesh of [poles, heads, pools]) {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    group.add(mesh);
  }
  poles.castShadow = tier === 'high';

  // fountain in the plaza
  const { x: fx, z: fz, r } = layout.fountain;
  const basin = new THREE.Mesh(
    own(new THREE.CylinderGeometry(r, r, 0.7, 28)),
    own(lambert(0xcbd5de)),
  );
  basin.position.set(fx, 0.35, fz);
  const water = new THREE.Mesh(
    own(new THREE.CircleGeometry(r - 0.35, 28).rotateX(-Math.PI / 2)),
    own(lambert(0x4fb8ff)),
  );
  water.position.set(fx, 0.71, fz);
  const column = new THREE.Mesh(
    own(new THREE.CylinderGeometry(0.35, 0.6, 2.4, 10)),
    own(lambert(0xe3e8ee)),
  );
  column.position.set(fx, 1.3, fz);
  basin.castShadow = column.castShadow = tier === 'high';
  group.add(basin, water, column);

  // billboard frames, filled with the booking ad until the ad system exists
  const texture = own(billboardTexture());
  const panelMaterials = [
    lambert(0x555b66),
    lambert(0x555b66),
    lambert(0x555b66),
    lambert(0x555b66),
    own(new THREE.MeshBasicMaterial({ map: texture })),
    lambert(0x555b66),
  ].map(own);
  for (const b of layout.billboards) {
    const frame = new THREE.Group();
    const panel = new THREE.Mesh(own(new THREE.BoxGeometry(7, 3.5, 0.25)), panelMaterials);
    panel.position.y = 5.6;
    const postGeometry = own(new THREE.BoxGeometry(0.3, 4.2, 0.3));
    for (const dx of [-2.4, 2.4]) {
      const post = new THREE.Mesh(postGeometry, panelMaterials[0]);
      post.position.set(dx, 2.1, 0);
      frame.add(post);
    }
    frame.add(panel);
    frame.position.set(b.x, 0, b.z);
    frame.rotation.y = b.yaw;
    group.add(frame);
  }

  return {
    group,
    setGlow(glow) {
      headMaterial.color.set(0xdad7c8).lerp(color(0xffe2a0), glow);
      poolMaterial.opacity = 0.3 * glow;
      pools.visible = glow > 0.02;
    },
    dispose() {
      disposables.forEach((d) => d.dispose());
      group.removeFromParent();
    },
  };
}

// ---------------------------------------------------------------------------------------------
// the default look: simple shapes, drawn from the first frame with nothing downloaded
// ---------------------------------------------------------------------------------------------

export function windowTextures(): { facade: THREE.CanvasTexture; glow: THREE.CanvasTexture } {
  const draw = (wall: string, glass: string) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const g = canvas.getContext('2d')!;
    g.fillStyle = wall;
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = glass;
    g.fillRect(34, 28, 60, 56);
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  };
  return { facade: draw('#ffffff', '#7e97ad'), glow: draw('#000000', '#ffd98a') };
}

export function windowBox(w: number, h: number, d: number): THREE.BufferGeometry {
  const box = new THREE.BoxGeometry(w, h, d);
  const uv = box.getAttribute('uv');
  // BoxGeometry faces: +x, -x, +y, -y, +z, -z; four vertices each
  const faceWidth = [d, d, 0, 0, w, w];
  for (let face = 0; face < 6; face++) {
    for (let v = 0; v < 4; v++) {
      const i = face * 4 + v;
      if (faceWidth[face] === 0)
        uv.setXY(i, 0.03, 0.03); // roof and floor: plain wall
      else uv.setXY(i, (uv.getX(i) * faceWidth[face]!) / 4, (uv.getY(i) * h) / 3.4);
    }
  }
  return box.translate(0, h / 2, 0);
}

export function standInGeometry(id: ModelId): THREE.BufferGeometry {
  const def = MODELS[id];
  const { w, h, d } = dims(id);
  if (def.kind === 'building') return paint(windowBox(w, h, d), def.color);
  if (def.kind === 'vehicle') {
    const body = new THREE.BoxGeometry(w, h * 0.5, d).translate(0, h * 0.25 + 0.15, 0);
    const cabin = new THREE.BoxGeometry(w * 0.88, h * 0.42, d * 0.5).translate(
      0,
      h * 0.5 + 0.15 + h * 0.1,
      -d * 0.04,
    );
    return mergeGeometries([paint(body, def.color), paint(cabin, 0xdfe8ef)])!;
  }
  if (id === 'tree') {
    // all merged geometry must be indexed the same way; the icosahedron has no index
    const trunk = new THREE.CylinderGeometry(0.14, 0.2, h * 0.45, 6)
      .translate(0, h * 0.225, 0)
      .toNonIndexed();
    const crown = new THREE.IcosahedronGeometry(w * 0.5, 0).translate(0, h * 0.68, 0);
    return mergeGeometries([paint(trunk, 0x6b4a2f), paint(crown, def.color)])!;
  }
  return paint(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), def.color);
}

export function byModel(placements: readonly Placement[]): Map<ModelId, Placement[]> {
  const map = new Map<ModelId, Placement[]>();
  for (const p of placements) map.set(p.model, [...(map.get(p.model) ?? []), p]);
  return map;
}

// ---------------------------------------------------------------------------------------------
// the model look: the real models from the downloaded packs, instanced
// ---------------------------------------------------------------------------------------------

/** A cheaper material for the Low tier: no physically based lighting. */
export function lite(source: THREE.Material): THREE.Material {
  const s = source as THREE.MeshStandardMaterial;
  if (!s.isMeshStandardMaterial) return source;
  const material = new THREE.MeshLambertMaterial({
    color: s.color,
    map: s.map,
    transparent: s.transparent,
    opacity: s.opacity,
    alphaTest: s.alphaTest,
    side: s.side,
    vertexColors: s.vertexColors,
    // the loader turns this on for models with no normals; without it they render black
    flatShading: s.flatShading,
  });
  material.name = s.name;
  return material;
}

/**
 * A model exported with a mirrored axis has a negative-determinant transform. Normal meshes handle
 * that, but instanced ones do not, so the triangles end up inside out and render black. Return a
 * copy of the geometry with its triangle winding reversed.
 */
export function withFlippedWinding(source: THREE.BufferGeometry): THREE.BufferGeometry {
  const geometry = source.clone();
  const index = geometry.getIndex();
  if (!index) return geometry;
  const flipped = index.array.slice();
  for (let i = 0; i < flipped.length; i += 3) {
    const second = flipped[i + 1]!;
    flipped[i + 1] = flipped[i + 2]!;
    flipped[i + 2] = second;
  }
  geometry.setIndex(new THREE.BufferAttribute(flipped, 1));
  return geometry;
}

/** A piece of a model that is drawn with one draw call per block it appears in. */
export interface Piece {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  /** Transform applied before the placement: identity when it is already baked into the geometry. */
  local: THREE.Matrix4;
  owned: boolean;
}

/**
 * Bake every untextured mesh of a model into ONE geometry: the mesh's own transform is applied,
 * triangles become flat-shaded, and each material's colour becomes a vertex colour. A building with
 * seven materials then costs one draw call instead of seven.
 */
export function bakeUntextured(meshes: readonly THREE.Mesh[]): THREE.BufferGeometry | undefined {
  const positions: number[] = [];
  const colors: number[] = [];
  const v = new THREE.Vector3();
  for (const mesh of meshes) {
    const flat = mesh.geometry.toNonIndexed();
    const position = flat.getAttribute('position');
    const material = Array.isArray(mesh.material) ? mesh.material[0]! : mesh.material;
    const c = (material as THREE.MeshStandardMaterial).color ?? new THREE.Color(0xffffff);
    const mirrored = mesh.matrixWorld.determinant() < 0;
    for (let i = 0; i < position.count; i += 3) {
      // a mirrored transform turns triangles inside out; swap two corners to put them right again
      const order = mirrored ? [0, 2, 1] : [0, 1, 2];
      for (const k of order) {
        v.set(position.getX(i + k), position.getY(i + k), position.getZ(i + k)).applyMatrix4(
          mesh.matrixWorld,
        );
        positions.push(v.x, v.y, v.z);
        colors.push(c.r, c.g, c.b);
      }
    }
    flat.dispose();
  }
  if (positions.length === 0) return undefined;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export const hasTexture = (mesh: THREE.Mesh) =>
  Boolean(
    (
      (Array.isArray(mesh.material)
        ? mesh.material[0]
        : mesh.material) as THREE.MeshStandardMaterial
    )?.map,
  );
