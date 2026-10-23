import { describe, expect, it } from 'vitest';
import { BACKGROUND_ASSETS } from '../src/data/backgrounds';
import { backgroundBasePlane, backgroundProjection, forestGround } from '../src/game/backgrounds/projection';
import { entrancePose, FOREST_ENTRANCE_SECONDS } from '../src/game/backgrounds/entrance';
import { backgroundView, BACKGROUND_RULES } from '../src/game/backgrounds/policy';

describe('统一入梦取景与固定地面锚点', () => {
  it.each([[1440, 900], [844, 390], [640, 360], [2560, 1080]])('%s × %s 开场、底图和 WebGL 用相同投影，防露边不增加放大', (width, height) => {
    const asset = BACKGROUND_ASSETS.forest; const overscan = BACKGROUND_RULES.overscan;
    const plane = backgroundBasePlane(asset, width, height, 0, overscan)!;
    const view = backgroundView(width, height, asset.view);
    const scale = width / view.width;
    expect(plane.width * overscan).toBeCloseTo(asset.baseBounds!.width * scale);
    expect((plane.top - height / 2) * overscan).toBeCloseTo(-(asset.baseBounds!.vertical + asset.baseBounds!.height / 2 + entrancePose(asset.baseEntrance, 0).vertical) * scale);
    expect(backgroundBasePlane(asset, width, height, 0, overscan)).toEqual(plane);
    expect(backgroundBasePlane(asset, width, height, FOREST_ENTRANCE_SECONDS, overscan)!.width).toBe(plane.width);
  });

  it.each([[1440, 900, 1], [844, 390, 220 / 510], [640, 360, 190 / 510]])('%s × %s 树苗最初在屏幕下方，与倒木同速上移，终态落在固定世界坐标', (width, height, treeScale) => {
    const asset = BACKGROUND_ASSETS.forest;
    const ground = forestGround(asset, width, height, 0)!;
    expect(ground.root + ground.entrance - 230 * treeScale).toBeGreaterThan(height);
    const worldScale = backgroundProjection(width, height, asset.view);
    const foreground = asset.layers.find((layer) => layer.json.src.endsWith('/qianjin.json'))!;
    for (let frame = 0; frame <= 61; frame++) {
      const sample = forestGround(asset, width, height, frame / 18)!;
      const logOffset = -entrancePose(foreground.entrance, frame / 18).vertical * worldScale;
      expect(sample.root + sample.entrance - logOffset).toBeCloseTo(ground.root);
      expect((height / 2 - sample.root) / worldScale).toBeCloseTo(-360);
    }
    expect(forestGround(asset, width, height, Infinity)!.entrance).toBe(0);
  });

  it('其他背景不继承森林地面位移，缺少几何不伪造固定平面', () => {
    expect(forestGround(BACKGROUND_ASSETS.dunes, 1440, 900, 0)).toBeNull();
    expect(forestGround(null, 1440, 900, 0)).toBeNull();
    expect(backgroundBasePlane(BACKGROUND_ASSETS.sanctuary, 1440, 900, 0)).toBeNull();
  });
});
