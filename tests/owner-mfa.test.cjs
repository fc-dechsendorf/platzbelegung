const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const {webcrypto}=require('node:crypto');
let source=fs.readFileSync(path.join(__dirname,'../supabase/functions/owner-mfa/index.ts'),'utf8');
// Use the same pinned esbuild transpiler as the production bundle, no network/dependencies added.
const {execFileSync}=require('node:child_process');
source=execFileSync(process.execPath,[path.join(__dirname,'../node_modules/esbuild/bin/esbuild'),'--loader=ts','--format=cjs'],{input:source,encoding:'utf8'});
function fixture(user='25f4325b-18d1-40ba-9645-8fec15ea5855',aal='aal1') {
 let handler; const calls=[];
 const client={auth:{getUser:async()=>({data:{user:{id:user,email:'owner@example.invalid',app_metadata:{fcd_role:'admin'}}}}),
  signInWithPassword:async()=>({error:{message:'invalid'},data:{}}),
  admin:{signOut:async()=>({error:null}),mfa:{listFactors:async()=>({data:{factors:[]}})}}},
  rpc:async(_name,args)=>{calls.push(args);return {data:args.p_action==='attempt'?{allowed:true}:args.p_action==='status'?{required:false}: {ok:true}}}};
 const module={exports:{}};
 vm.runInNewContext(source,{module,exports:module.exports,crypto:webcrypto,TextEncoder,Response,atob,Deno:{env:{get:()=>''},serve:fn=>handler=fn},require:()=>({createClient:()=>client})});
 const token='header.'+Buffer.from(JSON.stringify({session_id:'11111111-1111-1111-1111-111111111111',aal})).toString('base64url')+'.signature';
 return {exports:module.exports,calls,request:async body=>handler(new Request('https://example.invalid',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)}))};
}
test('Recovery codes have independent 128-bit randomness and normalized hashes',async()=>{
 const f=fixture(); const codes=Array.from({length:100},()=>f.exports.newCode());
 assert.equal(new Set(codes).size,100); assert.match(codes[0],/^([0-9A-F]{4}-){7}[0-9A-F]{4}$/);
 assert.equal(await f.exports.hashCode(codes[0]),await f.exports.hashCode(codes[0].toLowerCase().replaceAll('-',' ')));
 assert.match(await f.exports.hashCode(codes[0]),/^[0-9a-f]{64}$/);
});
test('A different admin cannot reach personal MFA records',async()=>{
 const f=fixture('other');assert.equal((await f.request({action:'status'})).status,403);assert.equal(f.calls.length,0);
});
test('Stale AAL1 tokens cannot generate or activate recovery codes',async()=>{
 const f=fixture();for(const action of ['codes','activate']) assert.equal((await f.request({action})).status,403);
 assert.equal(f.calls.length,0);
});
test('AAL2 code generation stores hashes and returns codes only in no-store response',async()=>{
 const f=fixture(undefined,'aal2');const response=await f.request({action:'codes'});const body=await response.json();
 assert.equal(body.codes.length,10);assert.equal(f.calls[0].p_hashes.length,10);
 assert.ok(f.calls[0].p_hashes.every(h=>/^[0-9a-f]{64}$/.test(h)));
 assert.equal(response.headers.get('Cache-Control'),'no-store');
});
test('Recovery needs password verification and records an attempt first',async()=>{
 const f=fixture();const response=await f.request({action:'recover',password:'invalid',code:'A'.repeat(32)});
 assert.equal(response.status,400);assert.deepEqual(f.calls.map(c=>c.p_action),['attempt']);
});
