/** Transport only. Auth UI/session lifecycle is deliberately not implemented here. */
export function createCommunityClient({ enabled = false, tokenProvider, fetchImpl = globalThis.fetch, origin = globalThis.location?.origin } = {}) {
  if (typeof tokenProvider !== 'function') tokenProvider = async () => null;
  const base = new URL(origin || 'https://disabled.invalid');
  if (base.protocol !== 'https:' || base.username || base.password || base.pathname !== '/' || base.search || base.hash) throw new Error('Invalid community origin');
  async function request(path, { method = 'GET', body, authenticated = false, signal } = {}) {
    if (!enabled) throw Object.assign(new Error('Community backend is not connected.'), { code: 'BACKEND_DISABLED' });
    if (typeof path !== 'string' || path.length > 8192 || /[\r\n\\#]/.test(path)) throw new Error('Invalid API path');
    const pathname = path.split('?')[0];
    // Route segments are fixed names or UUIDs. Encoded segments and dot traversal
    // are unnecessary; encoded search text belongs only in the query string.
    const route = /^\/api\/(community|admin)\/[a-z0-9_/-]+$/i;
    if (!route.test(pathname)) throw new Error('Invalid API path');
    const url = new URL(path, base);
    if (url.origin !== base.origin || !route.test(url.pathname) || url.pathname !== pathname) throw new Error('Cross-origin request blocked');
    const headers = { Accept: 'application/json' };
    if (authenticated || path.startsWith('/api/admin/') || method !== 'GET') {
      const token = await tokenProvider();
      if (typeof token !== 'string' || !token || /[\r\n]/.test(token)) throw Object.assign(new Error('Sign in is required.'), { code: 'SIGN_IN_REQUIRED' });
      headers.Authorization = `Bearer ${token}`;
    }
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    // No cookies or persisted token handling; the separately reviewed Auth integration supplies tokens.
    const response = await fetchImpl(url.href, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'omit', redirect: 'error', cache: 'no-store', signal });
    let result;
    try { result = await response.json(); } catch { throw Object.assign(new Error('The server returned an invalid response.'), { code: 'INVALID_RESPONSE' }); }
    if (!response.ok) {
      const code = typeof result?.error?.code === 'string' ? result.error.code : 'REQUEST_FAILED';
      const messages = { version_conflict: 'This content changed. Reload it before saving again.', unauthorized: 'Your session has expired. Sign in again.', forbidden: 'This action is not available to your account.', backend_disabled: 'Community backend is not connected.' };
      throw Object.assign(new Error(messages[code] || 'The request could not be completed.'), { code, status: response.status });
    }
    return result;
  }
  return Object.freeze({ request });
}
