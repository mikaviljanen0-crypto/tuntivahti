'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {sha,expect}=require('./package-tools.cjs'),{patchForemenCard}=require('./foremen-upgrade.cjs');
const [pilot,out]=process.argv.slice(2).map(x=>path.resolve(x));expect(pilot&&out&&!fs.existsSync(out),'Anna alkuperainen SSO 1.0 -paketti ja UUSI kohdekansio.');
const previous=JSON.parse(fs.readFileSync(path.join(pilot,'update.json'),'utf8'));expect(previous.format==='tjt-tunnit-sso-1.0','Tarvitaan alkuperainen SSO 1.0 -paketti.');
for(const[f,h]of Object.entries(previous.payload))expect(sha(path.join(pilot,'payload',f))===h,'Pilotin lahdetiedosto on muuttunut: '+f);
const root=path.resolve(__dirname,'..'),r=spawnSync(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'build','--outDir','dist-portal'],{cwd:root,env:{...process.env,VITE_PORTAL_MODE:'true',VITE_PORTAL_URL:'/',VITE_READ_ONLY_PREVIEW:'false'},stdio:'inherit'});expect(r.status===0,'Selainkooste epaonnistui.');
const payload=path.join(out,'payload');fs.mkdirSync(path.join(payload,'app','web'),{recursive:true});fs.mkdirSync(path.join(payload,'tuntivahti'),{recursive:true});
fs.writeFileSync(path.join(payload,'app','web','portal.js'),patchForemenCard(fs.readFileSync(path.join(pilot,'payload','app','web','portal.js'),'utf8')));
fs.copyFileSync(path.join(__dirname,'bridge.cjs'),path.join(payload,'tuntivahti','bridge.cjs'));
fs.cpSync(path.join(root,'dist-portal'),path.join(payload,'tuntivahti','public'),{recursive:true});
const installer={};for(const file of ['bridge.cjs','package-tools.cjs','foremen-upgrade.cjs','install-foremen.cjs','Paivita-Tunnit-Tyonjohto.ps1','LUE-ENSIN-Tyonjohto.txt']){fs.copyFileSync(path.join(__dirname,file),path.join(out,file));installer[file]=sha(path.join(out,file));}
const files={};function walk(dir){for(const ent of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,ent.name);if(ent.isDirectory())walk(file);else files[path.relative(payload,file).split(path.sep).join('/')]=sha(file);}}walk(payload);
fs.writeFileSync(path.join(out,'update.json'),JSON.stringify({format:'tjt-tunnit-sso-1.1',baseline:{...previous.baseline,...previous.payload},payload:files,installer},null,2)+'\n');console.log('Työnjohdon päivityspaketti luotu:',out);
