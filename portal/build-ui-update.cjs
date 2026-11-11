'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {sha,expect}=require('./package-tools.cjs');
const args=process.argv.slice(2);expect(args.length===2,'Anna SSO 1.1 -paketti ja uusi kohdekansio.');
const [previousDir,out]=args.map(x=>path.resolve(x));expect(!fs.existsSync(out),'Kohdekansio on jo olemassa.');
const previous=JSON.parse(fs.readFileSync(path.join(previousDir,'update.json'),'utf8'));
expect(previous.format==='tjt-tunnit-sso-1.1','Tarvitaan SSO 1.1 -lahtopaketti.');
for(const[f,h]of Object.entries(previous.payload))expect(sha(path.join(previousDir,'payload',f))===h,'Lahtopaketin tiedosto muuttunut: '+f);
const root=path.resolve(__dirname,'..');
const r=spawnSync(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'build','--outDir','dist-portal'],{cwd:root,env:{...process.env,VITE_PORTAL_MODE:'true',VITE_PORTAL_URL:'/',VITE_READ_ONLY_PREVIEW:'false'},stdio:'inherit'});
expect(r.status===0,'Selainkooste epaonnistui.');
const payload=path.join(out,'payload');fs.mkdirSync(path.join(payload,'tuntivahti'),{recursive:true});
fs.cpSync(path.join(root,'dist-portal'),path.join(payload,'tuntivahti','public'),{recursive:true});
const installer={};
for(const file of ['bridge.cjs','package-tools.cjs','foremen-upgrade.cjs','ui-upgrade.cjs','install-ui-update.cjs','Paivita-Tunnit-1.2.ps1','LUE-ENSIN-1.2.txt']){fs.copyFileSync(path.join(__dirname,file),path.join(out,file));installer[file]=sha(path.join(out,file));}
const files={};function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else files[path.relative(payload,p).split(path.sep).join('/')]=sha(p);}}walk(payload);
fs.writeFileSync(path.join(out,'update.json'),JSON.stringify({format:'tjt-tunnit-ui-1.2',baseline:{...previous.baseline,...previous.payload},payload:files,installer},null,2)+'\n');
console.log('Tunnit 1.2 -paivityspaketti valmis:',out);
