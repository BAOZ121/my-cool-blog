/**
 * Unused interface fixture, not discovered by Cloudflare Pages in backend/api.
 * Actual local release adapters now live in functions/api/{community,admin}.
 * Deployment and runtime configuration still require separate approval.
 */
import { handleCommunityRequest } from './handler.mjs';

export async function onRequest({ request, env }) {
  return handleCommunityRequest(request, env);
}
