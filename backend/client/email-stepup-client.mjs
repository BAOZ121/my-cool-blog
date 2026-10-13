/**
 * Default-disabled dedicated email challenge under the existing password JWT.
 * No Supabase SDK, new Auth session, recipient selection or frontend HMAC secret.
 * Server identity, role, admission and exact-action grants remain authoritative.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9._~-]{16,8192}$/;
const MAX_CHALLENGE_MS = 5 * 60_000;
const RESEND_MS = 60_000;
const ROUTES = Object.freeze({ begin: '/api/admin/stepup/begin', verify: '/api/admin/stepup/verify', status: '/api/admin/stepup/status', cancel: '/api/admin/stepup/cancel' });
const MESSAGES = Object.freeze({
  DISABLED: 'Email administrator verification is not enabled.',
  CONFIGURATION_REQUIRED: 'Email verification is not configured.',
  SIGN_IN_REQUIRED: 'Sign in with your account before continuing.',
  FORBIDDEN: 'Administrator verification is not available to this session.',
  BUSY: 'A verification request is already in progress.',
  WAIT_TO_RESEND: 'Wait before requesting another code.',
  INVALID_REQUEST: 'The verification request is invalid.',
  CODE_INVALID: 'That verification code could not be accepted.',
  EXPIRED: 'This verification request expired. Request a new code.',
  ATTEMPTS_EXHAUSTED: 'Too many attempts. Request a new code after the waiting period.',
  VERIFICATION_DENIED: 'Administrator verification was not accepted.',
  EMAIL_DELIVERY_FAILED: 'The email could not be sent. Wait before requesting another code.',
  REQUEST_FAILED: 'Verification could not be completed. Check its status before trying again.',
  CANCELLED: 'The local verification request was stopped.',
  CANCEL_UNCONFIRMED: 'Cancellation was not confirmed. Keep this action blocked and retry cancellation explicitly.',
  version_conflict: 'This content changed. Review the latest version before preparing another action.',
  unauthorized: 'Your session has expired. Sign in again.',
  forbidden: 'This action is not available to your account.',
  ACTION_NOT_READY: 'Verify a fresh code for this exact action before confirming.',
  ACTION_UNCONFIRMED: 'The action outcome is uncertain. Do not repeat it; reconcile or cancel its unused permission.',
  CANCELLATION_REQUIRED: 'Cancel the outstanding action permission before requesting another code.',
});
const failure = (code) => Object.assign(new Error(MESSAGES[code]), { code });
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const safeFailure = (error) => { const safe = failure(Object.hasOwn(MESSAGES, error?.code) ? error.code : 'REQUEST_FAILED'); if (Number.isInteger(error?.retryAfterSeconds) && error.retryAfterSeconds >= 60 && error.retryAfterSeconds <= 3600) safe.retryAfterSeconds = error.retryAfterSeconds; return safe; };
function config(options) {
  try {
    const site = new URL(options.origin);
    if (site.protocol !== 'https:' || site.origin !== options.origin || site.username || site.password || !site.hostname.includes('.') || site.hostname.includes('*')
      || typeof options.fetchImpl !== 'function' || typeof options.getAccessToken !== 'function') throw new Error();
    return site.origin;
  } catch { throw failure('CONFIGURATION_REQUIRED'); }
}
function beginPayload(value = {}) {
  if (!object(value) || Object.keys(value).some((key) => !['scope', 'action', 'targetId', 'expectedVersion', 'payload'].includes(key))) throw failure('INVALID_REQUEST');
  const scope = value.scope ?? 'admission';
  if (scope === 'admission') {
    if (['action', 'targetId', 'expectedVersion', 'payload'].some((key) => value[key] != null)) throw failure('INVALID_REQUEST');
    return { scope: 'admission' };
  }
  if (scope !== 'action' || !['admin_edit_post', 'moderate_post', 'set_account_state'].includes(value.action)
    || !UUID.test(value.targetId || '') || !Number.isInteger(value.expectedVersion) || value.expectedVersion < 1 || value.expectedVersion > 2_147_483_647
    || !object(value.payload) || JSON.stringify(value.payload).length > 30_000) throw failure('INVALID_REQUEST');
  const keys = value.action === 'admin_edit_post' ? ['title', 'body', 'reason'] : value.action === 'moderate_post' ? ['action', 'reason'] : ['state', 'reason'];
  if (Object.keys(value.payload).length !== keys.length || keys.some((key) => typeof value.payload[key] !== 'string')) throw failure('INVALID_REQUEST');
  return { scope, action: value.action, target_id: value.targetId, expected_version: value.expectedVersion, payload: structuredClone(value.payload) };
}

export function createEmailStepupClient(options = {}) {
  const now = options.now ?? Date.now;
  const timeoutMs = options.timeoutMs ?? 25_000;
  let origin, active = null, activeAbort = null, cancelling = null, generation = 0, disposed = false;
  let challenge = null, cancelTarget = null, cancellationUnconfirmed = false, suspended = false, resendAt = 0, attempts = 0;
  let state = { status: options.enabled === true ? 'idle' : 'disabled', busy: false, scope: null, expiresAt: null, resendAt: 0,
    attemptsRemaining: 5, admitted: false, idleExpiresAt: null, absoluteExpiresAt: null, cancellationStatus: 'none', notice: null, error: null };
  const listeners = new Set();
  const snapshot = () => ({ ...structuredClone(state), actionExpiresAt: cancelTarget?.grantExpiresAt ?? null, actionReady: !!cancelTarget?.verifiedAction && !cancelTarget.executing && !cancelTarget.executed && !suspended && !cancellationUnconfirmed && !active && !disposed && now() < cancelTarget.grantExpiresAt });
  function publish(patch) { state = { ...state, ...patch }; for (const listener of listeners) { try { listener(snapshot()); } catch { /* UI cannot alter the operation. */ } } }
  function assertOpen() { if (options.enabled !== true) throw failure('DISABLED'); if (disposed) throw failure('CANCELLED'); }
  function fence(id) { if (disposed || id !== generation) throw failure('CANCELLED'); }
  function pending() {
    if (!challenge) throw failure('INVALID_REQUEST');
    if (now() >= challenge.expiresAt) { challenge = null; throw failure('EXPIRED'); }
    if (attempts >= 5) { challenge = null; throw failure('ATTEMPTS_EXHAUSTED'); }
  }
  async function request(route, { body, signal } = {}) {
    const controller = new AbortController(); let timer;
    const cancel = () => controller.abort();
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) controller.abort();
    try {
      return await Promise.race([
        (async () => {
          // The primary token remains a transient request-local value, never
          // copied into state/storage or a second SDK session.
          const token = await options.getAccessToken();
          if (controller.signal.aborted) throw failure('CANCELLED');
          if (!TOKEN.test(token || '')) throw failure('SIGN_IN_REQUIRED');
          const response = await options.fetchImpl(origin + ROUTES[route], {
            method: body === undefined ? 'GET' : 'POST',
            headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
            body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal,
            credentials: 'omit', redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer',
          });
          if (!response.body) throw failure('REQUEST_FAILED');
          const reader = response.body.getReader(); const chunks = []; let size = 0;
          const stopReader = () => { void reader.cancel().catch(() => {}); };
          controller.signal.addEventListener('abort', stopReader, { once: true });
          let decoded;
          try {
            if (controller.signal.aborted) throw failure('CANCELLED');
            while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 65_536) throw failure('REQUEST_FAILED'); chunks.push(value); }
            if (controller.signal.aborted) throw failure('CANCELLED');
            const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
            decoded = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
          } catch (error) { stopReader(); throw safeFailure(error); }
          finally { controller.signal.removeEventListener('abort', stopReader); reader.releaseLock(); }
          if (!response.ok) {
            const byCode = { backend_disabled: 'DISABLED', stepup_disabled: 'DISABLED', email_delivery_failed: 'EMAIL_DELIVERY_FAILED', delivery_failed: 'EMAIL_DELIVERY_FAILED', rate_limited: 'WAIT_TO_RESEND', challenge_rate_limited: 'WAIT_TO_RESEND', unauthorized: 'SIGN_IN_REQUIRED', forbidden: 'FORBIDDEN' };
            const safe = failure(byCode[decoded?.error?.code] ?? (response.status === 401 ? 'SIGN_IN_REQUIRED' : response.status === 403 ? 'FORBIDDEN' : response.status === 429 ? 'WAIT_TO_RESEND' : 'REQUEST_FAILED'));
            const retry = decoded?.error?.retry_after_seconds ?? decoded?.retry_after_seconds ?? Number(response.headers.get('Retry-After'));
            if (safe.code === 'WAIT_TO_RESEND' && Number.isInteger(retry) && retry >= 60 && retry <= 3600) safe.retryAfterSeconds = retry;
            throw safe;
          }
          if (!object(decoded) || !object(decoded.data)) throw failure('REQUEST_FAILED');
          return decoded.data;
        })(),
        new Promise((_, reject) => { timer = setTimeout(() => { reject(failure('REQUEST_FAILED')); controller.abort(); }, timeoutMs); }),
        new Promise((_, reject) => {
          if (controller.signal.aborted) reject(failure('CANCELLED'));
          else controller.signal.addEventListener('abort', () => reject(failure('CANCELLED')), { once: true });
        }),
      ]);
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
  }
  function run(status, work, { stateResult = true } = {}) {
    try {
      assertOpen(); if (active) throw failure('BUSY'); if (cancellationUnconfirmed) throw failure('CANCEL_UNCONFIRMED'); if (suspended && cancelTarget) throw failure('CANCELLATION_REQUIRED'); origin ??= config(options);
      if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) throw failure('CONFIGURATION_REQUIRED');
    } catch (error) { return Promise.reject(safeFailure(error)); }
    const id = generation; const controller = new AbortController(); activeAbort = controller; active = Promise.resolve();
    publish({ status, busy: true, admitted: false, idleExpiresAt: null, absoluteExpiresAt: null, error: null });
    const promise = Promise.resolve().then(() => { fence(id); return work(id, controller.signal); }).catch((error) => {
      const safe = disposed || id !== generation ? failure('CANCELLED') : safeFailure(error);
      if (safe.retryAfterSeconds) resendAt = Math.max(resendAt, now() + safe.retryAfterSeconds * 1000);
      if (!disposed && id === generation) publish({ resendAt, status: challenge && now() < challenge.expiresAt && attempts < 5 ? 'code_requested' : 'restart_required', error: { code: safe.code, message: safe.message } });
      throw safe;
    }).finally(() => { if (active === promise) { active = null; activeAbort = null; } if (!disposed && id === generation) publish({ busy: false }); }).then(result => stateResult ? snapshot() : result);
    active = promise; return promise;
  }
  function begin(value = {}) {
    let body;
    try { assertOpen(); if (cancellationUnconfirmed) throw failure('CANCEL_UNCONFIRMED'); if (cancelTarget?.needsResolution) throw failure('CANCELLATION_REQUIRED'); if (now() < resendAt) throw failure('WAIT_TO_RESEND'); body = beginPayload(value); }
    catch (error) { return Promise.reject(safeFailure(error)); }
    return run('requesting_code', async (id, signal) => {
      challenge = null; cancelTarget = null; suspended = false; attempts = 0; resendAt = now() + RESEND_MS;
      publish({ admitted: false, scope: body.scope, expiresAt: null, resendAt, attemptsRemaining: 5, cancellationStatus: 'none', notice: null });
      const data = await request('begin', { body, signal }); fence(id);
      const expiresAt = data.expires_epoch * 1000;
      if (!UUID.test(data.id || '') || data.scope !== body.scope || !Number.isInteger(data.expires_epoch)
        || expiresAt <= now() || expiresAt - now() > MAX_CHALLENGE_MS + 5_000) throw failure('REQUEST_FAILED');
      challenge = { id: data.id, scope: data.scope, expiresAt: Math.min(expiresAt, now() + MAX_CHALLENGE_MS) };
      cancelTarget = { id: challenge.id, scope: challenge.scope, needsResolution: false };
      publish({ status: 'code_requested', scope: challenge.scope, expiresAt: challenge.expiresAt, resendAt });
      return snapshot();
    });
  }
  function verify(code) {
    return run('verifying', async (id, signal) => {
      try {
        pending(); if (typeof code !== 'string' || !/^\d{6}$/.test(code)) throw failure('CODE_INVALID');
        const expected = { ...challenge }; cancelTarget.needsResolution = true; attempts += 1; publish({ attemptsRemaining: 5 - attempts });
        const body = { challenge_id: expected.id, code };
        code = ''; // No code in controller state; caller must clear its input too.
        const data = await request('verify', { body, signal }); fence(id);
        if (now() >= expected.expiresAt) { challenge = null; throw failure('EXPIRED'); }
        if (data.verified !== true) {
          if (data.verified !== false || !Number.isInteger(data.attempts_remaining) || data.attempts_remaining < 0 || data.attempts_remaining > 5) throw failure('REQUEST_FAILED');
          if (!['challenge_unavailable', 'challenge_expired', 'challenge_not_active', 'attempts_exhausted', 'invalid_code', 'admission_expired'].includes(data.error)) throw failure('REQUEST_FAILED');
          cancelTarget.needsResolution = false;
          attempts = Math.max(attempts, 5 - data.attempts_remaining);
          publish({ attemptsRemaining: 5 - attempts });
          if (attempts >= 5 || data.error === 'attempts_exhausted') { challenge = null; throw failure('ATTEMPTS_EXHAUSTED'); }
          if (data.error === 'challenge_expired') { challenge = null; throw failure('EXPIRED'); }
          if (['challenge_unavailable', 'challenge_not_active', 'admission_expired'].includes(data.error)) { challenge = null; throw failure('VERIFICATION_DENIED'); }
          if (data.error !== 'invalid_code') { challenge = null; throw failure('REQUEST_FAILED'); }
          throw failure('CODE_INVALID');
        }
        if (data.id !== expected.id || data.scope !== expected.scope
          || !Number.isInteger(data.expires_epoch) || data.expires_epoch * 1000 <= now()
          || data.expires_epoch * 1000 - now() > (expected.scope === 'admission' ? 3_600_000 : 120_000) + 5_000) { challenge = null; throw failure('REQUEST_FAILED'); }
        // Never replay a verified code, but retain the exact ID for cancellation.
        // An action permission must be resolved before another begin can replace it.
        cancelTarget.needsResolution = expected.scope === 'action';
        cancelTarget.verifiedAction = expected.scope === 'action';
        cancelTarget.grantExpiresAt = expected.scope === 'action' ? data.expires_epoch * 1000 : null;
        challenge = null;
        publish({ status: 'verified', expiresAt: null, admitted: expected.scope === 'admission', scope: expected.scope });
        return snapshot();
      } catch (error) { if (id === generation && error?.code !== 'CODE_INVALID') challenge = null; throw error; }
      finally { code = ''; }
    });
  }
  function status() {
    return run('checking_status', async (id, signal) => {
      const data = await request('status', { signal }); fence(id);
      if (typeof data.enabled !== 'boolean' || typeof data.admitted !== 'boolean') throw failure('REQUEST_FAILED');
      const epoch = (value) => value == null ? null : Number.isInteger(value) && value > 0 ? value * 1000 : null;
      const idle = epoch(data.idle_expires_epoch), absolute = epoch(data.absolute_expires_epoch);
      if (data.admitted && (!data.enabled || !idle || !absolute || idle <= now() || absolute <= now() || idle > absolute
        || idle - now() > 900_000 + 5_000 || absolute - now() > 3_600_000 + 5_000)) throw failure('REQUEST_FAILED');
      publish({ status: !data.enabled ? 'disabled' : challenge ? 'code_requested' : data.admitted ? 'admitted' : 'idle', admitted: data.enabled && data.admitted,
        idleExpiresAt: epoch(data.idle_expires_epoch), absoluteExpiresAt: epoch(data.absolute_expires_epoch) });
      return snapshot();
    });
  }
  function consumeAction(execute) {
    return run('executing_action', async (id, signal) => {
      const target = cancelTarget;
      if (typeof execute !== 'function' || !target?.verifiedAction || target.executing || target.executed || suspended
        || !Number.isFinite(target.grantExpiresAt) || now() >= target.grantExpiresAt) throw failure('ACTION_NOT_READY');
      // The calling UI supplies its frozen request. No challenge/token is exposed
      // here: the database matches the original session and full action binding.
      target.executing = true;
      let timer, abort;
      try {
        const result = await Promise.race([
          Promise.resolve().then(() => { fence(id); return execute(signal); }),
          new Promise((_, reject) => { timer = setTimeout(() => { reject(failure('ACTION_UNCONFIRMED')); if (id === generation) activeAbort?.abort(); }, timeoutMs); }),
          new Promise((_, reject) => { abort = () => reject(failure('CANCELLED')); if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true }); }),
        ]); fence(id);
        target.executed = true; target.verifiedAction = false; target.needsResolution = false;
        publish({ status: 'action_completed', expiresAt: null, error: null });
        return result;
      } catch (error) {
        if (id !== generation || disposed) throw failure('CANCELLED');
        target.verifiedAction = false; target.needsResolution = true;
        // Never retry an uncertain mutation with the old permission. Preserve
        // its ID so explicit cancellation can revoke any unconsumed grant.
        throw error;
      } finally { clearTimeout(timer); if (abort) signal.removeEventListener('abort', abort); target.executing = false; }
    }, { stateResult: false });
  }
  function suspend() {
    if (disposed) return snapshot();
    generation += 1; challenge = null; suspended = !!cancelTarget;
    if (cancelTarget) { cancelTarget.verifiedAction = false; cancelTarget.needsResolution = true; }
    activeAbort?.abort(); if (active) void active.catch(() => {});
    active = null; activeAbort = null;
    publish({ status: 'suspended', busy: false, admitted: false, idleExpiresAt: null, absoluteExpiresAt: null, expiresAt: null,
      notice: cancelTarget ? 'Verification was interrupted. Reconcile or cancel this permission before continuing.' : null, error: null });
    return snapshot();
  }
  function cancel() {
    if (cancelling) return cancelling;
    try { assertOpen(); } catch (error) { return Promise.reject(safeFailure(error)); }
    // Snapshot the exact known ID before fencing verify. Never guess the latest
    // server challenge or substitute another session's/grant's identifier.
    const target = cancelTarget;
    generation += 1; const id = generation; challenge = null;
    activeAbort?.abort();
    if (active) void active.catch(() => {});
    active = null; activeAbort = null;
    if (!target) {
      // A stopped begin may already have sent mail. Without its response ID no
      // verify request was possible, so there is no grant to claim revoked.
      const terminal = ['confirmed', 'already_used'].includes(state.cancellationStatus);
      publish({ status: terminal ? (state.cancellationStatus === 'confirmed' ? 'cancelled' : 'already_used') : 'stopped', busy: false, admitted: false,
        idleExpiresAt: null, absoluteExpiresAt: null, expiresAt: null,
        cancellationStatus: terminal ? state.cancellationStatus : 'local_only',
        notice: terminal ? state.notice : 'Request stopped; an email may still arrive. No server cancellation was confirmed.', error: null });
      return Promise.resolve(snapshot());
    }
    const controller = new AbortController(); activeAbort = controller;
    // Reserve single-flight before notifications; reentrant clicks get this same
    // operation rather than a second revocation request.
    let resolveCancel, rejectCancel;
    const promise = new Promise((resolve, reject) => { resolveCancel = resolve; rejectCancel = reject; });
    cancelling = promise; active = promise; cancellationUnconfirmed = true;
    publish({ status: 'cancelling', busy: true, admitted: false, idleExpiresAt: null, absoluteExpiresAt: null,
      expiresAt: null, cancellationStatus: 'pending', notice: null, error: null });
    void Promise.resolve().then(async () => {
      fence(id); origin ??= config(options);
      if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) throw failure('CONFIGURATION_REQUIRED');
      const data = await request('cancel', { body: { challenge_id: target.id }, signal: controller.signal }); fence(id);
      const revoked = data.cancelled === true && data.already_used === false && data.error === undefined;
      const used = data.cancelled === false && data.already_used === true && data.error === undefined;
      if (!revoked && !used) throw failure('CANCEL_UNCONFIRMED');
      cancelTarget = null; cancellationUnconfirmed = false; suspended = false;
      publish({ status: revoked ? 'cancelled' : 'already_used', cancellationStatus: revoked ? 'confirmed' : 'already_used',
        notice: revoked ? 'This challenge and any unused action permission were cancelled.'
          : 'This permission was already used. Cancellation did not undo a completed action or revoke administrator admission.', error: null });
    }).catch((error) => {
      if (disposed || id !== generation) throw failure('CANCELLED');
      const safe = failure('CANCEL_UNCONFIRMED');
      publish({ status: 'cancellation_unconfirmed', cancellationStatus: 'unconfirmed', notice: null,
        error: { code: safe.code, message: safe.message } });
      throw safe;
    }).finally(() => {
      if (active === promise) { active = null; activeAbort = null; }
      if (cancelling === promise) cancelling = null;
      if (!disposed && id === generation) publish({ busy: false });
    }).then(() => resolveCancel(snapshot()), rejectCancel);
    return promise;
  }
  async function dispose() {
    if (disposed) return;
    // Disposal is local teardown, never an implicit server mutation. Call and
    // await explicit cancel first when the user requests server revocation.
    disposed = true; generation += 1; challenge = null; cancelTarget = null;
    activeAbort?.abort(); const prior = active; listeners.clear();
    await Promise.resolve(prior).catch(() => {});
    state = { ...state, status: 'disposed', busy: false, admitted: false, idleExpiresAt: null, absoluteExpiresAt: null, expiresAt: null };
  }
  return Object.freeze({ begin, verify, status, consumeAction, suspend, cancel, dispose, getState: snapshot,
    subscribe(listener) { if (typeof listener !== 'function') throw failure('INVALID_REQUEST'); listeners.add(listener); listener(snapshot()); return () => listeners.delete(listener); } });
}
