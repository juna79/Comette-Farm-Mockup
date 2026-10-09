/* Order -> email. Shared by the local preview server (tools/serve.js) and the hosted function (netlify/functions/order.js).
   Env:  ORDER_TO          where orders are emailed (Greens Greens' inbox)
         ORDER_FROM        verified sender, e.g. "Greens Greens Orders <orders@yourdomain.com>"
         RESEND_API_KEY    email provider key (https://resend.com). Without it, emails are written to ./outbox/ instead.
         SEND_CUSTOMER_COPY=1  also email the customer a copy (default on)                                   */
const fs = require('fs'), path = require('path');

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const kes = n => 'KES ' + Math.round(n).toLocaleString('en-KE');
const day = k => k ? new Date(k + 'T00:00').toLocaleDateString('en-GB', {weekday:'long', day:'numeric', month:'long'}) : 'To be confirmed';

function validate(o) {
  const bad = m => { const e = new Error(m); e.status = 400; throw e; };
  if (!o || typeof o !== 'object') bad('No order');
  if (o.website) bad('Rejected');                                         // honeypot field, bots fill it in
  const c = o.customer || {};
  if (!String(c.name || '').trim()) bad('Name is required');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(c.email || ''))) bad('A valid email is required');
  if (!String(c.address || '').trim()) bad('Delivery address is required');
  if (!Array.isArray(o.lines) || !o.lines.length || o.lines.length > 200) bad('The cart is empty');
  for (const l of o.lines) if (!l || !String(l.name || '').trim() || !(+l.qty > 0) || !(+l.total >= 0)) bad('Invalid item in cart');
  if (JSON.stringify(o).length > 60000) bad('Order too large');
}

function orderTable(o) {
  const th = 'text-align:left;padding:6px 8px;border-bottom:2px solid #2f7d4f;font-size:12px;color:#555';
  const td = 'padding:6px 8px;border-bottom:1px solid #eee;font-size:14px;vertical-align:top';
  return `<table style="border-collapse:collapse;width:100%"><tr><th style="${th}">Item</th><th style="${th}">Qty</th><th style="${th};text-align:right">KES</th></tr>` +
    o.lines.map(l => `<tr><td style="${td}">${esc(l.name)}<br><span style="color:#777;font-size:12px">${esc(l.option)}${l.note ? ' · Note: ' + esc(l.note) : ''}</span></td><td style="${td};white-space:nowrap">${esc(l.qtyText)}${l.est ? ' <span style="color:#b36b00;font-size:12px">(weigh)</span>' : ''}</td><td style="${td};text-align:right">${Math.round(l.total).toLocaleString('en-KE')}${l.est ? '*' : ''}</td></tr>`).join('') +
    `<tr><td style="${td};font-weight:bold" colspan="2">${o.hasEstimate ? 'Estimated total' : 'Total'} – cash on delivery</td><td style="${td};text-align:right;font-weight:bold">${Math.round(o.total).toLocaleString('en-KE')}</td></tr></table>` +
    (o.hasEstimate ? '<p style="font-size:12px;color:#777">* Sold by weight – estimate. Weigh at packing and confirm the final amount on delivery.</p>' : '');
}

function buildOwnerEmail(o) {
  const c = o.customer, when = o.date ? `${day(o.date)}${o.groupName ? ' (' + o.groupName + ')' : ''}` : 'NOT ON A GROUP YET – confirm delivery day';
  const subject = `New order ${o.id} – ${c.name} – ${o.date ? day(o.date) : 'confirm delivery day'}`;
  const text = [`NEW ORDER ${o.id}`, '', `Customer: ${c.name}`, `Phone: ${c.phone}`, `Email: ${c.email}`, `Delivery details: ${c.address}`, `Delivery: ${when}`,
    c.notes ? `Notes: ${c.notes}` : '', '', 'ITEMS',
    ...o.lines.map(l => `- ${l.name} (${l.option}) x ${l.qtyText}${l.est ? ' [weigh]' : ''}${l.note ? ' – ' + l.note : ''}  KES ${Math.round(l.total)}`),
    '', `${o.hasEstimate ? 'ESTIMATED TOTAL' : 'TOTAL'}: ${kes(o.total)}  – CASH ON DELIVERY`,
    o.hasEstimate ? 'Items marked [weigh] are sold by weight: confirm the final amount on delivery.' : ''].filter((x, i, a) => x !== '' || a[i - 1] !== '').join('\n');
  const html = `<div style="font-family:Arial,sans-serif;max-width:640px;color:#1d2a22">
    <h2 style="margin:0 0 4px">New order ${esc(o.id)}</h2>
    <p style="margin:0 0 16px;color:#555">${esc(c.name)} · ${esc(day(o.date))}${o.groupName ? ' · ' + esc(o.groupName) : ''}</p>
    <table style="border-collapse:collapse;margin-bottom:16px;font-size:14px">
      <tr><td style="padding:2px 12px 2px 0;color:#777">Phone</td><td>${esc(c.phone)}</td></tr>
      <tr><td style="padding:2px 12px 2px 0;color:#777">Email</td><td>${esc(c.email)}</td></tr>
      <tr><td style="padding:2px 12px 2px 0;color:#777">Delivery details</td><td>${esc(c.address)}</td></tr>
      <tr><td style="padding:2px 12px 2px 0;color:#777">Delivery</td><td>${o.date ? esc(when) : '<b style="color:#b3412f">' + esc(when) + '</b>'}</td></tr>
      ${c.notes ? `<tr><td style="padding:2px 12px 2px 0;color:#777">Notes</td><td>${esc(c.notes)}</td></tr>` : ''}
    </table>${orderTable(o)}</div>`;
  return {subject, text, html};
}

