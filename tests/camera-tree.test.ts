import { describe, expect, it } from 'vitest';
import { CameraController } from '../src/game/camera/CameraController';
import { createSkeleton, trunkX } from '../src/game/tree/geometry';

describe('巨树与镜头', () => {
  it('相同种子始终生成相同旧枝条和历史痕迹', () => {
    const first = createSkeleton(1027); const restored = createSkeleton(1027);
    expect(restored).toEqual(first); expect(first.some((branch) => branch.historical === 'first-leaf')).toBe(true); expect(first.some((branch) => branch.historical === 'freedom')).toBe(true);
    expect(trunkX(100)).toBe(trunkX(100));
  });
  it('自由镜头有上下边界，重要演出锁定后不能手动移动', () => {
    const camera = new CameraController(); camera.resize(1440, 900, 3100);
    expect(camera.move(99999)).toBe(camera.maximum); camera.locked = true; expect(camera.move(-99999)).toBe(camera.maximum);
    camera.locked = false; expect(camera.move(-99999)).toBe(0);
  });
  it('窗口尺寸变化后相机被夹回有效范围', () => {
    const camera = new CameraController(); camera.resize(1440, 600, 3100); camera.move(99999); camera.resize(1440, 900, 400);
    expect(camera.position).toBe(0); expect(camera.maximum).toBe(0); expect(camera.target).toBe(0);
  });
  it('桌面与手机比例都给完整树冠预留顶部空间', () => {
    for (const viewport of [{ width: 1440, height: 900, scale: 1 }, { width: 844, height: 390, scale: 0.43 }]) {
      const camera = new CameraController(); const physicalHeight = 1360 * viewport.scale;
      camera.resize(viewport.width, viewport.height, physicalHeight, viewport.scale);
      const crownAnchor = viewport.height - 40 - 100 * viewport.scale - physicalHeight + camera.maximum;
      expect(crownAnchor - 125 * viewport.scale).toBeGreaterThanOrEqual(79);
    }
  });
});
