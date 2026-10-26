import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { projectRoot, relative, sha256 } from './player-spine-utils.mjs';

const sourceRoot = path.join(projectRoot, 'asserts/E技能素材');
const outputRoot = path.join(sourceRoot, 'clean-v2');
const generation = JSON.parse(fs.readFileSync(path.join(projectRoot, 'docs/e-skill-clean-generation.json'), 'utf8'));
assert.equal(sha256(path.join(projectRoot, generation.source)), generation.sourceSha256);
const atlasText = fs.readFileSync(path.join(sourceRoot, 'e_skill_frame.atlas'), 'utf8');
const regions = [...atlasText.matchAll(/^([^\r\n:]+)\r?\nbounds:(\d+),(\d+),(\d+),(\d+)/gm)].map((match) => ({ name: match[1], bounds: match.slice(2).map(Number) }));
assert.equal(regions.length, 17);
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? (process.platform === 'win32' ? 'chrome' : undefined), headless: true });
let result;
try {
  const page = await browser.newPage();
  result = await page.evaluate(async ({ source, master, regions }) => {
    const decode = async (data) => createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob());
    const original = await decode(source); const flower = await decode(master);
    const read = document.createElement('canvas'); read.width = flower.width; read.height = flower.height;
    const context = read.getContext('2d', { willReadFrequently: true }); context.drawImage(flower, 0, 0);
    const alpha = context.getImageData(0, 0, read.width, read.height).data;
    let left = flower.width; let right = 0; let top = flower.height; let bottom = 0;
    for (let vertical = 0; vertical < flower.height; vertical++) for (let horizontal = 0; horizontal < flower.width; horizontal++) if (alpha[(vertical * flower.width + horizontal) * 4 + 3] >= 64) {
      left = Math.min(left, horizontal); right = Math.max(right, horizontal + 1); top = Math.min(top, vertical); bottom = Math.max(bottom, vertical + 1);
    }
    if (right <= left || bottom <= top) throw new Error('Missing transparent clover');
    const output = document.createElement('canvas'); output.width = original.width; output.height = original.height;
    const paint = output.getContext('2d'); paint.imageSmoothingQuality = 'high';
    const geometry = [];
    for (const { name, bounds } of regions) {
      const [regionX, regionY, width, height] = bounds;
      if (name === 'center_emblem') { paint.drawImage(original, regionX, regionY, width, height, regionX, regionY, width, height); continue; }
      if (name.startsWith('corner_')) {
        paint.drawImage(flower, left, top, right - left, bottom - top, regionX + 38, regionY + 38, 104, 104);
        geometry.push({ name, kind: 'four-leaf', bounds: [38, 38, 104, 104] }); continue;
      }
      read.width = width; read.height = height; context.drawImage(original, regionX, regionY, width, height, 0, 0, width, height);
      const pixels = context.getImageData(0, 0, width, height).data;
      const horizontal = width > height; const length = horizontal ? width : height; const cross = horizontal ? height : width;
      const at = (along, across) => pixels[((horizontal ? across : along) * width + (horizontal ? along : across)) * 4 + 3];
      const rows = Array.from({ length: cross }, (_, across) => Array.from({ length }, (_, along) => at(along, across) >= 96 ? 1 : 0).reduce((sum, value) => sum + value, 0));
      const axis = rows.indexOf(Math.max(...rows));
      const thickness = Array.from({ length }, (_, along) => Array.from({ length: cross }, (_, across) => at(along, across) >= 128 ? 1 : 0).reduce((sum, value) => sum + value, 0));
      const groups = [];
      for (let along = 0; along < length; along++) {
        if (thickness[along] < 7) continue;
        const start = along;
        while (along + 1 < length && thickness[along + 1] >= 7) along++;
        const end = along; const radius = Math.max(...thickness.slice(start, end + 1)) / 2;
        if (start >= 12 && end < length - 8 && end - start >= 4 && radius >= 3 && radius <= 18) groups.push({ center: (start + end) / 2, radius });
      }
      const beads = name.startsWith('chain_') ? groups : [];
      if (name.startsWith('chain_') && beads.length !== 3) throw new Error(`${name}: expected three beads; ${JSON.stringify(groups)}`);
      const active = Array.from({ length }, (_, along) => along).filter((along) => Array.from({ length: 5 }, (_, offset) => axis - 2 + offset).some((across) => across >= 0 && across < cross && at(along, across) >= 96));
      const start = active[0]; const end = active.at(-1);
      const points = [];
      for (let along = start; along <= end; along += 3) {
        const samples = Array.from({ length: 9 }, (_, offset) => axis - 4 + offset).filter((across) => across >= 0 && across < cross && at(along, across) >= 96);
        const position = samples.length ? samples.reduce((sum, value) => sum + value, 0) / samples.length : axis;
        points.push(horizontal ? `${along},${position}` : `${position},${along}`);
      }
      const vector = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><polyline points="${points.join(' ')}" fill="none" stroke="#dfff8e" stroke-width="1.5" stroke-linecap="round"/>${beads.map((bead) => `<circle cx="${horizontal ? bead.center : axis}" cy="${horizontal ? axis : bead.center}" r="${bead.radius}" fill="#dfff8e"/>`).join('')}</svg>`;
      const address = URL.createObjectURL(new Blob([vector], { type: 'image/svg+xml' }));
      const bitmap = new Image(); bitmap.src = address; await bitmap.decode();
      paint.drawImage(bitmap, regionX, regionY); URL.revokeObjectURL(address); bitmap.src = '';
      geometry.push({ name, kind: beads.length ? 'beads-and-ray' : 'ray', axis, start, end, beads });
    }
    flower.close(); original.close();
    return { png: output.toDataURL('image/png').split(',')[1], geometry, masterCrop: [left, top, right - left, bottom - top] };
  }, { source: fs.readFileSync(path.join(sourceRoot, 'e_skill_frame.png')).toString('base64'), master: fs.readFileSync(path.join(projectRoot, generation.master)).toString('base64'), regions });
} finally { await browser.close(); }
fs.mkdirSync(outputRoot, { recursive: true });
fs.writeFileSync(path.join(outputRoot, 'e_skill_frame.png'), Buffer.from(result.png, 'base64'));
for (const file of ['e_skill_frame.atlas', 'e_skill_frame.json']) fs.copyFileSync(path.join(sourceRoot, file), path.join(outputRoot, file));
const outputs = ['e_skill_frame.atlas', 'e_skill_frame.json', 'e_skill_frame.png'].map((file) => ({ file: relative(path.join(outputRoot, file)), sha256: sha256(path.join(outputRoot, file)), bytes: fs.statSync(path.join(outputRoot, file)).size }));
fs.writeFileSync(path.join(projectRoot, 'docs/e-skill-clean.manifest.json'), JSON.stringify({ version: 2, sourceRoot: relative(sourceRoot), sourceHashes: ['e_skill_frame.atlas', 'e_skill_frame.json', 'e_skill_frame.png'].map((file) => ({ file: relative(path.join(sourceRoot, file)), sha256: sha256(path.join(sourceRoot, file)) })), generation: 'docs/e-skill-clean-generation.json', masterSha256: sha256(path.join(projectRoot, generation.master)), masterCrop: result.masterCrop, geometry: result.geometry, outputs }, null, 2) + '\n');
console.log(JSON.stringify({ outputs, pieces: result.geometry.length }));
