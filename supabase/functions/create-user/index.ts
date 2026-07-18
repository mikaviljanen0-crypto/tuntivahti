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
    if(profileError||!caller?.active||caller.role!=='admin')throw new Error('Vain pääkäyttäjä voi hallita käyttäjiä.')

    const body=await request.json()
    const action=String(body.action||'create')
    const userId=String(body.userId||'')

    if(action!=='create'){
      const {data:target,error:targetError}=await adminClient.from('profiles').select('id,organization_id,role,email').eq('id',userId).eq('organization_id',caller.organization_id).single()
      if(targetError||!target)throw new Error('Käyttäjää ei löytynyt.')
      if(target.id===user.id&&['deactivate','delete'].includes(action))throw new Error('Et voi poistaa omaa pääkäyttäjätunnustasi käytöstä.')

      if(action==='deactivate'||action==='reactivate'){
        const active=action==='reactivate'
        const {error:updateError}=await adminClient.from('profiles').update({active}).eq('id',target.id)
        if(updateError)throw new Error(updateError.message)
        const {error:authError}=await adminClient.auth.admin.updateUserById(target.id,{ban_duration:active?'none':'876000h'})
        if(authError){await adminClient.from('profiles').update({active:!active}).eq('id',target.id);throw new Error(authError.message)}
        return new Response(JSON.stringify({id:target.id,active}),{headers:{...corsHeaders,'Content-Type':'application/json'}})
      }

      if(action==='update'){
        const fullName=String(body.fullName||'').trim()
        const email=String(body.email||'').trim().toLowerCase()
        const role=body.role==='foreman'?'foreman':'worker'
        const employerId=String(body.employerId||'')
        if(!fullName||!email||!employerId)throw new Error('Täytä nimi, sähköposti, työnantaja ja rooli.')
        const {data:employer}=await adminClient.from('employers').select('id').eq('id',employerId).eq('organization_id',caller.organization_id).eq('active',true).single()
        if(!employer)throw new Error('Työnantajayritys ei kuulu tähän organisaatioon.')
        const {data:duplicate}=await adminClient.from('profiles').select('id').eq('organization_id',caller.organization_id).ilike('email',email).neq('id',target.id).maybeSingle()
        if(duplicate)throw new Error('Sähköpostiosoite on jo käytössä.')
        const {error:authUpdateError}=await adminClient.auth.admin.updateUserById(target.id,{email,email_confirm:true,user_metadata:{full_name:fullName}})
        if(authUpdateError)throw new Error(authUpdateError.message.includes('already')?'Sähköpostiosoite on jo käytössä.':authUpdateError.message)
        const {error:updateError}=await adminClient.from('profiles').update({full_name:fullName,email,role,employer_id:employerId}).eq('id',target.id)
        if(updateError){if(target.email)await adminClient.auth.admin.updateUserById(target.id,{email:target.email,email_confirm:true});throw new Error(updateError.message)}
        return new Response(JSON.stringify({id:target.id,fullName,email,role}),{headers:{...corsHeaders,'Content-Type':'application/json'}})
      }

      if(action==='delete'){
        const checks=await Promise.all([
          adminClient.from('time_entries').select('*',{count:'exact',head:true}).eq('employee_id',target.id),
          adminClient.from('week_submissions').select('*',{count:'exact',head:true}).eq('employee_id',target.id),
          adminClient.from('day_notes').select('*',{count:'exact',head:true}).or(`employee_id.eq.${target.id},author_id.eq.${target.id}`),
        ])
        if(checks.some(result=>(result.count||0)>0))throw new Error('Käyttäjällä on kirjauksia. Poista tunnus käytöstä, jotta historiatiedot säilyvät.')
        await adminClient.from('worksites').update({foreman_id:null}).eq('foreman_id',target.id)
        const {error:deleteError}=await adminClient.auth.admin.deleteUser(target.id)
        if(deleteError)throw new Error(deleteError.message)
        return new Response(JSON.stringify({id:target.id,deleted:true}),{headers:{...corsHeaders,'Content-Type':'application/json'}})
      }
      throw new Error('Tuntematon käyttäjätoiminto.')
    }

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
