import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const projectRoot = fileURLToPath(new URL('../', import.meta.url));
export const outputRoot = path.join(projectRoot, 'asserts/player');
export const reportRoot = path.join(projectRoot, 'docs/player-spine');
export const runtimePath = path.join(projectRoot, 'node_modules/spine-player-4-0/dist/iife/spine-player.js');

export function loadRuntime() {
  const context = vm.createContext({ console, setTimeout, clearTimeout });
  vm.runInContext(fs.readFileSync(runtimePath, 'utf8'), context, { filename: runtimePath });
  assert.ok(context.spine?.SkeletonJson, 'Install the project dependencies first.');
  return context.spine;
}

export function json(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function sha256(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

export function pngSize(file) {
  const bytes = fs.readFileSync(file);
  assert.equal(bytes.toString('ascii', 1, 4), 'PNG', file);
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

export function filesUnder(root) {
  return fs.readdirSync(root, { recursive: true }).filter((name) => fs.statSync(path.join(root, name)).isFile()).sort();
}

export function relative(file) {
  return path.relative(projectRoot, file).replaceAll(path.sep, '/');
}

// Compose every ancestor, including nested group scale. The source happens to
// use unit group scales, but a later layout edit must not silently lose them.
export function flattenPage(page) {
  const nodes = [];
  function visit(children, x, y, sx, sy) {
    for (const child of children) {
      const cx = x + sx * child.position[0];
      const cy = y + sy * child.position[1];
      const csx = sx * (child.scale?.[0] ?? 1);
      const csy = sy * (child.scale?.[1] ?? 1);
      if (child.type === 'group' || child.children) visit(child.children, cx, cy, csx, csy);
      else nodes.push({ ...child, x: cx, y: cy, sx: csx, sy: csy });
    }
  }
  visit(page.groups, page.position[0], page.position[1], page.scale, page.scale);
  return nodes.map((node, index) => ({ ...node, id: `layer_${String(index).padStart(2, '0')}_${node.name}` }));
}

export function readSkeleton(spine, skeletonFile, atlasFile) {
  const atlas = new spine.TextureAtlas(fs.readFileSync(atlasFile, 'utf8'));
  for (const page of atlas.pages) {
    const [width, height] = pngSize(path.join(path.dirname(atlasFile), page.name));
    assert.equal(page.width, width, `Atlas width: ${page.name}`);
    assert.equal(page.height, height, `Atlas height: ${page.name}`);
    page.setTexture({ getImage: () => ({ width, height }), setFilters() {}, setWraps() {} });
  }
  const reader = new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas));
  return { data: reader.readSkeletonData(json(skeletonFile)), atlas };
}

export function gcd(a, b) {
  return b === 0 ? a : gcd(b, a % b);
}

export function lcm(a, b) {
  return a / gcd(a, b) * b;
}
