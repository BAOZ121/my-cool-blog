// Local release preparation only. Deployment/configuration requires separate approval.
import { handleCommunityRequest } from '../../../backend/api/handler.mjs';

export function onRequest({ request, env }) {
  return handleCommunityRequest(request, env);
}
