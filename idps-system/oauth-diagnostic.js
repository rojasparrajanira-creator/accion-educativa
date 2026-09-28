const { Pool } = require('pg');

// Compatibilidad preventiva con el nombre usado inicialmente en Render.
if (!process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_CLIENT_SECRE) {
  process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRE;
}

console.log('[GOOGLE_OAUTH_CONFIG]', JSON.stringify({
  client_id: !!process.env.GOOGLE_CLIENT_ID,
  client_secret: !!process.env.GOOGLE_CLIENT_SECRET,
  database: !!process.env.DATABASE_URL
}));

const originalFetch = global.fetch;
const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  : null;

async function storedRefreshToken() {
  if (!pool) return null;
  try {
    await pool.query("CREATE TABLE IF NOT EXISTS idps_settings (key text PRIMARY KEY, value text NOT NULL)");
    const q = await pool.query("SELECT value FROM idps_settings WHERE key='gmail_refresh_token'");
    return q.rows[0]?.value || null;
  } catch (e) {
    console.error('[GMAIL_TOKEN_STORE_ERROR]', e.message);
    return null;
  }
}

function b64url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function mimeSubject(subject) {
  return `=?UTF-8?B?${Buffer.from(String(subject || 'Acceso Plataforma IDPS')).toString('base64')}?=`;
}

async function sendViaGmail(payload) {
  const refreshToken = await storedRefreshToken();
  if (!refreshToken) return null;

  const tokenResponse = await originalFetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  });
  const tokenData = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || !tokenData.access_token) {
    console.error('[GMAIL_REFRESH_ERROR]', JSON.stringify({
      status: tokenResponse.status,
      error: tokenData.error || null,
      error_description: tokenData.error_description || null
    }));
    return new Response(JSON.stringify({ error: 'gmail_refresh_failed' }), { status: 502 });
  }

  const to = Array.isArray(payload.to) ? payload.to.join(', ') : String(payload.to || '');
  const subject = mimeSubject(payload.subject || 'Acceso Plataforma IDPS');
  const html = String(payload.html || '');
  const raw = [
    'From: Accion Educativa SPA <accioneducativaspa@gmail.com>',
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    html
  ].join('\r\n');

  const gmailResponse = await originalFetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ raw: b64url(raw) })
  });
  const gmailText = await gmailResponse.text();
  if (!gmailResponse.ok) {
    console.error('[GMAIL_SEND_ERROR]', JSON.stringify({ status: gmailResponse.status, body: gmailText.slice(0, 240) }));
    return new Response(gmailText, { status: gmailResponse.status });
  }
  console.log('[GMAIL_SEND_OK] activation email sent');
  return new Response(gmailText || '{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } });
}

if (originalFetch) {
  global.fetch = async function (...args) {
    const target = String(args[0] || '');

    // El código histórico llama a Resend. Cuando Gmail ya está autorizado,
    // este puente lo envía por Gmail API sin exponer credenciales al navegador.
    if (target.includes('api.resend.com/emails')) {
      try {
        const options = args[1] || {};
        const payload = JSON.parse(options.body || '{}');
        const gmailResult = await sendViaGmail(payload);
        if (gmailResult) return gmailResult;
      } catch (e) {
        console.error('[GMAIL_BRIDGE_ERROR]', e.message);
      }
    }

    const response = await originalFetch(...args);
    try {
      if (target.includes('oauth2.googleapis.com/token')) {
        const clone = response.clone();
        const data = await clone.json().catch(() => ({}));
        if (!response.ok) {
          console.error('[GOOGLE_OAUTH_ERROR]', JSON.stringify({
            status: response.status,
            error: data.error || null,
            error_description: data.error_description || null
          }));
        } else {
          console.log('[GOOGLE_OAUTH_OK]', JSON.stringify({
            status: response.status,
            refresh_token_received: !!data.refresh_token,
            access_token_received: !!data.access_token
          }));
        }
      }
    } catch (_) {}
    return response;
  };
}
