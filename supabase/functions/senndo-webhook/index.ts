import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { verifyWebhookSignature } from "npm:@senndo/sdk@1.5.0";

const URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(URL, SERVICE_KEY);
const responseHeaders = { "Content-Type":"application/json", "Cache-Control":"no-store", "X-Content-Type-Options":"nosniff" };
const reply = (body:unknown,status=200) => new Response(JSON.stringify(body),{status,headers:responseHeaders});
const sha256 = async (value:string) => {
 const bytes = await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
 return [...new Uint8Array(bytes)].map((b)=>b.toString(16).padStart(2,"0")).join("");
};
const str = (v:unknown) => typeof v === "string" ? v : "";

Deno.serve(async (req) => {
 if (req.method !== "POST") return reply({error:"POST requis"},405);
 const raw = await req.text();
 if (!raw || raw.length > 1024 * 1024) return reply({error:"Corps invalide"},400);
 const signature = req.headers.get("X-Senndo-Signature") || req.headers.get("x-senndo-signature") || "";
 const {data:secret,error:secretError} = await admin.rpc("senndo_get_secret",{p_name:"senndo_webhook_secret"});
 if (secretError || !secret) return reply({error:"Webhook non configuré"},503);
 let verified = false;
 try { verified = await verifyWebhookSignature(secret,signature,raw); } catch { verified = false; }
 if (!verified) return reply({error:"Signature invalide"},401);
 let event:any;
 try { event = JSON.parse(raw); } catch { return reply({error:"JSON invalide"},400); }
 const type = str(event?.type) || str(event?.event);
 const data = event?.data && typeof event.data === "object" ? event.data : event;
 const messageId = str(data?.id) || str(data?.messageId) || str(data?.message_id) || str(data?.message?.id);
 const eventId = str(event?.id) || str(event?.event_id) || await sha256(raw);
 const status = (str(data?.status) || str(data?.delivery?.status) || str(data?.verdict?.status) || str(data?.result?.status)).toLowerCase();
 let receiptId:string;
 const inserted = await admin.from("notification_provider_webhook_receipts").insert({
   fournisseur:"senndo",event_id:eventId,event_type:type || "unknown",provider_message_id:messageId || null,payload:event
 }).select("id").maybeSingle();
 if (inserted.error?.code === "23505") {
   const {data: prior,error: priorError} = await admin.from("notification_provider_webhook_receipts")
     .select("id,processed_at").eq("fournisseur","senndo").eq("event_id",eventId).maybeSingle();
   if (priorError || !prior) return reply({error:"Événement existant introuvable"},500);
   if (prior.processed_at) return reply({ok:true,duplicate:true});
   receiptId = prior.id;
 } else if (inserted.error || !inserted.data) {
   return reply({error:"Échec d'enregistrement de l'événement"},500);
 } else {
   receiptId = inserted.data.id;
 }
 try {
   const eventType = type.toLowerCase();
   let deliveryStatus:string|null = null;
   if (eventType.includes("read") || status === "read" || status === "lu") deliveryStatus = "lu";
   else if (eventType.includes("deliver") || eventType.includes("call.completed") || status === "delivered" || status === "livre" || status === "completed") deliveryStatus = "livre";
   else if (eventType.includes("fail") || status === "failed" || status === "undelivered") deliveryStatus = "echoue";
   else if (eventType.includes("sent") || eventType.includes("call.started") || eventType.includes("call.answered") || status === "sent" || status === "accepted" || status === "queued" || status === "answered") deliveryStatus = "envoye";
   if (messageId && deliveryStatus) {
     const { data: priorDelivery, error: lookupError } = await admin.from("notification_deliveries")
       .select("id,metadata").eq("fournisseur","senndo").eq("provider_message_id",messageId).maybeSingle();
     if (lookupError) throw lookupError;
     if (!priorDelivery) {
       await admin.from("notification_provider_webhook_receipts").update({processing_error:"Livraison non encore associée à l'identifiant Senndo"}).eq("id",receiptId);
       return reply({error:"Livraison en cours d'association; Senndo peut réessayer"},503);
     }
     const priorMetadata = priorDelivery.metadata && typeof priorDelivery.metadata === "object" ? priorDelivery.metadata : {};
     const now = new Date().toISOString();
     const patch:any = {statut:deliveryStatus,provider_status:status || type,metadata:{...priorMetadata,senndo_event_type:type,senndo_status:status,senndo_event_id:eventId}};
     if (deliveryStatus === "echoue") patch.erreur = str(data?.failureReason) || str(data?.error) || str(data?.failureCode) || str(data?.delivery?.failureReason) || "Échec signalé par Senndo";
     if (deliveryStatus === "envoye" || deliveryStatus === "livre" || deliveryStatus === "lu") patch.sent_at = now;
     if (deliveryStatus === "livre" || deliveryStatus === "lu") patch.delivered_at = now;
     if (deliveryStatus === "lu") patch.read_at = now;
     const { error: updateError } = await admin.from("notification_deliveries").update(patch).eq("id",priorDelivery.id);
     if (updateError) throw updateError;
   }
   await admin.from("notification_provider_webhook_receipts").update({processed_at:new Date().toISOString(),processing_error:null}).eq("id",receiptId);
   return reply({ok:true});
 } catch {
   await admin.from("notification_provider_webhook_receipts").update({processing_error:"Traitement de statut échoué"}).eq("id",receiptId);
   return reply({error:"Traitement de l'événement échoué"},500);
 }
});