import { COMMUNITY_PATHS } from './community-config.mjs';
/** Navigation-only intent. It cannot supply recipients, credentials or redirects. */
export function communityIntent(href, expectedOrigin) {
  try {
    const url = new URL(href);
    if (url.origin !== expectedOrigin || url.protocol !== 'https:' || url.pathname !== COMMUNITY_PATHS.forum || url.search) return null;
    return ({ '#signin': 'signin', '#register': 'signup', '#account': 'account' })[url.hash] ?? null;
  } catch { return null; }
}
