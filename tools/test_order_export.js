// Checks for the office order export.   node tools/test_order_export.js
// Uses a stubbed mail transport, so nothing is ever sent.
const assert = require('assert'), fs = require('fs'), path = require('path'), XLSX = require('xlsx');
const nm = require('nodemailer'); const sent = []; nm.createTransport = () => ({sendMail: async m => { sent.push(m); }});
const {handleOrder, buildCustomerEmail} = require('../server/orderEmail');
const {buildImport, buildWorkbook, bundledCatalogue} = require('../server/orderExport');

const s = fs.readFileSync(path.join(__dirname, '..', 'data', 'catalogue.js'), 'utf8');
const CAT = JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1));
const V = {}; CAT.products.forEach(p => p.variants.forEach(v => V[v.sku] = {p, v}));
const base = bundledCatalogue();                                            // [id, name, sku] in office-sheet order
const line = (sku, qty) => { const {p, v} = V[sku]; return {sku, name: p.name, option: v.src, qty, qtyText: v.unit === 'kg' ? qty + ' kg' : String(qty), unitPrice: v.price, est: !!v.estimate, note: '', total: v.price * qty}; };
const order = (lines, extra = {}) => ({id: 'GG-261021-001', createdAt: '2026-10-21T08:00:00Z', customer: {name: 'Wanjiru Kamau (Test)', email: 'customer@example.com', phone: '+254700000000', address: 'Karen, Nairobi', notes: ''},
  date: '2026-10-23', group: '', groupName: '', lines, subtotal: lines.reduce((t, l) => t + l.total, 0), total: lines.reduce((t, l) => t + l.total, 0), hasEstimate: lines.some(l => l.est), website: '', ...extra});

const kg = Object.values(V).find(x => x.v.unit === 'kg'), piece = Object.values(V).find(x => x.v.estimate);
const picks = [Object.keys(V).map(Number).sort((a, b) => V[b].v.ord - V[a].v.ord)[0], kg.v.sku, 97, piece.v.sku];   // deliberately not in sheet order
const lines = [line(picks[0], 2), line(picks[1], 1.5), line(picks[2], 3), line(picks[3], 4)];
const sheetRows = buf => XLSX.utils.sheet_to_json(XLSX.read(buf, {type: 'buffer'}).Sheets['Order Import'], {header: 1});

// 1. sheet content, order, zeros, decimals, ids
let o = order(lines, {catalogue: base}); let imp = buildImport(o);
assert(imp.ok, 'clean order should have nothing to flag: ' + JSON.stringify(imp.items.concat(imp.notes)));
let buf = buildWorkbook(imp, o), wb = XLSX.read(buf, {type: 'buffer'});
assert.deepStrictEqual(wb.SheetNames, ['Order Import']);
const rows = sheetRows(buf);
assert.deepStrictEqual(rows[0], ['ItemID', 'Quantity']);
assert.strictEqual(rows.length, 1 + base.length, 'one row per product, header excluded from count');
assert.deepStrictEqual(rows.slice(1).map(r => r[0]), base.map(r => r[0]), 'ItemIDs in source order');
const want = Object.fromEntries(lines.map(l => [l.sku, l.qty]));
rows.slice(1).forEach(([id, q]) => assert.strictEqual(q, want[id] || 0, 'qty for ' + id));
assert(rows.slice(1).every(r => typeof r[0] === 'number' && typeof r[1] === 'number'), 'numeric cells');
assert(rows.some(r => r[1] === 1.5), 'decimal quantity kept');
assert(rows.filter(r => r[1] === 0).length === base.length - 4, 'unselected = numeric zero');
const ws = XLSX.read(buf, {type: 'buffer', cellNF: true}).Sheets['Order Import']; assert(!ws['!merges'], 'no merged cells'); assert.strictEqual(ws['A2'].z, '0');
assert.strictEqual(ws['!ref'], 'A1:B' + (base.length + 1));
console.log('1 ok: sheet', base.length, 'rows, source order, zeros, decimal 1.5');

