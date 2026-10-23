import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { parseBirthdayMail } from '../src/data/birthdayMailSource.ts';

const source = 'asserts/生日贺图/信与回复.md';
const bytes = readFileSync(source);
const letters = parseBirthdayMail(bytes.toString('utf8'));
const data = { source, sha256: createHash('sha256').update(bytes).digest('hex'), letters };
writeFileSync('src/data/birthdayMail.generated.json', JSON.stringify(data, null, 2) + '\n');
console.log(`Birthday mail: ${letters.length} years, ${letters.filter((letter) => letter.pending).length} pending`);
