'use strict';
// Run against the user's retrieved source archives. Creates synthetic users only.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {Bridge,Vault}=require('./bridge.cjs'),{once}=require('./package-tools.cjs');
const sources=path.resolve(process.argv[2]);
(async()=>{
 let source=fs.readFileSync(path.join(sources,'aikataulu-1.6','payload','app','auth.cjs'),'utf8');
 source=once(source,'const apps=[',"const apps=[['laatuvahti','Laatuvahti','Laatumatriisit, katselmukset ja pöytäkirjat'],");
 source=once(source,'if(this.users.some(u=>!validGrants(u.grants)))',"for(const u of this.users)for(const g of Object.values(u.grants||{}))if(g&&typeof g==='object'&&!Object.hasOwn(g,'laatuvahti'))g.laatuvahti=u.owner?'edit':'none';if(this.users.some(u=>!validGrants(u.grants)))");
 assert.equal(crypto.createHash('sha256').update(source).digest('hex'),'2e1abb03684683b27dce964f5d3fa209413f887f3fae1ba6ae84f991fc6a19f5');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tunti-auth-contract-'));fs.writeFileSync(path.join(dir,'auth.cjs'),source);fs.copyFileSync(path.join(sources,'tuotanto-v1','app','companies.cjs'),path.join(dir,'companies.cjs'));
 const {Auth,emptyGrants,passwordHash}=require(path.join(dir,'auth.cjs'));
 const grants=emptyGrants();grants.tjt.laskenta='edit';const user={id:crypto.randomUUID(),username:'mika.viljanen',name:'Testaaja Esimerkki',owner:true,admin:true,active:true,mustChange:false,grants,password:await passwordHash('Synthetic test only 123!')};
 fs.writeFileSync(path.join(dir,'users.json'),JSON.stringify({version:2,users:[user]}));
 const auth=new Auth(dir),login=await auth.login('mika.viljanen','Synthetic test only 123!','127.0.0.1');
 const bridge=new Bridge({auth,hosts:new Set(['portal.test']),config:{url:'https://abcdefghijklmnopqrst.supabase.co',key:'sb_publishable_test',pilotUsername:user.username,expectedEmail:'mika.viljanen@julkisivutekniikka.fi'},vault:new Vault(path.join(dir,'grants'),crypto.randomBytes(32)),publicDir:dir,fetchImpl:()=>{throw Error('No external network in contract test.');}});
 const req={headers:{cookie:'__Host-tjt_session='+login.token}};const ctx=bridge.context(req);assert.equal(ctx.u.id,user.id);assert.equal(ctx.s.csrf,login.csrf);
 auth.logout(auth.session(req));assert.throws(()=>bridge.context(req),e=>e.status===401);
 const again=await auth.login('mika.viljanen','Synthetic test only 123!','127.0.0.1');req.headers.cookie='__Host-tjt_session='+again.token;assert.equal(bridge.context(req).u.id,user.id);auth.revoke(user.id);assert.throws(()=>bridge.context(req),e=>e.status===401);
 console.log('PASS: exact installed Auth source hash, real login, cookie contract, logout, revoke, re-login. Synthetic users only.');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
