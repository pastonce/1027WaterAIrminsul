const mountPath = '/nahida1027';
const pagesOrigin = 'https://nahida-1027.pages.dev';

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === mountPath) {
      url.pathname += '/';
      return Response.redirect(url.toString(), 308);
    }
    if (!url.pathname.startsWith(`${mountPath}/`)) return fetch(request);

    const target = new URL(pagesOrigin);
    target.pathname = url.pathname.slice(mountPath.length);
    target.search = url.search;
    const upstream = new Request(target.toString(), request);
    upstream.headers.delete('Host');
    upstream.headers.delete('Cookie');
    upstream.headers.delete('Authorization');

    const response = await fetch(upstream, { redirect: 'manual' });
    const location = response.headers.get('Location');
    if (!location || response.status < 300 || response.status >= 400) return response;

    const redirect = new URL(location, target);
    if (redirect.origin !== pagesOrigin) return response;
    const headers = new Headers(response.headers);
    headers.set('Location', `${mountPath}${redirect.pathname}${redirect.search}${redirect.hash}`);
    return new Response(response.body, { status: response.status, headers });
  },
};
