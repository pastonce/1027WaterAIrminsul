import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { projectRoot } from './player-spine-utils.mjs';

export async function startAssetServer() {
  const types = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.atlas': 'text/plain', '.txt': 'text/plain', '.png': 'image/png', '.css': 'text/css' };
  const prefixes = ['/asserts/player/', '/asserts/player-extracted/', '/docs/player-', '/docs/screenshots/', '/scripts/player-', '/node_modules/spine-player-4-0/dist/'];
  const server = createServer((request, response) => {
    try {
      let pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      if (!prefixes.some((prefix) => pathname.startsWith(prefix))) { response.writeHead(404).end(); return; }
      if (pathname.endsWith('/')) pathname += 'index.html';
      const file = path.resolve(projectRoot, '.' + pathname);
      if (!file.startsWith(projectRoot) || !existsSync(file) || !statSync(file).isFile()) { response.writeHead(404).end(); return; }
      response.setHeader('Content-Type', types[path.extname(file)] ?? 'application/octet-stream');
      createReadStream(file).pipe(response);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((resolve) => server.close(resolve)) };
}
