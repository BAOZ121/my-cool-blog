import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../assets/js/forum-test.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../layouts/page/forum-test.html',import.meta.url),'utf8');
function fixture({blocked=false}={}){
 const nodes=new Map(),storage=new Map();
 function el(key){
  if(!nodes.has(key)) nodes.set(key, {
   value:'',textContent:'',innerHTML:'',hidden:false,style:{},dataset:{},attrs:{},
   classList:{toggle(){}}, setAttribute(k,v){this.attrs[k]=v},
   addEventListener(k,f){this['on'+k]=f}, showModal(){this.open=true},close(){this.open=false},
   querySelectorAll(){return []},
   querySelector(){return {click(){nodes.get('#categories').onclick({target:{closest(){return {dataset:{category:'All'}}}}})}}}
  });
  return nodes.get(key);
 }
 const document={querySelector:el,querySelectorAll:()=>[]};el('#sort').value='recent';
 const context={document,structuredClone,crypto:{randomUUID:()=>String(Math.random())},localStorage:{getItem:k=>{if(blocked)throw Error('denied');return storage.get(k)},setItem:(k,v)=>{if(blocked)throw Error('denied');storage.set(k,v)}},setTimeout:()=>0,clearTimeout(){},confirm:()=>true,FormData:class{constructor(form){this.data=form.data}get(k){return this.data[k]}}};vm.runInNewContext(source,context);
 return {el,storage,submit(id,data){const f=el(id);f.data=data;f.reset=()=>{};f.onsubmit({preventDefault(){},target:f})}};
}
test('test route uses the native shell, is not listed and carries noindex',()=>{const front=readFileSync(new URL('../content/test/forum-v1/index.en.md',import.meta.url),'utf8');assert.match(front,/url: "\/test\/forum-v1\/"/);assert.match(front,/type: "page"/);assert.match(front,/testpage: true/);assert.match(front,/list: never/);assert.match(front,/disable: true/);assert.match(html,/partialCached "footer\/footer"/);assert.doesNotMatch(html,/<html|<body|class="rail"/)});
test('real sign-in cannot collect credentials and both demo warnings are visible',()=>{assert.match(html,/<input type="email"[^>]*disabled/);assert.match(html,/<input type="password"[^>]*disabled/);assert.match(html,/Continue with Google · Coming soon/);assert.match(html,/not shared with other visitors/);assert.match(html,/not sent to DEX/);assert.doesNotMatch(source,/fetch\(|XMLHttpRequest|sendBeacon/)});
test('visitor sees seeded discussions, but posting opens sign-in',()=>{const f=fixture();assert.match(f.el('#result-count').textContent,/4 discussions/);f.el('#new-topic').onclick();assert.equal(f.el('#login').open,true);assert.notEqual(f.el('#composer').open,true)});
test('member can create a local topic with escaped text and persistent state',()=>{const f=fixture();f.el('#demo-member').onclick();f.submit('#topic-form',{title:'Test <script> title',body:'A harmless local testing discussion.',category:'Questions & ideas'});assert.match(f.el('#topics').innerHTML,/Test &lt;script&gt; title/);assert.match(f.el('#result-count').textContent,/5 discussions/);assert.equal(JSON.parse(f.storage.get('dex-onsite-forum-test-v1')).length,5)});
test('search returns an explicit empty state',()=>{const f=fixture();f.el('#search').value='zzzz-no-result';f.el('#search').oninput();assert.match(f.el('#topics').innerHTML,/No matching discussions/)});
test('message board requires demo role and stores only local messages safely',()=>{const f=fixture();f.submit('#board-form',{message:'Visitor test'});assert.equal(f.el('#login').open,true);assert.equal(f.storage.has('dex-onsite-message-board-test-v1'),false);f.el('#demo-member').onclick();f.submit('#board-form',{message:'<img src=x onerror=alert(1)>'});assert.match(f.el('#board-messages').innerHTML,/&lt;img/);assert.doesNotMatch(f.el('#board-messages').innerHTML,/<img/);assert.equal(JSON.parse(f.storage.get('dex-onsite-message-board-test-v1')).length,2)});
test('moderator can hide and restore board entries; visitor cannot see hidden entries',()=>{const f=fixture();f.el('#demo-admin').onclick();const event={target:{closest:()=>({dataset:{boardHide:'welcome-board'}})}};f.el('#board-messages').onclick(event);assert.match(f.el('#board-messages').innerHTML,/hidden/);f.el('#account').onclick();assert.match(f.el('#board-messages').innerHTML,/No demo messages yet/);f.el('#demo-admin').onclick();f.el('#board-messages').onclick(event);assert.match(f.el('#board-messages').innerHTML,/Welcome to the DEX/)});
test('tabs switch explicitly and blocked storage does not break demo',()=>{const f=fixture({blocked:true});f.el('#show-board').onclick();assert.equal(f.el('#forum-panel').hidden,true);assert.equal(f.el('#board-panel').hidden,false);f.el('#demo-member').onclick();f.submit('#board-form',{message:'Works without local storage'});assert.match(f.el('#board-messages').innerHTML,/Works without local storage/)});

test('test page inherits DEX light/dark palette without a fixed blue accent',()=>{const css=readFileSync(new URL('../assets/css/forum-test.css',import.meta.url),'utf8');assert.match(css,/--df-accent:var\(--accent-color\)/);assert.match(css,/color:var\(--accent-color-text\)/);assert.match(css,/background:var\(--card-background\)/);assert.match(css,/var\(--card-separator-color\)/);assert.doesNotMatch(css,/#[0-9a-fA-F]{3,8}\b/);assert.doesNotMatch(css,/--df-blue/)});
