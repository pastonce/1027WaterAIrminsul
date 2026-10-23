import type { Connect, Plugin } from 'vite';
import { createTimeResponse } from './timeEndpoint';

const middleware: Connect.NextHandleFunction = (request, response, next) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (!['/api/time', '/api/time/'].includes(url.pathname)) return next();
  const result = createTimeResponse(new Request(url, { method: request.method }));
  response.statusCode = result.status;
  result.headers.forEach((value, name) => response.setHeader(name, value));
  void result.text().then((body) => response.end(body), next);
};

export function timePlugin(): Plugin {
  return {
    name: 'irminsul-time',
    configureServer(server) { server.middlewares.use(middleware); },
    configurePreviewServer(server) { server.middlewares.use(middleware); },
  };
}
