/** Project-scoped, per-tab Auth storage. No localStorage or cookies. */
export function createAuthStorage({ tabStorage, namespace, callbackUrls, callbackUrl, storageKey, now = Date.now, ttlMs = 30 * 60_000 }) {
  const memory = new Map();
  const recordKey = `${namespace}:pkce`;
  const sessionKey = `${namespace}:session`;
  const userKey = `${namespace}:user`;
  const recoveryKey = `${namespace}:recovery`;
  const allowedCallbacks = callbackUrls ?? [callbackUrl];
  let closed = false, sessionBlocked = false;
  const isVerifier = (key) => typeof key === 'string'
    && (key === `${storageKey}-code-verifier` || key === `${storageKey}-flows-code-verifier`
      || (key.startsWith(`${storageKey}-flow-`) && key.endsWith('-code-verifier')
        && /^[A-Za-z0-9_-]{8,64}$/.test(key.slice(`${storageKey}-flow-`.length, -'-code-verifier'.length))));
  const suffix = (key) => key.slice(storageKey.length);
  const sessionStorageKey = (key) => key === storageKey ? sessionKey : key === `${storageKey}-user` ? userKey : null;
  const unavailable = () => Object.assign(new Error('Tab storage is required for sign-in.'), { code: 'STORAGE_UNAVAILABLE' });
  function read(key) { try { return tabStorage?.getItem(key) ?? null; } catch { throw unavailable(); } }
  function write(key, value) {
    if (closed || !tabStorage) throw unavailable();
    try { tabStorage.setItem(key, value); } catch { throw unavailable(); }
  }
  function remove(key) { try { tabStorage?.removeItem(key); return true; } catch { return false; } }
  function readPending() {
    if (closed) return null;
    let record;
    try { record = JSON.parse(read(recordKey) || 'null'); } catch { return null; }
    if (!record || !allowedCallbacks.includes(record.callbackUrl)
      || !['signup', 'google', 'recovery'].includes(record.kind) || !Number.isFinite(record.createdAt)
      || record.createdAt > now() || now() - record.createdAt > ttlMs
      || !record.verifiers || typeof record.verifiers !== 'object' || Array.isArray(record.verifiers)) return null;
    // Upgrade old records keyed by the prior SDK instance without reusing its
    // BroadcastChannel name. All new records store only verifier suffixes.
    const verifiers = {};
    for (const [key, value] of Object.entries(record.verifiers)) {
      const logical = record.storageKey && key.startsWith(record.storageKey) ? key.slice(record.storageKey.length) : key;
      if (isVerifier(`${storageKey}${logical}`)) verifiers[logical] = value;
    }
    return { kind: record.kind, createdAt: record.createdAt, callbackUrl: record.callbackUrl, verifiers };
  }
  function clearPending() { return remove(recordKey); }
  function clearSession() { sessionBlocked = true; memory.clear(); const results = [remove(sessionKey), remove(userKey), remove(recoveryKey)]; return results.every(Boolean); }
  return Object.freeze({
    adapter: Object.freeze({
      getItem(key) {
        if (closed) return null;
        if (isVerifier(key)) return readPending()?.verifiers[suffix(key)] ?? null;
        const persisted = sessionStorageKey(key);
        return persisted ? (sessionBlocked ? null : read(persisted)) : memory.get(key) ?? null;
      },
      setItem(key, value) {
        if (closed) return;
        if (typeof value !== 'string' || value.length > 131_072) throw unavailable();
        if (isVerifier(key)) {
          const record = readPending();
          if (!record || value.length > 4096) throw Object.assign(new Error('Restart this sign-in flow.'), { code: 'CALLBACK_INVALID' });
          record.verifiers[suffix(key)] = value;
          write(recordKey, JSON.stringify(record));
        } else {
          const persisted = sessionStorageKey(key);
          if (persisted) {
            let serialized = value;
            if (key === storageKey) {
              try {
                const session = JSON.parse(value);
                if (session && typeof session === 'object' && !Array.isArray(session)) {
                  delete session.provider_token; delete session.provider_refresh_token;
                  serialized = JSON.stringify(session);
                }
              } catch { throw unavailable(); }
            }
            write(persisted, serialized); sessionBlocked = false;
          } else memory.set(key, value);
        }
      },
      removeItem(key) {
        if (isVerifier(key)) {
          const record = readPending();
          if (record) { delete record.verifiers[suffix(key)]; write(recordKey, JSON.stringify(record)); }
        } else {
          const persisted = sessionStorageKey(key);
          if (persisted) remove(persisted); else memory.delete(key);
        }
      },
    }),
    assertAvailable() {
      const key = `${namespace}:probe`;
      write(key, 'ok');
      if (read(key) !== 'ok' || !remove(key)) throw unavailable();
    },
    beginFlow(kind, redirectUrl = allowedCallbacks[0]) {
      if (!allowedCallbacks.includes(redirectUrl)) throw Object.assign(new Error('Restart this sign-in flow.'), { code: 'CALLBACK_INVALID' });
      clearPending();
      write(recordKey, JSON.stringify({ kind, createdAt: now(), callbackUrl: redirectUrl, verifiers: {} }));
    },
    pending() { return readPending(); },
    hasVerifier(flowId) {
      const entries = Object.entries(readPending()?.verifiers || {});
      return entries.some(([key, value]) => isVerifier(`${storageKey}${key}`) && typeof value === 'string' && value.length > 0
        && (flowId ? key === `-flow-${flowId}-code-verifier` : key === '-code-verifier'));
    },
    recovery() {
      try { const value = JSON.parse(read(recoveryKey) || 'null'); return value && typeof value === 'object' ? value : null; }
      catch { return { invalid: true }; }
    },
    setRecovery(value) { write(recoveryKey, JSON.stringify(value)); },
    clearRecovery() { remove(recoveryKey); },
    clearPending,
    clearMemory: clearSession,
    clear() { const sessionCleared = clearSession(); const pendingCleared = clearPending(); const legacyClientCleared = remove(`${namespace}:client`); return sessionCleared && pendingCleared && legacyClientCleared; },
    // Navigation cleanup preserves tab-scoped session/PKCE, but late writes stop.
    close() { memory.clear(); closed = true; },
  });
}

/** A fresh SDK channel identity per document, even when tab storage is cloned. */
export function resolveStorageKey({ randomUUID = () => globalThis.crypto.randomUUID() } = {}) {
  const selected = `dex-auth-${randomUUID()}`;
  if (!/^dex-auth-[a-f0-9-]{36}$/.test(selected)) throw Object.assign(new Error('Invalid sign-in configuration.'), { code: 'INVALID_CONFIG' });
  return selected;
}
