import test from 'node:test';
import assert from 'node:assert/strict';
import {createCommunityClient} from '../client/community-client.mjs';
test('disabled transport never contacts a service',async()=>{let calls=0;const c=createCommunityClient({origin:'https://example.com',fetchImpl:()=>calls++});await assert.rejects(c.request('/api/community/topics'),{code:'BACKEND_DISABLED'});assert.equal(calls,0)});
test('rejects cross-origin paths before obtaining credentials',async()=>{const c=createCommunityClient({enabled:true,origin:'https://example.com',tokenProvider:()=>{throw Error('unexpected')}});await assert.rejects(c.request('https://evil.invalid/api/admin/users'));await assert.rejects(c.request('//evil.invalid/api/admin/users'))});
test('requires token for writes and admin reads',async()=>{const c=createCommunityClient({enabled:true,origin:'https://example.com',fetchImpl:()=>{throw Error('unexpected')}});await assert.rejects(c.request('/api/community/messages',{method:'POST',body:{body:'hello'}}),{code:'SIGN_IN_REQUIRED'});await assert.rejects(c.request('/api/admin/users',{authenticated:true}),{code:'SIGN_IN_REQUIRED'})});
test('token only transmitted to same-origin API, cookies omitted',async()=>{let call;const c=createCommunityClient({enabled:true,origin:'https://example.com',tokenProvider:async()=>'test-token',fetchImpl:async(...args)=>{call=args;return Response.json({ok:true})}});assert.deepEqual(await c.request('/api/community/messages',{method:'POST',body:{body:'hello'}}),{ok:true});assert.equal(call[0],'https://example.com/api/community/messages');assert.equal(call[1].headers.Authorization,'Bearer test-token');assert.equal(call[1].credentials,'omit');assert.equal(call[1].redirect,'error')});
test('raw server errors never become UI messages',async()=>{const c=createCommunityClient({enabled:true,origin:'https://example.com',fetchImpl:async()=>Response.json({error:{code:'DATABASE_FAILURE',message:'sensitive upstream details'}},{status:500})});await assert.rejects(c.request('/api/community/topics'),e=>!e.message.includes('sensitive')&&e.status===500)});

test('API error codes map to actionable safe client messages',async()=>{for(const [code,status,fragment] of [['version_conflict',409,'Reload'],['unauthorized',401,'Sign in'],['forbidden',403,'not available'],['backend_disabled',503,'not connected']]){const c=createCommunityClient({enabled:true,origin:'https://example.com',fetchImpl:async()=>Response.json({error:{code}},{status})});await assert.rejects(c.request('/api/community/topics'),e=>e.code===code&&e.message.includes(fragment))}});

test('admin include_hidden query reaches same-origin route with member bearer', async () => {
  let call;
  const client = createCommunityClient({ enabled: true, origin: 'https://example.com', tokenProvider: async () => 'synthetic-token', fetchImpl: async (...args) => { call = args; return Response.json({data: []}); } });
  await client.request('/api/admin/posts?kind=topic&include_hidden=true&limit=25&offset=0');
  assert.equal(call[0], 'https://example.com/api/admin/posts?kind=topic&include_hidden=true&limit=25&offset=0');
  assert.equal(call[1].headers.Authorization, 'Bearer synthetic-token');
});

test('encoded traversal cannot obtain or send bearer outside API route', async () => {
  let tokens = 0, fetches = 0;
  const client = createCommunityClient({ enabled: true, origin: 'https://example.com', tokenProvider: async () => { tokens++; return 'synthetic'; }, fetchImpl: async () => { fetches++; return Response.json({}); } });
  for (const path of ['/api/community/%2e%2e/%2e%2e/collect', '/api/admin/%2e%2e%2fcollect', '/api/admin/../collect', '/api/admin/posts#fragment']) await assert.rejects(client.request(path, {authenticated: true}));
  assert.equal(tokens, 0); assert.equal(fetches, 0);
});
test('encoded search and underscore query keys are separate from strict route validation', async () => {
  let target;
  const client = createCommunityClient({ enabled: true, origin: 'https://example.com', tokenProvider: async () => 'synthetic', fetchImpl: async url => { target = url; return Response.json({data: []}); } });
  await client.request('/api/admin/posts?include_hidden=true&q=a.b%20%2F%3F%23');
  assert.equal(new URL(target).pathname, '/api/admin/posts');
  assert.equal(new URL(target).searchParams.get('q'), 'a.b /?#');
});
