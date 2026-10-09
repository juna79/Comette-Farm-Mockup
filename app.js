/* Greens Greens – prototype storefront + admin. No backend: state lives in localStorage.
   Orders go to /api/order, which emails them to Greens Greens (see README). */
(() => {
'use strict';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const kes = n => 'KES ' + Math.round(n).toLocaleString('en-KE');

/* ---------- data ---------- */
const CAT = window.CATALOGUE;
const TINT = {'Vegetables':'#e3f1df','Fruit':'#fdeed6','Herbs & Salad':'#dcefe3','Dairy, Cheese & Eggs':'#fbf3d5',
  'Meat & Fish':'#f8e0dc','Drinks':'#dfeaf6','Pantry':'#efe6d8','Flowers':'#f6e1ee','Live Plants':'#e6efd4'};
const UNIT_LABEL = {kg:'kg',piece:'piece',bunch:'bunch',pack:'pack',unit:'each',punnet:'punnet',litre:'litre',jar:'jar',
  bag:'bag',bottle:'bottle',carton:'carton',crate:'crate',tray:'tray',dozen:'dozen'};

const DEFAULT_SETTINGS = {
  shopName: 'Greens Greens',
  orderEmail: '',                     // shown in the "send by email instead" fallback (the real inbox is set on the server: ORDER_TO)
  // client groups: each group gets the weekly sheet on its own day and is delivered on `deliver` (0=Sun..6=Sat)
  groups: [{id:'mon', name:'Monday group', deliver:3}, {id:'tue', name:'Tuesday group', deliver:4}, {id:'thu', name:'Thursday group', deliver:6}]
};
let settings = Object.assign({}, DEFAULT_SETTINGS, store.get('gg_settings', {}));
let ov = store.get('gg_ov', {prod:{}, sku:{}});          // owner overrides: {prod:{id:{inStock}}, sku:{sku:{price,estKg}}}
let cart = store.get('gg_cart', {});                      // {sku:{qty,note}}
let orders = store.get('gg_orders', []);
let clients = store.get('gg_clients', []);                // [{name, phone:'2547…', group:'mon'}]
let me = store.get('gg_me', {});                          // last customer details on this device (prefill)
const sel = {};                                           // chosen variant per product id
const ui = {cat:'All', q:''};

let extraItems = store.get('gg_extra', []);                 // products added from uploaded sheets
CAT.products.push(...extraItems);
const PRODUCTS = CAT.products;
const BY_ID = Object.fromEntries(PRODUCTS.map(p => [p.id, p]));
const BY_SKU = {};
PRODUCTS.forEach(p => p.variants.forEach(v => BY_SKU[v.sku] = {p, v}));

/* ---------- pricing ---------- */
function eff(v) {                       // effective variant after owner overrides
  const o = ov.sku[v.sku] || {};
  const price = o.price ?? v.price;
  const estKg = o.estKg ?? v.estKg;
  const unitPrice = v.estimate ? Math.round(price * estKg) : price;
  return {...v, price, estKg, unitPrice};
}
const varOut = v => !!ov.sku[v.sku]?.out;
const inStock = p => (ov.prod[p.id]?.inStock ?? p.inStock) !== false && p.variants.some(v => !varOut(v));
const step = v => v.unit === 'kg' ? 0.5 : 1;
function qtyText(v, q) { return v.unit === 'kg' ? `${q} kg` : String(q); }
function varLabel(v) {
  const u = UNIT_LABEL[v.unit] || v.unit;
  const base = v.unit === 'kg' ? 'By the kg' : ['unit'].includes(v.unit) ? 'Each' : `Per ${u}`;
  return (v.ripeness ? 'Half ripe · ' : '') + base;
}
function cartLines() {
  return Object.entries(cart).map(([sku, c]) => {
    const e = BY_SKU[sku]; if (!e) return null;
    const v = eff(e.v);
    return {sku:+sku, p:e.p, v, qty:c.qty, note:c.note || '', total: Math.round(v.unitPrice * c.qty)};
  }).filter(Boolean);
}
const subtotal = () => cartLines().reduce((s, l) => s + l.total, 0);
const cartCount = () => cartLines().length;
const saveCart = () => store.set('gg_cart', cart);

/* ---------- shop ---------- */
function renderChips() {
  const cats = ['All', ...CAT.categories];
  $('#chips').innerHTML = cats.map(c => `<button class="chip" aria-pressed="${ui.cat === c}" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
}
function artHTML(p) {
  const tint = TINT[p.category] || '#eee';
  const label = p.brand || p.category;
  return p.img
    ? `<div class="art photo"><img src="${esc(p.img)}" alt="${esc(p.name)}" loading="lazy"></div>`
    : `<div class="art tile" style="--tint:${tint}"><span>${esc(label)}</span></div>`;
}
function cardHTML(p) {
  const out = !inStock(p);
  const vis = p.variants.filter(x => !varOut(x)), pool = vis.length ? vis : p.variants;
  const sku = pool.some(x => x.sku === sel[p.id]) ? sel[p.id] : pool[0].sku;
  const v = eff(pool.find(x => x.sku === sku));
  const inCart = cart[v.sku];
  const opts = pool.length > 1
    ? `<select data-var="${p.id}" aria-label="Choose option for ${esc(p.name)}">${pool.map(x => `<option value="${x.sku}"${x.sku === sku ? ' selected' : ''}>${esc(varLabel(x))}</option>`).join('')}</select>` : '';
  const price = v.estimate
    ? `<div class="price"><small>≈</small> ${kes(v.unitPrice)} <small>/ ${esc(UNIT_LABEL[v.unit] || v.unit)}</small></div><div class="est">Estimate · ${kes(v.price)}/kg, about ${v.estKg} kg each</div>`
    : `<div class="price">${kes(v.price)} <small>/ ${esc(v.unit === 'unit' ? 'each' : UNIT_LABEL[v.unit] || v.unit)}</small></div>`;
  const buy = out ? `<button class="add" disabled>Not available this week</button>`
    : inCart ? `<div class="stepper"><button data-dec="${v.sku}" aria-label="Remove one">−</button><span>${qtyText(v, inCart.qty)}</span><button data-inc="${v.sku}" aria-label="Add one more">+</button></div>`
    : `<button class="add" data-add="${v.sku}">Add to cart</button>`;
  return `<article class="card${out ? ' out' : ''}" data-id="${p.id}">${artHTML(p)}<div class="cbody"><h3>${esc(p.name)}</h3>` +
    (p.brand ? `<div class="brandline">${esc(p.brand)}</div>` : '') + `${opts}${price}<div class="buy">${buy}</div></div></article>`;
}
function visibleProducts() {
  const q = ui.q.trim().toLowerCase();
  return PRODUCTS.filter(p => (ui.cat === 'All' || p.category === ui.cat) && (!q || (p.name + ' ' + p.category + ' ' + p.brand).toLowerCase().includes(q)));
}
function renderBanner() {
  const el = $('#deliveryBanner'); if (!el) return;
  const dl = resolveDelivery(me.phone);
  const fmt = d => d.toLocaleDateString('en-GB', {weekday:'long', day:'numeric', month:'long'});
  const days = [...new Set(settings.groups.map(g => DAYS[g.deliver] + 's'))];
  const upd = weeklyMeta ? ` <small style="opacity:.8">Prices and availability updated ${new Date(weeklyMeta.updated).toLocaleDateString('en-GB', {weekday:'long', day:'numeric', month:'long'})}.</small>` : '';
  el.innerHTML = (dl.group
    ? `Your delivery day: <strong>${fmt(dl.date)}</strong> (${esc(dl.group.name)}).`
    : `We deliver on ${days.length > 1 ? days.slice(0, -1).join(', ') + ' and ' + days.at(-1) : days[0]}, depending on your group. We’ll match you by phone number at checkout.`) + upd;
}
function renderGrid() {
  const list = visibleProducts();
  const ci = p => CAT.categories.indexOf(p.category);
  list.sort((a, b) => (inStock(b) - inStock(a)) || (ci(a) - ci(b)));
  $('#resultLine').textContent = `${list.length} product${list.length === 1 ? '' : 's'}${ui.cat !== 'All' ? ' in ' + ui.cat : ''}${ui.q ? ` matching “${ui.q}”` : ''}`;
  $('#grid').innerHTML = list.length ? list.map(cardHTML).join('') : `<div class="empty">Nothing matches that. Try another word or category.</div>`;
}
function refreshCard(id) {
  const el = $(`.card[data-id="${id}"]`); if (el) el.outerHTML = cardHTML(BY_ID[id]);
}

/* ---------- cart ---------- */
function setQty(sku, q) {
  const e = BY_SKU[sku]; const s = step(e.v);
  q = Math.round(q / s) * s;
  if (q <= 0) delete cart[sku]; else cart[sku] = {qty:q, note: cart[sku]?.note || ''};
  saveCart(); refreshCard(e.p.id); updateBars();
  if ($('#drawer').classList.contains('open')) renderDrawer();
}
function updateBars() {
  const n = cartCount(), t = subtotal();
  $('#cartCount').textContent = n;
  $('#cartTotalTop').textContent = n ? kes(t) : '';
  $('#mobileBar').hidden = !n || !$('#admin').hidden;
  $('#mbCount').textContent = `${n} item${n === 1 ? '' : 's'}`;
  $('#mbTotal').textContent = kes(t);
}
function openDrawer() { renderDrawer(); $('#scrim').hidden = false; const d = $('#drawer'); d.classList.add('open'); d.setAttribute('aria-hidden', 'false'); $('.x', d)?.focus(); }
function closeDrawer() { $('#scrim').hidden = true; const d = $('#drawer'); d.classList.remove('open'); d.setAttribute('aria-hidden', 'true'); }
function renderDrawer() {
  const L = cartLines(), d = $('#drawer');
  const hasEst = L.some(l => l.v.estimate);
  const body = L.length ? L.map(l => `
    <div class="line">
      <div><div class="nm">${esc(l.p.name)}</div><div class="sub">${esc(varLabel(l.v))} · ${l.v.estimate ? '≈ ' : ''}${kes(l.v.unitPrice)}${l.v.estimate ? ' (estimate)' : ''}</div></div>
      <div class="lt">${l.v.estimate ? '≈ ' : ''}${kes(l.total)}</div>
      <div class="ctl"><div class="mini"><button data-dec="${l.sku}" aria-label="Remove one">−</button><span>${qtyText(l.v, l.qty)}</span><button data-inc="${l.sku}" aria-label="Add one more">+</button></div>
        <button class="linkbtn" data-del="${l.sku}">Remove</button></div>
      <input class="noteinp" data-note="${l.sku}" value="${esc(l.note)}" placeholder="Note (e.g. ripe for Saturday)" aria-label="Note for ${esc(l.p.name)}">
    </div>`).join('') : `<div class="empty-cart">Your cart is empty.<br>Add something fresh.</div>`;
  d.innerHTML = `<div class="dh"><h2>Your cart</h2><button class="x" data-close aria-label="Close cart">×</button></div>
    <div class="dbody">${body}</div>
    <div class="dfoot">
      <div class="row"><span>Subtotal${hasEst ? ' (estimated)' : ''}</span><strong>${kes(subtotal())}</strong></div>
      <div class="hint">${hasEst ? 'Items sold by weight are estimates; we weigh your order and confirm the final amount on delivery. ' : ''}You pay cash on delivery.</div>
      <button class="primary" id="toCheckout" ${L.length ? '' : 'disabled'}>Checkout</button>
    </div>`;
}

/* ---------- checkout ---------- */
let co = {step:'form', data:{name:'', email:'', phone:'', address:'', date:'', notes:'', website:''}, errors:{}, order:null, timer:null};
const groupById = id => settings.groups.find(g => g.id === id);
function nextDate(weekday, from = new Date()) {
  const d = new Date(from); d.setHours(0, 0, 0, 0);
  do d.setDate(d.getDate() + 1); while (d.getDay() !== weekday);
  return d;
}
function linkGroup() {                                    // group set by a shop link like ?g=mon (remembered on this device)
  const g = new URLSearchParams(location.search).get('g');
  if (g && groupById(g)) store.set('gg_group', g);
  const saved = store.get('gg_group', ''); return groupById(saved) ? saved : '';
}
function resolveDelivery(phoneRaw) {
  // 1) the client list (by phone) 2) the group link the customer arrived through 3) unknown -> we confirm later
  const p = normPhone(phoneRaw || '');
  const c = p && clients.find(x => x.phone === p);
  const g = (c && groupById(c.group)) || groupById(linkGroup());
  return g ? {group:g, date:nextDate(g.deliver), source: c && groupById(c.group) ? 'client' : 'link'} : {group:null, date:null, source:'none'};
}
const dateKey = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const dateText = k => k ? new Date(k + 'T00:00').toLocaleDateString('en-GB', {weekday:'long', day:'numeric', month:'long'}) : 'To be confirmed';
function normPhone(s) {
  s = String(s).replace(/[\s\-()]/g, '');
  if (/^\+?254[17]\d{8}$/.test(s)) return '254' + s.replace(/^\+?254/, '');
  if (/^0[17]\d{8}$/.test(s)) return '254' + s.slice(1);
  return null;
}
function totals() {
  const sub = subtotal(); return {sub, fee:0, total:sub};
}
function openCheckout() {
  closeDrawer();
  if (!co.data.name && me.name) Object.assign(co.data, {name:me.name, email:me.email || '', phone:me.phone || '', address:me.address || ''});
  co.step = 'form'; co.errors = {}; co.pending = null;
  renderCheckout();
  $('#checkout').showModal();
}
function fixedDayHTML() {
  const dl = resolveDelivery(co.data.phone);
  if (dl.group) return `${esc(dateText(dateKey(dl.date)))}<small>${esc(dl.group.name)}</small>`;
  return normPhone(co.data.phone || '') ? `We’ll confirm your day<small>We don’t have this number on our client list yet</small>` : `Enter your phone number<small>to see your delivery day</small>`;
}
function renderCheckout() {
  const dlg = $('#checkout'), t = totals(), dt = co.data, er = co.errors;
  const hasEst = cartLines().some(l => l.v.estimate);
  if (co.step === 'form') {
    dlg.innerHTML = `<form class="dlg" id="coForm" novalidate>
      <div class="dh" style="padding:0 0 8px;border:0"><h2 id="coTitle">Your order details</h2><button type="button" class="x" data-closeco aria-label="Close">×</button></div>
      <div class="two">
        <div class="field"><label for="f_name">Your name</label><input id="f_name" name="name" autocomplete="name" value="${esc(dt.name)}" required>${er.name ? `<span class="err">${er.name}</span>` : ''}</div>
        <div class="field"><label for="f_phone">Phone number</label><input id="f_phone" name="phone" inputmode="tel" autocomplete="tel" placeholder="0712 345 678" value="${esc(dt.phone)}" required>${er.phone ? `<span class="err">${er.phone}</span>` : ''}</div>
      </div>
      <div class="field"><label for="f_email">Email address</label><input id="f_email" name="email" type="email" inputmode="email" autocomplete="email" placeholder="you@example.com" value="${esc(dt.email)}" required>${er.email ? `<span class="err">${er.email}</span>` : ''}<span class="sub" style="color:var(--muted);font-size:12.5px">We’ll email you a copy of your order.</span></div>
      <div aria-hidden="true" style="position:absolute;left:-9999px"><label>Leave this empty <input name="website" tabindex="-1" autocomplete="off" value=""></label></div>
      <div class="field"><label for="f_addr">Delivery details</label><textarea id="f_addr" name="address" rows="3" placeholder="Estate, road, house number, landmark, gate code…" required>${esc(dt.address)}</textarea>${er.address ? `<span class="err">${er.address}</span>` : ''}</div>
      <div class="field"><span class="lbl">Delivery day</span><div class="fixed" id="fixedDay">${fixedDayHTML()}</div></div>
      <div class="field"><label for="f_notes">Anything else? (optional)</label><textarea id="f_notes" name="notes" rows="2" placeholder="Any notes for your order">${esc(dt.notes)}</textarea></div>
      <div class="summary">
        <div class="row big"><span>${hasEst ? 'Estimated total' : 'Total'}</span><span>${kes(t.total)}</span></div>
        ${hasEst ? `<div class="hint">Some items are sold by weight, so the final total is confirmed when we pack your order.</div>` : ''}
      </div>
      <div class="mpesa"><span aria-hidden="true">💵</span><span><b>Cash on delivery.</b> Nothing to pay now.</span></div>
      <button class="primary" type="submit">Place order</button>
    </form>`;
  } else if (co.step === 'sending') {
    dlg.innerHTML = `<div class="dlg center"><h2 id="coTitle">Sending your order…</h2><div class="spinner" role="progressbar" aria-label="Sending order"></div><p>Please don’t close this window.</p></div>`;
  } else if (co.step === 'sendfail') {
    const o = co.pending;
    dlg.innerHTML = `<div class="dlg center"><div class="tick bad" aria-hidden="true">!</div><h2 id="coTitle">We couldn’t send your order</h2>
      <p>${esc(co.failMsg)}</p><p class="hint">Your cart is safe. You can try again, or send the order to us by email instead.</p>
      <button class="primary" data-resend>Try again</button>
      <p><a class="secondary" style="display:inline-block;text-decoration:none" href="${esc(mailtoFor(o))}">Send by email instead</a></p>
      <p><button class="linkbtn" data-closeco>Back to shop</button></p></div>`;
  } else if (co.step === 'done') {
    const o = co.order;
    dlg.innerHTML = `<div class="dlg"><div class="center"><div class="tick" aria-hidden="true">✓</div><h2 id="coTitle">Order confirmed</h2>
      <p>Thank you, ${esc(o.customer.name.split(' ')[0])}. Your order <strong>${esc(o.id)}</strong> has been sent to us.</p></div>
      <div class="summary">${orderSummaryHTML(o)}</div>
      <p class="hint">Please pay cash on delivery. ${o.date ? `Delivery on <strong>${dateText(o.date)}</strong>` : 'We’ll message you to confirm your delivery day'} to ${esc(o.customer.address)}.</p>
      <button class="primary" data-closeco>Done</button>
      <p class="center"><button class="linkbtn" data-print="${esc(o.id)}">Print receipt</button></p></div>`;
  }
}
function orderSummaryHTML(o) {
  return o.lines.map(l => `<div class="row"><span>${esc(l.name)} <small style="color:var(--muted)">× ${esc(l.qtyText)}${l.est ? ' (est.)' : ''}</small></span><span>${kes(l.total)}</span></div>`).join('') +
    `<div class="row big"><span>${o.hasEstimate ? 'Estimated total' : 'Total'}</span><span>${kes(o.total)}</span></div>` +
    (o.hasEstimate ? `<div class="hint">Weighed items are estimates; the final total is confirmed on delivery.</div>` : '');
}
function validate() {
  const d = co.data, e = {};
  if (d.name.trim().length < 2) e.name = 'Please enter your name.';
  co.phone254 = normPhone(d.phone);
  if (!co.phone254) e.phone = 'Enter a valid phone number, e.g. 0712 345 678.';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email.trim())) e.email = 'Enter a valid email address.';
  if (d.address.trim().length < 5) e.address = 'Please add your delivery address.';
  co.errors = e; return !Object.keys(e).length;
}
function buildOrder() {
  const t = totals(), dl = resolveDelivery(co.data.phone);
  if (!co.seq) { co.seq = (store.get('gg_seq', 0)) + 1; }
  const now = new Date();
  const lines = cartLines().map(l => ({sku:l.sku, name:l.p.name, option:varLabel(l.v), qty:l.qty, qtyText:qtyText(l.v, l.qty), unitPrice:l.v.unitPrice, est:!!l.v.estimate, note:l.note, total:l.total}));
  return {id:`GG-${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(co.seq).padStart(3, '0')}`,
    createdAt:now.toISOString(), customer:{name:co.data.name.trim(), email:co.data.email.trim(), phone:'+' + co.phone254, address:co.data.address.trim(), notes:co.data.notes.trim()},
    zone:'', fee:0, date:dl.date ? dateKey(dl.date) : '', group:dl.group ? dl.group.id : '', groupName:dl.group ? dl.group.name : '', lines, subtotal:t.sub, total:t.total, hasEstimate:lines.some(l => l.est),
    payMethod:'On delivery', payStatus:'Unpaid', finalTotal:null, mpesaRef:'', status:'New', website: co.data.website || ''};
}
const mailtoFor = o => 'mailto:' + (settings.orderEmail || '') + '?subject=' + encodeURIComponent(`Order ${o.id} – ${o.customer.name}`) + '&body=' + encodeURIComponent(
  [`Name: ${o.customer.name}`, `Phone: ${o.customer.phone}`, `Email: ${o.customer.email}`, `Delivery details: ${o.customer.address}`, `Delivery: ${o.date ? dateText(o.date) : 'to be confirmed'}`, o.customer.notes ? `Notes: ${o.customer.notes}` : '', '',
   ...o.lines.map(l => `- ${l.name} (${l.option}) x ${l.qtyText}${l.est ? ' [weigh]' : ''}${l.note ? ' – ' + l.note : ''}  KES ${Math.round(l.total)}`), '', `${o.hasEstimate ? 'Estimated total' : 'Total'}: ${kes(o.total)} – cash on delivery`].filter(Boolean).join('\n'));
async function submitOrder() {
  co.pending = co.pending || buildOrder();
  co.step = 'sending'; renderCheckout();
  const o = co.pending;
  try {
    const r = await fetch('/api/order', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(o)});
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error(j.error || 'The order service did not answer.');
    o.emailed = true;
  } catch (e) {
    co.failMsg = e.message === 'Failed to fetch' ? 'We couldn’t reach the order service. Check your connection.' : e.message;
    co.step = 'sendfail'; if ($('#checkout').open) renderCheckout(); return;
  }
  delete o.website;
  store.set('gg_seq', co.seq); co.seq = 0;
  orders.unshift(o); store.set('gg_orders', orders);
  me = {name:o.customer.name, email:o.customer.email, phone:co.data.phone, address:o.customer.address}; store.set('gg_me', me);
  cart = {}; saveCart(); co.order = o; co.pending = null; co.step = 'done'; renderBanner(); renderGrid(); updateBars();
  if ($('#checkout').open) renderCheckout();
}
/* ---------- printing ---------- */
function printHTML(html) { $('#printArea').innerHTML = html; window.print(); }
function receiptHTML(o) {
  return `<h2>${esc(settings.shopName)} – Order ${esc(o.id)}</h2><p>${esc(o.customer.name)} · ${esc(o.customer.phone)}<br>${esc(o.customer.address)}<br>Delivery: ${esc(dateText(o.date))}${o.customer.notes ? '<br>Notes: ' + esc(o.customer.notes) : ''}</p>
  <table style="width:100%"><tr><th>Item</th><th>Qty</th><th style="text-align:right">KES</th></tr>${o.lines.map(l => `<tr><td>${esc(l.name)} <small>${esc(l.option)}</small>${l.note ? '<br><small>Note: ' + esc(l.note) + '</small>' : ''}</td><td>${esc(l.qtyText)}${l.est ? ' (weigh)' : ''}</td><td style="text-align:right">${Math.round(l.total)}</td></tr>`).join('')}
<tr><td colspan="2"><strong>${o.payStatus === 'Paid' ? 'Total paid' : o.finalTotal != null ? 'Amount due (final)' : o.hasEstimate ? 'Estimated total due' : 'Total due'}</strong></td><td style="text-align:right"><strong>${Math.round(o.finalTotal ?? o.total)}</strong></td></tr></table>
  <p>${o.payStatus === 'Paid' ? 'Paid – ' + esc(o.payMethod) + (o.mpesaRef ? ' ref ' + esc(o.mpesaRef) : '') : 'Cash on delivery. Weighed items: final amount ______'}</p>`;
}

/* ---------- admin ---------- */
const adm = {authed:false};
const saveOv = () => store.set('gg_ov', ov);
const saveSettings = () => store.set('gg_settings', settings);
async function renderCredits() {
  const el = $('#credits'); el.innerHTML = '<h1 style="font-size:28px;margin:24px 0 8px">Photo credits</h1><p class="hint">Product photos are from Wikimedia Commons, used under their free licences. Thank you to the photographers.</p><p><a href="#">← Back to shop</a></p><div id="creditList">Loading…</div>';
  try {
    const c = await (await fetch('images/credits.json')).json();
    const users = {}; PRODUCTS.forEach(p => { if (p.img) (users[p.img] ??= []).push(p.name); });
    $('#creditList').innerHTML = '<table><thead><tr><th>Used for</th><th>Photo</th><th>Author</th><th>Licence</th></tr></thead><tbody>' +
      Object.entries(c).map(([k, v]) => `<tr><td>${esc((users['images/' + k + '.jpg'] || []).slice(0, 4).join(', '))}</td><td><a href="${esc(v.page)}" target="_blank" rel="noopener">${esc(v.title)}</a></td><td>${esc(v.author)}</td><td>${esc(v.license)}</td></tr>`).join('') + '</tbody></table>';
  } catch { $('#creditList').textContent = 'Credits are not available yet.'; }
}
function showRoute() {
  const isAdmin = location.hash === '#admin', isCredits = location.hash === '#credits';
  $('#shop').hidden = isAdmin || isCredits; $('#admin').hidden = !isAdmin; $('#credits').hidden = !isCredits;
  if (isCredits) renderCredits();
  $('.top').hidden = isAdmin || isCredits; $('#demoBar').hidden = false;
  if (isAdmin) renderAdmin(); else { renderGrid(); }
  updateBars(); window.scrollTo(0, 0);
}
function renderAdmin() {
  const root = $('#admin');
  if (!adm.authed) {
    root.innerHTML = `<div class="panel" style="max-width:380px;margin:40px auto"><h2>Staff login</h2>
      <form id="pinForm"><div class="field"><label for="pin">PIN</label><input id="pin" type="password" inputmode="numeric" autocomplete="off"></div><button class="primary">Sign in</button></form>
      <p><a href="#">← Back to shop</a></p></div>`;
    return;
  }
  root.innerHTML = `<div class="ad-head"><h1 style="font-size:26px">Weekly update</h1><span><a href="#">View shop</a> · <button class="linkbtn" id="logout">Sign out</button></span></div><div id="admBody"></div>`;
  adminWeekly($('#admBody'));
}
/* ---------- weekly stock/price upload ---------- */
let weeklyMeta = store.get('gg_weekly', null);               // {updated, file, counts}
let weeklyPreview = null;                                     // parsed upload awaiting confirmation
const normName = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
function parseStockSheet(buf, fileName) {
  if (typeof XLSX === 'undefined') throw new Error('The spreadsheet reader could not load. Check your internet connection and try again.');
  const wb = XLSX.read(buf, {type:'array'});
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {header:1, defval:''});
  const ID = /^(item\s*-?\s*id|sku|code|item\s*code)$/i, NAME = /^(item|item name|name|product|description)$/i;
  let hr = -1;
  for (let r = 0; r < Math.min(rows.length, 15); r++) if (rows[r].some(x => ID.test(String(x).trim())) || rows[r].some(x => NAME.test(String(x).trim()))) { hr = r; break; }
  if (hr < 0) throw new Error('I could not find an “ItemID” or “Item” column in this file. Use the same layout as the weekly order sheet.');
  const head = rows[hr], col = re => head.findIndex(x => re.test(String(x).trim()));
  const idC = col(ID), nameC = col(NAME), groupC = col(/^(group|category)$/i), ouC = col(/^order\s*unit$/i), cuC = col(/^charge\s*unit$/i), priceC = col(/price/i), availC = col(/^(available|availability|in stock|stock)$/i);
  const bySku = {}, byName = {};
  PRODUCTS.forEach(p => p.variants.forEach(v => { bySku[v.sku] = v; (byName[normName(v.src)] ??= []).push(v); }));
  const matched = new Map(), unknown = [], newItems = []; let curGroup = '';
  for (const r of rows.slice(hr + 1)) {
    const name = nameC >= 0 ? String(r[nameC]).trim() : '', idv = idC >= 0 && String(r[idC]).trim() !== '' ? Number(String(r[idC]).trim()) : NaN;
    if (groupC >= 0 && String(r[groupC]).trim()) curGroup = String(r[groupC]).trim();
    if (!name && !Number.isFinite(idv)) continue;
    let v = Number.isFinite(idv) && idv > 0 ? bySku[idv] : null;
    if (!v && name && byName[normName(name)]?.length === 1) v = byName[normName(name)][0];
    const titleRow = !Number.isFinite(idv) && !(priceC >= 0 && String(r[priceC]).trim() !== '');   // group title rows have no ID and no price
    if (!v) {
      if (titleRow) continue;
      const pr = priceC >= 0 ? Number(String(r[priceC]).replace(/[^\d.]/g, '')) : NaN;
      const dupe = newItems.some(n => normName(n.name) === normName(name));
      if (name && pr >= 0 && String(r[priceC]).trim() !== '' && !dupe) newItems.push({name, id: Number.isFinite(idv) && idv > 0 ? idv : null, price: pr, group: curGroup, ou: ouC >= 0 ? String(r[ouC]).trim() : '', cu: cuC >= 0 ? String(r[cuC]).trim() : ''});
      else unknown.push({name: name || '(no name)', id: Number.isFinite(idv) ? idv : ''});
      continue;
    }
    let price = priceC >= 0 && String(r[priceC]).trim() !== '' ? Number(String(r[priceC]).replace(/[^\d.]/g, '')) : null;
    if (!(price >= 0)) price = null;
    const av = availC >= 0 ? String(r[availC]).trim() : '';
    matched.set(v.sku, {price, avail: !/^(no|n|0|out|false|sold\s*out|unavailable|x)$/i.test(av)});
  }
  const total = PRODUCTS.reduce((n, p) => n + p.variants.length, 0);
  const nameOf = v => { const p = PRODUCTS.find(q => q.variants.includes(v)); return `${p.name}${p.variants.length > 1 ? ' – ' + varLabel(v) : ''}`; };
  const d = {newItems, file: fileName, matched: [...matched.values()].filter(m => m.avail).length, total, unknown, becameOut: [], backIn: [], priceChanges: [], apply: []};
  PRODUCTS.forEach(p => p.variants.forEach(v => {
    const m = matched.get(v.sku), nowOut = !m || !m.avail, wasOut = varOut(v), cur = eff(v).price;
    if (nowOut && !wasOut) d.becameOut.push(nameOf(v));
    if (!nowOut && wasOut) d.backIn.push(nameOf(v));
    if (!nowOut && m.price != null && m.price !== cur) d.priceChanges.push({name: nameOf(v), from: cur, to: m.price});
    d.apply.push({sku: v.sku, out: nowOut, price: !nowOut && m.price != null ? m.price : null});
  }));
  d.suspicious = d.matched < Math.max(5, total * 0.2);
  return d;
}
function pruneCart() {
  let n = 0; Object.keys(cart).forEach(sku => { const e = BY_SKU[sku]; if (!e || varOut(e.v)) { delete cart[sku]; n++; } });
  if (n) saveCart(); return n;
}
const UNIT_WORDS = {"kg's":'kg', kg:'kg', kgs:'kg', pieces:'piece', piece:'piece', pc:'piece', pcs:'piece', bunch:'bunch', pack:'pack', packs:'pack', unit:'unit', punnet:'punnet', litres:'litre', litre:'litre', ltr:'litre', jar:'jar', bag:'bag', bottles:'bottle', bottle:'bottle', carton:'carton', crate:'crate', tray:'tray', dozen:'dozen'};
const unitOf = s => UNIT_WORDS[String(s || '').trim().toLowerCase()] || (String(s || '').trim() ? String(s).trim().toLowerCase() : 'unit');
function guessCategory(group, name) {
  const s = (group + ' ' + name).toLowerCase();
  if (/live|plant/.test(group.toLowerCase())) return 'Live Plants';
  if (/flower|bouquet/.test(s)) return 'Flowers';
  if (/juice|kombucha|water|drink|soda|beverage/.test(s)) return 'Drinks';
  if (/cheese|dairy|milk|yog|egg|cream|butter|ice[- ]?cream|dip|hummus/.test(s)) return 'Dairy, Cheese & Eggs';
  if (/meat|fish|chicken|beef|pork|duck|sausage|bacon|ham\b|prawn|squid|salmon|lamb|mutton/.test(s)) return 'Meat & Fish';
  if (/herb|salad|basil|mint|parsley|thyme|rosemary|sage|oregano|coriander|chive|rocket/.test(s)) return 'Herbs & Salad';
  if (/fruit|berr|apple|banana|orange|lemon|lime|mango|melon|pine|grape|passion|papaya|paw/.test(s)) return 'Fruit';
  if (/veg|tomato|potato|onion|cabbage|kale|carrot|spinach|lettuce|pepper|cucumber|bean|pea\b|pumpkin|garlic|ginger/.test(s)) return 'Vegetables';
  return 'Pantry';
}
const tidyName = s => String(s).replace(/\s+/g, ' ').trim();
function addNewItems(list) {
  const made = [];
  list.forEach(n => {
    let sku = n.id && !BY_SKU[n.id] ? n.id : 0; if (!sku) { sku = 900000 + extraItems.length + made.length + 1; while (BY_SKU[sku]) sku++; }
    const ou = unitOf(n.ou), cu = n.cu ? unitOf(n.cu) : ou, est = ou !== cu;
    const v = {sku, src: tidyName(n.name), unit: ou, price: n.price, chargeUnit: cu, ripeness: ''};
    if (est) { v.estimate = true; v.estKg = ou === 'bunch' ? 0.3 : 0.25; v.estPrice = Math.round(n.price * v.estKg); }
    const cat = guessCategory(n.group || '', n.name);
    const p = {id: 'x' + Date.now().toString(36) + made.length, name: tidyName(n.name), category: cat, brand: '', emoji: '', inStock: true, slug: '', isNew: true, variants: [v]};
    PRODUCTS.push(p); BY_ID[p.id] = p; BY_SKU[sku] = {p, v}; made.push(p);
  });
  extraItems = [...extraItems, ...made]; store.set('gg_extra', extraItems);
  return made;
}
function applyWeekly() {
  const d = weeklyPreview; if (!d) return;
  store.set('gg_ov_prev', {ov, weeklyMeta, extraCount: extraItems.length});
  ov = JSON.parse(JSON.stringify(ov)); ov.prod = {};          // a weekly sheet replaces any manual in/out toggles
  d.apply.forEach(a => { const o = (ov.sku[a.sku] ??= {}); o.out = a.out; if (a.price != null) o.price = a.price; });
  const added = addNewItems(d.newItems || []);
  weeklyMeta = {updated: new Date().toISOString(), file: d.file, counts: {available: d.matched + added.length, out: d.total - d.matched, prices: d.priceChanges.length, added: added.length}};
  store.set('gg_weekly', weeklyMeta); saveOv(); weeklyPreview = null; pruneCart(); renderBanner(); renderGrid(); renderAdmin(); toast(added.length ? `Saved – ${added.length} new item${added.length === 1 ? '' : 's'} added` : 'Saved – the shop is updated');
}
function adminWeekly(el) {
  const d = weeklyPreview, when = t => new Date(t).toLocaleString('en-GB', {weekday:'long', day:'numeric', month:'long', hour:'2-digit', minute:'2-digit'});
  const list = (title, arr, fmt) => arr.length ? `<details><summary>${title} (${arr.length})</summary><ul>${arr.slice(0, 200).map(x => `<li>${fmt(x)}</li>`).join('')}${arr.length > 200 ? `<li>…and ${arr.length - 200} more</li>` : ''}</ul></details>` : '';
  el.innerHTML = `<div class="panel">
    <h2 style="font-size:18px;margin-bottom:6px">Upload this week’s spreadsheet</h2>
    <p class="hint">Upload the sheet of what you have this week (Excel or CSV, same layout as the order sheet – it needs the <strong>ItemID</strong> or <strong>Item</strong> column, and a price column if prices change). Everything on the sheet is <strong>in stock</strong>; anything <strong>not on it shows “Not available this week”</strong>. Prices on the sheet replace the shop prices. You’ll see a summary to check, then press Save.</p>
    ${weeklyMeta ? `<p class="hint">Last update: <strong>${esc(when(weeklyMeta.updated))}</strong> from “${esc(weeklyMeta.file)}” – ${weeklyMeta.counts.available} available, ${weeklyMeta.counts.out} not available, ${weeklyMeta.counts.prices} price changes${weeklyMeta.counts.added ? ', ' + weeklyMeta.counts.added + ' new items added' : ''}. ${store.get('gg_ov_prev', null) ? '<button class="linkbtn" id="undoWeekly">Undo this update</button>' : ''}</p>` : ''}
    <div class="tools"><label class="secondary" style="cursor:pointer;position:relative">Choose this week’s sheet… <input type="file" id="weeklyFile" accept=".xls,.xlsx,.csv" style="position:absolute;left:-9999px"></label>
      <button class="secondary" id="dlList">Download the current list (Excel)</button></div>
    <div id="weeklyMsg" role="status"></div>
    ${d ? `<div class="order" style="margin-top:12px"><h3 style="font-size:16px;margin-bottom:8px">Check before applying – “${esc(d.file)}”</h3>
      <div class="row"><span>Items on the sheet that match the shop</span><strong>${d.matched} of ${d.total}</strong></div>
      <div class="row"><span>Will show as not available this week</span><strong>${d.total - d.matched}</strong></div>
      <div class="row"><span>Price changes</span><strong>${d.priceChanges.length}</strong></div>
      <div class="row"><span>Back in stock</span><strong>${d.backIn.length}</strong></div>
      <div class="row"><span>New items to add to the shop</span><strong>${d.newItems.length}</strong></div>
      ${d.suspicious ? `<p class="err" style="color:var(--danger);font-weight:700">Only ${d.matched} items matched. This may not be the right file; applying it would mark almost everything as unavailable.</p><label class="tg"><input type="checkbox" id="forceWeekly"> I’m sure, apply anyway</label>` : ''}
      ${list('New items (will be added, with no photo for now)', d.newItems, x => `${esc(x.name)} – ${kes(x.price)} · ${esc(guessCategory(x.group || '', x.name))}`)}
      ${list('Price changes', d.priceChanges, x => `${esc(x.name)}: ${kes(x.from)} → <strong>${kes(x.to)}</strong>`)}
      ${list('Newly not available', d.becameOut, esc)}
      ${list('Back in stock', d.backIn, esc)}
      ${list('On the sheet but not added (no price)', d.unknown, x => `${esc(x.name)}${x.id ? ' (ID ' + x.id + ')' : ''}`)}
      <div class="tools" style="margin-top:12px"><button class="primary" id="applyWeekly" style="width:auto;padding:10px 22px" ${d.suspicious ? 'disabled' : ''}>Save to the shop</button><button class="secondary" id="cancelWeekly">Cancel</button></div></div>` : ''}
  </div>`;
}
function downloadList() {
  if (typeof XLSX === 'undefined') { toast('Spreadsheet tools did not load'); return; }
  const rows = [['Group', 'Item', 'Order Unit', 'ItemID', 'Quantity', 'Comments', 'Price Per Charge Unit (Subject to Change)', 'Charge Unit']];
  PRODUCTS.forEach(p => p.variants.forEach(v => { const e = eff(v); rows.push([p.category, v.src, UNIT_LABEL[v.unit] || v.unit, v.sku, 0, '', e.price, UNIT_LABEL[v.chargeUnit] || v.chargeUnit]); }));
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Order List'); XLSX.writeFile(wb, 'greens-greens-list.xlsx');
}
/* ---------- events ---------- */
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 1800); }
document.addEventListener('click', e => {
  const t = e.target.closest('button, a'); if (!t) return;
  const d = t.dataset;
  if (d.cat) { ui.cat = d.cat; renderChips(); renderGrid(); }
  else if (d.add) { setQty(+d.add, step(BY_SKU[d.add].v)); toast('Added to cart'); }
  else if (d.inc) { setQty(+d.inc, cart[d.inc].qty + step(BY_SKU[d.inc].v)); }
  else if (d.dec) { setQty(+d.dec, cart[d.dec].qty - step(BY_SKU[d.dec].v)); }
  else if (d.del) { setQty(+d.del, 0); }
  else if (t.id === 'cartBtn' || t.id === 'mobileCart') openDrawer();
  else if ('close' in d) closeDrawer();
  else if (t.id === 'toCheckout') openCheckout();
  else if ('closeco' in d) { $('#checkout').close(); }
  else if ('resend' in d) submitOrder();
  else if (d.print) { const o = orders.find(x => x.id === d.print); if (o) printHTML(receiptHTML(o)); }
  else if (t.id === 'logout') { adm.authed = false; renderAdmin(); }
  else if (t.id === 'dlList') downloadList();
  else if (t.id === 'applyWeekly') applyWeekly();
  else if (t.id === 'cancelWeekly') { weeklyPreview = null; renderAdmin(); }
  else if (t.id === 'undoWeekly') { const p = store.get('gg_ov_prev', null); if (p && confirm('Go back to how the shop was before the last weekly update?')) { ov = p.ov; weeklyMeta = p.weeklyMeta; if (p.extraCount != null && extraItems.length > p.extraCount) { extraItems.slice(p.extraCount).forEach(x => { const i = PRODUCTS.indexOf(x); if (i >= 0) PRODUCTS.splice(i, 1); delete BY_ID[x.id]; x.variants.forEach(v => delete BY_SKU[v.sku]); }); extraItems = extraItems.slice(0, p.extraCount); store.set('gg_extra', extraItems); renderGrid(); } store.set('gg_ov', ov); store.set('gg_weekly', weeklyMeta); store.set('gg_ov_prev', null); renderBanner(); renderAdmin(); toast('Update undone'); } }
});
document.addEventListener('change', e => {
  const t = e.target, d = t.dataset;
  if (d.var) { sel[d.var] = +t.value; refreshCard(d.var); }
  else if (d.note !== undefined && t.matches('.noteinp')) { if (cart[d.note]) { cart[d.note].note = t.value; saveCart(); } }
  else if (t.id === 'forceWeekly') { $('#applyWeekly').disabled = !t.checked; }
  else if (t.id === 'weeklyFile') {
    const f = t.files[0]; if (!f) return;
    f.arrayBuffer().then(buf => { try { weeklyPreview = parseStockSheet(buf, f.name); renderAdmin(); } catch (err) { weeklyPreview = null; renderAdmin(); $('#weeklyMsg').innerHTML = `<p class="err" style="color:var(--danger)">${esc(err.message)}</p>`; } });
  }
  else if (t.closest('#coForm')) { co.data[t.name] = t.value;  }
});
function focusAfter(sel) { const el = $(sel); if (el) el.focus(); }
document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'q') { ui.q = t.value; renderGrid(); }
  else if (t.closest('#coForm') && t.name) { co.data[t.name] = t.value; if (t.name === 'phone') $('#fixedDay').innerHTML = fixedDayHTML(); }
});
document.addEventListener('submit', e => {
  if (e.target.id === 'coForm') { e.preventDefault(); if (validate()) { co.pending = null; submitOrder(); } else renderCheckout(); }
  else if (e.target.id === 'pinForm') { e.preventDefault(); if ($('#pin').value === '1234') { adm.authed = true; renderAdmin(); } else { $('#pin').value = ''; toast('Wrong PIN'); } }
});
$('#scrim').addEventListener('click', closeDrawer);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });
window.addEventListener('hashchange', showRoute);

/* ---------- init ---------- */
pruneCart();
linkGroup();                                                // remember ?g=<group> from a shop link
renderChips(); renderBanner(); showRoute();
})();
