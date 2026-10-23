import { TIME_PROTOCOL_VERSION } from '../src/game/time/protocol';

export function createTimeResponse(request: Request) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, max-age=0',
    'CDN-Cache-Control': 'no-store',
  };
  if (!['GET', 'HEAD'].includes(request.method)) {
    return new Response(null, { status: 405, headers: { ...headers, Allow: 'GET, HEAD' } });
  }
  const requestId = new URL(request.url).searchParams.get('requestId') ?? '';
  if (requestId.length > 128 || !/^[\w-]*$/.test(requestId)) return new Response(null, { status: 400, headers });
  const body = { version: TIME_PROTOCOL_VERSION, now: Date.now(), requestId };
  return new Response(request.method === 'HEAD' ? null : JSON.stringify(body), { headers });
}
