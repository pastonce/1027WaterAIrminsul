import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'public/asserts/cursor');
const definitions = [
  ['normal', 'STMC_GenshinNahida_01_Normal.cur', 'auto'],
  ['pointer', 'STMC_GenshinNahida_15_Finger(large).cur', 'pointer'],
  ['text', 'STMC_GenshinNahida_06_Beam(reversed).cur', 'text'],
  ['unavailable', 'STMC_GenshinNahida_08_Unavailable.cur', 'not-allowed'],
  ['help', 'STMC_GenshinNahida_02_Help.cur', 'help'],
  ['horizontal', 'STMC_GenshinNahida_10_EW.cur', 'ew-resize'],
];
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
mkdirSync(output, { recursive: true });
const files = definitions.map(([role, name, fallback]) => {
  const source = `asserts/cursor/${name}`;
  const bytes = readFileSync(path.join(root, source));
  if (bytes.length < 22 || bytes.readUInt16LE(0) !== 0 || bytes.readUInt16LE(2) !== 2 || bytes.readUInt16LE(4) !== 1) throw new Error(`Invalid cursor: ${source}`);
  const width = bytes[6] || 256; const height = bytes[7] || 256;
  const hotspot = { x: bytes.readUInt16LE(10), y: bytes.readUInt16LE(12) };
  if (width !== 32 || height !== 32 || hotspot.x >= width || hotspot.y >= height || bytes.readUInt32LE(18) + bytes.readUInt32LE(14) !== bytes.length) throw new Error(`Unexpected cursor geometry: ${source}`);
  const sha256 = hash(bytes);
  const filename = `${role}-${sha256.slice(0, 12)}.cur`;
  const file = `public/asserts/cursor/${filename}`;
  copyFileSync(path.join(root, source), path.join(root, file));
  return { role, source, file, src: `/asserts/cursor/${filename}`, fallback, bytes: bytes.length, sha256, width, height, hotspot };
});
const copyrightSource = 'asserts/cursor/版权说明 Copyright.txt';
const copyrightBytes = readFileSync(path.join(root, copyrightSource));
const copyrightFile = 'public/asserts/cursor/COPYRIGHT.txt';
copyFileSync(path.join(root, copyrightSource), path.join(root, copyrightFile));
const manifest = { owner: 'SAM TOKI STUDIO', sourceUrl: 'https://github.com/SamToki/IconDesign---Sam-Toki-Mouse-Cursors', files, copyright: { source: copyrightSource, file: copyrightFile, bytes: copyrightBytes.length, sha256: hash(copyrightBytes) }, publishedBytes: files.reduce((sum, file) => sum + file.bytes, copyrightBytes.length) };
const cursor = (role) => {
  const asset = files.find((file) => file.role === role);
  return `url("${asset.src}") ${asset.hotspot.x} ${asset.hotspot.y}, ${asset.fallback}`;
};
const css = `@media (hover: hover) and (pointer: fine) and (forced-colors: none) {
  html { --cursor-normal: ${cursor('normal')}; --cursor-pointer: ${cursor('pointer')}; --cursor-text: ${cursor('text')}; --cursor-unavailable: ${cursor('unavailable')}; --cursor-help: ${cursor('help')}; --cursor-horizontal: ${cursor('horizontal')}; cursor: var(--cursor-normal); }
  :root body, :root body :where(*), :root body ::before, :root body ::after { cursor: inherit; }
  :root :is(button, a[href], summary, label, [role="button"], [role="link"], select, input:is([type="checkbox"], [type="radio"], [type="button"], [type="submit"], [type="reset"], [type="file"], [type="color"]), .tree-art, .creature-hit) { cursor: var(--cursor-pointer); }
  :root :is(input:not([type]), input:is([type="text"], [type="search"], [type="email"], [type="url"], [type="tel"], [type="password"], [type="number"], [type="date"], [type="datetime-local"], [type="month"], [type="week"], [type="time"]), textarea, [contenteditable]:not([contenteditable="false"])) { cursor: var(--cursor-text); }
  :root abbr[title] { cursor: var(--cursor-help); }
  :root input[type="range"] { cursor: var(--cursor-horizontal); }
  :root input[type="range"]::-webkit-slider-thumb { cursor: var(--cursor-horizontal); }
  :root input[type="range"]::-webkit-slider-runnable-track { cursor: var(--cursor-horizontal); }
  :root input[type="range"]::-moz-range-thumb { cursor: var(--cursor-horizontal); }
  :root input[type="range"]::-moz-range-track { cursor: var(--cursor-horizontal); }
  :root input::-webkit-datetime-edit { cursor: var(--cursor-text); }
  :root input::-webkit-calendar-picker-indicator { cursor: var(--cursor-pointer); }
  :root input::-webkit-inner-spin-button { cursor: var(--cursor-pointer); }
  :root input::-webkit-clear-button { cursor: var(--cursor-pointer); }
  :root input::file-selector-button { cursor: var(--cursor-pointer); }
  :root :is(button:disabled, input:disabled, select:disabled, textarea:disabled, [role="button"][aria-disabled="true"], [role="link"][aria-disabled="true"], .creature-hit:disabled) { cursor: var(--cursor-unavailable); }
  :root input:disabled::-webkit-datetime-edit { cursor: var(--cursor-unavailable); }
  :root input:disabled::-webkit-calendar-picker-indicator { cursor: var(--cursor-unavailable); }
  :root input:disabled::-webkit-inner-spin-button { cursor: var(--cursor-unavailable); }
  :root input:disabled::-webkit-clear-button { cursor: var(--cursor-unavailable); }
  :root input[type="range"]:disabled::-webkit-slider-thumb { cursor: var(--cursor-unavailable); }
  :root input[type="range"]:disabled::-webkit-slider-runnable-track { cursor: var(--cursor-unavailable); }
  :root input:disabled::file-selector-button { cursor: var(--cursor-unavailable); }
  :root input[type="range"]:disabled::-moz-range-thumb { cursor: var(--cursor-unavailable); }
  :root input[type="range"]:disabled::-moz-range-track { cursor: var(--cursor-unavailable); }
}
`;
writeFileSync(path.join(root, 'src/styles/cursors.generated.css'), css);
writeFileSync(path.join(root, 'docs/cursor-assets.manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Cursors: ${files.length} original 32px CUR, ${manifest.publishedBytes} B including copyright`);
