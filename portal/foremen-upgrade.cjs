'use strict';
const fs=require('node:fs'),path=require('node:path');
const {sha,expect,once,updateManifest}=require('./package-tools.cjs');
const {publicConfig}=require('./bridge.cjs');
function configuration(previous,users,vault){
 expect(previous.enabled===true&&!previous.mode&&previous.pilotUsername==='mika.viljanen'&&previous.expectedEmail==='mika.viljanen@julkisivutekniikka.fi','Tarvitaan toimiva Tunnit-SSO 1.0 -pilotti.');
 publicConfig(previous);
 const owners=users.filter(u=>u.active&&u.owner&&u.username===previous.pilotUsername);expect(owners.length===1,'Pilotin omistajatunnusta ei voitu varmistaa.');
 const binding=vault.read(owners[0].id);
 expect(binding?.email===previous.expectedEmail&&/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(binding?.organizationId||'')&&binding.userId&&binding.refreshToken,'Yhdista ensin Mikan oma Tuntivahti-tili toimivassa pilotissa.');
 return {...previous,mode:'foremen',organizationId:binding.organizationId};
}
function patchForemenCard(source){
 let s=once(source,' // Only the explicitly enabled pilot uses the authenticated portal bridge.',' // Portal TJT access + verified existing Tuntivahti manager role gate this bridge.');
 s=once(s," const pilot=me.user.owner===true&&me.user.username==='mika.viljanen';\n",'');
 s=once(s,"'+(pilot?'/tunnit/?view=review':'https://tuntivahti.vercel.app/?view=review')+'",'/tunnit/?view=review');
 return once(s,"'+(pilot?'Portaalikirjautuminen':'Tuntivahti-tunnuksilla')+'",'Portaalikirjautuminen');
}
function preflight(root,pkg,meta){
 const m=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8').replace(/^\uFEFF/,''));expect(m.format==='tjt-portal-package-v1'&&m.files,'Tuntematon portaalipaketti.');
 for(const[f,h]of Object.entries(meta.baseline)){
  expect(sha(path.join(root,f))===h,'Asennettu tiedosto on muuttunut: '+f+'. Mitaan ei paivitetty.');
  const keys=Object.keys(m.files).filter(k=>k.replaceAll('\\','/')===f);expect(keys.length===1&&m.files[keys[0]]===h,'Manifest ei vastaa tiedostoa: '+f);
 }
 for(const[f,h]of Object.entries(meta.payload)){
  expect(sha(path.join(pkg,'payload',f))===h,'Paketin tarkistussumma ei tasmaa: '+f);
  if(!(f in meta.baseline))expect(!fs.existsSync(path.join(root,f))&&!Object.keys(m.files).some(k=>k.replaceAll('\\','/')===f),'Uusi tiedosto on jo olemassa: '+f);
 }
 for(const[f,h]of Object.entries(meta.installer))expect(sha(path.join(pkg,f))===h,'Asennusohjelman tarkistussumma ei tasmaa: '+f);
}
module.exports={configuration,patchForemenCard,preflight,updateManifest};
