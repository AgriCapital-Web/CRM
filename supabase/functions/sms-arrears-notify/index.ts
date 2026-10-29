import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { SenndoClient } from "npm:@senndo/sdk@1.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const formatMontant = (m:number) => new Intl.NumberFormat("fr-FR").format(Math.round(m));
const formatPhone = (phone:string) => {
  const cleaned = phone.replace(/\D/g, "");
  return cleaned.startsWith("225") ? cleaned : "225" + cleaned;
};
const sendSms = async (db:any, base:string|undefined,key:string|undefined,to:string,text:string,idempotencyKey:string) => {
  const { data: senndoKey } = await db.rpc("senndo_get_secret", { p_name: "senndo_api_key" });
  if (typeof senndoKey === "string" && senndoKey) {
    const stableKey = "agricapital-notification-" + idempotencyKey.replace(/[^a-zA-Z0-9:_-]/g, "-").slice(0, 80);
    const client = new SenndoClient({ apiKey: senndoKey, baseUrl: "https://api.senndo.com", timeoutMs: 30000, maxRetries: 2, userAgent: "AgriCapital-CRM/1.0" });
    const result = await client.sendMessage({ channel:"sms", to: to.startsWith("+") ? to : "+" + formatPhone(to), text, senderId:"AgriCapital", idempotencyKey:stableKey });
    return { sent:true, provider:"senndo", messageId:result.id || null };
  }
  if (!base || !key) return { sent:false, dev:true, provider:"senndo_not_configured" };
  const res = await fetch(`${base}/sms/2/text/advanced`, {
    method:"POST",
    headers:{ Authorization:`App ${key}`, "Content-Type":"application/json" },
    body:JSON.stringify({messages:[{destinations:[{to:formatPhone(to)}],from:"AgriCapital",text}]})
  });
  return { sent:res.ok, status:res.status, provider:"legacy_fallback" };
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null,{headers:corsHeaders});
  try {
    const authHeader=req.headers.get("Authorization");
    const cronSecret=req.headers.get("x-cron-secret");
    const expectedCron=Deno.env.get("CRON_SECRET");
    let authorized=Boolean(expectedCron && cronSecret && cronSecret===expectedCron);
    if (!authorized && authHeader?.startsWith("Bearer ")) {
      const userClient=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_ANON_KEY")!,{global:{headers:{Authorization:authHeader}}});
      const token=authHeader.replace("Bearer ","");
      const {data:claims}=await userClient.auth.getClaims(token);
      const callerId=claims?.claims?.sub as string|undefined;
      if (callerId) {
        const adminClient=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        authorized=(await adminClient.rpc("is_admin",{_user_id:callerId})).data===true;
      }
    }
    if (!authorized) return new Response(JSON.stringify({success:false,error:"Non autorisé"}),{headers:{...corsHeaders,"Content-Type":"application/json"},status:401});

    const supabase=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body=await req.json().catch(()=>({}));
    const mode=body.mode||"both";
    const results={arrears:[] as any[],upcoming:[] as any[],errors:[] as string[]};
    const today=new Date().toISOString().slice(0,10);
    const in3Days=new Date(Date.now()+3*86400000).toISOString().slice(0,10);

    const {data:clients,error:clientErr}=await supabase
      .from("clients")
      .select("id,nom_complet,telephone,user_id,paiement_personnalise,prochaine_echeance")
      .eq("compte_actif",true)
      .in("statut_global",["actif","active"]);
    if(clientErr) throw clientErr;

    for(const client of clients||[]) {
      if(!client.telephone) continue;
      const custom=client.paiement_personnalise||{};
      const monthly=custom.mensualite||{};
      const initial=custom.paiement_initial||{};
      const customActive=custom.actif===true;
      const monthlyActive=monthly.active===true && Number(monthly.montant||0)>0 && Number(monthly.nombre||0)>0;

      const {data:pending}=await supabase
        .from("paiements")
        .select("id,montant,date_echeance,statut,type_paiement,plantation_id,numero_echeance")
        .eq("client_id",client.id)
        .eq("statut","en_attente")
        .eq("type_paiement","REDEVANCE")
        .order("date_echeance",{ascending:true});

      const overdue=(pending||[]).filter(p=>p.date_echeance && p.date_echeance<today);
      const upcoming=(pending||[]).filter(p=>p.date_echeance && p.date_echeance>=today && p.date_echeance<=in3Days);
      const arrears=overdue.reduce((s,p)=>s+Number(p.montant||0),0);
      const maxDue=overdue.length?overdue[0].date_echeance:null;
      const daysLate=maxDue?Math.max(1,Math.floor((Date.now()-new Date(maxDue).getTime())/86400000)):0;

      if((mode==="arrears"||mode==="both") && monthlyActive && arrears>0) {
        const message=`AgriCapital (notification automatique): arriéré de ${formatMontant(arrears)} F CFA (${daysLate} j). Consultez votre échéancier sur pay.agricapital.ci.`;
        const sent=await sendSms(supabase,Deno.env.get("INFOBIP_BASE_URL"),Deno.env.get("INFOBIP_API_KEY"),client.telephone,message,`arrears:${client.id}:${today}`);
        results.arrears.push({client_id:client.id,montant_arriere:arrears,jours_retard:daysLate,...sent});
        if(client.user_id) await supabase.from("notifications").insert({user_id:client.user_id,type:"arrears_alert",title:`Arriéré de ${formatMontant(arrears)} F CFA`,message:`Échéancier personnalisé : ${daysLate} jour(s) de retard.`,data:{montant:arrears,jours:daysLate,personnalise:true},dedupe_key:`arrears-alert:${client.id}:${today}`});
      }

      if((mode==="upcoming"||mode==="both")) {
        if(customActive && Number(initial.solde||0)>0) {
          const solde=Number(initial.solde);
          const message=`AgriCapital (notification automatique): solde du paiement initial de ${formatMontant(solde)} F CFA. Consultez votre situation sur pay.agricapital.ci.`;
        const sent=await sendSms(supabase,Deno.env.get("INFOBIP_BASE_URL"),Deno.env.get("INFOBIP_API_KEY"),client.telephone,message,`solde-pi:${client.id}:${today}`);
          results.upcoming.push({client_id:client.id,type:"solde_pi",montant:solde,...sent});
        }
        if(monthlyActive) {
          for(const payment of upcoming.slice(0,1)) {
            const daysUntil=Math.max(0,Math.ceil((new Date(payment.date_echeance).getTime()-Date.now())/86400000));
            const message=`AgriCapital (notification automatique): échéance personnalisée de ${formatMontant(Number(payment.montant))} F CFA le ${new Date(payment.date_echeance).toLocaleDateString("fr-FR")}. pay.agricapital.ci`;
        const sent=await sendSms(supabase,Deno.env.get("INFOBIP_BASE_URL"),Deno.env.get("INFOBIP_API_KEY"),client.telephone,message,`upcoming:${payment.id}`);
            results.upcoming.push({client_id:client.id,paiement_id:payment.id,montant:Number(payment.montant),jours_restants:daysUntil,...sent});
            if(client.user_id) await supabase.from("notifications").insert({user_id:client.user_id,type:"payment_reminder",title:`Échéance le ${new Date(payment.date_echeance).toLocaleDateString("fr-FR")}`,message:`${formatMontant(Number(payment.montant))} F CFA — échéancier personnalisé.`,data:{paiement_id:payment.id,montant:payment.montant,personnalise:true},dedupe_key:`payment-reminder:${payment.id}`});
          }
        } else if(!customActive) {
          for(const payment of upcoming.slice(0,1)) {
            const daysUntil=Math.max(0,Math.ceil((new Date(payment.date_echeance).getTime()-Date.now())/86400000));
            const message=`AgriCapital (notification automatique): échéance de ${formatMontant(Number(payment.montant))} F CFA le ${new Date(payment.date_echeance).toLocaleDateString("fr-FR")}. pay.agricapital.ci`;
        const sent=await sendSms(supabase,Deno.env.get("INFOBIP_BASE_URL"),Deno.env.get("INFOBIP_API_KEY"),client.telephone,message,`upcoming:${payment.id}`);
            results.upcoming.push({client_id:client.id,paiement_id:payment.id,montant:Number(payment.montant),jours_restants:daysUntil,...sent});
          }
        }
      }
    }

    await supabase.from("historique_activites").insert({
      table_name:"sms_notifications",action:"SMS_BATCH_SENT",
      details:`Arrears: ${results.arrears.length}, Upcoming: ${results.upcoming.length}, Errors: ${results.errors.length}`
    });

    return new Response(JSON.stringify({success:true,results}),{headers:{...corsHeaders,"Content-Type":"application/json"}});
  } catch(error:any) {
    console.error("SMS notification error:",error);
    return new Response(JSON.stringify({success:false,error:error.message}),{headers:{...corsHeaders,"Content-Type":"application/json"},status:500});
  }
});