'use strict';
// Portal BFF: browser receives no Supabase access/refresh tokens. Every request
// is gated by the live portal session, then by the linked user's Supabase RLS.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const TABLES=new Set(['profiles','organizations','employers','worksites','litteras','time_entries','day_notes','payroll_periods']);
const WRITE=new Set(['POST','PATCH','PUT','DELETE']);
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
const failure=(message,status=400)=>Object.assign(Error(message),{status});
function json(res,status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
async function body(req,limit=65536){let size=0;const chunks=[];for await(const b of req){size+=b.length;if(size>limit)throw failure('Pyyntö on liian suuri.',413);chunks.push(b);}return Buffer.concat(chunks);}
function publicConfig(value){
 const url=new URL(value.url);
 if(url.protocol!=='https:'||!/^([a-z0-9]{20})\.supabase\.co$/.test(url.hostname)||url.port||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('Virheellinen Supabase-osoite.');
 let allowed=typeof value.key==='string'&&/^sb_publishable_[A-Za-z0-9_-]+$/.test(value.key);
 if(!allowed&&typeof value.key==='string')try{allowed=JSON.parse(Buffer.from(value.key.split('.')[1],'base64url')).role==='anon';}catch{}
 if(!allowed)throw Error('Tarvitaan julkinen publishable/anon-avain, ei ylläpitoavainta.');
 return {url:url.origin,key:value.key};
}
class Vault {
 constructor(dir,key){if(!Buffer.isBuffer(key)||key.length!==32)throw Error('Salausavain puuttuu.');this.dir=dir;this.key=key;}
 file(id){if(!/^[a-zA-Z0-9_-]{1,100}$/.test(id))throw Error('Virheellinen käyttäjätunniste.');return path.join(this.dir,id+'.json');}
 read(id){const file=this.file(id);if(!fs.existsSync(file))return null;if(fs.lstatSync(file).isSymbolicLink())throw Error('Yhteystiedoston polku ei kelpaa.');const item=JSON.parse(fs.readFileSync(file,'utf8'));if(item.v!==1)throw Error('Tuntematon salausmuoto.');const decipher=crypto.createDecipheriv('aes-256-gcm',this.key,Buffer.from(item.iv,'base64'));decipher.setAAD(Buffer.from(id));decipher.setAuthTag(Buffer.from(item.tag,'base64'));return JSON.parse(Buffer.concat([decipher.update(Buffer.from(item.data,'base64')),decipher.final()]).toString('utf8'));}
 write(id,value){fs.mkdirSync(this.dir,{recursive:true,mode:0o700});const file=this.file(id);if(fs.existsSync(file)&&fs.lstatSync(file).isSymbolicLink())throw Error('Yhteystiedoston polku ei kelpaa.');const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',this.key,iv);cipher.setAAD(Buffer.from(id));const data=Buffer.concat([cipher.update(JSON.stringify(value)),cipher.final()]);const tmp=file+'.tmp-'+crypto.randomUUID();fs.writeFileSync(tmp,JSON.stringify({v:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')}),{flag:'wx',mode:0o600});fs.renameSync(tmp,file);}
 remove(id){const file=this.file(id);if(fs.existsSync(file))fs.unlinkSync(file);}
}
class Bridge {
 constructor({auth,hosts,readOnly=false,config,vault,publicDir,fetchImpl=fetch,clock=Date.now}){
  if(!auth?.sessions||!auth?.users||typeof auth.session!=='function')throw Error('Portaalin kirjautumisrajapinta ei täsmää.');
  this.auth=auth;this.hosts=hosts;this.readOnly=readOnly;this.config=config;this.upstream=publicConfig(config);this.vault=vault;this.publicDir=publicDir;this.fetch=fetchImpl;this.clock=clock;this.tokens=new Map();this.locks=new Map();this.attempts=new Map();
  if(config.pilotUsername!=='mika.viljanen'||config.expectedEmail!=='mika.viljanen@julkisivutekniikka.fi')throw Error('Pilotin käyttäjärajaus puuttuu.');
 }
 context(req,touch=false){
  // Read-only status polling must NOT renew the portal's inactivity deadline.
  const match=(req.headers.cookie||'').match(/(?:^|;\s*)__Host-tjt_session=([A-Za-z0-9_-]{43})(?:;|$)/);
  const key=match?digest(match[1]):'',s=this.auth.sessions.get(key),u=s&&this.auth.users.find(x=>x.id===s.uid),now=this.clock();
  if(!s||!u?.active||u.mustChange||s.expires<=now||s.last+1800000<=now)throw failure('Portaalin istunto on päättynyt. Kirjaudu portaaliin uudelleen.',401);
  if(!u.owner||u.username!==this.config.pilotUsername||!Object.values(u.grants?.tjt||{}).some(x=>x==='read'||x==='edit'))throw failure('Kertakirjautumisen pilotti on rajattu Mikan tunnukselle.',403);
  if(touch)s.last=now;
  return {key,s,u};
 }
 current(ctx){const s=this.auth.sessions.get(ctx.key),u=this.auth.users.find(x=>x.id===ctx.u.id),now=this.clock();if(s!==ctx.s||!u?.active||u.mustChange||!u.owner||u.username!==this.config.pilotUsername||s.expires<=now||s.last+1800000<=now||!Object.values(u.grants?.tjt||{}).some(x=>x==='read'||x==='edit'))throw failure('Portaalin käyttöoikeus tai istunto päättyi.',401);}
 async locked(uid,fn){const previous=this.locks.get(uid)||Promise.resolve();const pending=previous.catch(()=>{}).then(fn);this.locks.set(uid,pending);try{return await pending;}finally{if(this.locks.get(uid)===pending)this.locks.delete(uid);}}
 async call(route,{method='GET',token,body:payload,headers={}}={}){
  const response=await this.fetch(this.upstream.url+route,{method,headers:{apikey:this.upstream.key,...(token?{Authorization:'Bearer '+token}:{}),...headers},...(payload===undefined?{}:{body:payload}),redirect:'error',signal:AbortSignal.timeout(15000)});
  const length=Number(response.headers.get('content-length')||0);if(length>10*1024*1024)throw failure('Vastaus on liian suuri.',502);
  const chunks=[];let size=0;if(response.body)for await(const part of response.body){size+=part.length;if(size>10*1024*1024)throw failure('Vastaus on liian suuri.',502);chunks.push(part);}
  return {status:response.status,ok:response.ok,headers:response.headers,bytes:Buffer.concat(chunks)};
 }
 async authCall(route,payload){const r=await this.call(route,{method:'POST',body:JSON.stringify(payload),headers:{'Content-Type':'application/json'}});if(!r.ok)throw failure('Tuntivahdin kirjautuminen ei onnistunut. Tarkista tunnukset tai yhdistä tili uudelleen.',r.status===429?429:401);try{return JSON.parse(r.bytes);}catch{throw failure('Kirjautumispalvelun vastaus ei kelpaa.',502);}}
 async inspect(token){
  const userResponse=await this.call('/auth/v1/user',{token});if(!userResponse.ok)throw failure('Tuntivahdin kirjautumisyhteys on päättynyt. Yhdistä tili uudelleen.',401);
  const user=JSON.parse(userResponse.bytes);if(typeof user.id!=='string'||!/^[-a-f0-9]{36}$/.test(user.id)||user.email?.toLowerCase()!==this.config.expectedEmail)throw failure('Tuntivahti-tili ei vastaa pilotille määritettyä henkilöä.',403);
  const profileResponse=await this.call('/rest/v1/profiles?id=eq.'+user.id+'&select=id,organization_id,full_name,email,role,active',{token});
  if(!profileResponse.ok)throw failure('Tuntivahdin käyttöoikeutta ei voitu varmistaa.',403);
  const profiles=JSON.parse(profileResponse.bytes),p=Array.isArray(profiles)&&profiles.length===1?profiles[0]:null;
  if(!p?.active||p.id!==user.id||!['admin','foreman'].includes(p.role)||!p.organization_id||p.email?.toLowerCase()!==this.config.expectedEmail)throw failure('Tuntivahti-tilillä ei ole aktiivista työnjohto-oikeutta.',403);
  return {user:{id:user.id,email:user.email},profile:p};
 }
 saveToken(uid,data,binding){if(typeof data.access_token!=='string'||typeof data.refresh_token!=='string'||data.user?.id!==binding.userId||!Number.isFinite(data.expires_in)||data.expires_in<=0)throw failure('Kirjautumispalvelun vastaus ei kelpaa.',502);this.vault.write(uid,{...binding,refreshToken:data.refresh_token});this.tokens.set(uid,{accessToken:data.access_token,until:this.clock()+data.expires_in*1000});}
 async grant(ctx){return this.locked(ctx.u.id,async()=>{
  this.current(ctx);const binding=this.vault.read(ctx.u.id);if(!binding)throw failure('Yhdistä ensin oma Tuntivahti-tilisi.',409);
  if(binding.email!==this.config.expectedEmail)throw failure('Tunnusyhdistys ei kelpaa.',403);
  let token=this.tokens.get(ctx.u.id);
  if(!token||token.until<=this.clock()+60000){const refreshed=await this.authCall('/auth/v1/token?grant_type=refresh_token',{refresh_token:binding.refreshToken});this.current(ctx);this.saveToken(ctx.u.id,refreshed,binding);token=this.tokens.get(ctx.u.id);}
  const identity=await this.inspect(token.accessToken);this.current(ctx);
  if(identity.user.id!==binding.userId||identity.profile.organization_id!==binding.organizationId)throw failure('Tuntivahdin tunnusyhdistys on muuttunut.',403);
  return {...identity,token:token.accessToken};
 });}
 async revokeToken(token){try{await this.call('/auth/v1/logout?scope=local',{method:'POST',token});}catch{/* Portal authorization is already removed locally; no secret/error logging. */}}
 async link(ctx,input){return this.locked(ctx.u.id,async()=>{
  this.current(ctx);if(this.vault.read(ctx.u.id))throw failure('Tili on jo yhdistetty. Poista vanha yhdistys ennen vaihtamista.',409);
  if(input.consent!==true||input.email?.trim().toLowerCase()!==this.config.expectedEmail||typeof input.password!=='string'||!input.password||input.password.length>256)throw failure('Tarkista sähköposti, salasana ja yhdistämisen hyväksyntä.');
  const now=this.clock(),attempt=this.attempts.get(ctx.u.id)||{count:0,until:now+900000};if(attempt.until<=now){attempt.count=0;attempt.until=now+900000;}if(attempt.count>=5)throw failure('Liian monta yhdistämisyritystä. Odota 15 minuuttia.',429);attempt.count++;this.attempts.set(ctx.u.id,attempt);
  const data=await this.authCall('/auth/v1/token?grant_type=password',{email:this.config.expectedEmail,password:input.password}).catch(e=>{if(e.status===401)e.status=400;throw e;});
  try{const identity=await this.inspect(data.access_token);this.current(ctx);this.saveToken(ctx.u.id,data,{userId:identity.user.id,organizationId:identity.profile.organization_id,email:this.config.expectedEmail});this.auth.audit('tuntivahti_linked',ctx.u.username,identity.user.id);return identity;}catch(e){if(data.access_token)await this.revokeToken(data.access_token);throw e;}
 });}
 async unlink(ctx){return this.locked(ctx.u.id,async()=>{this.current(ctx);const token=this.tokens.get(ctx.u.id);this.vault.remove(ctx.u.id);this.tokens.delete(ctx.u.id);this.auth.audit('tuntivahti_unlinked',ctx.u.username);if(token)await this.revokeToken(token.accessToken);});}
 async handle(req,res){
  const url=new URL(req.url,'https://local');if(!(url.pathname==='/tunnit'||url.pathname.startsWith('/tunnit/')))return false;
  try{
   res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
   if(!this.hosts.has(req.headers.host))throw failure('Tuntematon palvelinosoite.',403);
   if(req.headers['sec-fetch-site']==='cross-site')throw failure('Pyyntö eri sivustolta estettiin.',403);
   const isStatus=url.pathname==='/tunnit/session',ctx=this.context(req,!isStatus);
   if(WRITE.has(req.method)){
    if(this.readOnly)throw failure('Tarkistusympäristössä tallennus on estetty.',403);
    if(req.headers.origin!=='https://'+req.headers.host||req.headers['x-tjt-csrf']!==ctx.s.csrf)throw failure('Istunnon vahvistus puuttuu. Päivitä sivu.',403);
   }
   if(isStatus&&req.method==='GET'){
    const linked=!!this.vault.read(ctx.u.id);if(!linked){json(res,200,{linked:false,csrf:ctx.s.csrf,email:this.config.expectedEmail});return true;}
    try{const identity=await this.grant(ctx);json(res,200,{linked:true,csrf:ctx.s.csrf,user:identity.user});}catch(e){this.current(ctx);if([401,403].includes(e.status)){json(res,200,{linked:false,reconnect:true,csrf:ctx.s.csrf,email:this.config.expectedEmail,message:'Tuntivahdin kirjautumisyhteys pitää yhdistää uudelleen.'});}else throw e;}return true;
   }
   if(url.pathname==='/tunnit/link'&&req.method==='POST'){await this.link(ctx,JSON.parse(await body(req,4096)));json(res,200,{ok:true});return true;}
   if(url.pathname==='/tunnit/unlink'&&req.method==='POST'){await this.unlink(ctx);json(res,200,{ok:true});return true;}
   if(url.pathname.startsWith('/tunnit/supabase/')){
    const route=url.pathname.slice('/tunnit/supabase'.length);const table=route.match(/^\/rest\/v1\/([a-z_]+)$/);
    const functionCall=route==='/functions/v1/create-user'&&req.method==='POST';const recovery=route==='/auth/v1/recover'&&req.method==='POST';
    if(!(table&&TABLES.has(table[1])&&['GET','HEAD','POST','PATCH','DELETE'].includes(req.method))&&!functionCall&&!recovery)throw failure('Rajapintaa ei ole sallittu.',403);
    const identity=await this.grant(ctx);if((functionCall||recovery)&&identity.profile.role!=='admin')throw failure('Toiminto vaatii Tuntivahdin pääkäyttäjäoikeuden.',403);
    const payload=WRITE.has(req.method)?await body(req):undefined;this.current(ctx);
    const headers={};for(const h of ['content-type','accept','prefer','range','range-unit','x-client-info'])if(typeof req.headers[h]==='string')headers[h]=req.headers[h];
    // Never forward browser Authorization/apikey/cookie/schema headers.
    let query=url.search;if(recovery)query='?redirect_to='+encodeURIComponent('https://tuntivahti.vercel.app/');
    const r=await this.call(route+query,{method:req.method,token:identity.token,body:payload,headers});this.current(ctx);
    for(const h of ['content-type','content-range','preference-applied','range-unit']){const v=r.headers.get(h);if(v)res.setHeader(h,v);}res.writeHead(r.status);res.end(r.bytes);return true;
   }
   if(req.method==='GET'&&(url.pathname==='/tunnit'||url.pathname==='/tunnit/')){if(url.pathname==='/tunnit'){res.writeHead(303,{Location:'/tunnit/'});res.end();return true;}res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fs.readFileSync(path.join(this.publicDir,'index.html')));return true;}
   const asset=url.pathname.match(/^\/tunnit\/assets\/([A-Za-z0-9_.-]+\.(js|css))$/);
   if(req.method==='GET'&&asset){const file=path.join(this.publicDir,'assets',asset[1]);if(!fs.existsSync(file)||fs.lstatSync(file).isSymbolicLink())throw failure('Tiedostoa ei löytynyt.',404);res.setHeader('Content-Type',asset[2]==='js'?'application/javascript; charset=utf-8':'text/css; charset=utf-8');res.end(fs.readFileSync(file));return true;}
   throw failure('Sivua ei löytynyt.',404);
  }catch(e){const status=e.status||502;json(res,status,{error:e.status?e.message:'Tuntivahti-yhteys ei onnistunut. Yritä uudelleen.',code:status===401?'PORTAL_SESSION_ENDED':status===409?'LINK_REQUIRED':'PORTAL_REQUEST_FAILED'});return true;}
 }
}
module.exports={Bridge,Vault,publicConfig};
