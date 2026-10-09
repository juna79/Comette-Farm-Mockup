// Tiny static server for local preview: node tools/serve.js [port]
process.env.LOCAL_DEV = '1';                                       // marks this as the local preview (enables the 1234 password and the outbox folder)
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), port = +process.argv[2] || 5180;
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.json':'application/json'};
const {handleOrder} = require('../server/orderEmail');
const stateApi = require('../server/stateApi');
const STATE_FILE = path.join(root, '.local-state.json');          // local stand-in for Netlify Blobs (gitignored)
const fileStore = { get: () => { try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return null; } }, set: o => fs.writeFileSync(STATE_FILE, JSON.stringify(o)) };
http.createServer((req, res) => {
  if (req.url.split('?')[0] === '/api/state' || req.url.split('?')[0] === '/api/login') {
    let b = ''; req.on('data', d => { b += d; if (b.length > 1000000) req.destroy(); });
    return req.on('end', async () => {
      const out = await stateApi.handle({method: req.method, path: req.url.split('?')[0], password: req.headers['x-staff-password'] || '', bodyText: b}, {store: fileStore, env: process.env});
      res.writeHead(out.status, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'}); res.end(JSON.stringify(out.body));
    });
  }
  if (req.method === 'POST' && req.url === '/api/order') {          // local stand-in for the hosted function
    let b = ''; req.on('data', d => { b += d; if (b.length > 100000) req.destroy(); });
    return req.on('end', async () => {
      try { const out = await handleOrder(JSON.parse(b || '{}')); res.writeHead(200, {'Content-Type': 'application/json'}); res.end(JSON.stringify(out)); }
      catch (e) { res.writeHead(e.status || 500, {'Content-Type': 'application/json'}); res.end(JSON.stringify({ok: false, error: e.status ? e.message : 'Could not send the order'})); }
    });
  }
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, path.normalize(p));
  if (!f.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (e, b) => e ? (res.writeHead(404), res.end('Not found')) : (res.writeHead(200, {'Content-Type': types[path.extname(f)] || 'application/octet-stream'}), res.end(b)));
}).listen(port, () => console.log('http://localhost:' + port));
