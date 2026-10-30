import * as THREE from 'three';
import {
  FURNITURE_SCALE,
  UNITS,
  doorCells,
  doorSpot,
  footprint,
  furnitureById,
  type FurnitureCategory,
  type FurnitureDef,
  type Placed,
  type Rotation,
  type UnitDef,
  type UnitId,
} from '@alexioncity/shared';
import type { AssetStore } from './assets';
import { approachAngle } from './cameras';

const WALL_HEIGHT = 2.7;
const WALL_THICKNESS = 0.18;
const ELEVATION = (52 * Math.PI) / 180;

/** Stand-in colour per category, shown until the furniture models are downloaded. */
const CATEGORY_COLOR: Record<FurnitureCategory, number> = {
  bedroom: 0x7aa7e8,
  bathroom: 0x8fd3d0,
  kitchen: 0xd9d4c8,
  living: 0xe8895b,
  dining: 0xc9a373,
  office: 0x9a8fd6,
  decor: 0x8bc47e,
};

/** Roughly how tall each kind of thing is, for the stand-in boxes. */
function standInHeight(def: FurnitureDef): number {
  if (def.flat) return 0.03;
  if (def.id.startsWith('bed')) return 0.55;
  if (def.id.startsWith('fridge')) return 1.8;
  if (def.id === 'shower') return 2;
  if (def.id === 'bathtub') return 0.6;
  if (def.id.startsWith('sofa') || def.id === 'armchair') return 0.85;
  if (
    def.id.startsWith('lamp') ||
    def.id === 'plant' ||
    def.id === 'coat-rack' ||
    def.id === 'speaker'
  )
    return 1.5;
  if (def.id.startsWith('bookcase')) return 1.6;
  if (def.id.startsWith('table') || def.id.startsWith('desk') || def.id.startsWith('coffee'))
    return 0.75;
  return 0.9;
}

export interface Ghost {
  item: string;
  /** Top-left floor cell after turning. */
  x: number;
  z: number;
  rot: Rotation;
  valid: boolean;
}

export interface Hit {
  /** The floor cell under the pointer, if the pointer is over the floor. */
  cell?: { x: number; z: number };
  /** The furniture under the pointer, if any. */
  pieceId?: string;
}

/**
 * A home seen from above at an angle, with the two walls nearest the camera left out so the whole room
 * shows. It draws what the server says is in the home, shows a grid and a ghost while arranging, and turns
 * a screen tap into a floor cell or a piece of furniture.
 */
export class Interior {
  readonly group = new THREE.Group();
  private unit: UnitDef | undefined;
  private readonly shell = new THREE.Group();
  private readonly furniture = new THREE.Group();
  private readonly walls = new Map<'N' | 'S' | 'W' | 'E', THREE.Object3D>();
  private readonly pieces = new Map<string, THREE.Object3D>();
  private readonly templates = new Map<string, THREE.Object3D>();
  private readonly ghostMaterials = {
    ok: new THREE.MeshBasicMaterial({
      color: 0x3ddc84,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    }),
    bad: new THREE.MeshBasicMaterial({
      color: 0xff5a5a,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    }),
  };
  private grid: THREE.LineSegments | undefined;
  private ghost: THREE.Object3D | undefined;
  private ghostKey = '';
  private selection: THREE.LineSegments | undefined;
  private layout: Placed[] = [];
  private store: AssetStore | undefined;
  private view = 0;
  private azimuth = Math.PI / 4;
  private readonly raycaster = new THREE.Raycaster();
  private readonly floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private editing = false;
  private selectedId: string | undefined;
  private disposed = false;

  constructor() {
    this.group.add(this.shell, this.furniture);
    this.group.visible = false;
  }

  get active(): boolean {
    return this.group.visible;
  }

  get size(): { w: number; d: number } {
    return this.unit ? { w: this.unit.w, d: this.unit.d } : { w: 0, d: 0 };
  }

  /** Show a home. Call again with the same unit to refresh the furniture. */
  show(unitId: UnitId, layout: readonly Placed[]): void {
    const unit = UNITS[unitId];
    if (this.unit?.id !== unit.id) {
      this.unit = unit;
      this.buildShell(unit);
      this.buildGrid(unit);
    }
    this.group.visible = true;
    this.setLayout(layout);
    this.applyWalls();
  }

  hide(): void {
    this.group.visible = false;
    this.setGhost(undefined);
    this.select(undefined);
    this.editing = false;
    if (this.grid) this.grid.visible = false;
  }

  /** Use the furniture models from the downloaded pack. Safe to call again after more has been downloaded. */
  async useModels(store: AssetStore): Promise<void> {
    this.store = store;
    if (!store.has('interiors')) return;
    await this.loadTemplates(new Set(this.layout.map((p) => p.item)));
    if (!this.disposed) this.rebuildPieces();
  }

