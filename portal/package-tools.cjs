'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const expect=(ok,message)=>{if(!ok)throw Error(message);};
function once(source,before,after){expect(source.split(before).length===2,'Tuettu lahderakenne ei tasmaa: '+before.slice(0,70));return source.replace(before,after);}
function patchServer(source){
 let s=once(source,'let diaryListeners;','let diaryListeners,tuntivahti;');
 s=once(s,'  if(!await portal.guard(req,res))return;', '  if(tuntivahti&&await tuntivahti.handle(req,res))return;\n  if(!await portal.guard(req,res))return;');
 const hosts="new Set(['127.0.0.1','localhost','10.15.10.3','tjt-palvelin','TJT-PALVELIN'].map(h=>h+':'+actualPort).concat('tjt-palvelin.tail528926.ts.net'))";
 s=once(s,'  if(tyomaavahti)diaryListeners=',"  tuntivahti=require('./tuntivahti/runtime.cjs').create({auth:portalAuth,hosts:"+hosts+",readOnly});\n  if(tyomaavahti)diaryListeners=");
 return s;
}
function patchCard(source){
 let s=once(source,' // External shortcut, not a portal permission grant. Supabase authorizes separately.\n // Do not forward portal company/session identifiers or imply cross-company SSO.',' // Only the explicitly enabled pilot uses the authenticated portal bridge.');
 s=once(s," if(companyId!=='tjt'||!me.companies.some(c=>c.id==='tjt'))return '';", " if(companyId!=='tjt'||!me.companies.some(c=>c.id==='tjt'))return '';\n const pilot=me.user.owner===true&&me.user.username==='mika.viljanen';");
 s=once(s,'href="https://tuntivahti.vercel.app/?view=review"', 'href="\'+(pilot?\'/tunnit/?view=review\':\'https://tuntivahti.vercel.app/?view=review\')+\'"');
 return once(s,'<span>Tuntivahti-tunnuksilla</span>',"<span>'+(pilot?'Portaalikirjautuminen':'Tuntivahti-tunnuksilla')+'</span>");
}
function manifest(root){return JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8').replace(/^\uFEFF/,''));}
function key(m,file,required=true){expect(m.files&&typeof m.files==='object'&&!Array.isArray(m.files),'Tuntematon manifest-rakenne.');const matches=Object.keys(m.files).filter(k=>k.replaceAll('\\','/')===file);expect(matches.length<=1&&(!required||matches.length===1),'Manifestin tiedosto puuttuu tai on kahdesti: '+file);return matches[0];}
function preflight(root,pkg,metadata){
 const m=manifest(root);
 for(const [f,h] of Object.entries(metadata.baseline)){expect(sha(path.join(root,f))===h,'Asennettu tiedosto on muuttunut: '+f+'. Mitaan ei paivitetty.');expect(m.files[key(m,f)]===h,'Manifest ei vastaa tiedostoa: '+f);}
 for(const [f,h] of Object.entries(metadata.payload)){expect(sha(path.join(pkg,'payload',f))===h,'Paketin tarkistussumma ei tasmaa: '+f);if(!(f in metadata.baseline)){expect(!fs.existsSync(path.join(root,f))&&!key(m,f,false),'Uusi kohdetiedosto on jo olemassa: '+f);}}
 for(const [f,h] of Object.entries(metadata.installer))expect(sha(path.join(pkg,f))===h,'Asennusohjelman tarkistussumma ei tasmaa: '+f);
 expect(!fs.existsSync(path.join(root,'tuntivahti')),'Tuntivahti-moduuli on jo asennettu. Pyydetaan paivityspaketti.');
}
function updateManifest(root,metadata){const m=manifest(root);for(const[f,h]of Object.entries(metadata.payload)){expect(sha(path.join(root,f))===h,'Kopiointi epaonnistui: '+f);m.files[key(m,f,false)||f]=h;}fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify(m,null,2)+'\n');}
module.exports={sha,expect,once,patchServer,patchCard,preflight,updateManifest};
