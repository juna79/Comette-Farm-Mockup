// Hosted endpoint (Netlify): POST /api/order  (see netlify.toml redirect)
const {handleOrder} = require('../../server/orderEmail');
exports.handler = async event => {
  if (event.httpMethod !== 'POST') return {statusCode: 405, body: 'POST only'};
  try {
    const out = await handleOrder(JSON.parse(event.body || '{}'));
    return {statusCode: 200, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(out)};
  } catch (e) {
    return {statusCode: e.status || 500, headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ok: false, error: e.status ? e.message : 'Could not send the order'})};
  }
};
