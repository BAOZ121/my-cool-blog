/**
 * Pages administrator email verification. Explicit feature/configuration gates apply.
 * Dedicated administrator email codes, NOT Supabase native OTP or AAL2.
 * Every Supabase RPC uses the same verified original password-session JWT.
 * Live owner/password/session, attempts, expiry and action-grant consumption are DB authority.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HEX64 = /^[a-f0-9]{64}$/;
const ROUTES = Object.freeze({
  '/api/admin/stepup/begin': { method: 'POST', name: 'begin' },
  '/api/admin/stepup/verify': { method: 'POST', name: 'verify' },
  '/api/admin/stepup/cancel': { method: 'POST', name: 'cancel' },
  '/api/admin/stepup/status': { method: 'GET', name: 'status' },
});
const MESSAGES = Object.freeze({
  stepup_disabled: 'Administrator email verification is not enabled.',
  stepup_unavailable: 'Administrator email verification could not be completed.',
  unauthorized: 'A valid sign-in is required.', forbidden: 'This action is not permitted.',
  invalid_request: 'The verification request is invalid.', not_found: 'The requested resource was not found.',
  method_not_allowed: 'This method is not allowed.', payload_too_large: 'The request is too large.',
  unsupported_media_type: 'Send an application/json request.', rate_limited: 'Wait before requesting another code.',
  version_conflict: 'The content changed. Reload before trying again.',
});
class Failure extends Error {
  constructor(status, code, retryAfter) { super(MESSAGES[code]); this.status = status; this.code = code; this.retryAfter = retryAfter; }
}
const fail = (status, code) => { throw new Failure(status, code); };
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, min, max) => {
  if (typeof value !== 'string' || value.includes('\0')) fail(400, 'invalid_request');
  const result = value.trim();
  if ([...result].length < min || [...result].length > max) fail(400, 'invalid_request');
  return result;
};
function keys(value, required, optional = []) {
  if (!object(value) || required.some((key) => !Object.hasOwn(value, key))
    || Object.keys(value).some((key) => ![...required, ...optional].includes(key))) fail(400, 'invalid_request');
}
function identifier(value) { if (typeof value !== 'string' || !UUID.test(value)) fail(400, 'invalid_request'); return value; }
function settings(env, cancellationOnly = false) {
  if (env.COMMUNITY_BACKEND_ENABLED !== 'true' || env.COMMUNITY_EMAIL_STEPUP_ENABLED !== 'true') fail(503, 'stepup_disabled');
  try {
    const upstream = new URL(env.SUPABASE_URL), origin = new URL(env.COMMUNITY_ALLOWED_ORIGIN);
    if (upstream.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/.test(upstream.hostname)
      || ![upstream.origin, `${upstream.origin}/`].includes(env.SUPABASE_URL) || upstream.port
      || upstream.username || upstream.password || upstream.pathname !== '/' || upstream.search || upstream.hash) throw new Error();
    if (origin.protocol !== 'https:' || origin.origin !== env.COMMUNITY_ALLOWED_ORIGIN || origin.username
      || origin.password || origin.hostname.includes('*') || !origin.hostname.includes('.')) throw new Error();
    if (!/^sb_publishable_[A-Za-z0-9_-]{16,512}$/.test(env.SUPABASE_PUBLISHABLE_KEY || '')) throw new Error();
    // Revoking a known own-session challenge needs no mail/signing credential.
    // Both explicit flags and the public origin/Auth configuration still apply.
    if (!cancellationOnly && (!/^[A-Za-z0-9_-]{32,128}$/.test(env.ADMIN_STEPUP_HMAC_KEY || '')
      || !/^re_[A-Za-z0-9_-]{16,256}$/.test(env.ADMIN_STEPUP_RESEND_KEY || ''))) throw new Error();
    return { upstream: upstream.origin, project: upstream.hostname.split('.')[0], origin: origin.origin,
      publishableKey: env.SUPABASE_PUBLISHABLE_KEY, hmacKey: env.ADMIN_STEPUP_HMAC_KEY, mailKey: env.ADMIN_STEPUP_RESEND_KEY };
  } catch { fail(503, 'stepup_disabled'); }
}
// Shared router can check readiness without exposing or retaining secret values.
export function hasAdminStepupConfiguration(env) {
  try { settings(env); return true; } catch { return false; }
}
function json(value, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(value), { status, headers: {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'CDN-Cache-Control': 'no-store',
    'Pragma': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Resource-Policy': 'same-origin', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'", ...extraHeaders,
  } });
}
function requestGuard(request, config) {
  const url = new URL(request.url);
  if (url.href.length > 512 || url.pathname.includes('%') || url.search) fail(400, 'invalid_request');
  const route = ROUTES[url.pathname];
  if (!route) fail(404, 'not_found');
  if (request.method !== route.method) fail(405, 'method_not_allowed');
  const origin = request.headers.get('Origin'), site = request.headers.get('Sec-Fetch-Site');
  if (url.origin !== config.origin || (origin !== null && origin !== config.origin)
    || (site !== null && !['same-origin', 'none'].includes(site))) fail(403, 'forbidden');
  if (request.method === 'POST') {
    if (origin !== config.origin || site !== 'same-origin') fail(403, 'forbidden');
    const mode = request.headers.get('Sec-Fetch-Mode'), dest = request.headers.get('Sec-Fetch-Dest');
    if ((mode !== null && !['cors', 'same-origin'].includes(mode)) || (dest !== null && dest !== 'empty')) fail(403, 'forbidden');
    if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('Content-Type') || '')
      || request.headers.has('Content-Encoding')) fail(415, 'unsupported_media_type');
  }
  return route;
}
async function boundedJson(stream, headers, limit, signal, upstream = false) {
  const bad = () => fail(upstream ? 503 : 400, upstream ? 'stepup_unavailable' : 'invalid_request');
  const large = () => fail(upstream ? 503 : 413, upstream ? 'stepup_unavailable' : 'payload_too_large');
  const length = headers.get('Content-Length');
  if (length !== null && !/^\d+$/.test(length)) bad();
  if (length !== null && Number(length) > limit) large();
  if (!stream) bad();
  const reader = stream.getReader(), decoder = new TextDecoder('utf-8', { fatal: true });
  const parts = []; let size = 0;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    while (true) {
      if (signal.aborted) throw new Error('aborted');
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) large();
      try { parts.push(decoder.decode(value, { stream: true })); } catch { bad(); }
    }
    try { parts.push(decoder.decode()); return JSON.parse(parts.join('')); } catch { bad(); }
  } catch (error) { cancel(); throw error; }
  finally { signal.removeEventListener('abort', cancel); reader.releaseLock(); }
}
async function deadline(callback, timeoutMs, parentSignal) {
  if (parentSignal.aborted) fail(503, 'stepup_unavailable');
  const controller = new AbortController(); let timer;
  let abortParent;
  const parentAbort = new Promise((_, reject) => {
    abortParent = () => { controller.abort(); reject(new Failure(503, 'stepup_unavailable')); };
    parentSignal.addEventListener('abort', abortParent, { once: true });
  });
  try {
    return await Promise.race([callback(controller.signal), new Promise((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Failure(503, 'stepup_unavailable')); }, timeoutMs);
    }), parentAbort]);
  } finally { clearTimeout(timer); parentSignal.removeEventListener('abort', abortParent); }
}
function beginArguments(body) {
  keys(body, ['scope'], ['action', 'target_id', 'expected_version', 'payload']);
  const payload = { p_scope: body.scope, p_action: null, p_target_id: null, p_expected_version: null, p_payload: null };
  if (body.scope === 'admission') {
    if (['action', 'target_id', 'expected_version', 'payload'].some((key) => body[key] != null)) fail(400, 'invalid_request');
    return payload;
  }
  if (body.scope !== 'action' || !['admin_edit_post', 'moderate_post', 'set_account_state'].includes(body.action)
    || !Number.isInteger(body.expected_version) || body.expected_version < 1 || body.expected_version > 2_147_483_647) fail(400, 'invalid_request');
  payload.p_action = body.action; payload.p_target_id = identifier(body.target_id); payload.p_expected_version = body.expected_version;
  if (body.action === 'admin_edit_post') {
    keys(body.payload, ['title', 'body', 'reason']);
    payload.p_payload = { title: text(body.payload.title, 0, 160), body: text(body.payload.body, 1, 20_000), reason: text(body.payload.reason, 1, 500) };
  } else if (body.action === 'moderate_post') {
    keys(body.payload, ['action', 'reason']);
    if (!['hide', 'restore', 'pin', 'unpin', 'lock', 'unlock'].includes(body.payload.action)) fail(400, 'invalid_request');
    payload.p_payload = { action: body.payload.action, reason: text(body.payload.reason, 1, 500) };
  } else {
    keys(body.payload, ['state', 'reason']);
    if (!['active', 'suspended'].includes(body.payload.state)) fail(400, 'invalid_request');
    payload.p_payload = { state: body.payload.state, reason: text(body.payload.reason, 1, 500) };
  }
  return payload;
}
function challengeContext(value, user, config, args, now) {
  if (!object(value) || value.created !== true || !UUID.test(value.id || '') || value.user_id !== user.id || value.email !== user.email
    || !UUID.test(value.original_session_id || '') || value.project !== config.project
    || typeof value.generation !== 'string' || !/^[1-9][0-9]{0,18}$/.test(value.generation)
    || value.scope !== args.p_scope || value.action !== args.p_action || value.target_id !== args.p_target_id
    || value.expected_version !== args.p_expected_version || !HEX64.test(value.binding_digest || '')
    || !/^[a-f0-9]{32}$/.test(value.salt || '') || !Number.isSafeInteger(value.expires_epoch)
    || value.expires_epoch * 1000 <= now() || value.expires_epoch * 1000 > now() + 305_000) fail(503, 'stepup_unavailable');
  if (value.scope === 'action' && !HEX64.test(value.payload_digest || '')) fail(503, 'stepup_unavailable');
  return value;
}
function upstreamFailure(status, body) {
  const codes = { PT401: [401, 'unauthorized'], PT403: [403, 'forbidden'], PT404: [404, 'not_found'],
    PT409: [409, 'version_conflict'], PT422: [400, 'invalid_request'], PT429: [429, 'rate_limited'] };
  const mapped = object(body) ? codes[body.code] : null;
  if (Array.isArray(mapped)) fail(...mapped);
  if (status === 401) fail(401, 'unauthorized');
  if (status === 403) fail(403, 'forbidden');
  if (status === 429) fail(429, 'rate_limited');
  fail(503, 'stepup_unavailable');
}
function sixDigitCode(crypto) {
  // Rejection sampling avoids modulo bias; no Math.random or browser-supplied code.
  const draw = new Uint32Array(1);
  for (let tries = 0; tries < 32; tries += 1) {
    crypto.getRandomValues(draw);
    if (draw[0] < 4_294_000_000) return String(draw[0] % 1_000_000).padStart(6, '0');
  }
  fail(503, 'stepup_unavailable');
}
async function signer(crypto, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return async (fields) => {
    const bytes = await crypto.subtle.sign('HMAC', key, encoder.encode(fields.join('\n')));
    return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  };
}
function signedFields(domain, context, digest) {
  return [domain, context.project, context.generation, context.id, context.user_id, context.original_session_id,
    context.scope, context.binding_digest, String(context.expires_epoch), context.salt, digest];
}
export function projectAdminStepupStatus(value) {
  const epoch = (number) => Number.isSafeInteger(number) && number > 0;
  if (!object(value) || typeof value.enabled !== 'boolean' || typeof value.admitted !== 'boolean'
    || !UUID.test(value.original_session_id || '') || (value.admitted && !value.enabled)
    || (value.admitted && (!epoch(value.idle_expires_epoch) || !epoch(value.absolute_expires_epoch)))
    || (!value.admitted && (value.idle_expires_epoch !== null || value.absolute_expires_epoch !== null))) fail(503, 'stepup_unavailable');
  return { enabled: value.enabled, admitted: value.admitted, idle_expires_epoch: value.idle_expires_epoch,
    absolute_expires_epoch: value.absolute_expires_epoch };
}
function verificationResponse(value, challengeId) {
  if (!object(value) || typeof value.verified !== 'boolean') fail(503, 'stepup_unavailable');
  if (value.verified) {
    if (value.id !== challengeId || !['admission', 'action'].includes(value.scope) || !UUID.test(value.original_session_id || '')
      || !Number.isSafeInteger(value.expires_epoch) || value.expires_epoch <= 0) fail(503, 'stepup_unavailable');
    return { verified: true, id: value.id, scope: value.scope, expires_epoch: value.expires_epoch };
  }
  if (!['challenge_unavailable', 'challenge_expired', 'challenge_not_active', 'attempts_exhausted', 'invalid_code', 'admission_expired'].includes(value.error)
    || !Number.isInteger(value.attempts_remaining) || value.attempts_remaining < 0 || value.attempts_remaining > 5) fail(503, 'stepup_unavailable');
  return { verified: false, error: value.error, attempts_remaining: value.attempts_remaining };
}
function cancellationResponse(value) {
  if (!object(value) || typeof value.cancelled !== 'boolean' || typeof value.already_used !== 'boolean'
    || (value.cancelled && value.already_used)) fail(503, 'stepup_unavailable');
  if (value.cancelled || value.already_used) {
    if (Object.hasOwn(value, 'error')) fail(503, 'stepup_unavailable');
    return { cancelled: value.cancelled, already_used: value.already_used };
  }
  if (value.error !== 'challenge_unavailable') fail(503, 'stepup_unavailable');
  return { cancelled: false, already_used: false, error: 'challenge_unavailable' };
}

export function createAdminStepupHandler({ fetch: fetchImpl = globalThis.fetch, crypto = globalThis.crypto,
  now = Date.now, timeoutMs = 8_000, totalTimeoutMs = 20_000, logger } = {}) {
  if (typeof fetchImpl !== 'function' || typeof crypto?.getRandomValues !== 'function' || !crypto?.subtle
    || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10_000
    || !Number.isInteger(totalTimeoutMs) || totalTimeoutMs < 1 || totalTimeoutMs > 20_000) throw new TypeError('Invalid step-up dependencies');
  return async function handleAdminStepup(request, env = {}) {
    let routeName = 'unmatched';
    const overall = new AbortController(), abortRequest = () => overall.abort();
    const overallTimer = setTimeout(abortRequest, totalTimeoutMs);
    request.signal.addEventListener('abort', abortRequest, { once: true });
    if (request.signal.aborted) overall.abort();
    const success = (data) => { if (overall.signal.aborted) fail(503, 'stepup_unavailable'); return json({ data }); };
    try {
      const cancellationOnly = new URL(request.url).pathname === '/api/admin/stepup/cancel';
      const config = settings(env, cancellationOnly), route = requestGuard(request, config); routeName = route.name;
      const match = /^Bearer ([A-Za-z0-9._~-]{16,8192})$/i.exec(request.headers.get('Authorization') || '');
      if (!match) fail(401, 'unauthorized');
      const token = match[1];
      let args = {};
      if (route.method === 'POST') {
        const body = await deadline((signal) => boundedJson(request.body, request.headers, 100_000, signal), timeoutMs, overall.signal);
        if (route.name === 'begin') args = beginArguments(body);
        else if (route.name === 'cancel') {
          keys(body, ['challenge_id']);
          args = { p_challenge_id: identifier(body.challenge_id) };
        } else {
          keys(body, ['challenge_id', 'code']);
          if (typeof body.code !== 'string' || !/^[0-9]{6}$/.test(body.code)) fail(400, 'invalid_request');
          args = { p_challenge_id: identifier(body.challenge_id), p_code: body.code };
        }
      }
      const call = (url, init, mail = false) => deadline(async (signal) => {
        const result = await fetchImpl(url, { ...init, signal, credentials: 'omit', redirect: 'manual',
          headers: { ...init.headers, 'Cache-Control': 'no-store, no-cache, max-age=0', Pragma: 'no-cache' },
          cf: { cacheTtlByStatus: { '100-599': -1 } } });
        // Workers does not support redirect:'error'. Never follow any 3xx ourselves.
        if (result.status >= 300 && result.status < 400) { void result.body?.cancel().catch(() => {}); fail(503, 'stepup_unavailable'); }
        const data = await boundedJson(result.body, result.headers, 65_536, signal, true);
        if (!result.ok) { if (mail) fail(503, 'stepup_unavailable'); upstreamFailure(result.status, data); }
        return data;
      }, timeoutMs, overall.signal);
      const supabase = (path, body) => call(`${config.upstream}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { apikey: config.publishableKey, Authorization: `Bearer ${token}`, Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const rpc = (name, payload = {}) => supabase(`/rest/v1/rpc/community_admin_stepup_${name}`, payload);
      const user = await supabase('/auth/v1/user');
      if (!object(user) || !UUID.test(user.id || '') || user.role !== 'authenticated') fail(401, 'unauthorized');
      if (route.name !== 'cancel' && (user.is_anonymous === true || typeof user.email !== 'string' || user.email.length > 254
        || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email) || typeof user.email_confirmed_at !== 'string'
        || !Number.isFinite(Date.parse(user.email_confirmed_at)) || (user.banned_until && Date.parse(user.banned_until) > now()))) fail(403, 'forbidden');
      // No JWT decode, AAL2 assumption, session swap or browser role assertion.
      // Cancel is privilege-reducing: SQL still requires the live original password
      // session and exact challenge ownership, but permits revocation after email/role changes.
      if (route.name === 'cancel') return success(cancellationResponse(await rpc('cancel', args)));
      if (route.name === 'status') return success(projectAdminStepupStatus(await rpc('status')));
      if (route.name === 'verify') return success(verificationResponse(await rpc('verify', args), args.p_challenge_id));

      const beginning = await rpc('begin', args);
      if (beginning?.created === false && beginning.error === 'challenge_rate_limited'
        && Number.isInteger(beginning.retry_after_seconds) && beginning.retry_after_seconds >= 60 && beginning.retry_after_seconds <= 3600) {
        throw new Failure(429, 'rate_limited', beginning.retry_after_seconds);
      }
      const context = challengeContext(beginning, user, config, args, now);
      const code = sixDigitCode(crypto), hmac = await signer(crypto, config.hmacKey);
      const digest = await hmac(['otp-v1', context.project, context.generation, context.id, context.user_id,
        context.original_session_id, context.salt, code]);
      const registration = await rpc('register', { p_challenge_id: context.id, p_otp_digest: digest,
        p_signature: await hmac(signedFields('register-v1', context, digest)) });
      if (registration?.registered !== true) fail(503, 'stepup_unavailable');
      const operation = context.action === 'moderate_post' ? args.p_payload.action
        : context.action === 'set_account_state' ? (args.p_payload.state === 'suspended' ? 'suspend' : 'restore') : 'edit';
      const purpose = context.scope === 'admission' ? 'Sign in to DEX administration.'
        : `Approve the requested DEX administrator action.\nAction: ${context.action}\nOperation: ${operation}\nTarget: ${context.target_id}\nVersion: ${context.expected_version}`;
      const sent = await call('https://api.resend.com/emails', { method: 'POST', headers: {
        Authorization: `Bearer ${config.mailKey}`, 'Content-Type': 'application/json',
        'Idempotency-Key': `dex-admin-stepup/${context.id}`,
      }, body: JSON.stringify({ from: 'noreply@thedexs.com', to: [user.email],
        subject: 'DEX administrator verification code',
        text: `${purpose}\n\nYour verification code is: ${code}\n\nThis code expires within five minutes and only applies to this request. Never share it. If you did not request it, ignore this message.`,
      }) }, true);
      if (!object(sent) || !UUID.test(sent.id || '')) fail(503, 'stepup_unavailable');
      const activation = await rpc('activate', { p_challenge_id: context.id,
        p_signature: await hmac(signedFields('activate-v1', context, digest)) });
      if (activation?.active !== true) fail(503, 'stepup_unavailable');
      // Never return raw code, email, salt, digest, signatures, session IDs or mail ID.
      return success({ id: context.id, scope: context.scope, expires_epoch: context.expires_epoch });
    } catch (error) {
      const safe = error instanceof Failure ? error : new Failure(503, 'stepup_unavailable');
      try { logger?.({ event: 'admin_stepup_error', route: routeName, code: safe.code, status: safe.status }); } catch { /* No raw logs. */ }
      return json({ error: { code: safe.code, message: MESSAGES[safe.code],
        ...(safe.retryAfter ? { retry_after_seconds: safe.retryAfter } : {}) } }, safe.status,
      safe.retryAfter ? { 'Retry-After': String(safe.retryAfter) } : {});
    } finally {
      clearTimeout(overallTimer);
      request.signal.removeEventListener('abort', abortRequest);
    }
  };
}
