import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import ts from 'typescript';

const source = 'https://webstatic.mihoyo.com/ys/event/e20220814prev/index_b1ed31e4fa6de2a3102d.js';
const response = await fetch(source, { signal: AbortSignal.timeout(30000) });
if (!response.ok) throw new Error(`Reference resource returned ${response.status}`);
const code = await response.text();
const match = code.match(/66146:[\s\S]*?exports="data:image\/jpeg;base64,([A-Za-z0-9+/=]+)"/);
if (!match) throw new Error('Reference embedded index_light was not found');
const bytes = Buffer.from(match[1], 'base64');
const sha256 = createHash('sha256').update(bytes).digest('hex');
if (sha256 !== 'a15ea8d1ea67007f9fa5fbbf50967db1ef9dce79910eacdfcc30c77b70224f4a') throw new Error('Reference texture changed; review before replacing it');
const directory = new URL('../asserts/reference-supplements/3.0/', import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(new URL('index_light.jpg', directory), bytes);
const manifest = [{ file: '3.0/index_light.jpg', source, module: 66146, id: 'index_light', bytes: bytes.length, sha256 }];
const published = new URL('../public/asserts/backgrounds/forest/', import.meta.url);
await mkdir(published, { recursive: true });
await writeFile(new URL('index_light.jpg', published), bytes);
console.log(`Recovered index_light: ${bytes.length} bytes; SHA-256 ${sha256}`);

const vendorSource = 'https://webstatic.mihoyo.com/ys/event/e20230401preview-84u4sh/vendors_4dab91e6184845585fd0.js';
const vendorResponse = await fetch(vendorSource, { signal: AbortSignal.timeout(30000) });
if (!vendorResponse.ok) throw new Error(`Reference resource returned ${vendorResponse.status}`);
const syntax = ts.createSourceFile('reference.js', await vendorResponse.text(), ts.ScriptTarget.Latest, false, ts.ScriptKind.JS);
const embedded = new Map();
const inspect = (node) => {
  if (ts.isStringLiteral(node)) {
    if (node.text.startsWith('full_NPC.png\n')) embedded.set('full_NPC.atlas', Buffer.from(node.text));
    if (node.text.startsWith('{"skeleton":{"hash":"3EY6MKtWods"')) embedded.set('full_NPC.json', Buffer.from(node.text));
    if (node.text.startsWith('{"geometries"')) {
      const geometry = JSON.parse(node.text).geometries['6a0931bad31e2f0b2004cbf63b3a607b'];
      if (geometry) embedded.set('ground.geometry.json', Buffer.from(JSON.stringify(geometry)));
    }
  }
  ts.forEachChild(node, inspect);
};
inspect(syntax);
const imageSource = 'https://webstatic.mihoyo.com/ys/event/e20230401preview-84u4sh/images/full_NPC.b323a559..png';
const imageResponse = await fetch(imageSource, { signal: AbortSignal.timeout(30000) });
if (!imageResponse.ok) throw new Error(`Reference image returned ${imageResponse.status}`);
embedded.set('full_NPC.png', Buffer.from(await imageResponse.arrayBuffer()));
const groundSource = 'https://webstatic.mihoyo.com/ys/event/e20230401preview-84u4sh/images/4%E8%A1%A8%E9%9D%A2%E9%A2%9C%E8%89%B2.2420f1fc..png';
const groundResponse = await fetch(groundSource, { signal: AbortSignal.timeout(30000) });
if (!groundResponse.ok) throw new Error(`Reference ground image returned ${groundResponse.status}`);
embedded.set('ground.png', Buffer.from(await groundResponse.arrayBuffer()));
const expected = {
  'full_NPC.atlas': 'cc86870801522e204749725d6fc177fc12ab0896d3679f5de3aed549fa2e8a1f',
  'full_NPC.json': 'b5e17278fc18ca8fb94e8de4b6a704eebc215f609c450ba7a711cc64dafa0c3e',
  'full_NPC.png': '437edd7344fa205c3b4e145055e4070d8a8014c601dc02d76f3ce8df4bc7645b',
  'ground.geometry.json': '819dae2f744a48ed748971803ac0404c31b2f1765f3c09598b794ef1a5d64729',
  'ground.png': 'c04f90e4b369a7c7da68fc7be8254060c106abea509943e6e113ed9fe3af6b80',
};
for (const [file, expectedHash] of Object.entries(expected)) {
  const data = embedded.get(file);
  if (!data || createHash('sha256').update(data).digest('hex') !== expectedHash) throw new Error(`Reference ${file} changed; review before replacing it`);
}
const stageDirectory = new URL('../asserts/reference-supplements/3.6/', import.meta.url);
const stagePublished = new URL('../public/asserts/backgrounds/canopy/', import.meta.url);
await mkdir(stageDirectory, { recursive: true });
await mkdir(stagePublished, { recursive: true });
for (const [file, data] of embedded) {
  await writeFile(new URL(file, stageDirectory), data);
  await writeFile(new URL(file, stagePublished), data);
  manifest.push({ file: `3.6/${file}`, source: file === 'full_NPC.png' ? imageSource : file === 'ground.png' ? groundSource : vendorSource, module: file === 'full_NPC.png' ? 49139 : file === 'ground.png' ? 69273 : undefined, id: file.startsWith('full_NPC') ? 'full_NPC' : 'ground', bytes: data.length, sha256: expected[file] });
  console.log(`Recovered ${file}: ${data.length} bytes`);
}
for (const resource of [
  { file: '3.1/abd_smoke_diffuse.jpg', published: 'dunes/abd_smoke_diffuse.jpg', source: 'https://webstatic.mihoyo.com/ys/event/e20220917prev/images/abd_smoke_diffuse_jpg.14529b29..jpg', id: 'abd_smoke_diffuse_jpg', sha256: '8836d271ac6bceb84a087f210b94b000b29e4aeff4a22efe766800cd4cb1fe10' },
  { file: '3.2/loading_flowMap.jpg', published: 'sanctuary/loading_flowMap.jpg', source: 'https://webstatic.mihoyo.com/ys/event/e20221024prev/index_f68c818de38938e8cd58.js', id: 'loading_flowMap', module: 77323, sha256: 'd22d83695132f5206313507d28ca696723ed137d243326319504e7c0e382c401' },
]) {
  const response = await fetch(resource.source, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Reference resource returned ${response.status}`);
  let data = Buffer.from(await response.arrayBuffer());
  if (resource.module) {
    const match = data.toString().match(/77323:[\s\S]*?exports="data:image\/jpeg;base64,([A-Za-z0-9+/=]+)"/);
    if (!match) throw new Error('Reference embedded loading_flowMap was not found');
    data = Buffer.from(match[1], 'base64');
  }
  if (createHash('sha256').update(data).digest('hex') !== resource.sha256) throw new Error(`Reference ${resource.id} changed; review before replacing it`);
  const original = new URL(`../asserts/reference-supplements/${resource.file}`, import.meta.url);
  const destination = new URL(`../public/asserts/backgrounds/${resource.published}`, import.meta.url);
  await mkdir(new URL('.', original), { recursive: true });
  await mkdir(new URL('.', destination), { recursive: true });
  await writeFile(original, data);
  await writeFile(destination, data);
  manifest.push({ file: resource.file, source: resource.source, module: resource.module, id: resource.id, bytes: data.length, sha256: resource.sha256 });
  console.log(`Recovered ${resource.id}: ${data.length} bytes`);
}
await writeFile(new URL('../manifest.json', directory), `${JSON.stringify(manifest, null, 2)}\n`);
