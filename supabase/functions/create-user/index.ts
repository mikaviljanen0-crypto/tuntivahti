import {createClient} from 'npm:@supabase/supabase-js@2'

const corsHeaders={
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async request=>{
  if(request.method==='OPTIONS')return new Response('ok',{headers:corsHeaders})
  try{
    const authorization=request.headers.get('Authorization')
    if(!authorization)throw new Error('Kirjautuminen puuttuu.')

    const url=Deno.env.get('SUPABASE_URL')!
    const publishableKey=Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const callerClient=createClient(url,publishableKey,{global:{headers:{Authorization:authorization}}})
    const adminClient=createClient(url,serviceRoleKey,{auth:{autoRefreshToken:false,persistSession:false}})

    const {data:{user},error:userError}=await callerClient.auth.getUser()
    if(userError||!user)throw new Error('Kirjautuminen ei ole voimassa.')

    const {data:caller,error:profileError}=await adminClient.from('profiles').select('organization_id,role,active').eq('id',user.id).single()
    if(profileError||!caller?.active||caller.role!=='admin')throw new Error('Vain pääkäyttäjä voi lisätä käyttäjiä.')

    const body=await request.json()
    const fullName=String(body.fullName||'').trim()
    const email=String(body.email||'').trim().toLowerCase()
    const password=String(body.password||'')
    const role=body.role==='foreman'?'foreman':'worker'
    const employerId=String(body.employerId||'')
    if(!fullName||!email||password.length<8||!employerId)throw new Error('Täytä nimi, sähköposti, työnantaja ja vähintään 8 merkin salasana.')

    const {data:employer,error:employerError}=await adminClient.from('employers').select('id').eq('id',employerId).eq('organization_id',caller.organization_id).eq('active',true).single()
    if(employerError||!employer)throw new Error('Työnantajayritys ei kuulu tähän organisaatioon.')

    const {data:created,error:createError}=await adminClient.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:fullName}})
    if(createError)throw new Error(createError.message.includes('already')?'Sähköpostiosoite on jo käytössä.':createError.message)

    const {error:insertError}=await adminClient.from('profiles').insert({id:created.user.id,organization_id:caller.organization_id,employer_id:employerId,full_name:fullName,email,role,active:true})
    if(insertError){await adminClient.auth.admin.deleteUser(created.user.id);throw new Error(`Käyttäjäprofiilin luonti epäonnistui: ${insertError.message}`)}

    return new Response(JSON.stringify({id:created.user.id,fullName,role}),{headers:{...corsHeaders,'Content-Type':'application/json'}})
  }catch(error){return new Response(JSON.stringify({error:error instanceof Error?error.message:'Käyttäjän lisääminen epäonnistui.'}),{status:400,headers:{...corsHeaders,'Content-Type':'application/json'}})}
})
