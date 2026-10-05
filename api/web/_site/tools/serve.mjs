// Tiny static server for QA scripts (root = web building bz). Starts on import, closes with srv.close().
import http from 'http'; import fs from 'fs'; import path from 'path';
const ROOT = path.resolve('..');
const T = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.json': 'application/json', '.mp4': 'video/mp4', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.md': 'text/plain' };
export const srv = http.createServer((q, s) => {
  let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  if (!f.startsWith(ROOT)) { s.statusCode = 403; return s.end(); }
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  fs.stat(f, (e, st) => {
    if (e) { s.statusCode = 404; return s.end(); }
    const type = T[path.extname(f).toLowerCase()] || 'application/octet-stream';
    const range = q.headers.range;
    if (range && type === 'video/mp4') {
      const [a, b] = range.replace('bytes=', '').split('-'); const start = +a, end = b ? +b : st.size - 1;
      s.writeHead(206, { 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, 'Content-Type': type });
      return fs.createReadStream(f, { start, end }).pipe(s);
    }
    s.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes' }); fs.createReadStream(f).pipe(s);
  });
}).listen(8080, '127.0.0.1');
