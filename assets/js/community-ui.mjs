import { communityIntent } from './community-intents.mjs';

/** Connected test UI. Server RBAC and Auth are authoritative; browser state never grants a role. */
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const LIMIT = 25;
const ERROR_TEXT = Object.freeze({
  GOOGLE_DISABLED: 'Google sign-in is not available yet. Use email and password to sign in.',
  INVALID_CONFIG: 'Real sign-in is not configured. Please try again after setup is complete.',
  INVALID_INPUT: 'Check the required fields and try again.', AUTH_BUSY: 'Please wait for the current account step to finish.',
  AUTH_FAILED: 'Sign-in could not be completed. Check your details and try again.',
  EMAIL_VERIFICATION_REQUIRED: 'Verify your email, then sign in. Open the verification link in the same tab where you registered.',
  SESSION_EXPIRED: 'Your session has expired. Sign in again.', SIGN_IN_REQUIRED: 'Sign in with a verified account to continue.',
  STORAGE_UNAVAILABLE: 'Allow browser tab storage before starting sign-in.',
  CALLBACK_INVALID: 'This link could not be verified in this tab. Open it in the tab where you requested it, or start again with a fresh link.',
  RECOVERY_REQUIRED: 'Request a fresh password reset link and open it in this same tab.',
  MFA_PENDING: 'An unfinished authenticator setup already exists. Continue with the authenticator you added during setup. If you did not save the setup key, contact account support before starting again.',
  MFA_REQUIRED: 'Complete authenticator verification to continue.', MFA_CODE_INVALID: 'That code could not be verified. Start a new verification and try again.',
  SIGN_OUT_UNCONFIRMED: 'Local sign-in has been cleared, but server sign-out could not be confirmed. Reconnect and sign out again on shared devices.',
  RATE_LIMITED: 'Please wait before trying again.', rate_limited: 'Please wait before trying again.',
  unauthorized: 'Your session is no longer valid. Sign in again.', forbidden: 'The server did not allow this action. Your account, role or authenticator verification may have changed.',
  version_conflict: 'This item changed on the server. Your draft has not been saved. Close this window, refresh, and review the newest version before trying again.',
  not_found: 'This content is no longer available.', backend_disabled: 'The community backend is disabled. No content has been saved.',
  EMAIL_STEPUP_UNAVAILABLE: 'Email administrator verification is not available for this session.',
  DISABLED: 'Email administrator verification is not enabled.', CONFIGURATION_REQUIRED: 'Email verification is not configured.',
  FORBIDDEN: 'Administrator verification is not available to this session.', BUSY: 'A verification request is already in progress.',
  WAIT_TO_RESEND: 'Wait before requesting another code.', INVALID_REQUEST: 'The verification request is invalid.',
  CODE_INVALID: 'That verification code could not be accepted.', EXPIRED: 'This verification request expired. Cancel it and request a new code.',
  ATTEMPTS_EXHAUSTED: 'Too many attempts. Cancel this request and wait before requesting another code.',
  VERIFICATION_DENIED: 'Administrator verification was not accepted.', EMAIL_DELIVERY_FAILED: 'The email could not be sent. Wait before requesting another code.',
  REQUEST_FAILED: 'Verification could not be completed. Check its status before trying again.',
  REQUEST_TIMEOUT: 'The request timed out. Check the server state before trying again.',
  ACTION_NOT_READY: 'This action permission is unavailable or expired. Cancel it before reviewing a new request.',
  ACTION_UNCONFIRMED: 'The change could not be confirmed. Check the server state before making a new request.',
  CANCEL_UNCONFIRMED: 'Cancellation was not confirmed. This action is blocked. Retry cancellation explicitly.',
  CANCELLATION_REQUIRED: 'Cancel the outstanding action permission before requesting another code.',
  BACKEND_DISABLED: 'The community backend is disabled. No content has been saved.', INVALID_RESPONSE: 'The server returned an invalid response. Please reload.',
});
export const safeUiError = error => ERROR_TEXT[error?.code] || 'The request could not be completed. Please try again.';
const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
const validPost = value => isObject(value) && UUID.test(value.id || '') && ['topic', 'reply', 'message'].includes(value.kind) && typeof value.body === 'string';
const rows = result => { if (!Array.isArray(result?.data)) throw Object.assign(new Error(), { code: 'INVALID_RESPONSE' }); return result.data; };
const query = values => new URLSearchParams(values).toString().replaceAll('+', '%20').replaceAll('.', '%2E').replaceAll('*', '%2A');
const memberName = id => UUID.test(id || '') ? `Member ${id.slice(0, 8)}` : 'Community member';
const dateLabel = value => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '';

