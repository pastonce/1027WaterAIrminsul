import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { filesUnder, json, loadRuntime, outputRoot, projectRoot, readSkeleton, sha256 } from './player-spine-utils.mjs';
import { extractedRootName } from './player-extract-config.mjs';

const spine = loadRuntime();
const root = path.join(projectRoot, extractedRootName);
const manifest = json(path.join(root, 'manifest.json'));
const report = { spine: manifest.spine, runtime: manifest.runtime, sourceFiles: 0, exportedFiles: 0, assets: [] };
const cache = new Map();
for (const entry of manifest.inputs) {
  assert.equal(sha256(path.join(projectRoot, entry.file)), entry.sha256);
  report.sourceFiles++;
}
function pose(data, animation, time, loop = false, offset = [0, 0]) {
  const skeleton = new spine.Skeleton(data);
  skeleton.x = offset[0]; skeleton.y = offset[1];
  data.findAnimation(animation).apply(skeleton, -1, time, loop, null, 1, spine.MixBlend.replace, spine.MixDirection.mixIn);
  skeleton.updateWorldTransform();
  return skeleton;
}
function world(slot) {
  const attachment = slot.getAttachment();
  if (!attachment || !('computeWorldVertices' in attachment)) return [];
  const points = new Float32Array(attachment.worldVerticesLength ?? 8);
  if (attachment instanceof spine.RegionAttachment) attachment.computeWorldVertices(slot.bone, points, 0, 2);
  else attachment.computeWorldVertices(slot, 0, points.length, points, 0, 2);
  return points;
}
for (const asset of manifest.assets) {
  const directory = path.join(root, asset.folder);
  assert.deepEqual(filesUnder(directory).sort(), [asset.name + '.atlas', asset.name + '.json', asset.name + '.png'].sort());
  for (const entry of asset.files) { assert.equal(sha256(path.join(directory, entry.file)), entry.sha256); report.exportedFiles++; }
  if (!cache.has(asset.source.group)) cache.set(asset.source.group, readSkeleton(spine, path.join(outputRoot, asset.source.group, asset.source.group + '.json'), path.join(outputRoot, asset.source.group, asset.source.group + '.atlas')));
  const source = cache.get(asset.source.group);
  const exported = readSkeleton(spine, path.join(directory, asset.name + '.json'), path.join(directory, asset.name + '.atlas'));
  assert.equal(exported.atlas.pages.length, 1);
  assert.equal(exported.atlas.regions.length, asset.regions);
  assert.equal(exported.data.slots.length, asset.source.slots.length);
  const result = { id: asset.id, animations: 0, samples: 0, vertexCoordinates: 0, uvCoordinates: 0, maxVertexError: 0, maxUvPixelError: 0, maxColorError: 0 };
  for (const animation of asset.source.animations) {
    const originalAnimation = source.data.findAnimation(animation.source);
    assert.equal(exported.data.findAnimation(animation.name).duration, originalAnimation.duration);
    const times = [0, 0.125, originalAnimation.duration * 0.23, originalAnimation.duration * 0.61, Math.max(0, originalAnimation.duration - 0.001), originalAnimation.duration + 0.001, originalAnimation.duration * 2 + 0.125];
    for (const [index, time] of times.entries()) {
      const looping = index >= 5;
      const a = pose(source.data, animation.source, time, looping, asset.offset);
      const b = pose(exported.data, animation.name, time, looping);
      for (const name of asset.source.slots) {
        const original = a.findSlot(name), extracted = b.findSlot(name.slice(asset.source.prefix.length + 1));
        assert.ok(original && extracted);
        const av = world(original), bv = world(extracted);
        assert.equal(av.length, bv.length);
        for (let cursor = 0; cursor < av.length; cursor++) {
          const error = Math.abs(av[cursor] - bv[cursor]);
          assert.ok(Number.isFinite(error));
          result.maxVertexError = Math.max(result.maxVertexError, error);
        }
        result.vertexCoordinates += av.length;
        const aa = original.getAttachment(), ba = extracted.getAttachment();
        if (!aa || !ba) continue;
        if (aa.region) {
          assert.equal(aa.region.degrees, ba.region.degrees);
          for (let cursor = 0; cursor < aa.uvs.length; cursor++) {
            const size = cursor % 2 === 0 ? 'width' : 'height', location = cursor % 2 === 0 ? 'x' : 'y';
            const oldPixel = aa.uvs[cursor] * aa.region.page[size] - aa.region[location];
            const newPixel = ba.uvs[cursor] * ba.region.page[size] - ba.region[location];
            result.maxUvPixelError = Math.max(result.maxUvPixelError, Math.abs(oldPixel - newPixel));
          }
          result.uvCoordinates += aa.uvs.length;
        }
        for (const channel of ['r', 'g', 'b', 'a']) result.maxColorError = Math.max(result.maxColorError, Math.abs(original.color[channel] - extracted.color[channel]));
      }
      result.samples++;
    }
    result.animations++;
  }
  assert.equal(exported.data.findAnimation('loop').duration, source.data.findAnimation(asset.source.prefix + '/' + asset.source.animation).duration);
  console.log(asset.id, JSON.stringify(result));
  assert.ok(result.maxVertexError < 0.01, `Geometry changed: ${asset.id}`);
  assert.ok(result.maxUvPixelError < 0.001, `UV crop or rotation changed: ${asset.id}`);
  assert.ok(result.maxColorError < 0.00001, `Color changed: ${asset.id}`);
  report.assets.push(result);
}
assert.equal(manifest.assets.length, 17);
assert.equal(fs.readdirSync(path.join(projectRoot, 'asserts/player-source')).length, 0);
const textures = spawnSync('python', [path.join(projectRoot, 'scripts/verify-player-textures.py')], { encoding: 'utf8', windowsHide: true });
assert.equal(textures.status, 0, textures.stderr);
console.log(textures.stdout.trim());
fs.writeFileSync(path.join(projectRoot, 'docs/player-extracted/geometry-validation.json'), JSON.stringify(report, null, 2) + '\n');
console.log('All 17 assets verified; player-source is empty.');
