// Retired deliberately: never initialize Auth, read env credentials or contact Supabase.
export function onRequest() {
  return new Response(JSON.stringify({ error: { code: 'COMMUNITY_RETIRED', message: 'Community and account services have been taken offline.' } }), {
    status: 410,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
  });
}
