import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadRuntime, projectRoot, readSkeleton, relative, sha256 } from './player-spine-utils.mjs';

const root = path.join(projectRoot, 'asserts/E技能素材');
const expected = {
  'e_skill_frame.atlas': 'c510a420c155c170df0edfad97087c062a8b0e118fa717232ccb8967bdbc09c8',
  'e_skill_frame.json': '322f9f332b1b196fb30eef89a6d5c82539bcd6c8dcc4797eac42125c7b1a44c0',
  'e_skill_frame.png': '98bb9de5b3471e2d6720f023ed01aaf35ae760a1fb787a14f90ec611f9029648',
};
const sources = Object.entries(expected).map(([file, hash]) => {
  const source = path.join(root, file);
  assert.equal(sha256(source), hash, `Source changed: ${file}`);
  return { file: relative(source), sha256: hash };
});
const spine = loadRuntime();
const { data, atlas } = readSkeleton(spine, path.join(root, 'e_skill_frame.json'), path.join(root, 'e_skill_frame.atlas'));
assert.equal(data.version, '4.0.33');
assert.equal(atlas.pages.length, 1);
assert.equal(atlas.regions.length, 17);
const input = JSON.parse(fs.readFileSync(path.join(root, 'e_skill_frame.json'), 'utf8'));
const skeleton = new spine.Skeleton(data);
skeleton.setToSetupPose();
skeleton.updateWorldTransform();
const rounded = (value) => Math.round(value * 100000) / 100000;
const allPieces = skeleton.drawOrder.map((slot) => {
  const attachment = slot.getAttachment();
  assert.ok(attachment instanceof spine.RegionAttachment);
  const region = attachment.region;
  assert.equal(region.degrees, 0);
  assert.equal(region.width, region.originalWidth);
  assert.equal(region.height, region.originalHeight);
  const vertices = new Float32Array(8);
  attachment.computeWorldVertices(slot.bone, vertices, 0, 2);
  const topLeft = [vertices[2], -vertices[3]];
  const topRight = [vertices[4], -vertices[5]];
  const bottomLeft = [vertices[0], -vertices[1]];
  assert.ok(Math.abs(attachment.uvs[2] * region.page.width - region.x) < 0.001);
  assert.ok(Math.abs(attachment.uvs[3] * region.page.height - region.y) < 0.001);
  const show = input.animations.show.slots[slot.data.name].rgba;
  return {
    name: slot.data.name,
    region: [region.x, region.y, region.width, region.height],
    matrix: [(topRight[0] - topLeft[0]) / region.width, (topRight[1] - topLeft[1]) / region.width, (bottomLeft[0] - topLeft[0]) / region.height, (bottomLeft[1] - topLeft[1]) / region.height, ...topLeft].map(rounded),
    showDelayMs: Math.round(show[1].time * 1000),
    showDurationMs: Math.round((show[2].time - show[1].time) * 1000),
  };
});
const pieces = allPieces.filter((piece) => piece.name !== 'center_emblem');
const openingCenter = allPieces.find((piece) => piece.name === 'center_emblem');
assert.ok(openingCenter);
const openingWindow = { left: rounded(skeleton.findBone('line_left').worldX), top: rounded(-skeleton.findBone('line_top').worldY), size: rounded(skeleton.findBone('line_right').worldX - skeleton.findBone('line_left').worldX) };
assert.equal(openingWindow.size, rounded(skeleton.findBone('line_top').worldY - skeleton.findBone('line_bottom').worldY));
assert.equal(pieces.length, 16);
const extent = Math.ceil(Math.max(...pieces.flatMap((piece) => {
  const [horizontal, , , vertical, left, top] = piece.matrix;
  const [, , width, height] = piece.region;
  return [Math.abs(left), Math.abs(top), Math.abs(left + horizontal * width), Math.abs(top + vertical * height)];
})));
const result = { version: data.version, texture: '/asserts/effects/e-skill-frame.png', textureSize: [atlas.pages[0].width, atlas.pages[0].height], viewBox: [-extent, -extent, extent * 2, extent * 2], sources, omitted: ['center_emblem'], pieces, openingCenter, openingWindow };
fs.writeFileSync(path.join(projectRoot, 'src/data/eSkillPattern.generated.json'), JSON.stringify(result, null, 2) + '\n');
const output = path.join(projectRoot, 'public/asserts/effects/e-skill-frame.png');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.copyFileSync(path.join(root, 'e_skill_frame.png'), output);
assert.equal(sha256(output), expected['e_skill_frame.png']);
console.log(`Spine ${data.version}: ${pieces.length} blessing border pieces; original center and square window exported separately for startup; texture copied unchanged (${fs.statSync(output).size} bytes).`);
