import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.atlas': 'text/plain', '.png': 'image/png', '.css': 'text/css', '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain' };
const server = createServer((request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname === '/') { response.writeHead(302, { Location: '/web/' }).end(); return; }
    const file = path.resolve(root, '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname));
    if (!file.startsWith(root) || !statSync(file).isFile()) { response.writeHead(404).end(); return; }
    response.setHeader('Content-Type', mime[path.extname(file)] ?? 'application/octet-stream');
    createReadStream(file).pipe(response);
  } catch { response.writeHead(404).end(); }
});
server.listen(Number(process.env.PORT ?? 8080), '127.0.0.1', () => console.log(`Open http://127.0.0.1:${server.address().port}/web/ (Ctrl+C to stop)`));
