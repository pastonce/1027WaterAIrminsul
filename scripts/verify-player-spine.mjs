import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { filesUnder, json, loadRuntime, outputRoot, projectRoot, readSkeleton, reportRoot, sha256 } from './player-spine-utils.mjs';

const manifest = json(path.join(reportRoot, 'manifest.json'));
const spine = loadRuntime();
const report = { mode: 'retained-packs-after-user-source-cleanup', runtime: '4.0.31', pages: [], referenceHashes: 0 };
for (const entry of manifest.referenceFiles) {
  assert.equal(sha256(path.join(projectRoot, entry.file)), entry.sha256);
  report.referenceHashes++;
}
for (const page of manifest.pages) {
  const directory = path.join(outputRoot, page.name);
  assert.deepEqual(filesUnder(directory).sort(), page.files.map((file) => file.file).sort());
  for (const entry of page.files) assert.equal(sha256(path.join(directory, entry.file)), entry.sha256);
  const { data, atlas } = readSkeleton(spine, path.join(directory, page.name + '.json'), path.join(directory, page.name + '.atlas'));
  const skeleton = new spine.Skeleton(data);
  let coordinates = 0;
  for (const animation of data.animations) {
    for (const time of [0, animation.duration * 0.43, animation.duration + 0.125]) {
      skeleton.setToSetupPose(); animation.apply(skeleton, -1, time, true, null, 1, spine.MixBlend.replace, spine.MixDirection.mixIn); skeleton.updateWorldTransform();
      for (const slot of skeleton.slots) {
        const attachment = slot.getAttachment();
        if (!attachment || !('computeWorldVertices' in attachment)) continue;
        const vertices = new Float32Array(attachment.worldVerticesLength ?? 8);
        if (attachment instanceof spine.RegionAttachment) attachment.computeWorldVertices(slot.bone, vertices, 0, 2);
        else attachment.computeWorldVertices(slot, 0, vertices.length, vertices, 0, 2);
        assert.ok(vertices.every(Number.isFinite));
        if (attachment.uvs) assert.ok(attachment.uvs.every(Number.isFinite));
        coordinates += vertices.length;
      }
    }
  }
  report.pages.push({ name: page.name, files: page.files.length, textures: atlas.pages.length, animations: data.animations.length, coordinates, sha256MatchPreviousExport: true });
}
assert.equal(fs.readdirSync(path.join(projectRoot, 'asserts/player-source')).length, 0);
fs.writeFileSync(path.join(reportRoot, 'geometry-validation.json'), JSON.stringify(report, null, 2) + '\n');
console.log('Four retained packs verified without player-source; original hashes unchanged.');
