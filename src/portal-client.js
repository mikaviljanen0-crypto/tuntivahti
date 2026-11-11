// Same-origin portal adapter. Supabase credentials remain on the server.
export function makePortalClient(createClient, { origin, fetchImpl=fetch, navigate=(url)=>window.location.assign(url) }) {
  let state=null;
  const listeners=new Set(),authListeners=new Set();
  const notify=()=>{for(const fn of listeners)fn(state);};
  const expired=()=>{state={ended:true};notify();for(const fn of authListeners)fn('SIGNED_OUT',null);};
  const session=()=>state?.linked?{user:state.user,access_token:'portal-session-not-a-credential'}:null;
  async function request(route,{method='GET',data}={}){
    const r=await fetchImpl(route,{method,credentials:'same-origin',cache:'no-store',headers:{...(data===undefined?{}:{'Content-Type':'application/json'}),...(method==='GET'?{}:{'X-TJT-CSRF':state?.csrf||''})},...(data===undefined?{}:{body:JSON.stringify(data)})});
    const b=await r.json();if(b.code==='PORTAL_SESSION_ENDED')expired();
    if(!r.ok)throw Error(b.error||'Portaalin yhteys ei onnistunut.');return b;
  }
  const bridge={
    subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
    get state(){return state;},
    async sync(){try{state=await request('/tunnit/session');notify();return state;}catch(error){if(!state?.ended){state={error:error.message};notify();}throw error;}},
    async link(email,password,consent){await request('/tunnit/link',{method:'POST',data:{email,password,consent}});await bridge.sync();for(const fn of authListeners)fn('SIGNED_IN',session());},
    async unlink(){await request('/tunnit/unlink',{method:'POST',data:{}});await bridge.sync();for(const fn of authListeners)fn('SIGNED_OUT',null);},
  };
  const db=createClient(origin+'/tunnit/supabase','portal-publishable-placeholder',{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
    global:{fetch:async(input,init={})=>{
      const url=new URL(typeof input==='string'?input:input.url||String(input),origin);
      if(url.origin!==origin||!url.pathname.startsWith('/tunnit/supabase/'))throw Error('Portaalin ulkopuolinen pyyntö estetty.');
      const headers=new Headers(init.headers);headers.delete('authorization');headers.delete('apikey');headers.set('X-TJT-CSRF',state?.csrf||'');
      const r=await fetchImpl(url.pathname+url.search,{...init,headers,credentials:'same-origin',cache:'no-store'});
      if(r.status===401)expired();return r;
    }},
  });
  db.auth={
    async getSession(){return {data:{session:session()},error:null};},
    onAuthStateChange(fn){authListeners.add(fn);return {data:{subscription:{unsubscribe:()=>authListeners.delete(fn)}}};},
    async signOut(){try{await request('/portal-api/logout',{method:'POST',data:{}});}finally{expired();navigate('/');}return {error:null};},
    async resetPasswordForEmail(email){try{
      const response=await fetchImpl('/tunnit/supabase/auth/v1/recover',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','X-TJT-CSRF':state?.csrf||''},body:JSON.stringify({email})});
      if(!response.ok){const b=await response.json();return {error:Error(b.error||b.msg||'Vaihtolinkkiä ei voitu lähettää.')};}return {error:null};
    }catch(error){return {error};}},
  };
  db.portal=bridge;
  return db;
}
