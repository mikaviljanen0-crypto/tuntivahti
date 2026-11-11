'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),{Readable}=require('node:stream');
const {Bridge,Vault,publicConfig}=require('./bridge.cjs');
const uid='11111111-1111-4111-8111-111111111111',org='22222222-2222-4222-8222-222222222222',email='mika.viljanen@julkisivutekniikka.fi';
function setup(foremen=false){
 let now=1000000;const cookie='a'.repeat(43),key=crypto.createHash('sha256').update(cookie).digest('hex');
 const user={id:'portal-user',username:'mika.viljanen',owner:true,active:true,grants:{tjt:{laskenta:'edit'}}},s={uid:user.id,last:now,expires:now+28800000,csrf:'test-csrf'};
 const auth={users:[user],sessions:new Map([[key,s]]),session(){},audit(){}};
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tunti-bridge-test-'));const vault=new Vault(dir,crypto.randomBytes(32));
 const identity={user:{id:uid,email},profile:{id:uid,email,organization_id:org,role:'admin',active:true}};
 const calls=[];let refreshCount=0,failAuth=false;
 const fake=async(url,options)=>{calls.push({url,options});const u=new URL(url);let value;
  if(u.pathname==='/auth/v1/token'){if(failAuth)return Response.json({error:'wrong credentials'},{status:400});if(u.search.includes('refresh_token'))refreshCount++;value={access_token:'secret-access',refresh_token:'secret-refresh-'+refreshCount,expires_in:3600,user:identity.user};}
  else if(u.pathname==='/auth/v1/user')value=identity.user;
  else if(u.pathname==='/rest/v1/profiles'&&u.search.includes('select=id,organization_id'))value=[identity.profile];
  else if(u.pathname==='/auth/v1/logout')return new Response(null,{status:204});
  else value=[{id:'test-row'}];
  return Response.json(value,{headers:{'content-range':'0-0/1','set-cookie':'must-not-be-forwarded=secret'}});
 };
 const bridge=new Bridge({auth,hosts:new Set(['portal.test']),config:{url:'https://abcdefghijklmnopqrst.supabase.co',key:'sb_publishable_test',pilotUsername:user.username,expectedEmail:email,...(foremen?{mode:'foremen',organizationId:org}:{})},vault,publicDir:dir,fetchImpl:fake,clock:()=>now});
 function request(url='/tunnit/session',method='GET',data,headers={}){const req=Readable.from(data===undefined?[]:[Buffer.from(JSON.stringify(data))]);Object.assign(req,{url,method,headers:{host:'portal.test',cookie:'__Host-tjt_session='+cookie,'sec-fetch-site':'same-origin',...(method==='GET'?{}:{origin:'https://portal.test','x-tjt-csrf':s.csrf,'content-type':'application/json'}),...headers}});return req;}
 async function run(url,method,data,headers){const req=request(url,method,data,headers),res={status:200,headers:{},setHeader(k,v){this.headers[k.toLowerCase()]=v;},writeHead(status,h={}){this.status=status;for(const[k,v]of Object.entries(h))this.setHeader(k,v);},end(v){this.bytes=Buffer.from(v||'');}};const handled=await bridge.handle(req,res);return {...res,handled,json:()=>JSON.parse(res.bytes.toString()||'null')};}
 async function link(){const r=await run('/tunnit/link','POST',{email,password:'test-only-password',consent:true});assert.equal(r.status,200,r.bytes.toString());return r;}
 return {auth,user,s,key,vault,bridge,identity,calls,dir,request,run,link,setNow:v=>now=v,get refreshCount(){return refreshCount;},setFailAuth:v=>failAuth=v};
}
test('public config rejects admin/secret keys and foreign URLs',()=>{
 assert.throws(()=>publicConfig({url:'https://evil.example',key:'sb_publishable_x'}));
 assert.throws(()=>publicConfig({url:'https://abcdefghijklmnopqrst.supabase.co',key:'sb_secret_x'}));
 assert.throws(()=>publicConfig({url:'https://abcdefghijklmnopqrst.supabase.co',key:'x.'+Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')+'.x'}));
});
test('net-minute computed field passes through the existing authenticated table route, without RPC access',async()=>{
 const f=setup(true);await f.link();
 const query='select=id,paidMinutes:review_net_minutes&work_date=gte.2026-11-01';
 const r=await f.run('/tunnit/supabase/rest/v1/time_entries?'+query);
 assert.equal(r.status,200);
 const call=f.calls.find(c=>c.url.includes('/time_entries?'));
 assert.equal(new URL(call.url).searchParams.get('select'),'id,paidMinutes:review_net_minutes');
 assert.equal(call.options.headers.Authorization,'Bearer secret-access');
 assert.equal((await f.run('/tunnit/supabase/rest/v1/rpc/review_net_minutes')).status,403);
});
test('anonymous and non-pilot portal users cannot open any bridge data',async()=>{
 const f=setup();assert.equal((await f.run('/tunnit/session','GET',undefined,{cookie:''})).status,401);
 f.user.username='other';assert.equal((await f.run()).status,403);assert.equal(f.calls.length,0);
});
test('unlinked status gives only expected email and CSRF, not tokens',async()=>{const f=setup(),r=await f.run();assert.deepEqual(r.json(),{linked:false,csrf:f.s.csrf,email,emailLocked:true});assert.equal(f.calls.length,0);});
test('link requires consent, same origin and exact portal session CSRF',async()=>{
 for(const overrides of [{origin:'https://other.test'},{'x-tjt-csrf':'bad'},{'sec-fetch-site':'cross-site'},{host:'evil.test'}]){const f=setup();assert.equal((await f.run('/tunnit/link','POST',{email,password:'test',consent:true},overrides)).status,403);assert.equal(f.calls.length,0);}
 const f=setup();assert.equal((await f.run('/tunnit/link','POST',{email,password:'test'})).status,400);assert.equal(f.calls.length,0);
});
test('link verifies real identity, stores only encrypted grant, no password or access token',async()=>{
 const f=setup();await f.link();const file=fs.readFileSync(f.vault.file(f.user.id),'utf8');assert.doesNotMatch(file,/secret-refresh|test-only-password|secret-access/);
 const saved=f.vault.read(f.user.id);assert.equal(saved.userId,uid);assert.equal(saved.refreshToken,'secret-refresh-0');assert.equal(saved.password,undefined);assert.equal(saved.accessToken,undefined);
 const state=await f.run();assert.equal(state.json().linked,true);assert.doesNotMatch(state.bytes.toString(),/secret-access|secret-refresh|password/);
});
test('vault is bound to portal UUID and detects tampering',async()=>{
 const f=setup();await f.link();fs.copyFileSync(f.vault.file(f.user.id),f.vault.file('different-user'));assert.throws(()=>f.vault.read('different-user'));
 const record=JSON.parse(fs.readFileSync(f.vault.file(f.user.id)));record.data=Buffer.from('bad').toString('base64');fs.writeFileSync(f.vault.file(f.user.id),JSON.stringify(record));assert.throws(()=>f.vault.read(f.user.id));
});
test('wrong Supabase identity or worker-only role cannot be linked',async()=>{
 for(const change of [f=>f.identity.user.email='other@example.test',f=>f.identity.profile.role='worker',f=>f.identity.profile.active=false]){const f=setup();change(f);const r=await f.run('/tunnit/link','POST',{email,password:'test',consent:true});assert.equal(r.status,403);assert.equal(f.vault.read(f.user.id),null);assert.ok(f.calls.some(c=>c.url.includes('/logout?scope=local')));}
});
test('five failed link attempts are rate limited without ending the portal session',async()=>{const f=setup();f.setFailAuth(true);for(let i=0;i<5;i++)assert.equal((await f.run('/tunnit/link','POST',{email,password:'test',consent:true})).status,400);assert.equal((await f.run('/tunnit/link','POST',{email,password:'test',consent:true})).status,429);assert.ok(f.auth.sessions.has(f.key));});
test('REST proxy uses the bound token, ignores caller credentials and preserves pagination',async()=>{
 const f=setup();await f.link();const r=await f.run('/tunnit/supabase/rest/v1/time_entries?select=id','GET',undefined,{authorization:'Bearer attacker',apikey:'attacker','accept-profile':'private',range:'0-499'});
 assert.equal(r.status,200);const c=f.calls.at(-1);assert.equal(c.options.headers.Authorization,'Bearer secret-access');assert.equal(c.options.headers.apikey,'sb_publishable_test');assert.equal(c.options.headers['accept-profile'],undefined);assert.equal(c.options.headers.cookie,undefined);assert.equal(c.options.headers.range,'0-499');assert.equal(r.headers['content-range'],'0-0/1');assert.equal(r.headers['set-cookie'],undefined);
});
test('unknown routes, RPC, token minting, storage and redirects fail closed',async()=>{
 const f=setup();await f.link();for(const url of ['/tunnit/supabase/auth/v1/token','/tunnit/supabase/rest/v1/rpc/admin','/tunnit/supabase/storage/v1/object/foo','/tunnit/supabase/functions/v1/login-with-phone','/tunnit/supabase/rest/v1/auth_users'])assert.equal((await f.run(url,'POST',{})).status,403);
 assert.ok(f.calls.every(c=>new URL(c.url).origin==='https://abcdefghijklmnopqrst.supabase.co'&&c.options.redirect==='error'));
});
test('logout immediately blocks subsequent GET and PATCH, independent of JWT lifetime',async()=>{
 const f=setup();await f.link();f.auth.sessions.delete(f.key);const n=f.calls.length;
 for(const method of ['GET','PATCH'])assert.equal((await f.run('/tunnit/supabase/rest/v1/time_entries',method,method==='GET'?undefined:{status:'approved'})).status,401);
 assert.equal(f.calls.length,n);
});
test('disable, forced password change, removed company access and expired session block data',async()=>{
 for(const change of [f=>f.user.active=false,f=>f.user.mustChange=true,f=>f.user.grants.tjt.laskenta='none',f=>f.s.expires=1,f=>f.setNow(2800001)]){const f=setup();await f.link();change(f);const r=await f.run('/tunnit/supabase/rest/v1/time_entries');assert.ok([401,403].includes(r.status));}
});
test('status polling never extends the 30 minute inactivity limit',async()=>{
 const f=setup();await f.link();f.setNow(1500000);assert.equal((await f.run()).status,200);assert.equal(f.s.last,1000000);f.setNow(2800001);assert.equal((await f.run()).status,401);
});
test('current Supabase active state and organization are checked before every data request',async()=>{
 for(const change of [f=>f.identity.profile.active=false,f=>f.identity.profile.organization_id='different',f=>f.identity.user.id='33333333-3333-4333-8333-333333333333']){const f=setup();await f.link();change(f);assert.equal((await f.run('/tunnit/supabase/rest/v1/time_entries')).status,403);assert.ok(!f.calls.some(c=>c.url.includes('/time_entries')));}
});
test('parallel requests serialize refresh rotation and persist the latest token',async()=>{
 const f=setup();await f.link();f.bridge.tokens.clear();await Promise.all([f.run(),f.run(),f.run()]);assert.equal(f.refreshCount,1);assert.equal(f.vault.read(f.user.id).refreshToken,'secret-refresh-1');
});
test('revocation during upstream identity check does not authorize a pending write',async()=>{
 const f=setup();await f.link();const original=f.bridge.fetch;f.bridge.fetch=async(url,options)=>{const r=await original(url,options);if(url.endsWith('/auth/v1/user'))f.auth.sessions.delete(f.key);return r;};
 assert.equal((await f.run('/tunnit/supabase/rest/v1/time_entries','PATCH',{status:'approved'})).status,401);assert.ok(!f.calls.some(c=>c.url.includes('/time_entries')));
});
test('unlink removes persistent credentials and revokes only the linked Supabase session',async()=>{
 const f=setup();await f.link();assert.equal((await f.run('/tunnit/unlink','POST',{})).status,200);assert.equal(f.vault.read(f.user.id),null);assert.equal(f.bridge.tokens.size,0);assert.ok(f.calls.some(c=>c.url.includes('/logout?scope=local')));assert.ok(f.auth.sessions.has(f.key));
});
test('read-only portal rejects mutations before touching Supabase',async()=>{const f=setup();f.bridge.readOnly=true;assert.equal((await f.run('/tunnit/link','POST',{email,password:'test',consent:true})).status,403);assert.equal(f.calls.length,0);});
test('public login and unrelated portal routes are not intercepted',async()=>{const f=setup();assert.equal((await f.run('/portal-api/login','POST',{username:'test'})).handled,false);assert.equal((await f.run('/laatuvahti/')).handled,false);});
test('foremen mode accepts another active manager and their own email, not only the pilot',async()=>{
 const f=setup(true);f.user.owner=false;f.user.username='test.foreman';f.identity.user.email=f.identity.profile.email='foreman@example.test';f.identity.profile.role='foreman';
 const status=await f.run();assert.equal(status.json().emailLocked,false);assert.equal(status.json().email,'');
 const r=await f.run('/tunnit/link','POST',{email:'  Foreman@example.test  ',password:'test',consent:true});assert.equal(r.status,200,r.bytes.toString());
 assert.equal(f.vault.read(f.user.id).email,'foreman@example.test');assert.equal((await f.run()).json().linked,true);
});
test('foremen mode blocks workers, inactive managers, another tenant and forged email',async()=>{
 for(const change of [f=>f.identity.profile.role='worker',f=>f.identity.profile.active=false,f=>f.identity.profile.organization_id='33333333-3333-4333-8333-333333333333',f=>f.identity.user.email='someone-else@example.test']){
  const f=setup(true);change(f);const r=await f.run('/tunnit/link','POST',{email,password:'test',consent:true});assert.equal(r.status,403);assert.equal(f.vault.read(f.user.id),null);
 }
});
test('foremen mode is tenant pinned and refuses missing or invalid organization id',()=>{
 const f=setup(true);for(const organizationId of ['',undefined,'invalid'])assert.throws(()=>new Bridge({...f.bridge,config:{...f.bridge.config,organizationId}}));
});
test('existing pilot grant keeps working after switching to foremen mode without a new password',async()=>{
 const f=setup();await f.link();const before=fs.readFileSync(f.vault.file(f.user.id));f.bridge.foremen=true;f.bridge.config.organizationId=org;
 const r=await f.run();assert.equal(r.json().linked,true);assert.deepEqual(fs.readFileSync(f.vault.file(f.user.id)),before);
 assert.equal(f.calls.filter(c=>c.url.includes('grant_type=password')).length,1);
});
test('another portal account cannot link an already-linked Supabase identity',async()=>{
 const f=setup(true);await f.link();const second={...f.user,id:'second-portal-user',username:'other.foreman',owner:false};const cookie='b'.repeat(43);f.auth.users.push(second);f.auth.sessions.set(crypto.createHash('sha256').update(cookie).digest('hex'),{...f.s,uid:second.id});
 const r=await f.run('/tunnit/link','POST',{email,password:'test',consent:true},{cookie:'__Host-tjt_session='+cookie});assert.equal(r.status,409);assert.equal(f.vault.read(second.id),null);assert.ok(f.vault.read(f.user.id));
});
test('parallel linking from two portal accounts permits only one binding of the same identity',async()=>{
 const f=setup(true);const second={...f.user,id:'second-portal-user',username:'other.foreman',owner:false};const cookie='b'.repeat(43);f.auth.users.push(second);f.auth.sessions.set(crypto.createHash('sha256').update(cookie).digest('hex'),{...f.s,uid:second.id});
 const data={email,password:'test',consent:true};const results=await Promise.all([f.run('/tunnit/link','POST',data),f.run('/tunnit/link','POST',data,{cookie:'__Host-tjt_session='+cookie})]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
});
test('foreman cannot call admin functions or password recovery, even with a valid link',async()=>{
 const f=setup(true);f.identity.profile.role='foreman';await f.link();
 for(const route of ['functions/v1/create-user','auth/v1/recover'])assert.equal((await f.run('/tunnit/supabase/'+route,'POST',{})).status,403);
 assert.ok(!f.calls.some(c=>c.url.includes('/functions/')||c.url.includes('/recover')));
});
test('foreman revocation, worker downgrade and loss of TJT access block subsequent data',async()=>{
 for(const change of [f=>f.auth.sessions.delete(f.key),f=>f.user.active=false,f=>f.user.grants.tjt={laskenta:'none'},f=>f.identity.profile.role='worker']){
  const f=setup(true);f.user.owner=false;f.user.username='test.foreman';f.identity.profile.role='foreman';await f.link();change(f);
  assert.ok([401,403].includes((await f.run('/tunnit/supabase/rest/v1/time_entries')).status));assert.ok(!f.calls.some(c=>c.url.includes('/time_entries')));
 }
});
test('two managers retain independent bound tokens, refresh grants and signouts',async()=>{
 const f=setup(true),cookie='b'.repeat(43),second={...f.user,id:'second-portal-user',username:'other.foreman',owner:false};
 f.auth.users.push(second);f.auth.sessions.set(crypto.createHash('sha256').update(cookie).digest('hex'),{...f.s,uid:second.id});
 const people=[{id:uid,email,token:'access-one',refresh:'refresh-one'},{id:'33333333-3333-4333-8333-333333333333',email:'foreman@example.test',token:'access-two',refresh:'refresh-two'}];
 f.bridge.fetch=async(url,opts)=>{f.calls.push({url,options:opts});const u=new URL(url);if(u.pathname==='/auth/v1/token'){const b=JSON.parse(opts.body),p=people.find(p=>p.email===b.email||p.refresh===b.refresh_token);return Response.json({access_token:p.token,refresh_token:p.refresh,expires_in:3600,user:{id:p.id,email:p.email}});}if(u.pathname==='/auth/v1/logout')return new Response(null,{status:204});const p=people.find(p=>'Bearer '+p.token===opts.headers.Authorization);assert.ok(p);if(u.pathname==='/auth/v1/user')return Response.json({id:p.id,email:p.email});if(u.pathname==='/rest/v1/profiles')return Response.json([{id:p.id,email:p.email,organization_id:org,role:'foreman',active:true}]);return Response.json([{authorizedUser:p.id}]);};
 await f.link();const h={cookie:'__Host-tjt_session='+cookie};assert.equal((await f.run('/tunnit/link','POST',{email:people[1].email,password:'test',consent:true},h)).status,200);
 assert.equal((await f.run('/tunnit/supabase/rest/v1/time_entries')).json()[0].authorizedUser,uid);
 assert.equal((await f.run('/tunnit/supabase/rest/v1/time_entries','GET',undefined,h)).json()[0].authorizedUser,people[1].id);
 f.auth.sessions.delete(f.key);assert.equal((await f.run()).status,401);assert.equal((await f.run('/tunnit/session','GET',undefined,h)).json().linked,true);
 assert.notEqual(f.vault.read(f.user.id).refreshToken,f.vault.read(second.id).refreshToken);
});
