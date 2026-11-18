import { createReadStream } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const publicDir = resolve(root, 'public');
const port = Number(process.env.PORT || 4173);
const mimeTypes = { '.css': 'text/css; charset=utf-8', '.gif': 'image/gif', '.html': 'text/html; charset=utf-8', '.ico': 'image/x-icon', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.xml': 'application/xml; charset=utf-8', '.woff2': 'font/woff2' };
function requestPath(url) { const pathname = decodeURIComponent(new URL(url, 'http://localhost').pathname); return resolve(publicDir, normalize(pathname === '/' ? 'index.html' : pathname.replace(/^[/\\]+/, ''))); }
const server = createServer(async (req, res) => {
  if (!['GET', 'HEAD'].includes(req.method || '')) { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return; }
  const filePath = requestPath(req.url || '/');
  if (!filePath.startsWith(`${publicDir}\\`) && filePath !== publicDir) { res.writeHead(403); res.end('Forbidden'); return; }
  try { await access(filePath); const file = await stat(filePath); if (file.isDirectory()) { res.writeHead(301, { Location: `${req.url?.replace(/\/$/, '')}/` }); res.end(); return; } const extension = extname(filePath).toLowerCase(); res.writeHead(200, { 'Content-Type': mimeTypes[extension] || 'application/octet-stream', 'Content-Length': file.size, 'Cache-Control': extension === '.idf' ? 'no-store' : 'no-cache', 'Cross-Origin-Resource-Policy': 'same-origin' }); if (req.method === 'HEAD') { res.end(); return; } createReadStream(filePath).pipe(res); } catch { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Not found'); }
});
server.listen(port, '0.0.0.0', () => {
  console.log(`IDF 三维模型管理平台已启动： http://localhost:${port}`);
  console.log(`静态目录：${publicDir}`);
});
