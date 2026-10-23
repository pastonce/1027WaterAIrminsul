import type { ExpressionMarker } from '../types/game';

export interface SourceDialogue { id: string; text: string; anchor: 'tree' | 'nahida' | 'user'; expressions?: ExpressionMarker[] }
export type DialogueCatalog = Record<string, SourceDialogue[]>;

export function parseDialogueDocument(source: string) {
  const sections: Record<string, string> = { 常态对白: 'normal', 剧情台词: 'story', 阶段转场: 'transition', 纳西妲的对白: 'nahida', 用户祝福: 'wish', 纳西妲回复: 'reply' };
  const shared: Record<string, string> = { 机制提示: 'mechanism', 进度上限: 'limit', 待机对白: 'idle', 欢迎回来: 'welcome' };
  const catalog: DialogueCatalog = {};
  const identifiers = new Set<string>();
  const treeExpressions: Record<string, number[]> = {};
  let stage = '';
  let pool = '';
  for (const line of source.split(/\r?\n/)) {
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading) {
      const stageHeading = /^([A-G])(?:\s*\[([0-9]+)\])?$/.exec(heading[1]);
      stage = stageHeading?.[1] ?? '';
      if (stage && stage !== 'G' && stageHeading?.[2]) treeExpressions[stage] = [...new Set(Array.from(stageHeading[2], Number))];
      pool = shared[heading[1]] ? `shared/${shared[heading[1]]}` : '';
      if (pool) catalog[pool] = [];
      continue;
    }
    const section = /^###\s+(?:[①-⑳]|\d+[.、]?)?\s*(.+?)\s*$/.exec(line);
    if (section) {
      const name = sections[section[1]];
      pool = stage && name ? `${stage}/${name}` : '';
      if (pool) catalog[pool] = [];
      continue;
    }
    const entry = /^-\s+\*\*([A-Z]\d+[A-Z]?)\*\*\s*(.+?)\s*$/.exec(line);
    if (!entry) continue;
    if (!pool || identifiers.has(entry[1])) throw new Error(`Invalid dialogue source: ${entry[1]}`);
    identifiers.add(entry[1]);
    const anchor = pool.endsWith('/wish') ? 'user' : pool.endsWith('/nahida') || pool.endsWith('/reply') ? 'nahida' : 'tree';
    const body = entry[2].replaceAll('**', '');
    let text = ''; let previous = 0;
    const expressions: ExpressionMarker[] = [];
    for (const marker of body.matchAll(/\[([0-9]+)\]/gu)) {
      text += body.slice(previous, marker.index);
      expressions.push({ mode: 'middle', offset: text.length, choices: [...new Set(Array.from(marker[1], Number))] });
      previous = marker.index + marker[0].length;
    }
    text += body.slice(previous);
    for (const marker of expressions) marker.mode = marker.offset === 0 ? 'before' : marker.offset === text.length ? 'after' : 'middle';
    catalog[pool].push({ id: entry[1], text, anchor, ...(expressions.length ? { expressions } : {}) });
  }
  for (const stageId of ['A', 'B', 'C', 'D', 'E', 'F']) for (const name of ['normal', 'story', 'transition', 'nahida']) {
    if (!catalog[`${stageId}/${name}`]?.length) throw new Error(`Missing dialogue pool: ${stageId}/${name}`);
  }
  for (const key of ['G/wish', 'G/reply', 'G/nahida', 'shared/mechanism', 'shared/limit', 'shared/idle', 'shared/welcome']) {
    if (!catalog[key]?.length) throw new Error(`Missing dialogue pool: ${key}`);
  }
  return { pools: catalog, treeExpressions };
}

export function parseDialogueSource(source: string): DialogueCatalog { return parseDialogueDocument(source).pools; }
