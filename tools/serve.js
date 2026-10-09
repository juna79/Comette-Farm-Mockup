// Tiny static server for local preview: node tools/serve.js [port]
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), port = +process.argv[2] || 5180;
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.json':'application/json'};
const {handleOrder} = require('../server/orderEmail');
http.createServer((req, res) => {
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
