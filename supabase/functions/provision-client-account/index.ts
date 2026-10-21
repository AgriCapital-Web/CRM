import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-agricapital-account-secret",
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const normalizePhone = (value: string) => {
  const raw = String(value || "").trim().replace(/[^0-9+]/g, "");
  if (raw.startsWith("+")) return raw;
  if (raw.startsWith("225") && raw.length === 13) return "+" + raw;
  if (raw.length === 10) return "+225" + raw;
  return raw;
};

const randomPassword = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("") + "Aa!9";
};

const findUser = async (admin: any, phone: string, email: string) => {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const user = (data?.users || []).find((u: any) =>
      (phone && u.phone === phone) || (email && u.email?.toLowerCase() === email.toLowerCase())
    );
    if (user || !data?.users || data.users.length < 1000) return user || null;
  }
  return null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "POST requis" }, 405);

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const secret = Deno.env.get("NOTIFICATION_CRON_SECRET") || "";
  const internal = req.headers.get("x-agricapital-account-secret") || "";
  if ((!secret || internal !== secret) && internal !== serviceKey) {
    return json({ success: false, error: "Non autorisé" }, 401);
  }

  try {
    const body = await req.json();
    const clientId = String(body?.client_id || "");
    if (!clientId) return json({ success: false, error: "client_id requis" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: s, error: sError } = await admin.from("clients")
      .select("id,user_id,nom_complet,telephone,email,numero_contrat,id_unique,compte_actif")
      .eq("id", clientId).single();
    if (sError) throw sError;
    if (!s) return json({ success: false, error: "Client introuvable" }, 404);
    if (!s.compte_actif) return json({ success: false, error: "Compte client non activé" }, 409);
    if (s.user_id) return json({ success: true, user_id: s.user_id, already_linked: true });

    const phone = normalizePhone(s.telephone || "");
    const username = String(s.numero_contrat || s.id_unique || s.id).trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
    const suppliedEmail = String(s.email || "").trim().toLowerCase();
    const realEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(suppliedEmail) ? suppliedEmail : "";
    const email = realEmail || `${username}@clients.agricapital.ci`;
    if (!phone && !email) return json({ success: false, error: "Téléphone ou email client manquant" }, 400);

    let user = await findUser(admin, phone, email);
    if (!user) {
      const attrs: any = {
        password: randomPassword(),
        user_metadata: {
          nom_complet: s.nom_complet,
          numero_client: s.numero_contrat || s.id_unique || s.id,
          username,
          role: "client",
          client_id: s.id,
        },
      };
      if (phone) { attrs.phone = phone; attrs.phone_confirm = true; }
      if (email) { attrs.email = email; attrs.email_confirm = true; }
      const { data, error } = await admin.auth.admin.createUser(attrs);
      if (error) throw error;
      user = data.user;
    }

    const { error: profileError } = await admin.from("profiles").upsert({
      user_id: user.id,
      username,
      nom_complet: s.nom_complet,
      email: realEmail || null,
      telephone: s.telephone || null,
      actif: true,
      poste: "client",
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (profileError) throw profileError;

    const { error: updateError } = await admin.from("clients")
      .update({ user_id: user.id, compte_actif: true, updated_at: new Date().toISOString() })
      .eq("id", s.id);
    if (updateError) throw updateError;

    return json({ success: true, user_id: user.id, phone, email, username, created: !s.user_id });
  } catch (error: any) {
    console.error("provision-client-account internal error:", error);
    return json({ success: false, code:"TEMPORARY_SERVICE_ERROR", error:"La création de l’accès client n’a pas pu aboutir. Veuillez réessayer ou contacter AgriCapital au +225 05 64 55 17 17." }, 500);
  }
});