function buildCustomerEmail(o, shop = 'Greens Greens') {
  const subject = `Your ${shop} order ${o.id}`;
  const text = [`Thank you ${o.customer.name.split(' ')[0]}, we have your order ${o.id}.`, '', `Delivery: ${o.date ? day(o.date) : 'we will confirm your delivery day'}`, `To: ${o.customer.address}`, '',
    ...o.lines.map(l => `- ${l.name} x ${l.qtyText}${l.est ? ' (weighed)' : ''}  KES ${Math.round(l.total)}`), '',
    `${o.hasEstimate ? 'Estimated total' : 'Total'}: ${kes(o.total)} – cash on delivery.`, o.hasEstimate ? 'Some items are sold by weight, so the final amount is confirmed on delivery.' : ''].join('\n');
  const html = `<div style="font-family:Arial,sans-serif;max-width:640px;color:#1d2a22"><h2 style="margin:0 0 8px">Thank you, ${esc(o.customer.name.split(' ')[0])}</h2>
    <p>We’ve received your order <b>${esc(o.id)}</b>. Delivery: <b>${esc(day(o.date))}</b> to ${esc(o.customer.address)}.</p>${orderTable(o)}
    <p style="color:#555;font-size:13px">Please pay cash on delivery. Reply to this email if you need to change anything.</p></div>`;
  return {subject, text, html};
}

async function sendOne(msg, {to, replyTo, env}) {
  const from = env.ORDER_FROM || 'Greens Greens Orders <onboarding@resend.dev>';
  if (!env.RESEND_API_KEY) {                                             // no provider configured: write to ./outbox for inspection
    const dir = path.join(__dirname, '..', 'outbox'); fs.mkdirSync(dir, {recursive: true});
    const f = path.join(dir, `${Date.now()}-${to.replace(/[^a-z0-9@.]/gi, '_')}.html`);
    fs.writeFileSync(f, `<!-- To: ${to}\n     Reply-To: ${replyTo || ''}\n     Subject: ${msg.subject} -->\n<meta charset="utf-8">\n${msg.html}`);
    return {mode: 'outbox', file: path.basename(f)};
  }
  const r = await fetch('https://api.resend.com/emails', {method: 'POST', headers: {Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json'},
    body: JSON.stringify({from, to: [to], reply_to: replyTo, subject: msg.subject, html: msg.html, text: msg.text})});
  if (!r.ok) { const e = new Error('Email provider error ' + r.status + ': ' + (await r.text()).slice(0, 200)); e.status = 502; throw e; }
  return {mode: 'sent'};
}

async function handleOrder(o, env = process.env) {
  validate(o);
  const owner = env.ORDER_TO || 'orders@example.com';
  const res = {owner: await sendOne(buildOwnerEmail(o), {to: owner, replyTo: o.customer.email, env})};
  if (env.SEND_CUSTOMER_COPY !== '0') {
    try { res.customer = await sendOne(buildCustomerEmail(o), {to: o.customer.email, env}); }
    catch (e) { res.customer = {error: e.message}; }                      // owner already has the order; a failed copy must not fail the order
  }
  return {ok: true, id: o.id, ...res};
}

module.exports = {handleOrder, buildOwnerEmail, buildCustomerEmail, validate};
