/* Office export for one order: the Excel "Order Import" sheet (ItemID | Quantity) and the matching copy/paste view.
   Used only for the office email; the customer email never sees any of this.

   The sheet is built from the product list the order was placed against (order.catalogue, frozen by the shop page when the
   customer pressed Order), so a later weekly upload cannot change an earlier order. Quantities are matched on the website sku,
   which is the office ItemID. Never on position, row number, or name alone.
   Anything that cannot be matched with certainty is NOT dropped and NOT guessed: it is returned in `items` and shown at the top of
   the office email (and on a second "Needs attention" sheet), so the office never gets a sheet that only looks complete.

   Snapshot row format: [officeItemID | null, source name, website sku]   (null = the uploaded sheet gave the item no ItemID). */
const fs = require('fs'), path = require('path');

const MAX_ROWS = 2000;
const goodId = n => Number.isSafeInteger(n) && n > 0;

let bundled;                                                            // the shop's base list, a cross-check and the fallback for old pages
function bundledCatalogue() {
  if (bundled !== undefined) return bundled;
  const here = [path.join(__dirname, '..', 'data', 'catalogue.js'), path.join(process.cwd(), 'data', 'catalogue.js'),
    process.env.LAMBDA_TASK_ROOT && path.join(process.env.LAMBDA_TASK_ROOT, 'data', 'catalogue.js')].filter(Boolean);
  for (const f of here) {
    try {
      const s = fs.readFileSync(f, 'utf8'), j = JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1)), rows = [];
      j.products.forEach(p => p.variants.forEach(v => rows.push([v.sku, v.src, v.sku, v.ord])));
      rows.sort((a, b) => a[3] - b[3]);
      return (bundled = rows.map(r => r.slice(0, 3)));
    } catch { /* try the next location */ }
  }
  return (bundled = null);
}

function readSnapshot(raw) {                                            // -> rows, or null if it is not a well-formed list
  if (!Array.isArray(raw) || !raw.length || raw.length > MAX_ROWS) return null;
  const rows = [];
  for (const r of raw) {
    if (!Array.isArray(r) || r.length < 3 || typeof r[1] !== 'string' || r[1].length > 200) return null;
    if (!(r[0] === null || goodId(r[0])) || !goodId(r[2])) return null;
    rows.push([r[0], r[1], r[2]]);
  }
  return rows;
}

const qtyClean = q => Math.round(q * 1e6) / 1e6;                        // 0.1 + 0.2 must not become 0.30000000000000004

function buildImport(o) {
  const notes = [], items = [];
  let rows = null, source = 'order';
  if (o.catalogue !== undefined) {
    rows = readSnapshot(o.catalogue);
    if (!rows) notes.push('The product list sent with this order could not be read, so the sheet was built from the shop\'s base list. Check any item added from a weekly upload by hand.');
  } else notes.push('This order came from an older copy of the shop page that did not send its product list. The sheet was built from the shop\'s base list; items added from a weekly upload cannot be matched.');
  if (!rows) { rows = bundledCatalogue(); source = 'base'; }
  if (!rows) throw new Error('No product list is available to build the sheet from.');
  const base = bundledCatalogue();
  const baseName = base ? new Map(base.map(r => [r[0], r[1]])) : null;

  const bySku = new Map();
  rows.forEach(r => { if (!bySku.has(r[2])) bySku.set(r[2], []); bySku.get(r[2]).push(r); });
  const dupes = [...bySku].filter(([, g]) => g.length > 1).map(([k]) => k);
  if (dupes.length) notes.push(`The product list repeats ItemID ${dupes.slice(0, 10).join(', ')}. Orders for those items are listed under "Needs attention".`);

  const qty = new Map();                                                // snapshot row -> quantity
  for (const l of o.lines) {
    const label = `${l.name}${l.option ? ' (' + l.option + ')' : ''}`, q = qtyClean(Number(l.qty)), sku = Number(l.sku);
    const bad = reason => items.push({name: label, qty: q, reason});
    if (!Number.isFinite(q) || q <= 0) { bad('Invalid quantity.'); continue; }
    const hits = goodId(sku) ? bySku.get(sku) : null;
    if (!hits) bad(goodId(sku) ? `ItemID ${sku} is not in the product list for this order.` : 'The order line has no ItemID.');
    else if (hits.length > 1) bad(`ItemID ${sku} is on ${hits.length} product rows, so it is ambiguous.`);
    else if (hits[0][0] === null) bad('The weekly upload gave this item no ItemID, so it has no office ItemID. Add it by hand.');
    else if (hits[0][0] !== hits[0][2]) bad(`ItemID ${hits[0][0]} does not match the website code ${hits[0][2]}.`);
    else if (baseName && baseName.has(hits[0][0]) && baseName.get(hits[0][0]) !== hits[0][1]) bad(`ItemID ${hits[0][0]} is "${hits[0][1]}" in this order but "${baseName.get(hits[0][0])}" in the shop's base list.`);
    else {
      if (qty.has(hits[0])) notes.push(`${label} appeared on more than one order line; the quantities were added together.`);
      qty.set(hits[0], qtyClean((qty.get(hits[0]) || 0) + q));
    }
  }

  const sheet = rows.filter(r => r[0] !== null && r[0] === r[2]).map(r => ({id: r[0], qty: qty.get(r) || 0}));
  const ordered = o.lines.reduce((s, l) => s + (Number(l.qty) || 0), 0);
  const placed = [...qty.values()].reduce((s, q) => s + q, 0) + items.reduce((s, i) => s + i.qty, 0);
  if (Math.abs(ordered - placed) > 1e-6) notes.push('The sheet quantities do not add up to the quantities ordered. Do not use the sheet; use the order summary.');
  return {rows: sheet, items, notes, source, ok: !items.length && !notes.length};
}

