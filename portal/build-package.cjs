'use strict';
// Reproducible package from the user's known portal archives and a fresh portal build.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {sha,expect,patchServer,patchCard}=require('./package-tools.cjs');
const [sources,linkPackage,out]=process.argv.slice(2).map(x=>path.resolve(x));
expect(sources&&linkPackage&&out&&!fs.existsSync(out),'Anna lahdearkistojen, Tunnit 1.0 -paketin ja UUDEN kohdekansion polut.');
const root=path.resolve(__dirname,'..'),manifest=JSON.parse(fs.readFileSync(path.join(sources,'ulkoasu-source','manifest.json'),'utf8').replace(/^\uFEFF/,''));
const baseline={};for(const file of ['Yhteiset.ps1','settings.cjs','backup/Protect-Secret.ps1','app/auth.cjs','app/portal.cjs','app/companies.cjs','server.cjs','operations.cjs']){const k=Object.keys(manifest.files).find(k=>k.replaceAll('\\','/')===file);expect(k,'Puuttuva lahdetarkistussumma: '+file);baseline[file]=manifest.files[k];}
baseline['app/web/portal.js']='7fda08b1bbd15d2a953fc36b509828b81ccc729391e217e09995680fe05f46b2';
const serverFile=path.join(sources,'tailscale-1.0','payload','server.cjs'),cardFile=path.join(linkPackage,'payload','app','web','portal.js');
expect(sha(serverFile)===baseline['server.cjs']&&sha(cardFile)===baseline['app/web/portal.js'],'Lahdetiedostot eivat vastaa tunnettua portaaliversiota.');
const build=spawnSync(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'build','--outDir','dist-portal'],{cwd:root,env:{...process.env,VITE_PORTAL_MODE:'true',VITE_PORTAL_URL:'/',VITE_READ_ONLY_PREVIEW:'false'},stdio:'inherit'});expect(build.status===0,'Selainkooste epaonnistui.');
const payload=path.join(out,'payload');fs.mkdirSync(path.join(payload,'app','web'),{recursive:true});fs.mkdirSync(path.join(payload,'tuntivahti'),{recursive:true});
fs.writeFileSync(path.join(payload,'server.cjs'),patchServer(fs.readFileSync(serverFile,'utf8')));
fs.writeFileSync(path.join(payload,'app','web','portal.js'),patchCard(fs.readFileSync(cardFile,'utf8')));
for(const file of ['bridge.cjs','runtime.cjs'])fs.copyFileSync(path.join(__dirname,file),path.join(payload,'tuntivahti',file));
fs.cpSync(path.join(root,'dist-portal'),path.join(payload,'tuntivahti','public'),{recursive:true});
for(const file of ['package-tools.cjs','install-check.cjs','Paivita-Tunnit-SSO.ps1','LUE-ENSIN.txt'])fs.copyFileSync(path.join(__dirname,file),path.join(out,file));
const files={};function walk(dir){for(const ent of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,ent.name);if(ent.isDirectory())walk(file);else files[path.relative(payload,file).split(path.sep).join('/')]=sha(file);}}walk(payload);
const installer={};for(const file of ['package-tools.cjs','install-check.cjs','Paivita-Tunnit-SSO.ps1','LUE-ENSIN.txt'])installer[file]=sha(path.join(out,file));
fs.writeFileSync(path.join(out,'update.json'),JSON.stringify({format:'tjt-tunnit-sso-1.0',baseline,payload:files,installer},null,2)+'\n');
console.log('Paketti luotu:',out);
