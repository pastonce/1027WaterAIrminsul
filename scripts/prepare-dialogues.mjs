import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { parseDialogueDocument } from '../src/data/dialogueSource.ts';

const source = readFileSync(new URL('../asserts/对白整合.md', import.meta.url), 'utf8');
const { pools, treeExpressions } = parseDialogueDocument(source);
const catalog = { source: 'asserts/对白整合.md', sha256: createHash('sha256').update(source).digest('hex'), pools, treeExpressions };
writeFileSync(new URL('../src/data/dialogues.generated.json', import.meta.url), JSON.stringify(catalog, null, 2) + '\n');
console.log(JSON.stringify({ pools: Object.keys(pools).length, lines: Object.values(pools).reduce((total, lines) => total + lines.length, 0), sha256: catalog.sha256, counts: Object.fromEntries(Object.entries(pools).map(([key, entries]) => [key, entries.length])) }, null, 2));
