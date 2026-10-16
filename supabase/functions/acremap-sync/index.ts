import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
Deno.serve(async (req) => {
 if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
 if(req.method!=="POST") return respond({error:"method_not_allowed"},405);
 const url=Deno.env.get("SUPABASE_URL")!, anon=Deno.env.get("SUPABASE_ANON_KEY")!, serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
 const authHeader=req.headers.get("Authorization")??"";
 const userClient=createClient(url,anon,{global:{headers:{Authorization:authHeader}}});
 const {data:authData,error:authError}=await userClient.auth.getUser();
 if(authError||!authData.user) return respond({error:"unauthorized"},401);
 const admin=createClient(url,serviceKey);
 const {data:roles}=await admin.from("user_roles").select("role").eq("user_id",authData.user.id);
 if(!(roles??[]).some((r:any)=>["admin","pdg","dg"].includes(String(r.role).toLowerCase()))) return respond({error:"forbidden"},403);
 const {data:settings,error:settingsError}=await admin.from("acremap_integration_settings").select("*").eq("id","default").maybeSingle();
 if(settingsError||!settings?.enabled||!settings.api_base_url||!settings.api_key) return respond({error:"integration_not_configured"},400);
 const {data:owners,error:ownersError}=await admin.from("proprietaires_terres").select("id,type_proprietaire,nom,prenoms,denomination_sociale,nom_representant,telephone,updated_at");
 if(ownersError) return respond({error:"owners_query_failed",detail:ownersError.message},500);
 const payload=(owners??[]).map((o:any)=>({id:String(o.id),full_name:String(o.denomination_sociale||[o.nom,o.prenoms].filter(Boolean).join(" ")||o.nom_representant||"Propriétaire sans nom").trim(),phone:o.telephone??null,account_code:String(o.id),active:true,updated_at:o.updated_at??new Date().toISOString()}));
 const response=await fetch(settings.api_base_url.replace(/\/$/,"")+"/api/v1/integration",{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+settings.api_key},body:JSON.stringify({event:"owners.sync",owners:payload})});
 const result=await response.json().catch(()=>({}));
 if(!response.ok) return respond({error:"acremap_api_failed",status:response.status,detail:result.error??"API error"},502);
 return respond({received:result.received??payload.length,synced_at:result.synced_at??new Date().toISOString()});
 function respond(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:{...cors,"content-type":"application/json"}});}
});
