import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome', headless: true });
let result;
try {
  const page = await browser.newPage(); await page.goto('http://127.0.0.1:5173');
  result = await page.evaluate(async () => {
    const [{ HIDING_PLACES, INHABITANT_ASSETS, ROAMING_ARANARA }, { getStageBackground }, { creatureLayout }] = await Promise.all([import('/src/data/inhabitants.ts'), import('/src/data/backgrounds.ts'), import('/src/game/encounters/layout.ts')]);
    const image = async (url) => { const source = new Image(); source.src = url; await source.decode(); const canvas = document.createElement('canvas'); canvas.width = source.width; canvas.height = source.height; const context = canvas.getContext('2d'); context.drawImage(source, 0, 0); return { source, canvas, context, pixels: context.getImageData(0, 0, source.width, source.height).data }; };
    const portraits = Object.fromEntries(await Promise.all(ROAMING_ARANARA.map(async (id) => [id, await image(INHABITANT_ASSETS[id].poster)])));
    const fits = {}; const report = []; const previews = [];
    for (const [stage, anchors] of Object.entries(HIDING_PLACES)) {
      const asset = getStageBackground(stage);
      const fore = Object.fromEntries(await Promise.all(asset.hiding.cuts.map(async (cut) => [cut.id, await image(asset.hiding.foreground.replace('hiding-foreground.webp', `hiding-after-${cut.id}.webp`))])));
      const foreground = fore.middle;
      const preview = document.createElement('canvas'); preview.width = foreground.canvas.width; preview.height = foreground.canvas.height;
      const context = preview.getContext('2d');
      const scale = preview.width / asset.view.width / 1.12;
      for (const [slot, anchor] of anchors.entries()) {
        if (anchor.edge) continue;
        const key = `${stage}-${slot}`; fits[key] = {};
        for (const id of ROAMING_ARANARA) {
          const portrait = portraits[id]; const height = id === 'aranara_04' ? 270 : 220;
          const width = height * INHABITANT_ASSETS[id].bounds.width / INHABITANT_ASSETS[id].bounds.height;
          const baseLeft = anchor.x - width * (anchor.burrow === 1 ? 0.4 : anchor.burrow === -1 ? 0.6 : 0.5);
          const baseTop = anchor.y + height * (anchor.burrow ? 0.55 : 0.4);
          const samples = [];
          for (let vertical = 4; vertical < portrait.canvas.height; vertical += 8) for (let horizontal = 4; horizontal < portrait.canvas.width; horizontal += 8) {
            if (portrait.pixels[(vertical * portrait.canvas.width + horizontal) * 4 + 3] > 100) samples.push({ horizontal: horizontal / portrait.canvas.width, vertical: vertical / portrait.canvas.height });
          }
          let best;
          for (const offsetX of [-70, -35, 0, 35, 70]) for (const offsetY of [-80, -40, 0, 40, 80]) {
            const visible = samples.filter((point) => {
              const horizontal = Math.round(preview.width / 2 + (baseLeft + offsetX + point.horizontal * width) * scale);
              const vertical = Math.round(preview.height / 2 - (baseTop + offsetY - point.vertical * height) * scale);
              return horizontal >= 0 && horizontal < preview.width && vertical >= 0 && vertical < preview.height && fore[anchor.depth ?? 'middle'].pixels[(vertical * preview.width + horizontal) * 4 + 3] < 180;
            });
            const ratio = visible.length / samples.length;
            const center = visible.reduce((sum, point) => sum + point.vertical, 0) / Math.max(1, visible.length);
            const score = Math.abs(ratio - 0.28) * 4 + (offsetX * offsetX + offsetY * offsetY) * 0.000005 + (center > (anchor.burrow ? 0.75 : 0.55) ? 1 : 0);
            if (!best || score < best.score) best = { offsetX, offsetY, score, ratio, visible };
          }
          const visible = best.visible;
          const horizontal = visible.reduce((sum, point) => sum + point.horizontal, 0) / Math.max(1, visible.length);
          const vertical = visible.reduce((sum, point) => sum + point.vertical, 0) / Math.max(1, visible.length);
          fits[key][id] = { horizontal: best.offsetX, vertical: best.offsetY, hitX: horizontal, hitY: vertical };
          report.push({ stage, slot, name: anchor.name, asset: id, ratio: Number(best.ratio.toFixed(4)), horizontal: best.offsetX, vertical: best.offsetY });
        }
      }
      const viewport = { width: preview.width, height: preview.height, scale: 1, offset: 0, root: preview.height - 100, treeHeight: 95, seed: 1027, growth: 0 };
      const actors = creatureLayout(stage, anchors.map((anchor, slot) => ({ id: slot, slot, phase: 'watching', asset: anchor.allowed?.[0] ?? ROAMING_ARANARA[slot % 6] })), viewport, []).filter((actor) => actor.kind === 'roaming');
      const drawActor = (actor) => {
        if (!actor.edge) {
          const fit = fits[`${stage}-${actor.encounter}`][actor.asset];
          const anchor = anchors[actor.encounter]; const projection = preview.width / asset.view.width;
          const width = actor.width / projection; const height = actor.height / projection;
          actor.left = preview.width / 2 + (anchor.x + fit.horizontal - width * (anchor.burrow === 1 ? 0.4 : anchor.burrow === -1 ? 0.6 : 0.5)) * projection;
          actor.top = preview.height / 2 - (anchor.y + fit.vertical + height * (anchor.burrow ? 0.55 : 0.4)) * projection;
        }
        context.save(); context.translate(actor.left + actor.width / 2, actor.top + actor.height / 2); if (actor.edge === 'top') context.rotate(Math.PI);
        context.drawImage(portraits[actor.asset].source, -actor.width / 2, -actor.height / 2, actor.width, actor.height); context.restore();
      };
      for (let band = 0; band <= asset.hiding.cuts.length; band++) {
        const plate = await image(asset.hiding.foreground.replace('hiding-foreground.webp', `hiding-band-${band}.webp`));
        context.drawImage(plate.source, -preview.width * 0.06, -preview.height * 0.06, preview.width * 1.12, preview.height * 1.12);
        if (asset.hiding.lightBands?.includes(band)) {
          const light = await image(asset.hiding.foreground.replace('hiding-foreground.webp', `hiding-light-${band}.webp`));
          context.globalCompositeOperation = 'lighter'; context.drawImage(light.source, -preview.width * 0.06, -preview.height * 0.06, preview.width * 1.12, preview.height * 1.12); context.globalCompositeOperation = 'source-over';
        }
        actors.filter((actor) => actor.depth === (asset.hiding.cuts[band]?.id ?? 'edge')).forEach(drawActor);
      }
      context.font = 'bold 19px sans-serif'; context.textAlign = 'center';
      for (const actor of actors) {
        const horizontal = Math.max(16, Math.min(preview.width - 16, actor.left + actor.width / 2));
        const vertical = Math.max(30, Math.min(preview.height - 25, actor.top - 8));
        context.fillStyle = '#183e35'; context.fillRect(horizontal - 13, vertical - 20, 26, 25);
        context.fillStyle = '#f2f8cc'; context.fillText(String(actor.encounter + 1), horizontal, vertical);
      }
      previews.push({ stage, data: preview.toDataURL('image/webp', 0.92).split(',')[1] });
    }
    return { fits, report, previews };
  });
} finally { await browser.close(); }
mkdirSync('docs/inhabitants', { recursive: true }); mkdirSync('docs/screenshots/hiding', { recursive: true });
writeFileSync('src/data/hiding.generated.json', JSON.stringify(result.fits, null, 2) + '\n');
writeFileSync('docs/inhabitants/hiding-calibration.json', JSON.stringify(result.report, null, 2) + '\n');
for (const preview of result.previews) writeFileSync(`docs/screenshots/hiding/${preview.stage}-anchors.webp`, Buffer.from(preview.data, 'base64'));
const ratios = result.report.map((entry) => entry.ratio);
console.log(`${result.report.length} object poses: visible ${Math.min(...ratios)} ~ ${Math.max(...ratios)}`);
console.log(JSON.stringify(result.report.filter((entry) => entry.ratio < 0.08 || entry.ratio > 0.65)));
