import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, quantize, simplify, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

export interface OptimizeOptions {
  /**
   * Fraction of triangles to keep, from 0 to 1. 1 keeps every triangle and only compresses.
   * Use about 0.25 for distant versions of characters and vehicles.
   */
  ratio?: number;
  /** Largest allowed geometric error, as a fraction of the model size. */
  error?: number;
}

export interface OptimizeResult {
  trianglesBefore: number;
  trianglesAfter: number;
  bytesBefore: number;
  bytesAfter: number;
}

function countTriangles(doc: Awaited<ReturnType<NodeIO['readBinary']>>): number {
  let triangles = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const indices = prim.getIndices();
      const position = prim.getAttribute('POSITION');
      triangles += indices ? indices.getCount() / 3 : (position?.getCount() ?? 0) / 3;
    }
  }
  return Math.round(triangles);
}

/**
 * Weld, simplify, dedupe, quantize and meshopt-compress a GLB.
 * The client needs the meshopt decoder to read the result.
 * Texture compression (KTX2) is a later step because it needs an external encoder.
 */
export async function optimizeGlb(
  input: Uint8Array,
  opts: OptimizeOptions = {},
): Promise<{ glb: Uint8Array } & OptimizeResult> {
  await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready, MeshoptSimplifier.ready]);

  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

  const doc = await io.readBinary(input);
  const trianglesBefore = countTriangles(doc);
  const ratio = opts.ratio ?? 1;

  const steps = [weld()];
  if (ratio < 1)
    steps.push(simplify({ simplifier: MeshoptSimplifier, ratio, error: opts.error ?? 0.01 }));
  steps.push(dedup(), prune(), quantize(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await doc.transform(...steps);

  const glb = await io.writeBinary(doc);
  return {
    glb,
    trianglesBefore,
    trianglesAfter: countTriangles(doc),
    bytesBefore: input.byteLength,
    bytesAfter: glb.byteLength,
  };
}
