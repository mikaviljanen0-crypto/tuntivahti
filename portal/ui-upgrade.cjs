'use strict';
const {expect}=require('./package-tools.cjs'),{preflight,updateManifest}=require('./foremen-upgrade.cjs');
function validateMetadata(meta){
 expect(meta.format==='tjt-tunnit-ui-1.2','Tuntematon paivityspaketti.');
 const files=Object.keys(meta.payload||{});
 expect(files.includes('tuntivahti/public/index.html')&&files.length>=3,'Selainkooste puuttuu.');
 expect(files.every(f=>f==='tuntivahti/public/index.html'||/^tuntivahti\/public\/assets\/[A-Za-z0-9_-]+\.(js|css)$/.test(f)),'Paivitys saa koskea vain Tuntivahdin selainresursseja.');
}
function check(root,pkg,meta){validateMetadata(meta);preflight(root,pkg,meta);}
module.exports={validateMetadata,preflight:check,updateManifest};