const clean = (s, n) => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 ._-]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
const fileName = o => `Order ${clean(o.id, 30) || 'new'} - ${clean(o.customer && o.customer.name, 40) || 'customer'}.xlsx`;

function buildWorkbook(imp, o) {                                        // -> Buffer (.xlsx)
  const XLSX = require('xlsx');                                         // loaded here so a missing module can never stop an order being emailed
  const ws = XLSX.utils.aoa_to_sheet([['ItemID', 'Quantity'], ...imp.rows.map(r => [r.id, r.qty])]);
  for (let i = 0; i < imp.rows.length; i++) ws['A' + (i + 2)].z = '0';  // ItemID as a plain whole number (never 1.7E+03)
  ws['!cols'] = [{wch: 10}, {wch: 10}];
  const wb = XLSX.utils.book_new(); wb.Props = {Title: `Order ${o.id}`, Author: 'Greens Greens website'};
  XLSX.utils.book_append_sheet(wb, ws, 'Order Import');
  if (imp.items.length || imp.notes.length) {                           // only when something needs a human; the import grid itself stays clean
    const aoa = [['Website item', 'Quantity', 'Why it is not in the Order Import sheet'], ...imp.items.map(i => [i.name, i.qty, i.reason])];
    if (imp.notes.length) aoa.push([], ...imp.notes.map(n => ['Note', '', n]));
    const w2 = XLSX.utils.aoa_to_sheet(aoa); w2['!cols'] = [{wch: 40}, {wch: 10}, {wch: 90}];
    XLSX.utils.book_append_sheet(wb, w2, 'Needs attention');
  }
  return XLSX.write(wb, {type: 'buffer', bookType: 'xlsx', compression: true});
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

function attentionHtml(imp, xlsxMissing) {
  const li = [...imp.items.map(i => `<li><b>${esc(i.name)}</b> × ${esc(i.qty)}: ${esc(i.reason)}</li>`), ...imp.notes.map(n => `<li>${esc(n)}</li>`),
    ...(xlsxMissing ? ['<li>The Excel attachment could not be created. Use the copy/paste view below or the order summary.</li>'] : [])].join('');
  return li ? `<div style="border:2px solid #b3261e;background:#fdecea;padding:10px 14px;margin:0 0 16px;border-radius:8px"><b style="color:#b3261e">CHECK BEFORE IMPORTING: this order needs a manual check</b><ul style="margin:6px 0 0;padding-left:20px">${li}</ul></div>` : '';
}
function attentionText(imp, xlsxMissing) {
  const l = [...imp.items.map(i => `- ${i.name} x ${i.qty}: ${i.reason}`), ...imp.notes.map(n => `- ${n}`), ...(xlsxMissing ? ['- The Excel attachment could not be created. Use the copy/paste list below or the order summary.'] : [])];
  return l.length ? ['*** CHECK BEFORE IMPORTING: this order needs a manual check ***', ...l, ''].join('\n') : '';
}
function copyPasteHtml(imp, file) {
  const td = 'padding:1px 14px 1px 0;font-family:Consolas,Menlo,monospace;font-size:13px';
  return `<h3 style="margin:28px 0 4px">Office copy/paste view</h3>
    <p style="margin:0 0 8px;font-size:13px;color:#555">The same two columns as the attached <b>${esc(file)}</b> (sheet “Order Import”), in the same order, one row for every product. Zero quantities are kept: remove them as usual. Copying cells from the Excel attachment is the reliable option; this table is the fallback.</p>
    <table cellspacing="0" cellpadding="0" style="border-collapse:collapse"><tr><th align="left" style="${td}">ItemID</th><th align="left" style="${td}">Quantity</th></tr>${imp.rows.map(r => `<tr><td style="${td}">${r.id}</td><td style="${td}">${r.qty}</td></tr>`).join('')}</table>`;
}
const copyPasteText = imp => ['', 'OFFICE COPY/PASTE VIEW (ItemID, Quantity: same as the Excel attachment; zero rows kept)', 'ItemID\tQuantity', ...imp.rows.map(r => `${r.id}\t${r.qty}`)].join('\n');

/* One call for the whole export. Never throws: whatever fails is reported inside the result so the order email still goes out. */
function buildOfficeExport(o) {
  const file = fileName(o);
  let imp;
  try { imp = buildImport(o); }
  catch (e) { return {file, failed: e.message, imp: {rows: [], items: [], notes: ['The office sheet could not be built: ' + e.message + ' Use the order summary.']}}; }
  let xlsx = null, xlsxError = null;
  try { xlsx = buildWorkbook(imp, o); } catch (e) { xlsxError = e.message; }
  return {file, imp, xlsx, xlsxError, failed: null};
}

module.exports = {buildOfficeExport, buildImport, buildWorkbook, fileName, attentionHtml, attentionText, copyPasteHtml, copyPasteText, bundledCatalogue};
