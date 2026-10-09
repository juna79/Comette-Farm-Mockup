// Netlify function: GET/POST /api/state and POST /api/login. The week is stored in Netlify Blobs.
import { getStore } from '@netlify/blobs';
import api from '../../server/stateApi.js';

export const config = { path: ['/api/state', '/api/login'] };

export default async (req) => {
  const blobs = getStore('greens-greens');
  const store = { get: () => blobs.get('state', { type: 'json' }), set: (obj) => blobs.setJSON('state', obj) };
  const url = new URL(req.url);
  const out = await api.handle(
    { method: req.method, path: url.pathname, password: req.headers.get('x-staff-password') || '', bodyText: req.method === 'POST' ? await req.text() : '' },
    { store, env: process.env }
  );
  return new Response(JSON.stringify(out.body), { status: out.status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
};
