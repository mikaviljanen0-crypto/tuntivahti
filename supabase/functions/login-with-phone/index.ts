import {createClient} from 'npm:@supabase/supabase-js@2'

const corsHeaders={
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
}

const normalizePhone=(value:unknown)=>{
  let phone=String(value||'').trim().replace(/[^\d+]/g,'')
  if(phone.startsWith('00'))phone=`+${phone.slice(2)}`
  else if(phone.startsWith('0'))phone=`+358${phone.slice(1)}`
  else if(phone.startsWith('358'))phone=`+${phone}`
  return phone
}

const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{
  status,
  headers:{...corsHeaders,'Content-Type':'application/json'},
})

Deno.serve(async request=>{
  if(request.method==='OPTIONS')return new Response('ok',{headers:corsHeaders})
  if(request.method!=='POST')return response({error:'Kirjautuminen epäonnistui.'},405)

  try{
    const {phone:rawPhone,password}=await request.json()
    const phone=normalizePhone(rawPhone)
    if(!/^\+[1-9]\d{7,14}$/.test(phone)||typeof password!=='string'||!password)return response({error:'Kirjautuminen epäonnistui.'},400)

    const url=Deno.env.get('SUPABASE_URL')!
    const publishableKey=Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const adminClient=createClient(url,serviceRoleKey,{auth:{autoRefreshToken:false,persistSession:false}})

    const {data:profile,error:profileError}=await adminClient
      .from('profiles')
      .select('email,active')
      .eq('phone',phone)
      .maybeSingle()

    if(profileError||!profile?.active||!profile.email)return response({error:'Kirjautuminen epäonnistui.'},400)

    const authClient=createClient(url,publishableKey,{auth:{autoRefreshToken:false,persistSession:false}})
    const {data,error}=await authClient.auth.signInWithPassword({email:profile.email,password})
    if(error||!data.session)return response({error:'Kirjautuminen epäonnistui.'},400)

    return response({
      access_token:data.session.access_token,
      refresh_token:data.session.refresh_token,
    })
  }catch{
    return response({error:'Kirjautuminen epäonnistui.'},400)
  }
})
