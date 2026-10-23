import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { completeLoadingArtChoices, getLoadingArt, loadingArtSource, STAGE_LOADING_ART, validateLoadingArtChoices } from '../src/data/stageLoading';
import pageAssets from '../src/data/pageAssets.generated.json' with { type: 'json' };
import { DialogueBubble } from '../src/components/DialogueBubble';
import { STAGES } from '../src/data/stages';
import { validateSave } from '../src/game/save/SaveManager';
import { getStageBackground, backgroundFiles } from '../src/data/backgrounds';
import { ASSETS } from '../src/data/assets';
import type { SpeechPlayback } from '../src/types/game';
import { startScene, testGame } from './support';

describe('转场素材抽选与按需下载', () => {
  it('五组双图独立等概率抽选，最终单图不浪费随机调用', () => {
    const first = completeLoadingArtChoices({}, () => 0);
    const last = completeLoadingArtChoices({}, () => 0.999);
    expect(first).toEqual({ B: 'AB1', C: 'BC1', D: 'CD1', E: 'DE1', F: 'EF1', G: 'FG1' });
    expect(last).toEqual({ B: 'AB2', C: 'BC2', D: 'CD2', E: 'DE2', F: 'EF2', G: 'FG1' });
    const random = vi.fn(() => 0);
    expect(completeLoadingArtChoices({ B: 'AB2' }, random).B).toBe('AB2'); expect(random).toHaveBeenCalledTimes(4);
    expect(Object.values(STAGE_LOADING_ART).flat()).toHaveLength(11);
  });

  it('只接受对应图片 ID，不能串段或把存档变成外链 / 路径', () => {
    expect(validateLoadingArtChoices({ A: 'AB1', B: 'BC1', C: 'https://example.com/a.jpg', D: 'CD2', G: 'FG2' })).toEqual({ D: 'CD2' });
    expect(getLoadingArt('B', 'EF1')?.id).toBe('AB1'); expect(getLoadingArt('A')).toBeUndefined();
    expect(validateSave({ loadingArtChoices: { B: 'AB2', F: '../../a' } }).loadingArtChoices).toEqual({ B: 'AB2' });
    expect(validateSave({ version: 2 }).loadingArtChoices).toEqual({});
  });

  it('同页选择保持，重新进入时由开场重抽，重置清除该轮选择', () => {
    const { game, storage, clock } = testGame();
    game.setSuspended(true); startScene(game); expect(game.getSnapshot().save.loadingArtChoices).toEqual({});
    game.setSuspended(false); const choices = game.getSnapshot().save.loadingArtChoices;
    expect(Object.keys(choices)).toHaveLength(6); game.tick(); expect(game.getSnapshot().save.loadingArtChoices).toEqual(choices); game.stop();
    const restored = testGame({ ...game.getSnapshot().save }, clock, storage).game;
    restored.prepareOpeningAssets(); startScene(restored); expect(restored.getSnapshot().save.loadingArtChoices).toEqual(completeLoadingArtChoices({}, () => .99));
    restored.reset(); expect(restored.getSnapshot().save.loadingArtChoices).toEqual({}); restored.stop();
  });

  it('横屏和高 DPI 按预算只选一个规格，CD2 从左侧裁掉留白后仍等比', () => {
    const artwork = getLoadingArt('D', 'CD2')!;
    expect(loadingArtSource(artwork, 844, 390, 3)).toBe(artwork.compact);
    expect(loadingArtSource(artwork, 1440, 900, 3)).toBe(artwork.full);
    expect(loadingArtSource(artwork, 640, 360, 1)).toBe(artwork.compact);
    expect(artwork.cropped).toBe(true); expect(artwork.aspect).toBeCloseTo(16 / 9);
    const styles = readFileSync('src/styles/loading.css', 'utf8');
    expect(styles).toContain('object-fit:cover'); expect(styles).toContain('.stage-loading-artwork{position:absolute;inset:0;');
    expect(styles).toContain('[data-illustration=CD2]{object-position:right center}'); expect(styles).not.toContain('transition:width');
  });
});

