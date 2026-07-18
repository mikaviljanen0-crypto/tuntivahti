import React,{useEffect,useMemo,useState} from 'react';
import {supabase} from './main.jsx';

const roleNames={admin:'Pääkäyttäjä',foreman:'Työnjohtaja',worker:'Työntekijä'};

export default function App(){
 const [session,setSession]=useState(null),[profile,setProfile]=useState(null),[loading,setLoading]=useState(true);
 useEffect(()=>{if(!supabase){setLoading(false);return}supabase.auth.getSession().then(({data})=>{setSession(data.session);setLoading(false)});const {data:{subscription}}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));return()=>subscription.unsubscribe()},[]);
 useEffect(()=>{if(!session){setProfile(null);return}supabase.from('profiles').select('id,full_name,role,organization_id,organizations(name)').eq('id',session.user.id).single().then(({data,error})=>{if(error)console.error(error);setProfile(data)})},[session]);
 if(loading)return <ScreenMessage text="Ladataan…"/>;
 if(!supabase)return <ScreenMessage text="Supabase-yhteystiedot puuttuvat ympäristömuuttujista."/>;
 if(!session)return <Login/>;
 if(!profile)return <ScreenMessage text="Ladataan käyttäjäprofiilia…"/>;
 return <Shell profile={profile} onLogout={()=>supabase.auth.signOut()}/>;
}

function Login(){
 const [email,setEmail]=useState('mika.viljanen0@gmail.com'),[password,setPassword]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function submit(e){e.preventDefault();setBusy(true);setError('');const {error}=await supabase.auth.signInWithPassword({email,password});if(error)setError('Kirjautuminen epäonnistui. Tarkista sähköposti ja salasana.');setBusy(false)}
 return <main className="login"><form className="login-card" onSubmit={submit}><div className="logo">✓</div><div className="eyebrow" style={{marginTop:20}}>Tampereen Julkisivutekniikka Oy</div><h1>Tuntivahti</h1><p className="muted">Kirjaudu yrityksen tuntien ja työmaiden hallintaan.</p><div className="field" style={{marginTop:24}}><label>Sähköposti</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} required/></div><div className="field" style={{marginTop:14}}><label>Salasana</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} required/></div>{error&&<div className="notice" style={{background:'#fee2e2',color:'#991b1b'}}>{error}</div>}<button className="primary full" style={{marginTop:18}} disabled={busy}>{busy?'Kirjaudutaan…':'Kirjaudu'}</button></form></main>
}

function Shell({profile,onLogout}){const [tab,setTab]=useState('dashboard');return <><header className="topbar"><div className="brand">✓ Tuntivahti</div><div><span style={{marginRight:14}}>{profile.full_name} · {roleNames[profile.role]}</span><button className="logout" onClick={onLogout}>Kirjaudu ulos</button></div></header><main className="container"><div className="heading"><div><div className="eyebrow">{roleNames[profile.role]}</div><h1>{profile.organizations?.name||'Tuntivahti'}</h1><p className="muted">Yhteinen työmaarekisteri Tuntivahdille ja Työmaavahdille</p></div></div>{profile.role==='admin'?<Admin profile={profile} tab={tab} setTab={setTab}/>:<ScreenMessage text="Tämän käyttäjäroolin tuotantonäkymä rakennetaan seuraavassa vaiheessa."/>}</main></>}

function Admin({profile,tab,setTab}){return <><nav className="tabs"><button className={`tab ${tab==='dashboard'?'active':''}`} onClick={()=>setTab('dashboard')}>Yhteenveto</button><button className={`tab ${tab==='worksites'?'active':''}`} onClick={()=>setTab('worksites')}>Työmaat</button></nav>{tab==='dashboard'?<Dashboard orgId={profile.organization_id} openWorksites={()=>setTab('worksites')}/>:<Worksites orgId={profile.organization_id}/>}</>}

function Dashboard({orgId,openWorksites}){const [counts,setCounts]=useState({worksites:0,employers:0,litteras:0});useEffect(()=>{Promise.all([supabase.from('worksites').select('*',{count:'exact',head:true}),supabase.from('employers').select('*',{count:'exact',head:true}),supabase.from('litteras').select('*',{count:'exact',head:true})]).then(rs=>setCounts({worksites:rs[0].count||0,employers:rs[1].count||0,litteras:rs[2].count||0}))},[orgId]);return <><div className="stats"><div className="stat"><span>Työmaat</span><strong>{counts.worksites}</strong></div><div className="stat"><span>Työnantajayritykset</span><strong>{counts.employers}</strong></div><div className="stat"><span>Litterat</span><strong>{counts.litteras}</strong></div></div><section className="card"><div className="card-head"><h2>Tuotantopohja on yhdistetty</h2><button className="primary" onClick={openWorksites}>Perusta ensimmäinen työmaa</button></div><div className="card-body"><p>✓ Oikea kirjautuminen toimii</p><p>✓ Organisaatio ja käyttäjärooli tulevat tietokannasta</p><p>✓ Työnantajat ja litterat tulevat yhteisestä rekisteristä</p><p>✓ Työmaa perustetaan vain kerran ja näkyy myöhemmin molemmissa ohjelmissa</p></div></section></>}

function Worksites({orgId}){
 const [rows,setRows]=useState([]),[number,setNumber]=useState(''),[name,setName]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function load(){const {data,error}=await supabase.from('worksites').select('id,number,name,status,created_at').order('number');if(error)setError(error.message);else setRows(data||[])}
 useEffect(()=>{load()},[orgId]);
 async function add(e){e.preventDefault();setBusy(true);setError('');const {error}=await supabase.from('worksites').insert({organization_id:orgId,number:number.trim(),name:name.trim(),status:'active'});if(error)setError(error.code==='23505'?'Työmaanumero on jo käytössä.':error.message);else{setNumber('');setName('');await load()}setBusy(false)}
 async function toggle(row){const next=row.status==='active'?'closed':'active';const {error}=await supabase.from('worksites').update({status:next,updated_at:new Date().toISOString()}).eq('id',row.id);if(error)setError(error.message);else load()}
 return <div className="grid"><section className="card"><div className="card-head"><h2>Perusta työmaa</h2></div><form className="card-body" onSubmit={add}><div className="field"><label>Työmaanumero</label><input value={number} onChange={e=>setNumber(e.target.value)} placeholder="Esim. 1001" required/></div><div className="field" style={{marginTop:14}}><label>Työmaan nimi</label><input value={name} onChange={e=>setName(e.target.value)} placeholder="Virallinen nimi" required/></div>{error&&<div className="notice" style={{background:'#fee2e2',color:'#991b1b'}}>{error}</div>}<button className="primary full" style={{marginTop:18}} disabled={busy}>{busy?'Tallennetaan…':'Tallenna työmaa'}</button></form></section><section className="card"><div className="card-head"><h2>Työmaarekisteri</h2></div><div className="card-body table-wrap"><table className="table"><thead><tr><th>Numero</th><th>Nimi</th><th>Tila</th><th></th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td><strong>{r.number}</strong></td><td>{r.name}</td><td><i className={`status ${r.status==='active'?'approved':'draft'}`}>{r.status==='active'?'Aktiivinen':'Suljettu'}</i></td><td><button className="secondary" onClick={()=>toggle(r)}>{r.status==='active'?'Sulje':'Avaa'}</button></td></tr>)}</tbody></table>{!rows.length&&<p className="muted">Työmaita ei ole vielä perustettu.</p>}</div></section></div>
}

function ScreenMessage({text}){return <main className="login"><div className="login-card"><div className="logo">✓</div><h2>{text}</h2></div></main>}