// 2. unmatched / no-ID / ambiguous lines are flagged, never dropped
const snap = [...base, [null, 'Brand new thing', 900001], [1685, 'Hibiscus Juice', 1685], [97, 'Dup row', 97]];   // 97 now ambiguous, 900001 has no office ID
const lines2 = [line(picks[1], 1.5), {...line(picks[1], 1), sku: 900001, name: 'Brand new thing', option: ''}, {...line(picks[1], 1), sku: 1685, name: 'Hibiscus Juice', option: ''}, line(97, 2), {...line(picks[1], 1), sku: 424242, name: 'Ghost'}];
o = order(lines2, {catalogue: snap}); imp = buildImport(o);
const why = imp.items.map(i => i.name + ': ' + i.reason).join(' | ');
assert(!imp.ok && imp.items.length === 3, why);
assert(/no office ItemID/.test(why) && /not in the product list/.test(why) && /ambiguous/.test(why), why);
assert(imp.rows.find(r => r.id === 1685).qty === 1, 'extra item with its own ItemID is exported');
assert(!imp.rows.some(r => r.id === 900001 || r.id === 424242), 'no invented IDs in the grid');
buf = buildWorkbook(imp, o); wb = XLSX.read(buf, {type: 'buffer'});
assert.deepStrictEqual(wb.SheetNames, ['Order Import', 'Needs attention']); assert.strictEqual(sheetRows(buf)[0].length, 2);
console.log('2 ok: flagged ->', imp.items.length, 'items');

// 3. old page (no product list) falls back to the base list, flagged
o = order(lines); imp = buildImport(o);
assert(!imp.ok && imp.source === 'base' && imp.notes.length === 1 && imp.rows.length === base.length);
console.log('3 ok: old page flagged');

// 4. a later upload cannot change an earlier order
const early = order(lines, {catalogue: base}), before = JSON.stringify(buildImport(early).rows);
const later = order(lines, {catalogue: [...base.slice(0, 5), [9999, 'Inserted by a later upload', 9999], ...base.slice(5)]});
assert.notStrictEqual(JSON.stringify(buildImport(later).rows), before); assert.strictEqual(JSON.stringify(buildImport(early).rows), before);
console.log('4 ok: earlier order unchanged by a later list');

// 5. emails: one owner email with the sheet, one customer email without
(async () => {
  const env = {EMAIL_LIVE: '1', GMAIL_USER: 'orders@example.com', GMAIL_APP_PASSWORD: 'x', ORDER_TO: 'office@example.com'};
  const o5 = order(lines, {catalogue: base});
  const r = await handleOrder(JSON.parse(JSON.stringify(o5)), env);
  assert.strictEqual(sent.length, 2, 'exactly two emails: ' + sent.length);
  const [own, cus] = sent;
  assert.strictEqual(own.to, 'office@example.com'); assert.strictEqual(cus.to, 'customer@example.com');
  assert.strictEqual(own.attachments.length, 1);
  assert.strictEqual(own.attachments[0].filename, 'Order GG-261021-001 - Wanjiru Kamau Test.xlsx');
  assert(own.attachments[0].contentType.includes('spreadsheetml'));
  assert.deepStrictEqual(sheetRows(own.attachments[0].content), rows.slice(0, 1).concat(buildImport(o5).rows.map(x => [x.id, x.qty])));
  assert(own.html.includes('Office copy/paste view') && own.text.includes('OFFICE COPY/PASTE VIEW'));
  assert(own.html.indexOf('Office copy/paste view') > own.html.indexOf('Karen, Nairobi'), 'copy/paste view is at the bottom');
  assert(!/^CHECK/.test(own.subject)); assert(own.html.includes('Friday 23 October') || own.html.includes('23 October'));
  assert(!(cus.attachments && cus.attachments.length), 'customer email has no attachment');
  assert(!/ItemID|copy\/paste|\.xlsx|spreadsheet/i.test(cus.html + cus.text), 'customer email text has no office material');
  assert.strictEqual(cus.html, buildCustomerEmail(o5).html, 'customer email unchanged');
  assert.strictEqual(r.sheet, 'attached');
  const pastedIds = [...own.html.split('Office copy/paste view')[1].matchAll(/<td[^>]*>(\d+)<\/td><td[^>]*>([\d.]+)<\/td>/g)].map(m => [+m[1], +m[2]]);
  assert.deepStrictEqual(pastedIds, buildImport(o5).rows.map(x => [x.id, x.qty]), 'copy/paste view = attachment rows');
  console.log('5 ok: 2 emails; owner has xlsx + copy/paste view; customer has neither');

  // 6. flagged order: subject + banner, and the order is still emailed
  sent.length = 0;
  await handleOrder(order(lines2, {catalogue: snap}), env);
  assert.strictEqual(sent.length, 2); assert(sent[0].subject.startsWith('CHECK ITEMIDS')); assert(sent[0].html.includes('CHECK BEFORE IMPORTING'));
  assert(!/CHECK BEFORE|ItemID/i.test(sent[1].html + sent[1].text));
  console.log('6 ok: flagged order still emailed, owner-only warning');
  console.log('ALL PASSED');
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