describe('图片派生、原图保护与界面替换', () => {
  it('十四张原图哈希不变，派生内容 / 规格有登记，总传输体积低于原图十分之一', () => {
    const manifest = JSON.parse(readFileSync('docs/page-assets.manifest.json', 'utf8')) as { sourceBytes: number; publishedBytes: number; inputs: Array<{ file: string; bytes: number; sha256: string; cropLeft: number }>; files: Array<{ file: string; bytes: number; sha256: string; width: number; height: number; source: string }> };
    expect(manifest.inputs).toHaveLength(14); expect(manifest.publishedBytes).toBeLessThan(manifest.sourceBytes / 10);
    for (const file of [...manifest.inputs, ...manifest.files]) {
      const bytes = readFileSync(file.file); expect(bytes.length).toBe(file.bytes);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(file.sha256);
    }
    expect(manifest.inputs.find((entry) => entry.file.endsWith('CD2.png'))?.cropLeft).toBe(580);
    for (const file of manifest.files.filter((entry) => entry.file.includes('/loading/art/'))) {
      expect([1280, 1920]).toContain(file.width); expect(file.height).toBeLessThanOrEqual(1200); expect(file.bytes).toBeLessThan(400 * 1024);
    }
    expect(pageAssets.dialogue.endsWith('.jpg')).toBe(true);
    const icon = readFileSync(`public${pageAssets.icon}`); expect(icon.readUInt32BE(16)).toBe(128); expect(icon.readUInt32BE(20)).toBe(128);
    expect(readFileSync('index.html', 'utf8')).toContain('type="image/png"');
  });

  it('F 恢复原无 Role 动态背景与真实花叶藏点，G 只替换静态底图', () => {
    const background = getStageBackground('F')!;
    expect(background.layers).toHaveLength(1); expect(background.layers[0].animation).toBe('loop'); expect(background.layers[0].textures).toHaveLength(14);
    expect(backgroundFiles(background).some((entry) => entry.src === pageAssets.realityBackground)).toBe(false);
    expect(background.hiding?.cuts.map((cut) => cut.slot)).toEqual(['layer_18_Flower/flower_sub_4_07', 'layer_19_Grasses/leaf_l6_1']);
    expect(getStageBackground('G')).toBeNull(); expect(ASSETS.realityBackground.src).toBe(pageAssets.realityBackground);
    expect(ASSETS.realityBackground.source).toContain('asserts/background.png');
    const report = JSON.parse(readFileSync('docs/inhabitants/hiding-calibration.json', 'utf8')) as Array<{ stage: string; ratio: number }>;
    const current = report.filter((entry) => entry.stage === 'F'); expect(current).toHaveLength(36);
    expect(current.every((entry) => entry.ratio >= 0.08 && entry.ratio < 0.65)).toBe(true);
  });

  it('仅纳西妲对白填充新图，改深色文字并保持自动气泡及读屏语义', () => {
    const speech: SpeechPlayback = { entry: STAGES.A.visit.dialogue[0], anchor: 'nahida', sequence: 1, phase: 'speaking', startedAt: Date.now(), elapsedMs: 0, typingMs: 0 };
    const render = (anchor: 'tree' | 'nahida') => renderToStaticMarkup(createElement(DialogueBubble, { speech: { ...speech, anchor, entry: anchor === 'tree' ? STAGES.A.dialogue[0] : speech.entry }, position: {}, reduced: true }));
    expect(render('nahida')).toContain(pageAssets.dialogue); expect(render('tree')).not.toContain(pageAssets.dialogue);
    expect(render('nahida')).toContain('role="status"'); expect(render('nahida')).not.toContain('<button');
    expect(render('nahida')).toContain('data-theme="nahida"');
    expect(readFileSync('src/styles/dialogue-themes.css', 'utf8')).toContain('--bubble-ink: #203d2e');
  });
});
