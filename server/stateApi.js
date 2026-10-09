/* Shared shop state (this week's stock, prices and added items) + staff login.
   Used by netlify/functions/state.mjs (Netlify Blobs) and tools/serve.js (a local file), so both behave the same.
   handle({method, path, password, bodyText}, {store:{get(),set(obj)}, env}) -> {status, body}
   Env: STAFF_PASSWORD  (required; set in Netlify. Locally (tools/serve.js sets LOCAL_DEV=1) it defaults to 1234.)         */
const crypto = require('crypto');

const CATEGORIES = ['Vegetables', 'Fruit', 'Herbs & Salad', 'Dairy, Cheese & Eggs', 'Meat & Fish', 'Drinks', 'Pantry', 'Flowers', 'Live Plants'];
const num = (x, lo, hi) => { const n = Number(x); if (!Number.isFinite(n) || n < lo || n > hi) throw bad('Invalid number'); return n; };
const str = (x, max) => { const s = String(x ?? ''); if (s.length > max) throw bad('Text too long'); return s; };
function bad(m) { const e = new Error(m); e.status = 400; return e; }

function cleanOv(ov) {
  const out = {prod: {}, sku: {}};
  for (const [k, v] of Object.entries((ov && ov.sku) || {})) {
    if (!/^\d{1,9}$/.test(k) || !v || typeof v !== 'object') continue;
    const o = {};
    if (v.price != null) o.price = num(v.price, 0, 10000000);
    if (v.estKg != null) o.estKg = num(v.estKg, 0.001, 1000);
    if (v.out != null) o.out = !!v.out;
    out.sku[k] = o;
  }
  return out;
}
function cleanMeta(m) {
  if (!m) return null;
  const c = m.counts || {};
  return {updated: str(m.updated, 40), file: str(m.file, 200), counts: {available: num(c.available || 0, 0, 1e6), out: num(c.out || 0, 0, 1e6), prices: num(c.prices || 0, 0, 1e6), added: num(c.added || 0, 0, 1e6)}};
}
function cleanProduct(p) {
  if (!p || !CATEGORIES.includes(p.category) || !Array.isArray(p.variants) || p.variants.length < 1 || p.variants.length > 4) throw bad('Invalid item');
  return {id: str(p.id, 40).replace(/[^a-z0-9]/gi, ''), name: str(p.name, 120), category: p.category, brand: '', emoji: '', inStock: true, slug: '', isNew: true,
    variants: p.variants.map(v => {
      const o = {sku: num(v.sku, 1, 999999999), src: str(v.src, 120), unit: str(v.unit, 20), price: num(v.price, 0, 10000000), chargeUnit: str(v.chargeUnit, 20), ripeness: ''};
      if (v.estimate) { o.estimate = true; o.estKg = num(v.estKg, 0.001, 1000); o.estPrice = Math.round(num(v.estPrice ?? v.price * v.estKg, 0, 1e9)); }
      return o;
    })};
}
function sanitize(b) {
  if (!b || typeof b !== 'object') throw bad('No data');
  const extra = Array.isArray(b.extra) ? b.extra : [];
  if (extra.length > 500) throw bad('Too many new items');
  const prev = b.prev && typeof b.prev === 'object' ? {ov: cleanOv(b.prev.ov), weeklyMeta: cleanMeta(b.prev.weeklyMeta), extraCount: num(b.prev.extraCount || 0, 0, 500)} : null;
  return {v: 1, updated: new Date().toISOString(), ov: cleanOv(b.ov), extra: extra.map(cleanProduct), weeklyMeta: cleanMeta(b.weeklyMeta), prev};
}
function checkPassword(given, expected) {
  if (!expected || typeof given !== 'string' || !given) return false;
  const a = crypto.createHash('sha256').update(given).digest(), b = crypto.createHash('sha256').update(String(expected)).digest();
  return crypto.timingSafeEqual(a, b);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function handle({method, path, password, bodyText}, {store, env}) {
  const expected = env.STAFF_PASSWORD || (env.LOCAL_DEV === '1' ? '1234' : '');   // the 1234 default exists only in the local preview
  try {
    if (path === '/api/state' && method === 'GET') return {status: 200, body: (await store.get()) || {}};
    if (!expected) return {status: 503, body: {ok: false, error: 'The staff password has not been set up yet.'}};
    if (path === '/api/login' && method === 'POST') {
      let given = password; try { given = JSON.parse(bodyText || '{}').password; } catch {}
      const ok = checkPassword(given, expected); if (!ok) await sleep(600);
      return ok ? {status: 200, body: {ok: true}} : {status: 401, body: {ok: false, error: 'Wrong password'}};
    }
    if (path === '/api/state' && method === 'POST') {
      if (!checkPassword(password, expected)) { await sleep(600); return {status: 401, body: {ok: false, error: 'Wrong password'}}; }
      if ((bodyText || '').length > 900000) throw bad('Too much data');
      let b; try { b = JSON.parse(bodyText || '{}'); } catch { throw bad('Not valid data'); }
      const state = sanitize(b); await store.set(state);
      return {status: 200, body: {ok: true, updated: state.updated}};
    }
    return {status: 405, body: {ok: false, error: 'Not allowed'}};
  } catch (e) {
    return {status: e.status || 500, body: {ok: false, error: e.status ? e.message : 'Something went wrong'}};
  }
}
module.exports = {handle, sanitize, checkPassword};