  setLayout(layout: readonly Placed[]): void {
    this.layout = [...layout];
    // pieces are cheap to rebuild and a home holds at most 80
    this.rebuildPieces();
    if (this.store?.has('interiors')) {
      const missing = new Set(layout.map((p) => p.item).filter((i) => !this.templates.has(i)));
      if (missing.size > 0)
        void this.loadTemplates(missing).then(() => {
          if (!this.disposed) this.rebuildPieces();
        });
    }
  }

  setEditing(on: boolean): void {
    this.editing = on;
    if (this.grid) this.grid.visible = on;
    if (!on) {
      this.setGhost(undefined);
      this.select(undefined);
    }
  }

  /** Turn the view a quarter turn around the room. */
  turn(): void {
    this.view = (this.view + 1) % 4;
    this.applyWalls();
  }

  // ---------------------------------------------------------------------------------------------
  // building

  private buildShell(unit: UnitDef): void {
    this.shell.clear();
    this.walls.clear();
    const { w, d } = unit;

    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(w + WALL_THICKNESS * 2, 0.12, d + WALL_THICKNESS * 2),
      new THREE.MeshLambertMaterial({ color: 0xcfa77a }),
    );
    floor.position.set(w / 2, -0.06, d / 2);
    // a lighter inlay so the floor reads as boards, not a slab
    const boards = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: 0xdcb98a }),
    );
    boards.position.set(w / 2, 0.002, d / 2);
    this.shell.add(floor, boards);

    const wallMat = new THREE.MeshLambertMaterial({ color: 0xf3ede3 });
    const trimMat = new THREE.MeshLambertMaterial({ color: 0xb79a77 });
    const glassMat = new THREE.MeshBasicMaterial({
      color: 0xa8d4ff,
      transparent: true,
      opacity: 0.55,
    });
    const frameMat = new THREE.MeshLambertMaterial({ color: 0xffffff });

    const box = (
      mat: THREE.Material,
      sx: number,
      sy: number,
      sz: number,
      x: number,
      y: number,
      z: number,
    ) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
      m.position.set(x, y, z);
      return m;
    };

    // north wall (z = 0) has the doorway
    const door = doorCells(unit);
    const north = new THREE.Group();
    const t = WALL_THICKNESS;
    // the two wall pieces either side of the doorway, running out to the corners
    north.add(box(wallMat, door.x + t, WALL_HEIGHT, t, (door.x - t) / 2, WALL_HEIGHT / 2, -t / 2));
    const rightStart = door.x + door.w;
    north.add(
      box(
        wallMat,
        w - rightStart + t,
        WALL_HEIGHT,
        t,
        (rightStart + w + t) / 2,
        WALL_HEIGHT / 2,
        -t / 2,
      ),
    );
    north.add(
      box(
        wallMat,
        door.w,
        WALL_HEIGHT - 2.15,
        t,
        door.x + door.w / 2,
        2.15 + (WALL_HEIGHT - 2.15) / 2,
        -t / 2,
      ),
    );
    // a darker frame so the doorway is easy to see
    north.add(box(trimMat, 0.08, 2.15, t + 0.04, door.x, 1.075, -t / 2));
    north.add(box(trimMat, 0.08, 2.15, t + 0.04, door.x + door.w, 1.075, -t / 2));
    north.add(box(trimMat, door.w + 0.08, 0.08, t + 0.04, door.x + door.w / 2, 2.15, -t / 2));
    this.addWall('N', north);

    const south = new THREE.Group();
    south.add(box(wallMat, w + 2 * t, WALL_HEIGHT, t, w / 2, WALL_HEIGHT / 2, d + t / 2));
    this.addWall('S', south);

    // west wall (x = 0) has two windows
    const west = new THREE.Group();
    west.add(box(wallMat, t, WALL_HEIGHT, d + 2 * t, -t / 2, WALL_HEIGHT / 2, d / 2));
    for (const zc of [d * 0.3, d * 0.7]) {
      west.add(box(glassMat, 0.04, 1.1, 1.5, 0.02, 1.6, zc));
      west.add(box(frameMat, 0.06, 0.08, 1.6, 0.03, 1.05, zc));
      west.add(box(frameMat, 0.06, 0.08, 1.6, 0.03, 2.15, zc));
      west.add(box(frameMat, 0.06, 1.16, 0.08, 0.03, 1.6, zc - 0.75));
      west.add(box(frameMat, 0.06, 1.16, 0.08, 0.03, 1.6, zc + 0.75));
    }
    this.addWall('W', west);

    const east = new THREE.Group();
    east.add(box(wallMat, t, WALL_HEIGHT, d + 2 * t, w + t / 2, WALL_HEIGHT / 2, d / 2));
    this.addWall('E', east);

    // a baseboard along the two back walls reads as a room, even when the walls are hidden
    for (const [sx, sz, x, z] of [
      [w, 0.06, w / 2, 0.03],
      [0.06, d, 0.03, d / 2],
    ] as const)
      this.shell.add(box(trimMat, sx, 0.14, sz, x, 0.07, z));
  }

  private addWall(side: 'N' | 'S' | 'W' | 'E', wall: THREE.Object3D): void {
    this.walls.set(side, wall);
    this.shell.add(wall);
  }

  private buildGrid(unit: UnitDef): void {
    if (this.grid) {
      this.group.remove(this.grid);
      this.grid.geometry.dispose();
    }
    const points: number[] = [];
    for (let x = 0; x <= unit.w; x++) points.push(x, 0.02, 0, x, 0.02, unit.d);
    for (let z = 0; z <= unit.d; z++) points.push(0, 0.02, z, unit.w, 0.02, z);
    const geometry = new THREE.BufferGeometry().setAttribute(
      'position',
      new THREE.Float32BufferAttribute(points, 3),
    );
    this.grid = new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({ color: 0x6b5a45, transparent: true, opacity: 0.35 }),
    );
    this.grid.visible = this.editing;
    this.group.add(this.grid);
  }

  /** Hide the two walls between the camera and the room. */
  private applyWalls(): void {
    const sx = [1, -1, -1, 1][this.view]!;
    const sz = [1, 1, -1, -1][this.view]!;
    this.walls.get('E')!.visible = sx < 0;
    this.walls.get('W')!.visible = sx > 0;
    this.walls.get('S')!.visible = sz < 0;
    this.walls.get('N')!.visible = sz > 0;
  }

  // ---------------------------------------------------------------------------------------------
  // furniture

  private async loadTemplates(items: Set<string>): Promise<void> {
    const store = this.store;
    if (!store) return;
    await Promise.all(
      [...items].map(async (item) => {
        const def = furnitureById(item);
        if (!def || this.templates.has(item)) return;
        try {
          const gltf = await store.gltf('interiors', def.file);
          this.templates.set(item, this.normalise(gltf.scene));
        } catch {
          // this model is not on the device: the stand-in box stays
        }
      }),
    );
  }

  /** Scale a model to real size and put its centre on the origin with its feet on the floor. */
  private normalise(source: THREE.Object3D): THREE.Object3D {
    const inner = source.clone(true);
    inner.scale.setScalar(FURNITURE_SCALE);
    const holder = new THREE.Group();
    holder.add(inner);
    const box = new THREE.Box3().setFromObject(holder);
    inner.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
    return holder;
  }

  private standIn(
    def: FurnitureDef,
    w: number,
    d: number,
    material?: THREE.Material,
  ): THREE.Object3D {
    const h = standInHeight(def);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w - 0.12, h, d - 0.12),
      material ?? new THREE.MeshLambertMaterial({ color: CATEGORY_COLOR[def.category] }),
    );
    mesh.position.y = h / 2;
    // a stand-in owns its box (and its colour, unless it borrows the ghost's); models are shared
    mesh.userData.own = true;
    mesh.userData.ownMaterial = !material;
    const holder = new THREE.Group();
    holder.add(mesh);
    return holder;
  }

  /** The model (or stand-in) for an item, turned and placed on its cells. */
  private build(
    def: FurnitureDef,
    x: number,
    z: number,
    rot: Rotation,
    material?: THREE.Material,
  ): THREE.Object3D {
    const fp = footprint(def, rot);
    const template = this.templates.get(def.id);
    let object: THREE.Object3D;
    if (template && !material) {
      object = template.clone(true);
      object.rotation.y = rot * (Math.PI / 2);
    } else if (template && material) {
      object = template.clone(true);
      object.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = material;
      });
      object.rotation.y = rot * (Math.PI / 2);
    } else {
      // a stand-in is sized to the turned footprint, so it needs no turning
      object = this.standIn(def, fp.w, fp.d, material);
    }
    const holder = new THREE.Group();
    holder.add(object);
    holder.position.set(x + fp.w / 2, def.flat ? 0.01 : 0, z + fp.d / 2);
    return holder;
  }

  private rebuildPieces(): void {
    for (const piece of this.pieces.values()) this.disposeObject(piece);
    this.furniture.clear();
    this.pieces.clear();
    for (const p of this.layout) {
      const def = furnitureById(p.item);
      if (!def) continue;
      const object = this.build(def, p.x, p.z, p.rot);
      object.userData.id = p.id;
      this.furniture.add(object);
      this.pieces.set(p.id, object);
    }
    this.select(this.selectedId && this.pieces.has(this.selectedId) ? this.selectedId : undefined);
  }

  // ---------------------------------------------------------------------------------------------
  // arranging

  setGhost(ghost: Ghost | undefined): void {
    const key = ghost
      ? `${ghost.item}|${ghost.x}|${ghost.z}|${ghost.rot}|${ghost.valid}|${this.templates.size}`
      : '';
    if (key === this.ghostKey) return;
    this.ghostKey = key;
    if (this.ghost) {
      this.ghost.removeFromParent();
      this.disposeObject(this.ghost);
      this.ghost = undefined;
    }
    const def = ghost && furnitureById(ghost.item);
    if (!ghost || !def) return;
    this.ghost = this.build(
      def,
      ghost.x,
      ghost.z,
      ghost.rot,
      ghost.valid ? this.ghostMaterials.ok : this.ghostMaterials.bad,
    );
    this.ghost.position.y += 0.02;
    this.group.add(this.ghost);
  }

  /** Outline one piece of furniture. */
  select(id: string | undefined): void {
    this.selectedId = id;
    if (this.selection) {
      this.selection.removeFromParent();
      this.selection.geometry.dispose();
      this.selection = undefined;
    }
    const piece = id ? this.pieces.get(id) : undefined;
    if (!piece) {
      this.selectedId = undefined;
      return;
    }
    const box = new THREE.Box3().setFromObject(piece);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    this.selection = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(size.x + 0.08, size.y + 0.08, size.z + 0.08)),
      new THREE.LineBasicMaterial({ color: 0xffb21a }),
    );
    this.selection.position.copy(center);
    this.group.add(this.selection);
  }

  /** World position of the centre of a piece, for putting the player next to it. */
  pieceCentre(id: string): { x: number; z: number } | undefined {
    const p = this.pieces.get(id);
    return p ? { x: p.position.x, z: p.position.z } : undefined;
  }

  /** What is under a point on screen (`ndc` in -1..1). */
  pick(ndcX: number, ndcY: number, camera: THREE.Camera): Hit {
    if (!this.unit) return {};
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
    const hit: Hit = {};
    const point = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.floorPlane, point)) {
      const x = Math.floor(point.x);
      const z = Math.floor(point.z);
      if (x >= 0 && z >= 0 && x < this.unit.w && z < this.unit.d) hit.cell = { x, z };
    }
    const hits = this.raycaster.intersectObjects(this.furniture.children, true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o && o.userData.id === undefined) o = o.parent;
      if (o) {
        hit.pieceId = o.userData.id as string;
        break;
      }
    }
    return hit;
  }

  // ---------------------------------------------------------------------------------------------
  // camera

  /** Where the camera should be to see the whole room on a screen of this shape. */
  pose(
    aspect: number,
    fov: number,
    dt: number,
  ): { position: THREE.Vector3; target: THREE.Vector3 } {
    const unit = this.unit ?? UNITS.studio;
    const sx = [1, -1, -1, 1][this.view]!;
    const sz = [1, 1, -1, -1][this.view]!;
    this.azimuth = approachAngle(this.azimuth, Math.atan2(sx, sz), dt, 8);
    const target = new THREE.Vector3(unit.w / 2, 0.5, unit.d / 2);
    // distance that fits the room's diagonal across the narrower side of the screen
    const vHalf = (fov * Math.PI) / 360;
    const hHalf = Math.atan(Math.tan(vHalf) * aspect);
    const half = Math.min(vHalf, hHalf);
    const radius = (Math.hypot(unit.w, unit.d) / 2 + 1.2) / Math.tan(half);
    const flat = Math.cos(ELEVATION) * radius;
    const position = new THREE.Vector3(
      target.x + Math.sin(this.azimuth) * flat,
      target.y + Math.sin(ELEVATION) * radius,
      target.z + Math.cos(this.azimuth) * flat,
    );
    return { position, target };
  }

  /** Where the player stands just inside the door. */
  doorSpot(): { x: number; z: number } {
    return doorSpot(this.unit ?? UNITS.studio);
  }

  // ---------------------------------------------------------------------------------------------

  private disposeObject(object: THREE.Object3D): void {
    object.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !mesh.userData.own) return;
      mesh.geometry.dispose();
      if (mesh.userData.ownMaterial) (mesh.material as THREE.Material).dispose();
    });
  }

  dispose(): void {
    this.disposed = true;
    this.hide();
    this.shell.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
    });
    this.grid?.geometry.dispose();
    this.ghostMaterials.ok.dispose();
    this.ghostMaterials.bad.dispose();
  }
}
