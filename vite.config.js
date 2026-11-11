import {defineConfig,loadEnv} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({mode})=>{
 const env={...loadEnv(mode,process.cwd(),'VITE_'),...process.env};
 const portal=env.VITE_PORTAL_MODE==='true';
 return {base:portal?'/tunnit/':'/',plugins:[react(),{
  name:'tuntivahti-public-connection-info',
  generateBundle(){
   if(portal||!env.VITE_SUPABASE_URL)return;
   const key=env.VITE_SUPABASE_PUBLISHABLE_KEY||env.VITE_SUPABASE_ANON_KEY;
   if(!key)return;
   let safe=/^sb_publishable_[A-Za-z0-9_-]+$/.test(key);
   if(!safe)try{safe=JSON.parse(Buffer.from(key.split('.')[1],'base64url')).role==='anon';}catch{}
   if(!safe)throw Error('Only a publishable/anon key may be bundled into Tuntivahti.');
   this.emitFile({type:'asset',fileName:'.well-known/tuntivahti-portal.json',source:JSON.stringify({protocol:1,url:env.VITE_SUPABASE_URL,key})});
  },
 }]};
});