export function setupCommunityUI({ document: doc, window: win, auth, api, config, stepup: initialStepup, createStepup, callbackUrl = win.location.href }) {
  const $ = id => doc.getElementById(id);
  const all = selector => [...doc.querySelectorAll(selector)];
  const root = $('rc-root');
  if (!root || config.enabled !== true) return null;
  const mode = root.dataset.communityMode;
  const callbackPage = ['callback', 'recovery'].includes(mode);
  const pending = new WeakSet();
  const controllers = new Set();
  let state = auth.getState(), disposed = false, initialized = false, authView = 'signin';
  let confirmedAdmin = state.admin, uiGeneration = 0, authBlocked = false;
  let topics = [], messages = [], topicOffset = 0, messageOffset = 0, topicSeq = 0, messageSeq = 0;
  let currentTopic = null, replies = [], replyOffset = 0, threadSeq = 0;
  let adminView = 'topic', adminData = [], adminOffset = 0, adminSeq = 0, adminAllowed = false, adminInitialLoadDone = false, editing = null;
  let historyId = null, historyOffset = 0, historySeq = 0;
  let mfaChallenge = null, mfaSequence = 0, signingOut = false, pageSuspended = false;
  let stepup = initialStepup, stepupUnsubscribe = null, emailState = stepup?.getState() || {};
  let emailFlow = null, emailSequence = 0, emailCancellation = null, emailMessage = '';
  let emailLocalStopped = false, emailConfirmPending = false, admissionExpiredLocally = false;
  const timers = [];

  function node(tag, text, className) {
    const element = doc.createElement(tag);
    if (text !== undefined) element.textContent = String(text ?? '');
    if (className) element.className = className;
    return element;
  }
  function button(text, action, className = 'outline') {
    const element = node('button', text, className); element.type = 'button'; element.addEventListener('click', action); return element;
  }
  const setText = (id, text) => { const element = $(id); if (element) element.textContent = text; };
  function notice(text, id = 'rc-status') { const element = $(id); if (element) { element.textContent = text; element.hidden = !text; } }
  function open(dialog) { if (dialog && !dialog.open) dialog.showModal(); }
  function close(dialog) { if (dialog?.open) dialog.close(); }
  const signedIn = () => !disposed && !!state.user && state.status !== 'recovery_ready' && !state.recovery && !signingOut;
  const canPost = () => signedIn() && !state.busy && !authBlocked && !pageSuspended;
  const emailMode = () => config.emailStepupEnabled === true && state.admin.method === 'email';
  const emailEligible = () => emailMode() && signedIn() && !authBlocked && !pageSuspended && (state.admin.canRequestEmailStepup === true || state.admin.canModerate === true);
  const emailAvailable = () => emailEligible() && !!stepup;
  const emailAdmissionCurrent = (admin = state.admin) => config.emailStepupEnabled !== true || admin.method !== 'email'
    || Number.isFinite(admin.idleExpiresAt) && Number.isFinite(admin.absoluteExpiresAt) && Date.now() < admin.idleExpiresAt && Date.now() < admin.absoluteExpiresAt;
  const canAdmin = () => canPost() && state.admin.canModerate === true && emailAdmissionCurrent();
  function fieldset(id, enabled) { const form = $(id); const field = form?.querySelector('fieldset'); if (field) field.disabled = !enabled || pending.has(form); }
  function resetPasswords() { all('input[type="password"], #rc-mfa-code, #rc-email-stepup-code').forEach(element => { element.value = ''; }); }
  function clearMfa() { mfaSequence++; mfaChallenge = null; setText('rc-mfa-secret', ''); if ($('rc-mfa-code')) $('rc-mfa-code').value = ''; if ($('rc-mfa-enrollment')) $('rc-mfa-enrollment').hidden = true; if ($('rc-mfa-form')) $('rc-mfa-form').hidden = true; }
  function invalidatePrivateViews() {
    uiGeneration++; adminSeq++; historySeq++; editing = null; historyId = null; adminData = [];
    if (emailFlow?.scope === 'action') { emailFlow.invalidated = true; emailFlow.verified = false; clearEmailCode(); setText('rc-email-stepup-summary', ''); }
    $('rc-admin-list')?.replaceChildren(); $('rc-history-list')?.replaceChildren();
    close($('rc-admin-editor')); close($('rc-history'));
    $('rc-admin-edit-form')?.reset();
    setText('rc-admin-count', '');
    if ($('rc-admin-search')) $('rc-admin-search').value = '';
    notice('', 'rc-admin-edit-result');
  }
  function abortRequests() { for (const controller of controllers) controller.abort(); controllers.clear(); topicSeq++; messageSeq++; threadSeq++; adminSeq++; historySeq++; }
  async function request(path, options = {}) {
    const controller = new AbortController(); controllers.add(controller);
    const generation = uiGeneration; let timeout, rejectAbort;
    const abort = () => controller.abort();
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) controller.abort();
    try {
      if (controller.signal.aborted) throw Object.assign(new Error(), { code: 'CANCELLED' });
      const result = await Promise.race([
        api.request(path, { ...options, signal: controller.signal }),
        new Promise((_, reject) => {
          rejectAbort = () => reject(Object.assign(new Error(), { code: 'CANCELLED' }));
          if (controller.signal.aborted) rejectAbort(); else controller.signal.addEventListener('abort', rejectAbort, { once: true });
          timeout = setTimeout(() => { reject(Object.assign(new Error(), { code: 'REQUEST_TIMEOUT' })); controller.abort(); }, 25_000);
        }),
      ]);
      if (disposed || controller.signal.aborted || (options.method && options.method !== 'GET' && generation !== uiGeneration)) throw Object.assign(new Error(), { code: 'CANCELLED' });
      return result;
    }
    finally { clearTimeout(timeout); if (rejectAbort) controller.signal.removeEventListener('abort', rejectAbort); options.signal?.removeEventListener('abort', abort); controllers.delete(controller); }
  }
  async function action(target, work, errorId = 'rc-status') {
    if (disposed || pending.has(target)) return;
    const generation = uiGeneration;
    pending.add(target);
    if ('disabled' in target) target.disabled = true;
    target.setAttribute('aria-busy', 'true'); renderControls();
    try { await work(); }
    catch (error) {
      if (!disposed && generation === uiGeneration && error?.name !== 'AbortError' && error?.code !== 'CANCELLED') {
        notice(safeUiError(error), errorId);
        if (['unauthorized', 'SESSION_EXPIRED', 'forbidden'].includes(error?.code)) {
          invalidatePrivateViews(); notice(safeUiError(error));
          if (!state.busy) void auth.refresh().catch(() => {});
        }
      }
    } finally {
      pending.delete(target); target.removeAttribute('aria-busy');
      if ('disabled' in target) target.disabled = false;
      renderControls();
    }
  }
  function form(id, work, errorId) {
    const element = $(id);
    element?.addEventListener('submit', event => { event.preventDefault(); if (!element.reportValidity()) return; const data = new win.FormData(element); void action(element, () => work(data), errorId); });
  }
  function renderControls() {
    fieldset('rc-auth-form', initialized && !authBlocked && !state.busy && !state.user && !signingOut);
    for (const id of ['rc-topic-form', 'rc-board-form']) fieldset(id, canPost());
    fieldset('rc-reply-form', canPost() && !!currentTopic && !currentTopic.locked);
    fieldset('rc-admin-edit-form', canAdmin() && !!editing && !emailFlow);
    fieldset('rc-mfa-form', !!state.user && !state.busy && !!mfaChallenge);
    fieldset('rc-recovery-form', state.status === 'recovery_ready' && !state.busy && !state.mfa.required);
    for (const element of all('[data-signout]')) element.disabled = signingOut;
    for (const element of all('[data-auth-open], [data-auth-view]')) element.disabled = !initialized || authBlocked || state.busy;
    if ($('rc-new-topic')) $('rc-new-topic').disabled = !initialized || authBlocked || state.busy;
    if ($('rc-google')) $('rc-google').disabled = authBlocked || !config.googleEnabled || state.busy || !!state.user || authView === 'reset';
    for (const id of ['rc-mfa-enroll', 'rc-mfa-challenge', 'rc-admin-recheck', 'rc-admin-verify']) if ($(id)) $(id).disabled = !state.user || state.busy || pending.has($(id));
    if ($('rc-reply-form')) $('rc-reply-form').hidden = !signedIn() || !currentTopic || !!currentTopic.locked;
    if ($('rc-thread-notice')) setText('rc-thread-notice', currentTopic?.locked ? 'This discussion is locked. New replies are closed.' : signedIn() ? '' : 'Sign in with a verified account to reply.');
    renderEmailControls();
    if ($('rc-recovery-form')) $('rc-recovery-form').hidden = state.status !== 'recovery_ready';
    if ($('rc-recovery-mfa')) $('rc-recovery-mfa').hidden = state.status !== 'recovery_ready' || !state.mfa.required;
  }
  function renderSession(next) {
    const previousUser = state.user?.id;
    const previousGeneration = state.sessionGeneration;
    const sessionChanged = previousUser !== next.user?.id || previousGeneration !== next.sessionGeneration
      || !!state.recovery !== !!next.recovery || (state.status === 'recovery_ready') !== (next.status === 'recovery_ready');
    state = next;
    if (sessionChanged) { admissionExpiredLocally = false; adminAllowed = false; adminInitialLoadDone = false; resetEmailSession(); }
    if (!state.busy) {
      const lostCapability = confirmedAdmin.canManageUsers && !state.admin.canManageUsers || confirmedAdmin.canReadAudit && !state.admin.canReadAudit;
      if (lostCapability || confirmedAdmin.canModerate && !state.admin.canModerate) invalidatePrivateViews();
      confirmedAdmin = state.admin;
    }
    const member = signedIn();
    all('[data-account-guest]').forEach(element => { element.hidden = member || !!state.recovery; });
    all('[data-account-member]').forEach(element => { element.hidden = !member; });
    all('[data-account-name]').forEach(element => { element.textContent = member ? state.user.email : ''; });
    all('[data-account-avatar]').forEach(element => { element.textContent = member ? state.user.email.slice(0, 2).toUpperCase() : ''; });
    all('[data-admin-link]').forEach(element => { element.hidden = !(state.admin.canModerate || emailEligible()) || !member; });
    setText('rc-mfa-description', emailMode() ? 'Use your authenticator for supported account security steps. Community management uses separate email verification for this session.' : 'Management access requires a verified account, an assigned server role, and a current authenticator code.');
    const label = member ? (state.busy ? 'Checking session…' : 'Verified account · signed in in this tab') : state.recovery ? 'Password recovery only · posting unavailable' : initialized ? 'Visitor · sign in to contribute' : 'Checking session…';
    all('[data-session-label]').forEach(element => { element.textContent = label; });
    if (sessionChanged && (previousUser || previousGeneration !== undefined)) {
      abortRequests(); invalidatePrivateViews(); resetPasswords(); clearMfa(); close($('rc-profile')); close($('rc-mfa')); close($('rc-composer')); close($('rc-thread'));
    }
    if (!state.busy && member) close($('rc-auth'));
    if (mode === 'admin') {
      const allowed = canAdmin();
      const useEmail = emailEligible();
      if ($('rc-admin-email')) $('rc-admin-email').hidden = !useEmail;
      if ($('rc-admin-verify')) $('rc-admin-verify').hidden = !member || useEmail;
      setText('rc-admin-gate-description', useEmail ? 'Request a one-time code for the verified account on this server. Each management change requires a separate code and your final confirmation.' : 'Sign in with your verified account, then complete authenticator verification. Management roles are assigned separately on the server.');
      $('rc-admin-tools').hidden = !allowed; $('rc-admin-gate').hidden = allowed;
      all('[data-admin-view="users"]').forEach(element => { element.hidden = !state.admin.canManageUsers; });
      all('[data-admin-view="audit"]').forEach(element => { element.hidden = !state.admin.canReadAudit; });
      if (allowed) {
        setText('rc-admin-role', state.admin.role === 'owner' ? 'Owner · verified server access' : 'Moderator · verified server access');
        if (adminView === 'users' && !state.admin.canManageUsers || adminView === 'audit' && !state.admin.canReadAudit) adminView = 'topic';
        if (!adminAllowed && adminInitialLoadDone) notice('Management access is verified. Use Refresh to reload the current records.');
        adminAllowed = true;
        if (!adminInitialLoadDone) { adminInitialLoadDone = true; void loadAdmin(); }
      } else {
        if (!state.busy) adminAllowed = false;
        if (!state.busy && (!state.user || !state.admin.canModerate || !emailAdmissionCurrent() || state.error)) invalidatePrivateViews();
        if (!state.busy) notice(state.admin.status === 'denied' ? 'This account does not have management access. Roles must be assigned by an authorized owner.' : state.admin.status === 'unavailable' ? 'Management access could not be checked. Recheck when the server is available.' : member ? useEmail ? 'Request an email code to verify management access.' : 'Complete authenticator verification to check management access.' : 'Sign in with your verified account to request management access.');
      }
    }
    renderControls();
  }

  function enforceEmailDeadline() {
    if (disposed || pageSuspended) return;
    // During a token refresh the public snapshot is deliberately unchecked;
    // retain the last server-confirmed deadline rather than extending it.
    const admin = state.busy ? confirmedAdmin : state.admin;
    const expired = config.emailStepupEnabled === true && admin.method === 'email' && admin.canModerate === true && !emailAdmissionCurrent(admin);
    if (!expired) { admissionExpiredLocally = false; return; }
    if (!admissionExpiredLocally) {
      admissionExpiredLocally = true; abortRequests(); invalidatePrivateViews(); adminAllowed = false;
      if ($('rc-admin-tools')) $('rc-admin-tools').hidden = true;
      if ($('rc-admin-gate')) $('rc-admin-gate').hidden = false;
      notice('Management access has expired. Request a new email verification before continuing.');
    }
  }

  // Email verification never grants UI access by itself: only a fresh Auth
  // management response can do that. The adapter holds challenge IDs privately.
  function clearEmailCode() { if ($('rc-email-stepup-code')) $('rc-email-stepup-code').value = ''; }
  function bindStepup() {
    stepupUnsubscribe?.(); stepupUnsubscribe = null;
    emailState = stepup?.getState() || {};
    if (stepup) stepupUnsubscribe = stepup.subscribe(next => { emailState = next; renderEmailControls(); });
  }
  function clearEmailFlow() {
    emailSequence++; emailFlow = null; emailMessage = ''; emailLocalStopped = false; emailConfirmPending = false;
    clearEmailCode(); setText('rc-email-stepup-summary', ''); close($('rc-email-stepup')); renderControls();
  }
  function resetEmailSession(recreate = true) {
    emailSequence++; emailFlow = null; emailCancellation = null; emailMessage = ''; emailLocalStopped = false; emailConfirmPending = false;
    clearEmailCode(); setText('rc-email-stepup-summary', ''); close($('rc-email-stepup'));
    stepupUnsubscribe?.(); stepupUnsubscribe = null;
    const previous = stepup; stepup = null; emailState = {};
    if (previous) void previous.dispose();
    if (recreate && config.emailStepupEnabled === true && typeof createStepup === 'function') stepup = createStepup();
    bindStepup();
  }
  function emailCurrent(flow) {
    return signedIn() && emailFlow === flow && flow.sequence === emailSequence && flow.sessionGeneration === state.sessionGeneration
      && flow.userId === state.user?.id && !signingOut && !pageSuspended && !flow.invalidated;
  }
  function renderEmailControls() {
    const dialog = $('rc-email-stepup'); if (!dialog) return;
    if ($('rc-admin-email')) $('rc-admin-email').disabled = !emailAvailable() || state.busy || !!emailFlow;
    const current = emailFlow && emailCurrent(emailFlow), available = current && emailAvailable() && !state.busy;
    const busy = emailState.busy || !!emailCancellation || emailConfirmPending;
    const verifiedAction = available && emailFlow.scope === 'action' && emailFlow.verified && emailState.actionReady === true
      && Number.isFinite(emailState.actionExpiresAt) && Date.now() < emailState.actionExpiresAt && canAdmin();
    const waiting = Number.isFinite(emailState.resendAt) && emailState.resendAt > Date.now();
    const codeRequested = current && emailState.status === 'code_requested';
    const send = $('rc-email-stepup-send');
    send.hidden = !emailFlow || emailFlow.sent || emailFlow.invalidated || emailLocalStopped;
    send.disabled = !available || busy || waiting;
    fieldset('rc-email-stepup-form', !!available && !busy && codeRequested);
    $('rc-email-stepup-form').hidden = !codeRequested || emailLocalStopped || !!emailFlow?.invalidated;
    $('rc-email-stepup-confirm').hidden = emailFlow?.scope !== 'action' || !emailFlow?.verified || !!emailFlow?.invalidated || emailLocalStopped;
    $('rc-email-stepup-confirm').disabled = !verifiedAction || busy;
    $('rc-email-stepup-check').hidden = emailFlow?.scope !== 'admission' || !emailFlow?.sent || emailLocalStopped || !!emailFlow?.invalidated;
    $('rc-email-stepup-check').disabled = !available || busy;
    $('rc-email-stepup-cancel').disabled = !!emailCancellation;
    setText('rc-email-stepup-cancel', emailLocalStopped ? 'Close stopped request' : emailState.cancellationStatus === 'unconfirmed' ? 'Retry cancellation' : 'Cancel verification');
    let message = emailMessage;
    if (emailState.cancellationStatus === 'unconfirmed') message = ERROR_TEXT.CANCEL_UNCONFIRMED;
    else if (emailState.cancellationStatus === 'pending') message = 'Cancelling this request. Keep this window open until the server responds.';
    else if (emailLocalStopped) message = 'Request stopped locally. An email may still arrive. No server cancellation was confirmed; no change was submitted.';
    else if (emailFlow?.invalidated) message = message || 'This verification was interrupted. The change is blocked. Cancel this request before reviewing a new change.';
    else if (emailState.status === 'requesting_code') message = 'Requesting a code…';
    else if (emailState.status === 'verifying') message = 'Verifying the code…';
    else if (['executing_action', 'consuming_action'].includes(emailState.status) || emailConfirmPending) message = 'Submitting your confirmed change. Do not submit it again.';
    else if (emailState.error) message = safeUiError(emailState.error);
    else if (verifiedAction) message = 'Code verified. Review the exact change above, then confirm to submit it once.';
    else if (emailFlow?.verified && emailFlow.scope === 'action') message = 'This action permission is no longer available. Cancel and review a new request. No automatic retry will run.';
    else if (codeRequested) message = 'Enter the six-digit code sent to the verified address on your account. The code expires in five minutes.';
    else if (!message && waiting) message = 'Wait before requesting another code.';
    notice(message, 'rc-email-stepup-result');
  }
  function openEmailFlow(details) {
    if (!emailAvailable() || state.busy || emailFlow) return;
    clearEmailCode(); emailMessage = ''; emailLocalStopped = false;
    emailFlow = { ...details, begin: details.begin || Object.freeze({ scope: 'admission' }), sequence: ++emailSequence,
      sessionGeneration: state.sessionGeneration, userId: state.user.id, sent: false, verified: false, invalidated: false };
    setText('rc-email-stepup-title', details.scope === 'action' ? 'Verify this exact change' : 'Verify management access');
    setText('rc-email-stepup-description', details.scope === 'action'
      ? 'A code authorizes only the exact action, item, version and content shown below. Verifying it will not submit the change. Your final confirmation is required.'
      : 'Send a one-time code to the verified address held by the server. This verifies access for your current signed-in session.');
    const request = emailFlow.begin;
    setText('rc-email-stepup-summary', details.scope === 'action'
      ? [`Action: ${request.action}`, `Item: ${request.targetId}`, `Expected version: ${request.expectedVersion}`,
        ...Object.entries(request.payload).map(([key, value]) => `${key[0].toUpperCase()}${key.slice(1)}: ${value}`)].join('\n\n') : '');
    $('rc-email-stepup-summary').hidden = details.scope !== 'action';
    renderControls(); open($('rc-email-stepup'));
  }
  async function cancelEmail() {
    if (!emailFlow || emailCancellation) return emailCancellation;
    clearEmailCode();
    if (emailLocalStopped) { clearEmailFlow(); notice('Verification stopped locally. An email may still arrive. No server cancellation was confirmed.'); return; }
    const flow = emailFlow, adapter = stepup;
    flow.invalidated = true; flow.verified = false; emailSequence++; emailMessage = '';
    const task = Promise.resolve().then(() => adapter.cancel()); emailCancellation = task; renderControls();
    try {
      const result = await task;
      if (disposed || emailFlow !== flow || adapter !== stepup) return;
      if (['confirmed', 'already_used'].includes(result.cancellationStatus)) {
        const text = result.cancellationStatus === 'already_used'
          ? 'This permission was already used. Cancellation did not undo any completed change or revoke management admission. Refresh to check the server state.'
          : 'This verification and any unused action permission were cancelled.';
        clearEmailFlow(); notice(text);
      } else if (result.cancellationStatus === 'local_only') { emailLocalStopped = true; renderEmailControls(); }
      else { emailMessage = ERROR_TEXT.CANCEL_UNCONFIRMED; renderEmailControls(); }
    } catch {
      if (!disposed && emailFlow === flow && adapter === stepup) { emailMessage = ERROR_TEXT.CANCEL_UNCONFIRMED; open($('rc-email-stepup')); }
    } finally { if (emailCancellation === task) emailCancellation = null; renderControls(); }
  }
  $('rc-admin-email')?.addEventListener('click', () => openEmailFlow({ scope: 'admission' }));
  $('rc-email-stepup-send')?.addEventListener('click', event => {
    const flow = emailFlow, adapter = stepup;
    if (!flow || !emailCurrent(flow) || !emailAvailable() || state.busy || flow.sent || emailCancellation) return;
    void action(event.currentTarget, async () => {
      emailMessage = ''; clearEmailCode(); flow.sent = true;
      try { await adapter.begin(flow.begin); }
      catch (error) { if (emailCurrent(flow)) { flow.sent = false; throw error; } }
      if (emailCurrent(flow)) { renderEmailControls(); $('rc-email-stepup-code').focus(); }
    }, 'rc-email-stepup-result');
  });
  $('rc-email-stepup-form')?.addEventListener('submit', event => {
    event.preventDefault(); const element = event.currentTarget, flow = emailFlow, adapter = stepup;
    const code = String($('rc-email-stepup-code').value || ''); clearEmailCode();
    if (!flow || !emailCurrent(flow) || !emailAvailable() || state.busy || emailState.status !== 'code_requested' || emailState.busy || !/^\d{6}$/.test(code)) return;
    void action(element, async () => {
      emailMessage = ''; await adapter.verify(code);
      if (!emailCurrent(flow)) return;
      if (flow.scope === 'action') { flow.verified = adapter.getState().actionReady === true; renderEmailControls(); }
      else {
        const sequence = adminSeq; await auth.refresh();
        if (!emailCurrent(flow)) return;
        if (canAdmin() && sequence === adminSeq) await loadAdmin();
        if (!emailCurrent(flow)) return;
        clearEmailFlow(); notice(canAdmin() ? 'Email verified. Management access is available.' : 'The email code was verified, but the server has not granted management access. Recheck access.');
      }
    }, 'rc-email-stepup-result');
  });
  $('rc-email-stepup-confirm')?.addEventListener('click', event => {
    const flow = emailFlow, adapter = stepup;
    if (!flow || !emailCurrent(flow) || flow.scope !== 'action' || !flow.verified || !canAdmin() || !emailAvailable()
      || emailState.actionReady !== true || !Number.isFinite(emailState.actionExpiresAt) || Date.now() >= emailState.actionExpiresAt || emailConfirmPending || emailCancellation) return;
    emailConfirmPending = true; flow.verified = false; clearEmailCode();
    void action(event.currentTarget, async () => {
      try {
        await adapter.consumeAction(signal => request(flow.path, { method: 'POST', body: flow.body, signal }));
        if (!emailCurrent(flow)) return;
        clearEmailFlow(); if (editing === flow.selection) close($('rc-admin-editor'));
        notice('The change was saved and recorded.'); await loadAdmin();
      } catch (error) {
        if (emailCurrent(flow)) { flow.invalidated = true; emailMessage = `${safeUiError(error)} No automatic retry will run. Cancel this verification and refresh to check the server state.`; notice(emailMessage, 'rc-email-stepup-result'); }
      } finally { if (emailFlow === flow) emailConfirmPending = false; renderControls(); }
    }, 'rc-email-stepup-result');
  });
  $('rc-email-stepup-check')?.addEventListener('click', event => {
    const flow = emailFlow, adapter = stepup;
    if (!flow || !emailCurrent(flow) || flow.scope !== 'admission' || !emailAvailable() || state.busy || emailState.busy) return;
    void action(event.currentTarget, async () => {
      await adapter.status(); if (!emailCurrent(flow)) return;
      const sequence = adminSeq; await auth.refresh(); if (!emailCurrent(flow)) return;
      if (canAdmin() && sequence === adminSeq) await loadAdmin();
      if (!emailCurrent(flow)) return;
      if (canAdmin()) { clearEmailFlow(); notice('Management access verified by the server.'); }
      else { emailMessage = 'Management access is not currently verified. Enter your code, or cancel before requesting a new one.'; renderEmailControls(); }
    }, 'rc-email-stepup-result');
  });
  $('rc-email-stepup-cancel')?.addEventListener('click', () => { void cancelEmail(); });
  $('rc-email-stepup')?.addEventListener('cancel', event => { event.preventDefault(); void cancelEmail(); });
  $('rc-email-stepup')?.addEventListener('close', () => { clearEmailCode(); if (emailFlow && !disposed && !pageSuspended) { open($('rc-email-stepup')); void cancelEmail(); } });
  $('rc-admin-editor')?.addEventListener('cancel', event => { if (emailFlow?.scope === 'action') { event.preventDefault(); void cancelEmail(); } });
  bindStepup();

  function authViewSet(view) {
    if (state.busy) return;
    authView = ['signin', 'signup', 'reset'].includes(view) ? view : 'signin';
    $('rc-auth-form').reset(); notice('', 'rc-auth-result');
    setText('rc-auth-title', authView === 'signup' ? 'Join the conversation.' : authView === 'reset' ? 'Reset your password.' : 'Welcome back.');
    setText('rc-auth-description', authView === 'reset' ? 'If your account is eligible, a reset email will be sent. Open the link in this same browser tab.' : authView === 'signup' ? 'Create an account and verify your email before posting.' : 'Sign in to join the conversation.');
    $('rc-password-label').hidden = authView === 'reset'; $('rc-password').required = authView !== 'reset'; $('rc-password').minLength = authView === 'signup' ? 12 : 1;
    $('rc-password').autocomplete = authView === 'signup' ? 'new-password' : 'current-password';
    $('rc-confirm-label').hidden = authView !== 'signup'; $('rc-confirm').required = authView === 'signup';
    $('rc-signup-note').hidden = authView !== 'signup';
    setText('rc-auth-submit', authView === 'signup' ? 'Create account' : authView === 'reset' ? 'Send reset email' : 'Sign in');
    for (const tab of all('[role="tab"][data-auth-view]')) { const active = tab.dataset.authView === authView; tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1; }
    $('rc-auth-form').setAttribute('aria-labelledby', authView === 'signup' ? 'rc-tab-signup' : 'rc-tab-signin');
    renderControls();
  }
  function showAuth(view) { if (authBlocked || state.user || state.busy) return; authViewSet(view); open($('rc-auth')); $('rc-email').focus(); }
  function applyAccountIntent() {
    if (mode !== 'forum' || !initialized || disposed || authBlocked || state.busy || state.recovery) return;
    const intent = communityIntent(win.location.href, config.allowedOrigin);
    if (!intent) return;
    // Consume presentation-only intent without retaining a URL command in
    // history. No credentials, OTP, logout or destination is read from the URL.
    win.history?.replaceState(null, '', '/test/forum-v1/#discussion');
    if (signedIn()) open($('rc-profile'));
    else showAuth(intent === 'signup' ? 'signup' : 'signin');
  }
  all('[data-auth-open]').forEach(element => element.addEventListener('click', () => showAuth(element.dataset.authOpen)));
  all('[data-auth-view]').forEach(element => element.addEventListener('click', () => authViewSet(element.dataset.authView)));
  all('[role="tab"][data-auth-view]').forEach(element => element.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); const view = event.key === 'Home' ? 'signin' : event.key === 'End' ? 'signup' : element.dataset.authView === 'signin' ? 'signup' : 'signin'; authViewSet(view); $(`rc-tab-${view}`).focus();
  }));
  form('rc-auth-form', async data => {
    if (state.user || state.busy) return;
    notice('', 'rc-auth-result'); const email = String(data.get('email') || ''), password = String(data.get('password') || '');
    try {
      if (authView === 'reset') { await auth.requestPasswordReset({ email }); notice('If the account is eligible, a password reset email has been sent. Open it in this same tab. Please wait before requesting another.', 'rc-auth-result'); }
      else if (authView === 'signup') {
        if (password !== data.get('confirm')) { notice('The passwords do not match.', 'rc-auth-result'); return; }
        await auth.signUp({ email, password }); notice('Check your email to verify your account. Open the verification link in this same browser tab, then sign in. If no email arrives, wait before trying again.', 'rc-auth-result');
      } else { await auth.signIn({ email, password }); notice('Signed in. You can now join the conversation.'); }
    } finally { resetPasswords(); }
  }, 'rc-auth-result');
  if (config.googleEnabled) setText('rc-google', 'Continue with Google');
  $('rc-google')?.addEventListener('click', event => {
    if (!config.googleEnabled || state.user || state.busy) return;
    void action(event.currentTarget, async () => { const result = await auth.signInWithGoogle(); win.location.assign(result.url); }, 'rc-auth-result');
  });
  async function signOut() {
    if (signingOut) return;
    signingOut = true; resetEmailSession(false); abortRequests(); invalidatePrivateViews(); resetPasswords(); clearMfa();
    for (const dialog of all('#rc-root dialog')) close(dialog);
    $('rc-topic-form')?.reset(); $('rc-board-form')?.reset(); $('rc-reply-form')?.reset();
    renderControls();
    let resultMessage;
    try { await auth.signOut(); resultMessage = 'Signed out. This tab’s saved session has been cleared.'; }
    catch (error) { resultMessage = safeUiError(error); }
    finally { signingOut = false; renderSession(auth.getState()); notice(resultMessage); }
  }
  all('[data-signout]').forEach(element => element.addEventListener('click', () => { void signOut(); }));
  all('[data-profile-open]').forEach(element => element.addEventListener('click', () => { if (signedIn()) open($('rc-profile')); }));
  all('[data-close]').forEach(element => element.addEventListener('click', () => { const dialog = element.closest('dialog'); if (dialog?.id === 'rc-admin-editor' && emailFlow?.scope === 'action') void cancelEmail(); else close(dialog); }));
  $('rc-auth')?.addEventListener('close', () => { resetPasswords(); if (state.busy && !signingOut) void signOut(); });
  $('rc-composer')?.addEventListener('close', () => { if (!pending.has($('rc-topic-form'))) $('rc-topic-form').reset(); });
  $('rc-thread')?.addEventListener('close', () => { threadSeq++; currentTopic = null; replies = []; $('rc-reply-form').reset(); $('rc-thread-content').replaceChildren(); });
  $('rc-admin-editor')?.addEventListener('close', () => { if (emailFlow?.scope === 'action' && editing && !pageSuspended) { emailFlow.invalidated = true; clearEmailCode(); void cancelEmail(); } editing = null; $('rc-admin-edit-form').reset(); });
  $('rc-history')?.addEventListener('close', () => { historySeq++; historyId = null; $('rc-history-list').replaceChildren(); });
  $('rc-mfa')?.addEventListener('close', clearMfa);

  function showMfa() {
    if (!state.user || state.busy) return;
    clearMfa(); notice('', 'rc-mfa-result');
    $('rc-mfa-factor').replaceChildren();
    for (const [index, factor] of state.mfa.factors.entries()) { const option = node('option', `Authenticator ${index + 1}`); option.value = factor.id; $('rc-mfa-factor').append(option); }
    const pendingFactor = UUID.test(state.mfa.pendingFactorId || '') ? state.mfa.pendingFactorId : null;
    if (pendingFactor) { const option = node('option', 'Unfinished authenticator setup'); option.value = pendingFactor; $('rc-mfa-factor').append(option); }
    const hasFactors = state.mfa.factors.length > 0 || !!pendingFactor;
    setText('rc-mfa-challenge', pendingFactor && !state.mfa.factors.length ? 'Continue unfinished setup' : 'Start verification');
    $('rc-mfa-factor-label').hidden = !hasFactors; $('rc-mfa-challenge').hidden = !hasFactors; $('rc-mfa-enroll').hidden = hasFactors || !!state.recovery;
    if (pendingFactor) notice('An unfinished setup is available. Use the authenticator you added during setup. If you did not save the setup key, this screen cannot safely restart setup; contact account support.', 'rc-mfa-result');
    if (!hasFactors && state.recovery) notice('This recovery session has no available authenticator. Request a new recovery link or contact the site owner through the published contact page.', 'rc-mfa-result');
    close($('rc-profile')); open($('rc-mfa'));
  }
  for (const id of ['rc-mfa-open', 'rc-admin-verify', 'rc-recovery-mfa']) $(id)?.addEventListener('click', showMfa);
  $('rc-mfa-challenge')?.addEventListener('click', event => { const sequence = mfaSequence; void action(event.currentTarget, async () => {
    const result = await auth.challengeMfa($('rc-mfa-factor').value);
    if (sequence !== mfaSequence || !$('rc-mfa').open) return;
    mfaChallenge = result; $('rc-mfa-form').hidden = false; notice('Enter the current code from your authenticator app.', 'rc-mfa-result'); renderControls(); $('rc-mfa-code').focus();
  }, 'rc-mfa-result'); });
  $('rc-mfa-enroll')?.addEventListener('click', event => { const sequence = mfaSequence; void action(event.currentTarget, async () => {
    const enrollment = await auth.enrollMfa();
    if (sequence !== mfaSequence || !$('rc-mfa').open) return;
    setText('rc-mfa-secret', enrollment.secret); $('rc-mfa-enrollment').hidden = false;
    const result = await auth.challengeMfa(enrollment.factorId);
    if (sequence !== mfaSequence || !$('rc-mfa').open) return;
    mfaChallenge = result; $('rc-mfa-form').hidden = false; renderControls();
  }, 'rc-mfa-result'); });
  form('rc-mfa-form', async data => {
    if (!mfaChallenge) return;
    try { await auth.verifyMfa({ ...mfaChallenge, code: String(data.get('code') || '') }); close($('rc-mfa')); notice(state.recovery ? 'Authenticator verified. You can now update your password.' : state.admin.canModerate ? 'Authenticator verified. Management access is available.' : 'Authenticator verified. This account has no assigned management role.'); }
    finally { $('rc-mfa-code').value = ''; }
  }, 'rc-mfa-result');
  $('rc-admin-recheck')?.addEventListener('click', event => { void action(event.currentTarget, async () => { const sequence = adminSeq; await auth.refresh(); if (canAdmin() && sequence === adminSeq) await loadAdmin(); }); });
  form('rc-recovery-form', async data => {
    try {
      const result = await auth.completePasswordReset({ password: String(data.get('password') || ''), confirmPassword: String(data.get('confirmPassword') || '') });
      notice(result.signOutConfirmed ? 'Your password has been updated and you are signed out. Return to the community and sign in with your new password.' : 'Your password has been updated and this tab’s session was cleared. Server sign-out could not be confirmed; reconnect and sign out again.');
      $('rc-recovery-form').hidden = true;
    } finally { resetPasswords(); }
  });

  function postCard(post, { admin = false } = {}) {
    const card = node('article', undefined, 'rc-post');
    const meta = node('p', `${memberName(post.author_id)} · ${dateLabel(post.created_at)}`, 'rc-meta'); card.append(meta);
    const flags = [post.hidden && 'Hidden', post.pinned && 'Pinned', post.locked && 'Locked'].filter(Boolean);
    if (flags.length) card.append(node('p', flags.join(' · '), 'rc-badge'));
    if (post.kind === 'topic') card.append(admin ? node('h3', post.title) : button(post.title, () => { void openThread(post.id); }, 'topic-title'));
    card.append(node('p', admin ? post.body : post.body.slice(0, post.kind === 'topic' ? 320 : 5000), 'rc-post-body'));
    if (admin) {
      card.append(node('p', `${post.kind} · ${post.id} · version ${post.version}`, 'rc-meta'));
      const actions = node('div', undefined, 'rc-actions');
      actions.append(button('Edit', () => editPost(post, 'edit')), button(post.hidden ? 'Restore' : 'Hide', () => editPost(post, post.hidden ? 'restore' : 'hide')));
      if (post.kind === 'topic') actions.append(button(post.pinned ? 'Unpin' : 'Pin', () => editPost(post, post.pinned ? 'unpin' : 'pin')), button(post.locked ? 'Unlock' : 'Lock', () => editPost(post, post.locked ? 'unlock' : 'lock')));
      actions.append(button('History', () => { void showHistory(post.id); })); card.append(actions);
    }
    return card;
  }
  function renderTopics() {
    const container = $('rc-topics'); if (!container) return;
    const term = $('rc-search').value.trim().toLowerCase();
    const filtered = topics.filter(post => `${post.title || ''} ${post.body}`.toLowerCase().includes(term));
    container.replaceChildren(...filtered.map(post => postCard(post)));
    if (!filtered.length) container.append(node('p', term ? 'No matching loaded discussions. Load more or change your search.' : 'No discussions yet. Start the first conversation.', 'empty'));
  }
  async function loadPublic(kind, more = false) {
    const topic = kind === 'topics', container = $(topic ? 'rc-topics' : 'rc-messages'); if (!container) return;
    const sequence = topic ? ++topicSeq : ++messageSeq;
    const offset = more ? (topic ? topicOffset : messageOffset) : 0;
    const moreButton = $(topic ? 'rc-topics-more' : 'rc-messages-more'); moreButton.disabled = true;
    if (!more) container.replaceChildren(node('p', 'Loading…', 'muted'));
    try {
      const result = await request(`/api/community/${kind}?limit=${LIMIT}&offset=${offset}`);
      if (disposed || sequence !== (topic ? topicSeq : messageSeq)) return;
      const data = rows(result); if (data.some(post => !validPost(post) || post.kind !== (topic ? 'topic' : 'message'))) throw Object.assign(new Error(), { code: 'INVALID_RESPONSE' });
      if (topic) { topics = more ? [...topics, ...data.filter(post => !topics.some(old => old.id === post.id))] : data; topicOffset = offset + data.length; renderTopics(); }
      else { messages = more ? [...messages, ...data.filter(post => !messages.some(old => old.id === post.id))] : data; messageOffset = offset + data.length; container.replaceChildren(...messages.map(post => postCard(post))); if (!messages.length) container.append(node('p', 'No messages yet. Say hello.', 'empty')); }
      moreButton.hidden = data.length < LIMIT || offset + LIMIT > 10000;
      if (!state.error && !authBlocked && mode === 'forum') notice('');
    } catch (error) {
      if (sequence !== (topic ? topicSeq : messageSeq) || disposed || error?.name === 'AbortError') return;
      if (!more) { container.replaceChildren(node('p', safeUiError(error), 'rc-load-error'), button('Try again', () => { void loadPublic(kind); })); }
      else notice(safeUiError(error));
    } finally { if (sequence === (topic ? topicSeq : messageSeq)) moreButton.disabled = false; }
  }
  function syncPanel(panel) {
    const board = panel ? panel === 'board' : win.location.hash === '#message-board';
    if (!$('rc-forum-panel')) return;
    $('rc-forum-panel').hidden = board; $('rc-board-panel').hidden = !board;
    root.querySelectorAll('[data-community-section]').forEach(element => {
      if (element.dataset.communitySection === (board ? 'board' : 'forum')) element.setAttribute('aria-current', 'location');
      else element.removeAttribute('aria-current');
    });
  }
  // Native fragment links preserve open-in-new-tab, copied URLs and browser history.
  // Reveal the destination before the browser scrolls to its existing anchor.
  root.querySelectorAll('[data-community-section]').forEach(element => element.addEventListener('click', event => {
    if (event.defaultPrevented || event.button > 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    syncPanel(element.dataset.communitySection);
  }));
  syncPanel();
  win.addEventListener('hashchange', () => { syncPanel(); applyAccountIntent(); });
  $('rc-search')?.addEventListener('input', renderTopics);
  $('rc-topics-more')?.addEventListener('click', () => { if (!$('rc-topics-more').disabled) void loadPublic('topics', true); });
  $('rc-messages-more')?.addEventListener('click', () => { if (!$('rc-messages-more').disabled) void loadPublic('messages', true); });
  $('rc-new-topic')?.addEventListener('click', () => { if (canPost()) open($('rc-composer')); else showAuth('signin'); });
  form('rc-topic-form', async data => {
    if (!canPost()) return;
    const result = await request('/api/community/topics', { method: 'POST', body: { title: String(data.get('title') || '').trim(), body: String(data.get('body') || '').trim() } });
    if (!validPost(result?.data)) throw Object.assign(new Error(), { code: 'INVALID_RESPONSE' });
    $('rc-topic-form').reset(); close($('rc-composer')); notice('Your discussion was published.'); await loadPublic('topics');
  });
  form('rc-board-form', async data => {
    if (!canPost()) return;
    await request('/api/community/messages', { method: 'POST', body: { body: String(data.get('body') || '').trim() } });
    $('rc-board-form').reset(); notice('Your message was posted.'); await loadPublic('messages');
  });
  function renderThread() {
    if (!currentTopic) return;
    const container = $('rc-thread-content'); const heading = node('h2', currentTopic.title); heading.id = 'rc-thread-title';
    container.replaceChildren(heading, node('p', `${memberName(currentTopic.author_id)} · ${dateLabel(currentTopic.created_at)}`, 'rc-meta'), node('p', currentTopic.body, 'rc-post-body'), node('h3', 'Replies'));
    container.append(...replies.map(post => postCard(post)));
    if (!replies.length) container.append(node('p', 'No replies yet.', 'muted'));
    renderControls();
  }
  async function openThread(id, more = false) {
    if (!UUID.test(id)) return;
    const sequence = ++threadSeq; const offset = more ? replyOffset : 0;
    if (!more) { currentTopic = null; replies = []; $('rc-thread-content').replaceChildren(node('p', 'Loading discussion…')); $('rc-reply-form').reset(); open($('rc-thread')); }
    $('rc-replies-more').disabled = true; renderControls();
    try {
      const result = await request(`/api/community/topics/${id}?limit=${LIMIT}&offset=${offset}`);
      if (disposed || sequence !== threadSeq || !$('rc-thread').open) return;
      if (!validPost(result?.data?.topic) || !Array.isArray(result.data.replies) || result.data.replies.some(post => !validPost(post))) throw Object.assign(new Error(), { code: 'INVALID_RESPONSE' });
      currentTopic = result.data.topic; replies = more ? [...replies, ...result.data.replies] : result.data.replies; replyOffset = offset + result.data.replies.length;
      renderThread(); $('rc-replies-more').hidden = result.data.replies.length < LIMIT || replyOffset + LIMIT > 10000;
    } catch (error) {
      if (sequence !== threadSeq || error?.name === 'AbortError') return;
      $('rc-thread-content').replaceChildren(node('p', safeUiError(error), 'rc-load-error'), button('Try again', () => { void openThread(id); }));
    } finally { if (sequence === threadSeq) $('rc-replies-more').disabled = false; }
  }
  $('rc-replies-more')?.addEventListener('click', () => { if (currentTopic && !$('rc-replies-more').disabled) void openThread(currentTopic.id, true); });
  form('rc-reply-form', async data => {
    if (!canPost() || !currentTopic || currentTopic.locked) return;
    const id = currentTopic.id, sequence = threadSeq;
    await request(`/api/community/topics/${id}/replies`, { method: 'POST', body: { body: String(data.get('body') || '').trim() } });
    if (sequence === threadSeq && $('rc-thread').open) { $('rc-reply-form').reset(); await openThread(id); }
    notice('Your reply was posted.');
  });

  function editPost(row, operation, account = false) {
    if (emailFlow || !canAdmin() || !Number.isSafeInteger(row.version) || row.version < 1 || (account && !state.admin.canManageUsers)) return;
    editing = { row, operation, account }; $('rc-admin-edit-form').reset(); notice('', 'rc-admin-edit-result');
    const edit = operation === 'edit'; setText('rc-admin-editor-title', edit ? 'Edit content' : `${operation[0].toUpperCase()}${operation.slice(1)} ${account ? 'account' : 'content'}`);
    $('rc-admin-title-label').hidden = !edit || row.kind !== 'topic'; $('rc-admin-body-label').hidden = !edit;
    $('rc-admin-edit-title').value = edit ? row.title || '' : ''; $('rc-admin-edit-title').required = edit && row.kind === 'topic';
    $('rc-admin-edit-body').value = edit ? row.body : ''; $('rc-admin-edit-body').required = edit;
    setText('rc-admin-save', emailMode() ? 'Review & verify by email' : edit ? 'Save changes' : `Confirm ${operation}`); renderControls(); open($('rc-admin-editor'));
  }
  function accountCard(account) {
    const card = node('article', undefined, 'rc-post'); card.append(node('h3', memberName(account.user_id)), node('p', account.user_id, 'rc-meta'), node('p', `${account.role} · ${account.state} · version ${account.version}`));
    if (UUID.test(account.user_id || '') && Number.isSafeInteger(account.version)) card.append(button(account.state === 'suspended' ? 'Restore account' : 'Suspend account', () => editPost(account, account.state === 'suspended' ? 'restore' : 'suspend', true)));
    return card;
  }
  function auditCard(row) {
    const card = node('article', undefined, 'rc-post'); card.append(node('h3', row.action), node('p', `${row.entity_type} · ${row.entity_id}`, 'rc-meta'), node('p', `${memberName(row.actor_id)} · ${dateLabel(row.created_at)}`, 'rc-meta'), node('p', row.reason || 'No reason recorded.', 'rc-post-body')); return card;
  }
  async function loadAdmin(more = false) {
    if (!canAdmin()) return;
    const sequence = ++adminSeq, view = adminView, offset = more ? adminOffset : 0;
    if (view === 'users' && !state.admin.canManageUsers || view === 'audit' && !state.admin.canReadAudit) return;
    const search = $('rc-admin-search').value.trim(); const container = $('rc-admin-list');
    $('rc-admin-more').disabled = true;
    if (!more) { adminData = []; container.replaceChildren(node('p', 'Loading…', 'muted')); }
    const endpoint = view === 'users' ? '/api/admin/users' : view === 'audit' ? '/api/admin/audit' : '/api/admin/posts';
    const filters = { limit: String(LIMIT), offset: String(offset), ...(view === 'audit' ? {} : { search }), ...(!['users', 'audit'].includes(view) ? { kind: view, include_hidden: String($('rc-admin-hidden').checked) } : {}) };
    try {
      const result = await request(`${endpoint}?${query(filters)}`);
      if (disposed || sequence !== adminSeq || !canAdmin() || view !== adminView) return;
      const data = rows(result); if (data.some(row => !isObject(row))) throw Object.assign(new Error(), { code: 'INVALID_RESPONSE' });
      adminData = more ? [...adminData, ...data] : data; adminOffset = offset + data.length;
      const render = view === 'users' ? accountCard : view === 'audit' ? auditCard : post => validPost(post) ? postCard(post, { admin: true }) : node('p', 'Invalid content record.');
      container.replaceChildren(...adminData.map(render)); if (!adminData.length) container.append(node('p', 'No matching records.', 'empty'));
      setText('rc-admin-count', `${adminData.length} records loaded. Search and hidden filters are applied by the server.`);
      $('rc-admin-more').hidden = data.length < LIMIT || adminOffset + LIMIT > 10000;
      notice('Management access verified. Changes require a reason and the current item version.');
    } catch (error) {
      if (sequence !== adminSeq || disposed || error?.name === 'AbortError') return;
      container.replaceChildren(node('p', safeUiError(error), 'rc-load-error'), button('Try again', () => { void loadAdmin(); }));
      if (['unauthorized', 'forbidden'].includes(error?.code)) { invalidatePrivateViews(); $('rc-admin-tools').hidden = true; notice(safeUiError(error)); if (!state.busy) void auth.refresh().catch(() => {}); }
    } finally { if (sequence === adminSeq) $('rc-admin-more').disabled = false; }
  }
  all('[data-admin-view]').forEach(element => element.addEventListener('click', () => {
    if (!canAdmin()) return;
    adminView = element.dataset.adminView; $('rc-admin-search').value = '';
    all('[data-admin-view]').forEach(tab => tab.setAttribute('aria-pressed', String(tab === element)));
    $('rc-admin-search-label').hidden = adminView === 'audit'; $('rc-admin-hidden-label').hidden = ['users', 'audit'].includes(adminView);
    $('rc-admin-search').placeholder = adminView === 'users' ? 'Search by user ID…' : 'Text or exact post ID…';
    void loadAdmin();
  }));
  form('rc-admin-filter', () => loadAdmin());
  $('rc-admin-refresh')?.addEventListener('click', () => { void loadAdmin(); });
  $('rc-admin-more')?.addEventListener('click', () => { if (!$('rc-admin-more').disabled) void loadAdmin(true); });
  form('rc-admin-edit-form', async data => {
    if (!canAdmin() || !editing || emailFlow) return;
    const selection = editing; const { row, operation, account } = selection;
    const id = account ? row.user_id : row.id; if (!UUID.test(id) || account && !state.admin.canManageUsers) return;
    const body = { expected_version: row.version, reason: String(data.get('reason') || '').trim(), ...(operation === 'edit' ? { title: row.kind === 'topic' ? String(data.get('title') || '').trim() : '', body: String(data.get('body') || '').trim() } : {}) };
    const path = `/api/admin/${account ? 'users' : 'posts'}/${id}/${operation}`;
    if (emailMode()) {
      if (!emailAvailable() || typeof stepup.consumeAction !== 'function') throw { code: 'EMAIL_STEPUP_UNAVAILABLE' };
      const payload = account ? { state: operation === 'suspend' ? 'suspended' : 'active', reason: body.reason }
        : operation === 'edit' ? { title: body.title, body: body.body, reason: body.reason } : { action: operation, reason: body.reason };
      openEmailFlow({ scope: 'action', selection, path, body: Object.freeze({ ...body }),
        begin: Object.freeze({ scope: 'action', action: account ? 'set_account_state' : operation === 'edit' ? 'admin_edit_post' : 'moderate_post', targetId: id, expectedVersion: row.version, payload: Object.freeze(payload) }) });
      return;
    }
    await request(path, { method: 'POST', body });
    if (editing === selection) close($('rc-admin-editor'));
    notice('The change was saved and recorded.'); await loadAdmin();
  }, 'rc-admin-edit-result');
  async function showHistory(id, more = false) {
    if (!canAdmin() || !UUID.test(id)) return;
    const sequence = ++historySeq, offset = more ? historyOffset : 0; historyId = id;
    const container = $('rc-history-list'); if (!more) { container.replaceChildren(node('p', 'Loading history…')); open($('rc-history')); }
    $('rc-history-more').disabled = true;
    try {
      const result = await request(`/api/admin/posts/${id}/history?limit=${LIMIT}&offset=${offset}`);
      if (disposed || sequence !== historySeq || !canAdmin() || !$('rc-history').open) return;
      const data = rows(result); if (!more) container.replaceChildren();
      for (const revision of data) {
        const card = node('article', undefined, 'rc-post'); card.append(node('h3', `Version ${revision.version} · ${revision.action}`), node('p', `${memberName(revision.actor_id)} · ${dateLabel(revision.created_at)}`, 'rc-meta'), node('p', revision.reason || '', 'rc-post-body'));
        if (isObject(revision.snapshot)) card.append(node('h3', revision.snapshot.title || ''), node('p', revision.snapshot.body || '', 'rc-post-body'), node('p', ['hidden', 'pinned', 'locked'].map(key => `${key}: ${revision.snapshot[key] === true}`).join(' · '), 'rc-meta'));
        container.append(card);
      }
      if (!data.length && !more) container.append(node('p', 'No revisions found.', 'muted'));
      historyOffset = offset + data.length; $('rc-history-more').hidden = data.length < LIMIT || historyOffset + LIMIT > 10000;
    } catch (error) {
      if (sequence !== historySeq || error?.name === 'AbortError') return;
      if (['unauthorized', 'forbidden'].includes(error?.code)) {
        invalidatePrivateViews(); $('rc-admin-tools').hidden = true; notice(safeUiError(error));
        if (!state.busy) void auth.refresh().catch(() => {});
      } else container.replaceChildren(node('p', safeUiError(error), 'rc-load-error'));
    }
    finally { if (sequence === historySeq) $('rc-history-more').disabled = false; }
  }
  $('rc-history-more')?.addEventListener('click', () => { if (historyId && !$('rc-history-more').disabled) void showHistory(historyId, true); });

  const unsubscribe = auth.subscribe(renderSession);
  const refresh = () => { if (!disposed && !pageSuspended && initialized && state.user && !state.busy && !signingOut) void auth.refresh().catch(error => notice(safeUiError(error))); };
  win.addEventListener('pageshow', event => { if (event.persisted) { pageSuspended = false; adminInitialLoadDone = false; if (emailFlow) { open($('rc-email-stepup')); renderEmailControls(); } refresh(); } });
  doc.addEventListener('visibilitychange', () => { if (doc.visibilityState === 'visible') refresh(); });
  win.addEventListener('focus', refresh);
  function dispose() { if (disposed) return; disposed = true; resetEmailSession(false); abortRequests(); resetPasswords(); clearMfa(); unsubscribe(); timers.forEach(timer => win.clearInterval(timer)); auth.dispose(); }
  win.addEventListener('pagehide', event => {
    pageSuspended = true; if (emailFlow) { emailFlow.invalidated = true; emailFlow.verified = false; }
    clearEmailCode(); close($('rc-email-stepup')); if (event.persisted) stepup?.suspend?.();
    abortRequests(); invalidatePrivateViews(); adminAllowed = false;
    if ($('rc-admin-tools')) $('rc-admin-tools').hidden = true;
    resetPasswords(); clearMfa(); if (!event.persisted) dispose();
  });
  timers.push(win.setInterval(refresh, 60_000));
  if (config.emailStepupEnabled === true) timers.push(win.setInterval(() => { enforceEmailDeadline(); renderControls(); }, 1_000));
  const ready = (async () => {
    try {
      if (callbackPage) {
        const url = new URL(callbackUrl);
        if (url.search || url.hash) await auth.handleCallback(callbackUrl);
        else await auth.initialize();
        const current = auth.getState();
        if (mode === 'callback') notice(current.status === 'signed_in' ? 'Your email or sign-in link has been verified. Continue to the community.' : 'There is no sign-in link to verify. Return to the community to sign in.');
        else notice(current.status === 'recovery_ready' ? 'Recovery link verified. Choose a new password below.' : 'Request a fresh password reset link and open it in this same tab.');
      } else await auth.initialize();
    } catch (error) { authBlocked = ['INVALID_CONFIG', 'STORAGE_UNAVAILABLE', 'AUTH_DISABLED'].includes(error?.code); notice(safeUiError(error)); if ($('rc-recovery-retry')) $('rc-recovery-retry').hidden = false; }
    finally { initialized = true; renderSession(auth.getState()); }
    if (mode === 'forum') { syncPanel(); applyAccountIntent(); await Promise.all([loadPublic('topics'), loadPublic('messages')]); }
  })();
  return Object.freeze({ ready, dispose });
}
