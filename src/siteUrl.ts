// The entry page is served at the root or at a mount path ending in a slash.
const mountPath = typeof document === 'undefined' ? '' : new URL('.', document.baseURI).pathname.slice(0, -1);

export function siteUrl(path: string): string {
  return path.startsWith('/') && !path.startsWith('//') ? mountPath + path : path;
}
