/**
 * LOCAL RELEASE PREPARATION. Actual Pages adapters import this shared handler.
 * Deployment and runtime configuration remain separate, explicitly approved steps.
 * Uses a publishable application key plus the verified caller's access token.
 * SQL RPCs remain the authority for ownership, live session/RBAC/MFA and limits.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_REQUEST_BYTES = 100_000;
// Fits 50 x 20k-character posts/revisions, even when each character is
// JSON-escaped to six ASCII bytes. Bulk audit responses are metadata-only.
const MAX_UPSTREAM_BYTES = 8_000_000;
const POST_COLUMNS = 'id,kind,topic_id,title,body,author_id,version,hidden,pinned,locked,created_at,updated_at';
const WRITES = new Set(['POST', 'PATCH']);
const ERROR_MESSAGES = Object.freeze({
  backend_disabled: 'Community backend is not enabled.',
  backend_unavailable: 'Community backend is temporarily unavailable.',
  upstream_invalid: 'Community backend returned an invalid response.',
  unauthorized: 'A valid sign-in is required.',
  forbidden: 'This action is not permitted.',
  invalid_request: 'The request is invalid.',
  unsupported_media_type: 'Send an application/json request.',
  payload_too_large: 'The request body is too large.',
  not_found: 'The requested resource was not found.',
  method_not_allowed: 'This method is not allowed.',
  version_conflict: 'The content changed. Reload before trying again.',
  rate_limited: 'Please wait before trying again.',
});

class ApiError extends Error {
  constructor(status, code) {
    super(ERROR_MESSAGES[code]);
    this.status = status;
    this.code = code;
  }
}
const fail = (status, code) => { throw new ApiError(status, code); };
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const charLength = (v) => [...v].length;

function config(env) {
  if (env?.COMMUNITY_BACKEND_ENABLED !== 'true') fail(503, 'backend_disabled');
  try {
    const source = env.SUPABASE_URL;
    const site = env.COMMUNITY_ALLOWED_ORIGIN;
    if (typeof source !== 'string' || typeof site !== 'string') throw new Error();
    const upstream = new URL(source);
    const origin = new URL(site);
    // Hosted Supabase only in this starter: no arbitrary upstreams, IPs or redirects.
    if (upstream.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/.test(upstream.hostname)
      || upstream.port || upstream.username || upstream.password || upstream.search || upstream.hash
      || upstream.pathname !== '/' || ![upstream.origin, `${upstream.origin}/`].includes(source)) throw new Error();
    if (origin.protocol !== 'https:' || origin.origin !== site || origin.username || origin.password
      || origin.hostname.includes('*') || !origin.hostname.includes('.')) throw new Error();
    const key = env.SUPABASE_PUBLISHABLE_KEY;
    // Do not accept JWT anon/service_role keys or sb_secret keys as a fallback.
    if (typeof key !== 'string' || !/^sb_publishable_[A-Za-z0-9_-]{16,512}$/.test(key)) throw new Error();
    return { upstream: upstream.origin, origin: origin.origin, key };
  } catch { fail(503, 'backend_disabled'); }
}

function response(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'CDN-Cache-Control': 'no-store',
      'Pragma': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
      ...extra,
    },
  });
}

function guardOrigin(request, url, settings) {
  if (url.origin !== settings.origin) fail(403, 'forbidden');
  const origin = request.headers.get('Origin');
  const site = request.headers.get('Sec-Fetch-Site');
  if (origin !== null && origin !== settings.origin) fail(403, 'forbidden');
  if (site !== null && !['same-origin', 'none'].includes(site)) fail(403, 'forbidden');
  if (WRITES.has(request.method)) {
    if (origin !== settings.origin || site !== 'same-origin') fail(403, 'forbidden');
    const mode = request.headers.get('Sec-Fetch-Mode');
    if (mode !== null && !['cors', 'same-origin'].includes(mode)) fail(403, 'forbidden');
    const dest = request.headers.get('Sec-Fetch-Dest');
    if (dest !== null && dest !== 'empty') fail(403, 'forbidden');
  }
}

async function boundedJson(body, headers, max, { upstream = false, signal } = {}) {
  const invalid = () => fail(upstream ? 502 : 400, upstream ? 'upstream_invalid' : 'invalid_request');
  const tooLarge = () => fail(upstream ? 502 : 413, upstream ? 'upstream_invalid' : 'payload_too_large');
  const length = headers.get('Content-Length');
  if (length !== null && !/^\d+$/.test(length)) invalid();
  if (length !== null && Number(length) > max) tooLarge();
  if (!body) invalid();
  const reader = body.getReader();
  const chunks = [];
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    while (true) {
      if (signal?.aborted) throw new Error('aborted');
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) tooLarge();
      try { chunks.push(decoder.decode(value, { stream: true })); }
      catch { invalid(); }
    }
    // Do not duplicate all byte chunks in an additional contiguous byte array.
    try { chunks.push(decoder.decode()); return JSON.parse(chunks.join('')); }
    catch { invalid(); }
  } catch (error) {
    cancel();
    throw error;
  } finally {
    signal?.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
}

async function deadline(callback, timeoutMs) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      callback(controller.signal),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new ApiError(503, 'backend_unavailable'));
        }, timeoutMs);
      }),
    ]);
  } finally { clearTimeout(timer); }
}

function validateKeys(object, required, optional = []) {
  if (!isObject(object)) fail(400, 'invalid_request');
  const allowed = new Set([...required, ...optional]);
  if (Object.keys(object).some((key) => !allowed.has(key))
    || required.some((key) => !Object.hasOwn(object, key))) fail(400, 'invalid_request');
}
function textValue(value, min, max) {
  if (typeof value !== 'string' || value.includes('\u0000')) fail(400, 'invalid_request');
  const trimmed = value.trim();
  if (charLength(trimmed) < min || charLength(trimmed) > max) fail(400, 'invalid_request');
  return trimmed;
}
function id(value) {
  if (typeof value !== 'string' || !UUID.test(value)) fail(400, 'invalid_request');
  return value.toLowerCase();
}
function version(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 2_147_483_647) fail(400, 'invalid_request');
  return value;
}
function query(url, allowed = []) {
  for (const key of url.searchParams.keys()) {
    if (!allowed.includes(key) || url.searchParams.getAll(key).length !== 1) fail(400, 'invalid_request');
  }
}
function page(url) {
  const number = (key, defaultValue, min, max) => {
    const raw = url.searchParams.get(key);
    if (raw === null) return defaultValue;
    if (!/^\d{1,5}$/.test(raw)) fail(400, 'invalid_request');
    const value = Number(raw);
    if (value < min || value > max) fail(400, 'invalid_request');
    return value;
  };
  return { limit: number('limit', 25, 1, 50), offset: number('offset', 0, 0, 10_000) };
}

const ROUTES = [
  ['topics', /^\/api\/community\/topics$/, ['GET', 'POST'], 'public'],
  ['topic', /^\/api\/community\/topics\/([^/]+)$/, ['GET'], 'public'],
  ['reply', /^\/api\/community\/topics\/([^/]+)\/replies$/, ['POST'], 'member'],
  ['messages', /^\/api\/community\/messages$/, ['GET', 'POST'], 'public'],
  ['selfEdit', /^\/api\/community\/posts\/([^/]+)$/, ['PATCH'], 'member'],
  ['adminSession', /^\/api\/admin\/session$/, ['GET'], 'admin'],
  ['adminPosts', /^\/api\/admin\/posts$/, ['GET'], 'admin'],
  ['adminUsers', /^\/api\/admin\/users$/, ['GET'], 'owner'],
  ['adminAudit', /^\/api\/admin\/audit$/, ['GET'], 'owner'],
  ['adminHistory', /^\/api\/admin\/posts\/([^/]+)\/history$/, ['GET'], 'admin'],
  ['adminEdit', /^\/api\/admin\/posts\/([^/]+)\/edit$/, ['POST'], 'admin'],
  ['adminModerate', /^\/api\/admin\/posts\/([^/]+)\/(hide|restore|pin|unpin|lock|unlock)$/, ['POST'], 'admin'],
  ['adminAccount', /^\/api\/admin\/users\/([^/]+)\/(suspend|restore)$/, ['POST'], 'owner'],
];

function matchRoute(url, method) {
  if (url.href.length > 2048 || url.pathname.includes('%')) fail(400, 'invalid_request');
  for (const [name, pattern, methods, access] of ROUTES) {
    const match = pattern.exec(url.pathname);
    if (!match) continue;
    if (!methods.includes(method)) fail(405, 'method_not_allowed');
    return { name, access: method !== 'GET' && access === 'public' ? 'member' : access, match };
  }
  fail(404, 'not_found');
}

function upstreamError(status, payload) {
  const byCode = {
    PT401: [401, 'unauthorized'], PT403: [403, 'forbidden'],
    PT404: [404, 'not_found'], PT409: [409, 'version_conflict'],
    PT422: [400, 'invalid_request'], PT429: [429, 'rate_limited'],
    '42501': [403, 'forbidden'],
  };
  const mapped = isObject(payload) ? byCode[payload.code] : null;
  if (Array.isArray(mapped)) fail(...mapped);
  if (status === 401) fail(401, 'unauthorized');
  if (status === 403) fail(403, 'forbidden');
  if (status === 429) fail(429, 'rate_limited');
  fail(503, 'backend_unavailable');
}

/** Dependency injection is for local tests; production callers use native fetch. */
export function createCommunityHandler({ fetch: fetchImpl = globalThis.fetch, timeoutMs = 8_000, logger } = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch is required');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10_000) throw new TypeError('Invalid timeout');
  return async function handleCommunityRequest(request, env = {}) {
    let routeName = 'unmatched';
    try {
      const settings = config(env);
      const url = new URL(request.url);
      const route = matchRoute(url, request.method);
      routeName = route.name;
      guardOrigin(request, url, settings);
      if (route.match[1]) id(route.match[1]);
      const call = async (path, { token, body, method = 'POST' } = {}) => deadline(async (signal) => {
        const headers = { apikey: settings.key, Accept: 'application/json',
          'Cache-Control': 'no-store, no-cache, max-age=0', Pragma: 'no-cache' };
        // Publishable keys belong only in apikey, never in Authorization.
        if (token) headers.Authorization = `Bearer ${token}`;
        if (body !== undefined) headers['Content-Type'] = 'application/json';
        const result = await fetchImpl(`${settings.upstream}${path}`, {
          // Older Pages runtimes reject RequestInit.cache before making a request.
          // Negative TTL explicitly excludes GET responses from Cloudflare caching.
          method, headers, signal, redirect: 'error', credentials: 'omit',
          cf: { cacheTtlByStatus: { '100-599': -1 } },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        });
        const data = await boundedJson(result.body, result.headers, MAX_UPSTREAM_BYTES, { upstream: true, signal });
        if (!result.ok) upstreamError(result.status, data);
        return data;
      }, timeoutMs);
      const rpc = (name, payload = {}, token) => call(`/rest/v1/rpc/community_${name}`, { body: payload, token });
      let token;
      let session;
      if (route.access !== 'public') {
        const authorization = request.headers.get('Authorization') || '';
        const match = /^Bearer ([A-Za-z0-9._~-]{16,8192})$/i.exec(authorization);
        if (!match) fail(401, 'unauthorized');
        token = match[1];
        // No JWT decode is used for authentication or authorization.
        const user = await call('/auth/v1/user', { method: 'GET', token });
        if (!isObject(user) || !UUID.test(user.id || '') || user.role !== 'authenticated') fail(401, 'unauthorized');
        if (user.is_anonymous === true || typeof user.email !== 'string' || !user.email
          || typeof user.email_confirmed_at !== 'string' || !Number.isFinite(Date.parse(user.email_confirmed_at))) fail(403, 'forbidden');
        if (user.banned_until && Date.parse(user.banned_until) > Date.now()) fail(403, 'forbidden');
        // Live DB checks also catch app suspension, changed role and revoked session.
        session = await rpc('me', {}, token);
        if (!isObject(session) || session.user_id !== user.id || session.email_verified !== true
          || session.state !== 'active' || session.can_post !== true) fail(403, 'forbidden');
        if (['admin', 'owner'].includes(route.access)
          && (session.can_moderate !== true || session.aal !== 'aal2'
            || !['moderator', 'owner'].includes(session.role))) fail(403, 'forbidden');
        if (route.access === 'owner' && session.role !== 'owner') fail(403, 'forbidden');
      }
      let body;
      if (WRITES.has(request.method)) {
        query(url);
        if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('Content-Type') || '')
          || request.headers.has('Content-Encoding')) fail(415, 'unsupported_media_type');
        body = await deadline((signal) => boundedJson(request.body, request.headers, MAX_REQUEST_BYTES, { signal }), timeoutMs);
      }
      const list = async (filters, paging, order) => {
        const params = new URLSearchParams({ select: POST_COLUMNS, hidden: 'eq.false', ...filters,
          order, limit: String(paging.limit), offset: String(paging.offset) });
        // Force anonymous public RLS even when an admin sends an Authorization header.
        const rows = await call(`/rest/v1/community_posts?${params}`, { method: 'GET' });
        if (!Array.isArray(rows)) fail(502, 'upstream_invalid');
        return rows;
      };
      if (['topics', 'messages'].includes(route.name) && request.method === 'GET') {
        query(url, ['limit', 'offset']);
        const paging = page(url);
        const kind = route.name === 'topics' ? 'topic' : 'message';
        return response({ data: await list({ kind: `eq.${kind}` }, paging,
          kind === 'topic' ? 'pinned.desc,created_at.desc,id.desc' : 'created_at.desc,id.desc'), page: paging });
      }
      if (route.name === 'topic') {
        query(url, ['limit', 'offset']);
        const paging = page(url);
        const topicId = id(route.match[1]);
        const topics = await list({ id: `eq.${topicId}`, kind: 'eq.topic' }, { limit: 1, offset: 0 }, 'id.asc');
        if (topics.length !== 1) fail(404, 'not_found');
        const replies = await list({ topic_id: `eq.${topicId}`, kind: 'eq.reply' }, paging, 'created_at.asc,id.asc');
        return response({ data: { topic: topics[0], replies }, page: paging });
      }
      if (['topics', 'messages', 'reply'].includes(route.name)) {
        const kind = route.name === 'topics' ? 'topic' : route.name === 'messages' ? 'message' : 'reply';
        validateKeys(body, kind === 'topic' ? ['title', 'body'] : ['body']);
        const payload = { p_kind: kind, p_title: kind === 'topic' ? textValue(body.title, 1, 160) : '',
          p_body: textValue(body.body, 1, kind === 'message' ? 5_000 : 20_000),
          p_topic_id: kind === 'reply' ? id(route.match[1]) : null };
        return response({ data: await rpc('create_post', payload, token) }, 201);
      }
      if (['selfEdit', 'adminEdit'].includes(route.name)) {
        const admin = route.name === 'adminEdit';
        validateKeys(body, ['expected_version', 'title', 'body', ...(admin ? ['reason'] : [])]);
        const payload = { p_post_id: id(route.match[1]), p_expected_version: version(body.expected_version),
          p_title: textValue(body.title, 0, 160), p_body: textValue(body.body, 1, 20_000),
          ...(admin ? { p_reason: textValue(body.reason, 1, 500) } : {}) };
        return response({ data: await rpc(admin ? 'admin_edit_post' : 'edit_post', payload, token) });
      }
      if (route.name === 'adminSession') {
        query(url);
        return response({ data: session });
      }
      if (route.name === 'adminPosts') {
        query(url, ['kind', 'search', 'include_hidden', 'limit', 'offset']);
        const kind = url.searchParams.get('kind');
        if (kind !== null && !['topic', 'reply', 'message'].includes(kind)) fail(400, 'invalid_request');
        const hidden = url.searchParams.get('include_hidden');
        if (hidden !== null && !['true', 'false'].includes(hidden)) fail(400, 'invalid_request');
        const paging = page(url);
        const data = await rpc('admin_list', { p_kind: kind, p_search: textValue(url.searchParams.get('search') || '', 0, 200),
          p_include_hidden: hidden !== 'false', p_limit: paging.limit, p_offset: paging.offset }, token);
        return response({ data, page: paging });
      }
      if (['adminUsers', 'adminAudit'].includes(route.name)) {
        const users = route.name === 'adminUsers';
        query(url, ['limit', 'offset', ...(users ? ['search'] : [])]);
        const paging = page(url);
        const data = await rpc(users ? 'admin_accounts' : 'admin_audit', { p_limit: paging.limit, p_offset: paging.offset,
          ...(users ? { p_search: textValue(url.searchParams.get('search') || '', 0, 200) } : {}) }, token);
        return response({ data, page: paging });
      }
      if (route.name === 'adminHistory') {
        query(url, ['limit', 'offset']);
        const paging = page(url);
        return response({ data: await rpc('post_history', { p_post_id: id(route.match[1]),
          p_limit: paging.limit, p_offset: paging.offset }, token), page: paging });
      }
      if (['adminModerate', 'adminAccount'].includes(route.name)) {
        validateKeys(body, ['expected_version', 'reason']);
        const payload = { p_expected_version: version(body.expected_version), p_reason: textValue(body.reason, 1, 500) };
        const account = route.name === 'adminAccount';
        Object.assign(payload, account
          ? { p_user_id: id(route.match[1]), p_state: route.match[2] === 'suspend' ? 'suspended' : 'active' }
          : { p_post_id: id(route.match[1]), p_action: route.match[2] });
        return response({ data: await rpc(account ? 'set_account_state' : 'moderate_post', payload, token) });
      }
      fail(404, 'not_found');
    } catch (error) {
      const safe = error instanceof ApiError ? error : new ApiError(503, 'backend_unavailable');
      // Deliberately exclude URL, request, headers, body and upstream error text.
      try { logger?.({ event: 'community_api_error', route: routeName, status: safe.status, code: safe.code }); }
      catch { /* Logging must never change a response or disclose an error. */ }
      return response({ error: { code: safe.code, message: ERROR_MESSAGES[safe.code] } }, safe.status);
    }
  };
}

export const handleCommunityRequest = createCommunityHandler();
