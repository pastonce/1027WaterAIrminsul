import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { parseDialogueDocument } from '../src/data/dialogueSource.ts';
import { releaseDialoguePools } from '../src/data/dialogueRelease.ts';

const source = readFileSync(new URL('../asserts/对白整合.md', import.meta.url), 'utf8');
const parsed = parseDialogueDocument(source);
const output = new URL('../src/data/dialogues.generated.json', import.meta.url);
const previous = JSON.parse(readFileSync(output, 'utf8'));
const { pools, deferredPools } = releaseDialoguePools(parsed.pools, previous);
const catalog = { source: 'asserts/对白整合.md', sha256: createHash('sha256').update(source).digest('hex'), pools, treeExpressions: parsed.treeExpressions, deferredPools };
writeFileSync(output, JSON.stringify(catalog, null, 2) + '\n');
console.log(JSON.stringify({ pools: Object.keys(pools).length, lines: Object.values(pools).reduce((total, lines) => total + lines.length, 0), sha256: catalog.sha256, deferredPools, counts: Object.fromEntries(Object.entries(pools).map(([key, entries]) => [key, entries.length])) }, null, 2));
