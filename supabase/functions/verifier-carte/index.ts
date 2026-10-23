import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    let code = url.searchParams.get("code") ?? "";
    if (!code && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      code = typeof body?.code === "string" ? body.code : "";
    }
    code = code.trim();

    if (!/^[A-Za-z0-9-]{6,64}$/.test(code)) {
      return new Response(JSON.stringify({ valide: false, error: "Code invalide" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceRoleKey) {
      console.error("verifier-carte configuration missing");
      return new Response(JSON.stringify({ valide: false, error: "Service de vérification indisponible" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data, error } = await admin.rpc("verifier_carte", { _code: code });
    if (error) {
      console.error("verifier-carte rpc error", error.message);
      return new Response(JSON.stringify({ valide: false, error: "Vérification impossible" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      return new Response(JSON.stringify({ valide: false, error: "Carte inconnue" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // The source object remains private. Only return a short-lived signed URL for
    // the specific photo attached to the card/profile returned for this code.
    const carte = { ...row, photo_url: null as string | null };
    const bucket = typeof row.photo_bucket === "string" ? row.photo_bucket : "";
    const photoPath = typeof row.photo_url === "string" ? row.photo_url : "";
    if (bucket && photoPath) {
      const { data: signed, error: signedError } = await admin.storage
        .from(bucket)
        .createSignedUrl(photoPath, 60 * 30);
      if (signedError) {
        console.warn("verifier-carte photo signing failed", signedError.message);
      } else {
        carte.photo_url = signed?.signedUrl ?? null;
      }
    }

    return new Response(JSON.stringify({ valide: carte.valide === true, carte }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (e) {
    console.error("verifier-carte error", e);
    return new Response(JSON.stringify({ valide: false, error: "Erreur serveur" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
