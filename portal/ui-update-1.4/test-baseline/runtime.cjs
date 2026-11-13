'use strict';
const fs=require('node:fs'),path=require('node:path');
const {Bridge,Vault}=require('./bridge.cjs');
function create({auth,hosts,readOnly}){
 const {C,unprotect}=require('../settings.cjs');
 const directory=path.join(C.settings,'tuntivahti');
 const config=JSON.parse(fs.readFileSync(path.join(directory,'config.json'),'utf8').replace(/^\uFEFF/,''));
 if(config.enabled!==true)return null;
 const key=Buffer.from(unprotect('bridge-key.dpapi',directory),'base64');
 return new Bridge({auth,hosts,readOnly,config,vault:new Vault(path.join(directory,'grants'),key),publicDir:path.join(__dirname,'public')});
}
module.exports={create};
