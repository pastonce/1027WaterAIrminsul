export type NoticeBlock = { kind: 'heading' | 'paragraph' | 'tagline'; text: string } | { kind: 'list'; items: string[] };
export interface NoticeDocument { title: string; blocks: NoticeBlock[] }

export function parseNotice(source: string): NoticeDocument {
  const document: NoticeDocument = { title: '企划声明', blocks: [] };
  let paragraph: string[] = [];
  let items: string[] = [];
  const flushParagraph = () => { if (paragraph.length) document.blocks.push({ kind: 'paragraph', text: paragraph.join(' ') }); paragraph = []; };
  const flushList = () => { if (items.length) document.blocks.push({ kind: 'list', items }); items = []; };
  for (const raw of source.replaceAll('\r\n', '\n').split('\n')) {
    const line = raw.trim();
    const title = line.match(/^#\s+(.+)$/);
    const heading = line.match(/^#{2,6}\s+(.+)$/);
    const tagline = line.match(/^>\s+(.+)$/);
    if (!line || title || heading || tagline) {
      flushParagraph(); flushList();
      if (title) document.title = title[1];
      if (heading) document.blocks.push({ kind: 'heading', text: heading[1] });
      if (tagline) document.blocks.push({ kind: 'tagline', text: tagline[1] });
    } else if (line.startsWith('- ')) {
      flushParagraph(); items.push(line.slice(2));
    } else {
      flushList(); paragraph.push(line);
    }
  }
  flushParagraph(); flushList();
  return document;
}

export function noticeLinkAllowed(href: string) {
  return /^https:\/\/[^\s]+$/i.test(href) || /^\/(?!\/)[^\s\\]*$/.test(href);
}
