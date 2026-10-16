'use strict';

/**
 * Receptor AISLADO de Webhooks de PRUEBA de Mercado Pago.
 * No crea cobros, no consulta cuentas y no modifica usuarios ni datos de IDPS.
 * La firma se comprueba usando la clave de prueba de Mercado Pago guardada en Render.
 */
const http = require('node:http');
const crypto = require('node:crypto');

const MAX_BYTES = 64 * 1024;
const ACCEPTED_TOPICS = new Set([
  'subscription_preapproval',
  'subscription_preapproval_plan',
  'subscription_authorized_payment',
  'payment'
]);

function parseSignature(raw) {
  if (typeof raw !== 'string' || raw.length > 512) return null;
  const parts = Object.create(null);
  for (const field of raw.split(',')) {
    const i = field.indexOf('=');
    if (i < 1) return null;
    const key = field.slice(0, i).trim();
    const val = field.slice(i + 1).trim();
    if (key !== 'ts' && key !== 'v1') return null;
    if (parts[key]) return null;
    parts[key] = val;
  }
  return /^\d{10}(\d{3})?$/.test(parts.ts || '') && /^[a-f0-9]{64}$/i.test(parts.v1 || '')
    ? parts : null;
}
function validSignature({secret, timestamp, requestId, dataId, signature, now}) {
  if (!secret || !requestId || !dataId) return false;
  const ts = Number(timestamp);
  const millis = timestamp.length === 10 ? ts * 1000 : ts;
  if (!Number.isFinite(millis) || Math.abs(now - millis) > 10 * 60 * 1000) return false;
  const manifest = 'id:' + dataId.toLowerCase() + ';request-id:' + requestId + ';ts:' + timestamp + ';';
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  const got = Buffer.from(signature, 'hex');
  return got.length === 32 && crypto.timingSafeEqual(Buffer.from(expected, 'hex'), got);
}

function createApp({getSecret = () => process.env.MP_WEBHOOK_TEST_SECRET || '', now = () => Date.now()} = {}) {
  let verified = 0;
  let latestTime = null;
  let latestTopic = null;
  const handler = (req, res) => {
    const json = (status, data) => {
      res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
      });
      res.end(JSON.stringify(data));
    };
    if (req.method === 'GET' && (req.url === '/' || req.url === '/health' || req.url === '/status')) {
      return json(200, {
        ok: true, environment: 'test-only', configured: Boolean(getSecret()),
        chargesEnabled: false,
        receivedVerified: verified, lastVerifiedTopic: latestTopic, lastVerifiedAt: latestTime
      });
    }
    const url = new URL(req.url || '/', 'http://staging.local');
    if (url.pathname !== '/webhooks/mercadopago' || req.method !== 'POST') {
      return json(404, {error: 'not_found'});
    }
    if (!getSecret()) return json(503, {error: 'test_webhook_secret_not_configured'});
    const meta = parseSignature(req.headers['x-signature']);
    const requestId = req.headers['x-request-id'];
    const dataId = url.searchParams.get('data.id');
    if (!meta || typeof requestId !== 'string' || requestId.length > 200 ||
        !dataId || dataId.length > 160 ||
        !validSignature({
          secret: getSecret(), timestamp: meta.ts, requestId,
          dataId, signature: meta.v1, now: now()
        })) {
      return json(401, {error: 'invalid_signature'});
    }
    if ((req.headers['content-type'] || '').split(';')[0].trim() !== 'application/json') {
      return json(415, {error: 'expected_json'});
    }
    let bytes = 0;
    const chunks = [];
    req.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > MAX_BYTES) { req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch {return json(400, {error: 'invalid_json'});}
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return json(400, {error: 'invalid_event'});
      }
      // No logs of webhook payloads, secret, payer details or transaction IDs.
      const topic = body.type || body.topic || body.action || 'unknown';
      latestTopic = ACCEPTED_TOPICS.has(topic) ? topic : 'other';
      latestTime = new Date(now()).toISOString();
      verified++;
      return json(200, {received: true, testOnly: true});
    });
    req.on('error', () => {
      if (!res.headersSent) json(400, {error: 'request_error'});
    });
  };
  return http.createServer(handler);
}

if (require.main === module) {
  const port = Number(process.env.PORT || 10000);
  const server = createApp();
  server.listen(port, '0.0.0.0', () => {
    console.log('IDPS webhook TEST receiver listening on', port,
      '(never charges or activates accounts)');
  });
}

module.exports = {createApp, parseSignature, validSignature};
