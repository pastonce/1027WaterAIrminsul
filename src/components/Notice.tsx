import type { ReactNode } from 'react';
import source from '../content/notice.md?raw';
import { parseNotice, noticeLinkAllowed } from '../game/notice/markdown';
import { Modal } from './Modal';
import { Icon } from './Icon';

const document = parseNotice(source);

function noticeText(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)) {
    nodes.push(text.slice(cursor, match.index));
    nodes.push(noticeLinkAllowed(match[2]) ? <a key={match.index} href={match[2]} target="_blank" rel="noopener noreferrer">{match[1]}</a> : match[1]);
    cursor = match.index + match[0].length;
  }
  nodes.push(text.slice(cursor));
  return nodes;
}

export function Notice({ onClose, reduced }: { onClose: () => void; reduced: boolean }) {
  return <Modal title={document.title} subtitle={null} className="notice-modal" reduced={reduced} onClose={onClose} returnFocus="[data-notice-opener]:not(:disabled)">
    <article className="notice-content">{document.blocks.filter((block) => block.kind !== 'tagline').map((block, index) => block.kind === 'heading' ? <h3 key={index}>{block.text}</h3> : block.kind === 'paragraph' ? <p key={index}>{noticeText(block.text)}</p> : block.kind === 'list' ? <ul key={index}>{block.items.map((item, position) => <li key={position}>{noticeText(item)}</li>)}</ul> : null)}
      {document.blocks.filter((block) => block.kind === 'tagline').map((block, index) => <footer className="notice-tagline" key={index}><Icon name="leaf" size={22}/><p>{'text' in block ? noticeText(block.text) : null}</p></footer>)}
    </article>
  </Modal>;
}
