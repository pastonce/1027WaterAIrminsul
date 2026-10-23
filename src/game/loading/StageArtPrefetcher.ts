import { loadingArtSource } from '../../data/stageLoading';
import type { LoadingArt } from '../../data/stageLoading';

export class StageArtPrefetcher {
  private idle: number | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private link: HTMLLinkElement | null = null;
  private source: string | null = null;

  private allowed() {
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    return !document.hidden && !connection?.saveData && !['slow-2g', '2g'].includes(connection?.effectiveType ?? '');
  }

  prepare(artwork: LoadingArt, width: number, height: number, density: number) {
    const source = loadingArtSource(artwork, width, height, density);
    if (source === this.source) return;
    this.cancel();
    if (!this.allowed()) return;
    this.source = source;
    const request = () => {
      this.idle = null; this.timer = null;
      if (!this.allowed()) { this.source = null; return; }
      const link = document.createElement('link');
      link.rel = 'prefetch'; link.as = 'image'; link.type = 'image/webp'; link.href = source; link.fetchPriority = 'low';
      this.link = link; document.head.append(link);
    };
    if ('requestIdleCallback' in window) this.idle = window.requestIdleCallback(request, { timeout: 5000 });
    else this.timer = setTimeout(request, 2000);
  }

  cancel() {
    if (this.idle !== null) window.cancelIdleCallback(this.idle);
    if (this.timer !== null) clearTimeout(this.timer);
    this.link?.remove(); this.link = null; this.source = null; this.idle = null; this.timer = null;
  }
}
