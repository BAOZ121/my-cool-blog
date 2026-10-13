/** A short-lived presentation hint. This is never evidence of authentication. */
const TTL_MS = 5 * 60_000;
const PROJECT = /^[a-z0-9-]+\.supabase\.co$/;
const INITIALS = /^[A-Z0-9]{1,2}$/;

export function createAccountHintStore({ storage, project, now = Date.now } = {}) {
  const key = typeof project === 'string' && PROJECT.test(project)
    ? `dex-community-account-view:v1:${project}` : null;
  const clear = () => {
    if (!key) return false;
    try { storage.removeItem(key); return true; } catch { return false; }
  };
  return Object.freeze({
    read() {
      if (!key) return null;
      try {
        const source = storage.getItem(key);
        if (typeof source !== 'string' || source.length > 128) return null;
        const value = JSON.parse(source), time = now();
        if (!value || typeof value !== 'object' || Array.isArray(value)
          || Object.keys(value).length !== 2 || !Object.hasOwn(value, 'initials') || !Object.hasOwn(value, 'expiresAt')
          || typeof value.initials !== 'string' || !INITIALS.test(value.initials)
          || !Number.isFinite(time) || !Number.isFinite(value.expiresAt)
          || value.expiresAt <= time || value.expiresAt > time + TTL_MS) return null;
        return Object.freeze({ initials: value.initials, expiresAt: value.expiresAt });
      } catch { return null; }
    },
    write(input = {}) {
      const initials = input?.initials;
      if (!key || typeof initials !== 'string' || !INITIALS.test(initials)) return false;
      try {
        const time = now();
        if (!Number.isFinite(time)) return false;
        storage.setItem(key, JSON.stringify({ initials, expiresAt: time + TTL_MS }));
        return true;
      } catch { return false; }
    },
    clear,
  });
}
