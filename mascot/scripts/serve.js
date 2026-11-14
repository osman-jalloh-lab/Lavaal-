/**
 * Local static server for the module demo (ES modules need http://).
 *
 *   npm run demo            → http://127.0.0.1:5173/demo/index.html
 *   PORT=8080 npm run demo
 *
 * Binds to 127.0.0.1 only. Serves files inside the prototype folder only.
 * No dependencies. For a no-server option, open demo/standalone.html.
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5173;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
               '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.md': 'text/plain; charset=utf-8' };

http.createServer((req, res) => {
  let urlPath;
  try { urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname); }
  catch { res.writeHead(400); return res.end('Bad request'); }
  if (urlPath === '/') { res.writeHead(302, { Location: '/demo/index.html' }); return res.end(); }
  const file = path.resolve(ROOT, '.' + urlPath);
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
}).listen(PORT, '127.0.0.1', () => {
  console.log(`LAVAALL mascot demo: http://127.0.0.1:${PORT}/demo/index.html  (Ctrl+C to stop)`);
});
