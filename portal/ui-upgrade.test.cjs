'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {validateMetadata,preflight,updateManifest,netSchemaReady}=require('./ui-upgrade.cjs'),{sha}=require('./package-tools.cjs');
test('net schema probe distinguishes the expected anonymous denial from missing schema or gateway errors',()=>{
 const body={code:'42501',message:'permission denied for function review_net_minutes'};
 assert.equal(netSchemaReady(401,body),true);
 for(const [status,value] of [[200,[]],[401,{code:'INVALID_KEY'}],[400,{code:'PGRST204'}],[503,body],[401,{...body,message:'permission denied for table time_entries'}]]) assert.equal(netSchemaReady(status,value),false);
});
test('UI update refuses any payload outside the Tuntivahti browser bundle',()=>{
 const m={format:'tjt-tunnit-ui-1.3',payload:{'tuntivahti/public/index.html':'h','tuntivahti/public/assets/new.js':'h','tuntivahti/public/assets/new.css':'h'}};
 validateMetadata(m);
 for(const f of ['server.cjs','tuntivahti/bridge.cjs','settings/config.json','tuntivahti/public/../grants','tuntivahti/public/assets/../../config.js']) assert.throws(()=>validateMetadata({...m,payload:{...m.payload,[f]:'h'}}));
});
test('UI update preserves unrelated programs, old assets and all credential files',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tunti-ui-test-')),root=path.join(dir,'app'),pkg=path.join(dir,'pkg');
 const old={'tuntivahti/public/index.html':'old index','tuntivahti/public/assets/old.js':'old js','tuntivahti/bridge.cjs':'existing bridge','app/auth.cjs':'existing auth','settings/config.json':'unchanged config','settings/grants/manager.json':'encrypted grant','settings/bridge-key.dpapi':'encrypted key'};
 const payload={'tuntivahti/public/index.html':'new index','tuntivahti/public/assets/new.js':'new js','tuntivahti/public/assets/new.css':'new css'};
 const baseline={}, hashes={};
 for(const[f,c]of Object.entries(old)){const p=path.join(root,f);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,c);baseline[f]=sha(p);}
 for(const[f,c]of Object.entries(payload)){const p=path.join(pkg,'payload',f);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,c);hashes[f]=sha(p);}
 fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify({format:'tjt-portal-package-v1',files:baseline}));
 const meta={format:'tjt-tunnit-ui-1.3',baseline,payload:hashes,installer:{}};
 preflight(root,pkg,meta);fs.cpSync(path.join(pkg,'payload'),root,{recursive:true});updateManifest(root,meta);
 for(const[f,c]of Object.entries(old))if(!(f in payload))assert.equal(fs.readFileSync(path.join(root,f),'utf8'),c);
 assert.throws(()=>preflight(root,pkg,meta));
});
