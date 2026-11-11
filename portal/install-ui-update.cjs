'use strict';
const fs=require('node:fs'),path=require('node:path'),https=require('node:https'),crypto=require('node:crypto');
const {preflight,updateManifest,validateMetadata,netSchemaReady}=require('./ui-upgrade.cjs');
const {publicConfig}=require('./bridge.cjs'),{expect,sha}=require('./package-tools.cjs');
const app=String.raw`C:\TJT\Ohjelmat\TJT-Portaali-v1`,settings=String.raw`C:\TJT\Asetukset\TJT-Portaali-v1\tuntivahti`;
const meta=JSON.parse(fs.readFileSync(path.join(__dirname,'update.json'),'utf8'));
function readConfig(){const c=JSON.parse(fs.readFileSync(path.join(settings,'config.json'),'utf8').replace(/^\uFEFF/,''));publicConfig(c);expect(c.enabled===true&&c.mode==='foremen'&&/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(c.organizationId||''),'Asenna ensin toimiva Tunnit-SSO 1.1 -tyonjohtoversio.');return c;}
async function schema(){
 const c=readConfig(),get=route=>fetch(c.url+route,{headers:{apikey:c.key},signal:AbortSignal.timeout(10000),redirect:'error'});
 const site=await get('/rest/v1/worksites?select=allowed_littera_ids&limit=0');
 expect(site.status===200,'Tyomaalitteroiden tietokantapaivitys puuttuu tai Supabase ei vastaa. Mitaan ei paivitetty.');
 const net=await get('/rest/v1/time_entries?select=review_net_minutes&limit=0');
 expect(netSchemaReady(net.status,await net.json()),'Tunnit 1.3 -nettolaskennan skeema tai kirjautumattoman kayton esto ei vastaa odotettua. Mitaan ei paivitetty.');
}
function request(host,url='/'){return new Promise((resolve,reject)=>{
 // Local anonymous health check only; the server's TLS settings are unchanged.
 const req=https.request({hostname:'127.0.0.1',port:4182,path:url,method:'GET',rejectUnauthorized:false,headers:{Host:host}},res=>{const chunks=[];let size=0;res.on('data',b=>{size+=b.length;if(size>2097152){req.destroy(Error('Tarkistusvastaus liian suuri.'));return;}chunks.push(b);});res.on('error',reject);res.on('end',()=>resolve({status:res.statusCode,body:Buffer.concat(chunks)}));});req.setTimeout(10000,()=>req.destroy(Error('Tarkistuksen aikakatkaisu.')));req.on('error',reject);req.end();
});}
async function probe(){
 for(const[f,h]of Object.entries(meta.payload))expect(sha(path.join(app,f))===h,'Selainresurssi ei vastaa pakettia: '+f);
 for(const host of ['10.15.10.3:4182','tjt-palvelin.tail528926.ts.net']){
  expect((await request(host)).status===200,'Portaali ei avaudu: '+host);
  const js=await request(host,'/portal.js');expect(js.status===200&&crypto.createHash('sha256').update(js.body).digest('hex')===meta.baseline['app/web/portal.js'],'Tunnit-kortti on muuttunut.');
  for(const route of ['/tunnit/','/tunnit/session','/tunnit/supabase/rest/v1/worksites']){const r=await request(host,route);expect(r.status===401&&JSON.parse(r.body).code==='PORTAL_SESSION_ENDED','Kirjautumattoman kayton esto ei toimi: '+route);}
 }
 console.log('Uudet selainresurssit, portaali ja kirjautumattoman kayton esto tarkistettu.');
}
if(require.main===module)(async()=>{expect(process.platform==='win32','Aja paivitys Windows-palvelimella.');validateMetadata(meta);const mode=process.argv[2];if(mode==='preflight'){preflight(app,__dirname,meta);await schema();}else if(mode==='manifest')updateManifest(app,meta);else if(mode==='probe')await probe();else throw Error('Tuntematon tarkistus.');})().catch(e=>{console.error(e.message);process.exitCode=1;});
