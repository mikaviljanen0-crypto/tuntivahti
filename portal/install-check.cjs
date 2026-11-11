'use strict';
const fs=require('node:fs'),path=require('node:path'),https=require('node:https'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const {preflight,updateManifest,sha,expect}=require('./package-tools.cjs');
const {publicConfig}=require('./payload/tuntivahti/bridge.cjs');
const app=String.raw`C:\TJT\Ohjelmat\TJT-Portaali-v1`,settings=String.raw`C:\TJT\Asetukset\TJT-Portaali-v1\tuntivahti`;
const meta=JSON.parse(fs.readFileSync(path.join(__dirname,'update.json'),'utf8'));
async function connection(){
 const r=await fetch('https://tuntivahti.vercel.app/.well-known/tuntivahti-portal.json',{redirect:'error',signal:AbortSignal.timeout(15000)});
 expect(r.ok,'Julkiset Tuntivahti-yhteystiedot eivat ole saatavilla. Mitaan ei asennettu.');
 const bytes=await r.text();expect(bytes.length<8192,'Virheellinen yhteystietovastaus.');const c=JSON.parse(bytes);expect(c.protocol===1,'Tuntematon yhteystietoversio.');
 return {...publicConfig(c),enabled:true,pilotUsername:'mika.viljanen',expectedEmail:'mika.viljanen@julkisivutekniikka.fi'};
}
async function prepareSettings(){
 expect(fs.existsSync(settings)&&fs.readdirSync(settings).length===0,'Yhteysasetusten kansio ei ole tyhja. Olemassa olevaa yhdistysta ei korvattu.');
 const config=await connection();
 // Key goes only through stdin, never command arguments, console or package.
 const exe=path.win32.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
 const key=crypto.randomBytes(32).toString('base64');
 const r=spawnSync(exe,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(app,'backup','Protect-Secret.ps1'),'-Action','Protect'],{input:key,encoding:'utf8',windowsHide:true,timeout:20000,maxBuffer:1048576});
 expect(!r.error&&r.status===0&&/^[A-Za-z0-9+/=]+$/.test(r.stdout.trim()),'Windowsin tunnussuojaus epaonnistui.');
 fs.writeFileSync(path.join(settings,'bridge-key.dpapi'),r.stdout.trim(),{flag:'wx'});
 fs.writeFileSync(path.join(settings,'config.json'),JSON.stringify(config,null,2)+'\n',{flag:'wx'});
 const {unprotect}=require(path.join(app,'settings.cjs'));expect(unprotect('bridge-key.dpapi',settings)===key,'Windowsin tunnussuojauksen tarkistus epaonnistui.');
}
function request(host,url='/'){return new Promise((resolve,reject)=>{
 // Loopback probe only; no credentials and no change to production TLS.
 const req=https.request({hostname:'127.0.0.1',port:4182,path:url,method:'GET',rejectUnauthorized:false,headers:{Host:host}},res=>{const chunks=[];let size=0;res.on('data',b=>{size+=b.length;if(size>2097152){req.destroy(Error('Tarkistusvastaus liian suuri.'));return;}chunks.push(b);});res.on('error',reject);res.on('end',()=>resolve({status:res.statusCode,body:Buffer.concat(chunks)}));});req.setTimeout(10000,()=>req.destroy(Error('Tarkistuksen aikakatkaisu.')));req.on('error',reject);req.end();
});}
async function probe(){for(const host of ['10.15.10.3:4182','tjt-palvelin.tail528926.ts.net']){
 expect((await request(host)).status===200,'Portaali ei avaudu: '+host);
 const js=await request(host,'/portal.js');expect(js.status===200&&crypto.createHash('sha256').update(js.body).digest('hex')===meta.payload['app/web/portal.js'],'Tunnit-kortti ei vastaa paivitysta.');
 for(const route of ['/tunnit/','/tunnit/session','/tunnit/supabase/rest/v1/profiles']){const r=await request(host,route);expect(r.status===401&&JSON.parse(r.body).code==='PORTAL_SESSION_ENDED','Kirjautumaton Tunnit-pyynto ei estynyt: '+route);}
 }console.log('Portaali, Tunnit-kortti ja kirjautumattoman kayton esto tarkistettu molemmilla hosteilla.');}
if(require.main===module)(async()=>{
 expect(process.platform==='win32','Aja asennus Windows-palvelimella.');
 const mode=process.argv[2];
 if(mode==='preflight'){preflight(app,__dirname,meta);expect(!fs.existsSync(settings),'Tuntivahdin asetukset ovat jo olemassa. Niita ei korvattu.');}
 else if(mode==='connection'){await connection();console.log('Julkiset yhteystiedot tarkistettu.');}
 else if(mode==='settings')await prepareSettings();
 else if(mode==='manifest')updateManifest(app,meta);
 else if(mode==='probe')await probe();
 else throw Error('Tuntematon tarkistus.');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
