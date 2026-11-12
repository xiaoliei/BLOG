// Optional derived mesh cache; the world save remains the only source of truth.
import type { Face, MeshChunk } from "./mesher.ts";

export const MESH_VERSION = 1;

interface MeshCacheFile {
  version: number;
  sourceHash: string;
  materials: string[];
  owners: [string | null, string | null][];
  chunks: { chunk: string; transparent: boolean; faces: number[][] }[];
}

function index<T>(value: T, values: T[], ids: Map<string, number>): number {
  const k = JSON.stringify(value);
  if (!ids.has(k)) { ids.set(k, values.length); values.push(value); }
  return ids.get(k) as number;
}

export function encodeMesh(chunks: readonly MeshChunk[], sourceHash: string): string {
  const materials: string[] = [], materialIds = new Map<string, number>(), owners: [string | null, string | null][] = [], ownerIds = new Map<string, number>();
  return JSON.stringify({
    version: MESH_VERSION, sourceHash, materials, owners,
    chunks: chunks.map(c => ({
      chunk: c.chunk, transparent: c.transparent,
      faces: c.faces.map(f => [f.axis, f.sign, f.plane, ...f.rect, index(f.color, materials, materialIds), index([f.place, f.instance], owners, ownerIds)]),
    })),
  }) + '\n';
}

export function decodeMesh(text: string, sourceHash: string): MeshChunk[] {
  if (text.length > 24_000_000) throw new Error('Mesh cache too large');
  const data: unknown = JSON.parse(text);
  if (!isMeshCacheFile(data) || data.version !== MESH_VERSION || data.sourceHash !== sourceHash || data.chunks.length > 8192) throw new Error('Stale mesh cache');
  if (!data.materials.every(c => /^#[\da-f]{6}$/i.test(c)) || !data.owners.every(o => o.every(v => v === null || typeof v === 'string'))) throw new Error('Invalid mesh palette');
  let count = 0;
  return data.chunks.map(c => {
    if (typeof c.chunk !== 'string' || !Array.isArray(c.faces) || typeof c.transparent !== 'boolean') throw new Error('Invalid mesh chunk');
    const faces = c.faces.map(f => {
      if (++count > 400000 || !Array.isArray(f) || f.length !== 9 || !f.every(Number.isFinite) || ![0, 1, 2].includes(f[0]) || ![-1, 1].includes(f[1]) || f[5] <= f[3] || f[6] <= f[4] || !data.materials[f[7]] || !data.owners[f[8]]) throw new Error('Invalid cached face');
      const owner = data.owners[f[8]];
      // Shapes above are runtime-validated; narrow to the Face geometry types.
      return { axis: f[0] as Face['axis'], sign: f[1] as Face['sign'], plane: f[2], rect: f.slice(3, 7) as Face['rect'], color: data.materials[f[7]], place: owner[0], instance: owner[1] };
    });
    return { chunk: c.chunk, transparent: c.transparent, faces };
  });
}

function isMeshCacheFile(data: unknown): data is MeshCacheFile {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  return typeof d.version === 'number' && typeof d.sourceHash === 'string'
    && Array.isArray(d.materials) && Array.isArray(d.owners) && Array.isArray(d.chunks)
    && d.materials.every(c => typeof c === 'string')
    && d.owners.every(o => Array.isArray(o) && o.length === 2)
    && d.chunks.every(c => typeof c === 'object' && c !== null);
}

export async function sourceDigest(text: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(hash)].map(n => n.toString(16).padStart(2, '0')).join('');
}
