'use strict';
const {expect}=require('./package-tools.cjs'),{preflight,updateManifest}=require('./foremen-upgrade.cjs');
function validateMetadata(meta){
 expect(meta.format==='tjt-tunnit-ui-1.3','Tuntematon paivityspaketti.');
 const files=Object.keys(meta.payload||{});
 expect(files.includes('tuntivahti/public/index.html')&&files.length>=3,'Selainkooste puuttuu.');
 expect(files.every(f=>f==='tuntivahti/public/index.html'||/^tuntivahti\/public\/assets\/[A-Za-z0-9_-]+\.(js|css)$/.test(f)),'Paivitys saa koskea vain Tuntivahdin selainresursseja.');
}
function check(root,pkg,meta){validateMetadata(meta);preflight(root,pkg,meta);}
function netSchemaReady(status,body){
 // The computed field must exist but must not be executable anonymously.
 // A missing schema field is a different PostgREST error and must stop install.
 return status===401&&body?.code==='42501'&&body?.message==='permission denied for function review_net_minutes';
}
module.exports={validateMetadata,preflight:check,updateManifest,netSchemaReady};
