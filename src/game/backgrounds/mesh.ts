import type { BackgroundMesh } from '../../data/backgrounds';

export interface BackgroundMeshGeometry {
  attributes: { position: { array: number[] }; uv: { array: number[] } };
  index: number[];
}

export function projectBackgroundMesh(geometry: BackgroundMeshGeometry, transform: Omit<BackgroundMesh, 'geometry'>) {
  const positions = geometry.attributes.position.array;
  const coordinates = geometry.attributes.uv.array;
  const count = positions.length / 3;
  if (!Number.isInteger(count) || count > 65535 || coordinates.length !== count * 2 || geometry.index.some((index) => !Number.isInteger(index) || index < 0 || index >= count)) throw new Error('background-mesh');
  const vertices = new Float32Array(count * 12);
  const cosine = Math.cos(transform.rotationX); const sine = Math.sin(transform.rotationX);
  for (let index = 0; index < count; index++) {
    const horizontal = positions[index * 3];
    const localVertical = positions[index * 3 + 1] + transform.localVertical;
    const localDepth = positions[index * 3 + 2];
    const vertical = localVertical * cosine - localDepth * sine + transform.vertical;
    const depth = localVertical * sine + localDepth * cosine;
    const scale = transform.cameraDepth / (transform.cameraDepth - depth);
    if (!Number.isFinite(scale) || scale <= 0) throw new Error('background-mesh-camera');
    vertices.set([horizontal * scale, vertical * scale, 1, 1, 1, 1, coordinates[index * 2], 1 - coordinates[index * 2 + 1], 0, 0, 0, 0], index * 12);
  }
  return { vertices, indices: geometry.index };
}
