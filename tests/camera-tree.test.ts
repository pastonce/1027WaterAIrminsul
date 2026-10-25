import { describe, expect, it } from 'vitest';
import { CameraController } from '../src/game/camera/CameraController';
import { createTreeModel } from '../src/game/tree/model';
import { getTreeHeight } from '../src/game/growth/GrowthSystem';

describe('原智慧树组织与镜头', () => {
  it('相同动画时刻恢复相同原始槽位，不再生成额外旧枝或接干', () => {
    expect(createTreeModel(40, .25)).toEqual(createTreeModel(40, .25));
    expect(createTreeModel(51).parts.map((part) => part.id)).toEqual(['tree9', 'grass', 'overlay9']);
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
  it('新树形在桌面无需追逐超高树冠，手机也只有小范围镜头移动', () => {
    const desktop = new CameraController(); desktop.resize(1440, 900, getTreeHeight(1027));
    expect(desktop.maximum).toBe(0);
    const mobile = new CameraController(); mobile.resize(844, 390, getTreeHeight(1000) * .43, .43);
    expect(mobile.maximum).toBeLessThan(100);
  });
});
