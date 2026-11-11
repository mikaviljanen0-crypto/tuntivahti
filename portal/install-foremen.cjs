'use strict';
const fs=require('node:fs'),path=require('node:path'),https=require('node:https'),crypto=require('node:crypto');
const {configuration,preflight,updateManifest}=require('./foremen-upgrade.cjs');
const {Vault}=require('./bridge.cjs'),{expect}=require('./package-tools.cjs');
const app=String.raw`C:\TJT\Ohjelmat\TJT-Portaali-v1`,settings=String.raw`C:\TJT\Asetukset\TJT-Portaali-v1\tuntivahti`;
const meta=JSON.parse(fs.readFileSync(path.join(__dirname,'update.json'),'utf8'));
function nextConfig(){
 const {readConfig,unprotect}=require(path.join(app,'settings.cjs')),{Auth}=require(path.join(app,'app','auth.cjs'));
 const previous=JSON.parse(fs.readFileSync(path.join(settings,'config.json'),'utf8').replace(/^\uFEFF/,''));
 const key=Buffer.from(unprotect('bridge-key.dpapi',settings),'base64');
 const auth=new Auth(readConfig().dir);
 return configuration(previous,auth.users,new Vault(path.join(settings,'grants'),key));
}
function migrate(){const next=nextConfig(),file=path.join(settings,'config.json'),tmp=file+'.tmp-'+crypto.randomUUID();fs.writeFileSync(tmp,JSON.stringify(next,null,2)+'\n',{flag:'wx'});fs.renameSync(tmp,file);console.log('Työnjohdon kirjautuminen rajattu pilotissa vahvistettuun TJT-organisaatioon. Nykyiset yhdistykset säilytettiin.');}
function request(host,url='/'){return new Promise((resolve,reject)=>{
 // Loopback-only unauthenticated check; production certificate settings unchanged.
 const req=https.request({hostname:'127.0.0.1',port:4182,path:url,method:'GET',rejectUnauthorized:false,headers:{Host:host}},res=>{const chunks=[];let size=0;res.on('data',b=>{size+=b.length;if(size>2097152){req.destroy(Error('Tarkistusvastaus liian suuri.'));return;}chunks.push(b);});res.on('error',reject);res.on('end',()=>resolve({status:res.statusCode,body:Buffer.concat(chunks)}));});req.setTimeout(10000,()=>req.destroy(Error('Tarkistuksen aikakatkaisu.')));req.on('error',reject);req.end();
});}
async function probe(){for(const host of ['10.15.10.3:4182','tjt-palvelin.tail528926.ts.net']){
 expect((await request(host)).status===200,'Portaali ei avaudu: '+host);const js=await request(host,'/portal.js');expect(js.status===200&&crypto.createHash('sha256').update(js.body).digest('hex')===meta.payload['app/web/portal.js'],'Tunnit-kortti ei vastaa paivitysta.');
 for(const route of ['/tunnit/','/tunnit/session','/tunnit/supabase/rest/v1/profiles']){const r=await request(host,route);expect(r.status===401&&JSON.parse(r.body).code==='PORTAL_SESSION_ENDED','Kirjautumaton Tunnit-pyynto ei estynyt: '+route);}
 }console.log('Portaali, Tunnit-kortti ja kirjautumattoman kayton esto tarkistettu.');}
if(require.main===module)(async()=>{expect(process.platform==='win32','Aja paivitys Windows-palvelimella.');const mode=process.argv[2];if(mode==='preflight'){preflight(app,__dirname,meta);nextConfig();}else if(mode==='settings')migrate();else if(mode==='manifest')updateManifest(app,meta);else if(mode==='probe')await probe();else throw Error('Tuntematon tarkistus.');})().catch(e=>{console.error(e.message);process.exitCode=1;});
