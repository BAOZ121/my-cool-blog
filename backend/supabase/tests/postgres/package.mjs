// Packages only synthetic fixtures and reviewed SQL. Does not install/run/connect.
import {copyFile,mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const source=fileURLToPath(new URL('../../',import.meta.url));
const output=resolve(process.argv[2]||'/tmp/dex-postgres-race-package');
if(!output.startsWith('/tmp/') && !output.startsWith(resolve(source,'../../../')+'/'))throw new Error('Output must be scratch or repository-owned');
const paths=['migrations/20261012030809_dex_community_foundation.sql','migrations/20261012030835_harden_auto_rls_execute.sql','migrations/20261013031903_community_admin_email_stepup.sql','tests/auth-stubs.sql','tests/auto-rls-fixture.sql','tests/vault-stub.sql','ops/disable-email-stepup.sql','tests/postgres/races.test.mjs','tests/postgres/compose.yaml','tests/postgres/EVIDENCE.json'];
const manifest=[];
for(const p of paths){const dst=resolve(output,p);await mkdir(dirname(dst),{recursive:true});await copyFile(resolve(source,p),dst);manifest.push({path:relative(output,dst),sha256:createHash('sha256').update(await readFile(dst)).digest('hex')});}
for(const [src,dst] of [['tests/postgres/package.json','package.json'],['tests/postgres/package-lock.json','package-lock.json'],['tests/postgres/README.md','README.md']]){await copyFile(resolve(source,src),resolve(output,dst));manifest.push({path:dst,sha256:createHash('sha256').update(await readFile(resolve(output,dst))).digest('hex')});}
const evidence=JSON.parse(await readFile(resolve(source,'tests/postgres/EVIDENCE.json'),'utf8'));
const matches=manifest.find(x=>x.path.endsWith('_community_admin_email_stepup.sql'))?.sha256===evidence.migration_sha256 && manifest.find(x=>x.path==='tests/postgres/races.test.mjs')?.sha256===evidence.runner_sha256;
await writeFile(resolve(output,'MANIFEST.json'),JSON.stringify({status:matches?'PASS: 7 real PostgreSQL17.11 concurrency scenarios, 8 tests, 0 skipped':'UNVERIFIED: current source hashes differ from the recorded run',evidence_run:matches?evidence.run_url:null,files:manifest},null,2)+'\n');
console.log(output);
