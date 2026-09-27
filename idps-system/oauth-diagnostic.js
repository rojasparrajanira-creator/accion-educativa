const originalFetch = global.fetch;
if (originalFetch) {
  global.fetch = async function (...args) {
    const response = await originalFetch(...args);
    try {
      const target = String(args[0] || '');
      if (target.includes('oauth2.googleapis.com/token') && !response.ok) {
        const clone = response.clone();
        const data = await clone.json().catch(() => ({}));
        console.error('[GOOGLE_OAUTH_ERROR]', JSON.stringify({
          status: response.status,
          error: data.error || null,
          error_description: data.error_description || null
        }));
      }
    } catch (_) {}
    return response;
  };
}
