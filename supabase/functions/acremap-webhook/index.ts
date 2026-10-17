import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"content-type, x-acremap-signature","Access-Control-Allow-Methods":"POST, OPTIONS"};
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
 if(req.method!=="POST") return respond({error:"method_not_allowed"},405);
 const raw=await req.text(), admin=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
 const {data:settings,error}=await admin.from("acremap_integration_settings").select("webhook_secret,enabled").eq("id","default").maybeSingle();
 if(error||!settings?.enabled||!settings.webhook_secret) return respond({error:"webhook_not_configured"},503);
 const provided=(req.headers.get("x-acremap-signature")??"").replace(/^sha256=/,"");
 const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(settings.webhook_secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const digest=new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(raw)));
 const expected=Array.from(digest,b=>b.toString(16).padStart(2,"0")).join("");
 if(!safeEqual(provided,expected)) return respond({error:"invalid_signature"},401);
 let body:any;try{body=JSON.parse(raw)}catch{return respond({error:"invalid_json"},400)}
 if(body?.event!=="morcellement.published"||typeof body.event_id!=="string"||!body.plan||!Array.isArray(body.lots)) return respond({error:"invalid_payload"},400);
 const plan=body.plan, planId=String(plan.id??"");if(!planId)return respond({error:"missing_plan_id"},400);
 const assignedOwnerIds=[...new Set((body.lots as any[]).map((lot:any)=>lot.assignee_owner_id?String(lot.assignee_owner_id):null).filter(Boolean))];
 const ownerId=body.owner_id?String(body.owner_id):(plan.owner_id?String(plan.owner_id):(assignedOwnerIds.length===1?assignedOwnerIds[0]:null));
 const {error:pe}=await admin.from("acremap_morcellements").upsert({id:planId,event_id:body.event_id,owner_id:ownerId,parcelle_id:plan.parcelle_id?String(plan.parcelle_id):null,reference:plan.reference??null,status:"received",payload:body,source_updated_at:plan.updated_at??new Date().toISOString()},{onConflict:"id"});
 if(pe)return respond({error:"plan_persist_failed"},500);
 const lots=body.lots.map((lot:any)=>({id:String(lot.id??(planId+":"+lot.code)),plan_id:planId,owner_id:lot.assignee_owner_id?String(lot.assignee_owner_id):null,code:String(lot.code??""),part:lot.part??null,kind:lot.kind??"lot",area_m2:Number.isFinite(Number(lot.area_m2))?Number(lot.area_m2):null,payload:lot}));
 if(lots.length){const {error:le}=await admin.from("acremap_lots").upsert(lots,{onConflict:"id"});if(le)return respond({error:"lots_persist_failed"},500)}
 const {data:existingLots,error:existingLotsError}=await admin.from("acremap_lots").select("id").eq("plan_id",planId);
 if(existingLotsError)return respond({error:"existing_lots_query_failed"},500);
 const currentLotIds=new Set(lots.map((lot:any)=>lot.id));
 for(const existing of existingLots??[]){if(!currentLotIds.has(existing.id)){const {error:deleteError}=await admin.from("acremap_lots").delete().eq("id",existing.id);if(deleteError)return respond({error:"stale_lot_cleanup_failed"},500)}}
 if(plan.parcelle_id){
  const {error:supersedeError}=await admin.from("acremap_morcellements").update({status:"superseded"}).eq("parcelle_id",String(plan.parcelle_id)).neq("id",planId);
  if(supersedeError)return respond({error:"previous_plan_update_failed"},500);
 }
 if(ownerId){
  const {data:ownerPlans,error:ownerPlansError}=await admin.from("acremap_morcellements").select("id").eq("owner_id",ownerId).eq("status","received");
  if(ownerPlansError)return respond({error:"owner_plans_query_failed"},500);
  const ownerPlanIds=(ownerPlans??[]).map((item:any)=>item.id);
  const {data:ownerLots,error:ownerLotsError}=ownerPlanIds.length?await admin.from("acremap_lots").select("area_m2,part,kind,plan_id").in("plan_id",ownerPlanIds):{data:[],error:null};
  if(ownerLotsError)return respond({error:"owner_lots_query_failed"},500);
  const measured=(ownerLots??[]).filter((lot:any)=>lot.kind==="lot");
  const total=measured.reduce((sum:number,lot:any)=>sum+Math.max(0,Number(lot.area_m2)||0),0);
  const ac=measured.filter((lot:any)=>lot.part==="ac").reduce((sum:number,lot:any)=>sum+Math.max(0,Number(lot.area_m2)||0),0);
  const proprietor=measured.filter((lot:any)=>lot.part==="proprietaire").reduce((sum:number,lot:any)=>sum+Math.max(0,Number(lot.area_m2)||0),0);
  const acCount=measured.filter((lot:any)=>lot.part==="ac").length;
  const {error:ownerError}=await admin.from("proprietaires_terres").update({
   nombre_lots_agricapital:acCount,surface_totale_ha:total/10000,
   part_agricapital_ha:ac/10000,part_proprietaire_ha:proprietor/10000,
   part_agricapital_pct:total>0?ac/total*100:0,part_proprietaire_pct:total>0?proprietor/total*100:0,
   updated_at:new Date().toISOString()
  }).eq("id",ownerId);
  if(ownerError)return respond({error:"owner_summary_update_failed"},500);
 }
 return respond({ok:true,event_id:body.event_id,plan_id:planId,lots_received:lots.length,owner_summary_updated:Boolean(ownerId)});
});
function safeEqual(a:string,b:string){let d=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)d|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return d===0}
function respond(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:{...cors,"content-type":"application/json","cache-control":"no-store"}})}
