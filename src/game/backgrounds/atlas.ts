interface AtlasPageSize { width: number; height: number }
interface AtlasRegionSize {
  page: AtlasPageSize;
  degrees: number;
  x: number;
  y: number;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  offsetX: number;
  offsetY: number;
}

export function resizeAtlasPage(regions: AtlasRegionSize[], page: AtlasPageSize, width: number, height: number) {
  const horizontal = width / page.width;
  const vertical = height / page.height;
  for (const region of regions) {
    if (region.page !== page) continue;
    const rotated = region.degrees === 90 || region.degrees === 270;
    const regionWidth = rotated ? vertical : horizontal;
    const regionHeight = rotated ? horizontal : vertical;
    region.x *= horizontal; region.y *= vertical;
    region.width *= regionWidth; region.originalWidth *= regionWidth; region.offsetX *= regionWidth;
    region.height *= regionHeight; region.originalHeight *= regionHeight; region.offsetY *= regionHeight;
  }
  page.width = width; page.height = height;
}
