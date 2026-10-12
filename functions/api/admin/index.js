// Claim the exact API base as JSON, never as a static HTML fallback.
import { handleCommunityRequest } from '../../../backend/api/handler.mjs';

export function onRequest({ request, env }) {
  return handleCommunityRequest(request, env);
}
