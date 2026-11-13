import React,{createContext,useContext,useEffect,useState} from 'react';
const PortalConnectionContext=createContext(null);
export function PortalConnectionDetails({children}){
 const connection=useContext(PortalConnectionContext);
 if(!connection)return children;
 return <details className="tjt-connection"><summary aria-label="Oma Tuntivahti-yhteys" title="Oma Tuntivahti-yhteys">{children}</summary><div className="tjt-connection-panel"><strong>Portaalikirjautuminen</strong><p>Tuntivahti-tilisi on yhdistetty portaaliin.</p><button type="button" onClick={connection.unlink} disabled={connection.busy}>{connection.busy?'Odota…':'Poista yhdistäminen'}</button>{connection.error&&<p role="alert">{connection.error}</p>}</div></details>;
}
export default function PortalRoot({db,children}){
 const [state,setState]=useState(db.portal.state),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[consent,setConsent]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{setEmail(state?.email||'');},[state?.email]);
 useEffect(()=>{
  const unsubscribe=db.portal.subscribe(setState);
  const refresh=()=>{if(document.visibilityState!=='hidden')db.portal.sync().catch(()=>{});};
  refresh();const timer=setInterval(refresh,20000);window.addEventListener('focus',refresh);
  return()=>{clearInterval(timer);window.removeEventListener('focus',refresh);unsubscribe();};
 },[db]);
 async function link(e){e.preventDefault();setBusy(true);setError('');try{if(state.reconnect)await db.portal.unlink();await db.portal.link(email,password,consent);setPassword('');}catch(e){setError(e.message);setPassword('');}finally{setBusy(false);}}
 async function unlink(){if(!window.confirm('Poistetaanko Tuntivahdin yhdistäminen portaaliin? Tuntikirjaukset ja nykyinen Tuntivahti-tunnus säilyvät.'))return;setBusy(true);setError('');try{await db.portal.unlink();}catch(e){setError(e.message);}finally{setBusy(false);}}
 if(state?.linked)return <PortalConnectionContext.Provider value={{unlink,busy,error}}>{children}</PortalConnectionContext.Provider>;
 return <main className="login"><section className="login-card"><div className="logo">✓</div><h1>{!state?'Avataan Tuntivahtia…':state.ended?'Kirjaudu portaaliin':state.error?'Yhteys ei onnistunut':'Yhdistä oma Tuntivahti-tilisi'}</h1>
 {state?.ended?<><p>Portaalin istunto on päättynyt tai käyttöoikeutta ei ole. Kirjaudu portaalin etusivulla uudelleen.</p><a className="primary" href="/">Avaa portaali</a></>:state?.error?<><p role="alert">{state.error}</p><button type="button" className="primary" onClick={()=>db.portal.sync().catch(()=>{})}>Yritä uudelleen</button><p><a href="/">Takaisin portaaliin</a></p></>:state&&<>
 <p>{state.message||'Tämä tehdään vain yhdistämisen yhteydessä. Jatkossa Tunnit avautuu portaalikirjautumisella.'}</p>
 <form onSubmit={link}><div className="field"><label htmlFor="portal-email">Oman Tuntivahti-tilisi sähköposti</label><input id="portal-email" type="email" readOnly={state.emailLocked!==false} value={email} onChange={e=>setEmail(e.target.value)} autoComplete="username" maxLength={254} required/>{state.emailLocked===false&&<small>Käytä omaa nykyistä työnjohto- tai pääkäyttäjätiliäsi. Osoitteen ei tarvitse olla sama kuin portaalissa.</small>}</div><div className="field" style={{marginTop:14}}><label htmlFor="portal-password">Nykyinen Tuntivahti-salasana</label><input id="portal-password" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required maxLength={256}/></div>
 <label className="s-link-consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} required/><span>Sallin oman Tuntivahti-tilini käytön tällä portaalitunnuksella. Salasanaa ei tallenneta. Kirjautumisyhteys tallennetaan salattuna TJT-palvelimelle.</span></label>
 {error&&<p role="alert" className="notice error">{error}</p>}<button className="primary full" disabled={busy||!consent}>{busy?'Yhdistetään…':'Yhdistä Tuntivahti'}</button></form><p><a href="/">Takaisin portaaliin</a> · <a href="https://tuntivahti.vercel.app/" rel="noreferrer">Avaa erillinen Tuntivahti</a></p></>}
 </section></main>;
}
