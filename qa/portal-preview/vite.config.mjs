// Local QA only. No Supabase network or production data; never included in packages.
import fs from 'node:fs';
import path from 'node:path';
import {defineConfig} from '../../node_modules/vite/dist/node/index.js';
const built=path.resolve(import.meta.dirname,'../../dist-portal');
let linked=false,ended=false;
const user={id:'11111111-1111-4111-8111-111111111111',email:'mika.viljanen@julkisivutekniikka.fi'};
const profile={...user,full_name:'Testaaja Esimerkki',organization_id:'22222222-2222-4222-8222-222222222222',role:'admin',is_foreman:true,active:true,language:'fi',organizations:{name:'TESTI – ei tuotantotietoja'},employers:{name:'Testiyritys'}};
export default defineConfig({plugins:[{name:'portal-qa-only',configureServer(server){server.middlewares.use(async(req,res,next)=>{
 const u=new URL(req.url,'http://qa.local');
 const json=(v,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(v));};
 if(u.pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<h1>Portaalin paikallinen testi</h1><p>Vain keksittyjä tietoja. Ei yhteyttä tuotantoon.</p><a href="/tunnit/">Avaa Tunnit</a><form method="post" action="/qa-login"><button>Kirjaudu testiportaaliin uudelleen</button></form><form method="post" action="/qa-linked-fixture"><button>Näytä yhdistetyn tilin testinäkymä</button></form>');return;}
 if(u.pathname==='/qa-linked-fixture'){linked=true;ended=false;res.writeHead(303,{Location:'/tunnit/'});res.end();return;}
 if(u.pathname==='/qa-login'){ended=false;res.writeHead(303,{Location:'/tunnit/'});res.end();return;}
 if(u.pathname==='/portal-api/logout'){ended=true;json({ok:true});return;}
 if(u.pathname==='/tunnit/session'){if(ended)json({error:'Portaalin istunto on päättynyt.',code:'PORTAL_SESSION_ENDED'},401);else json(linked?{linked,csrf:'test-csrf',user}:{linked,csrf:'test-csrf',email:user.email});return;}
 if(u.pathname==='/tunnit/link'){let s='';for await(const b of req)s+=b;const d=JSON.parse(s);if(d.password!=='TestOnly123!'){json({error:'Tarkista Tuntivahdin salasana.',code:'PORTAL_REQUEST_FAILED'},400);return;}linked=true;json({ok:true});return;}
 if(u.pathname==='/tunnit/unlink'){linked=false;json({ok:true});return;}
 if(u.pathname.startsWith('/tunnit/supabase/')){if(ended||!linked){json({error:'Unauthorized'},401);return;}if(u.pathname.endsWith('/profiles')&&u.searchParams.has('id'))json(profile);else json([]);return;}
 if(u.pathname==='/tunnit/'||/^\/tunnit\/assets\/[A-Za-z0-9_.-]+\.(js|css)$/.test(u.pathname)){const file=u.pathname==='/tunnit/'?path.join(built,'index.html'):path.join(built,u.pathname.slice('/tunnit/'.length));res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));return;}
 next();
 });}}]});
