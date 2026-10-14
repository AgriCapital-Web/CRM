import { createClient } from "npm:@supabase/supabase-js@2";

const BUCKET = "cartes-personnel";
const MAX_BYTES = 10 * 1024 * 1024;

const corsHeaders = (req: Request) => {
  const origin = req.headers.get("origin") || "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
  if (origin && /^https:\/\/([a-z0-9-]+\.)*agricapital\.ci$/i.test(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
};

const respond = (req: Request, body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });

async function processOne(admin: ReturnType<typeof createClient>, cardId: string, sourcePath: string) {
  if (sourcePath.startsWith("http") || sourcePath.includes("..") || sourcePath.startsWith("/")) {
    throw new Error("Chemin de photo invalide.");
  }

  const { data: card, error: cardError } = await admin
    .from("cartes_personnel")
    .select("id, profile_id, photo_url")
    .eq("id", cardId)
    .single();
  if (cardError || !card) throw new Error("Carte du personnel introuvable.");
  if (!sourcePath.startsWith(`originals/${card.profile_id}/`)) {
    throw new Error("Le chemin de la photo ne correspond pas au titulaire de la carte.");
  }

  const { data: source, error: downloadError } = await admin.storage.from(BUCKET).download(sourcePath);
  if (downloadError || !source) throw new Error("Photo source introuvable.");
  if (source.size > MAX_BYTES) throw new Error("La photo dépasse la limite de 10 Mo.");
  if (!source.type.startsWith("image/")) throw new Error("Le fichier source n'est pas une image.");

  // Traitement déterministe : aucune dépendance à un service IA tiers.
  // La photo déjà normalisée côté navigateur est copiée dans le dossier de sortie.
  const extension = source.type.includes("png") ? "png" : source.type.includes("webp") ? "webp" : "jpg";
  const targetPath = `processed/${card.profile_id}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await admin.storage.from(BUCKET).upload(targetPath, source, {
    contentType: source.type,
    upsert: false,
    cacheControl: "31536000",
  });
  if (uploadError) throw uploadError;

  const { error: updateError } = await admin
    .from("cartes_personnel")
    .update({ photo_url: targetPath })
    .eq("id", card.id);
  if (updateError) {
    await admin.storage.from(BUCKET).remove([targetPath]);
    throw updateError;
  }
  return targetPath;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
  if (req.method !== "POST") return respond(req, { error: "Méthode non autorisée." }, 405);

  try {
    const authorization = req.headers.get("Authorization") || "";
    const token = authorization.replace(/^Bearer\s+/i, "");
    if (!token) return respond(req, { error: "Authentification requise." }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) throw new Error("Configuration serveur Supabase indisponible.");

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: auth, error: authError } = await admin.auth.getUser(token);
    if (authError || !auth.user) return respond(req, { error: "Session invalide. Reconnectez-vous." }, 401);

    const [{ data: isSuperAdmin }, { data: isOperationsLead }] = await Promise.all([
      admin.rpc("has_role", { _user_id: auth.user.id, _role: "super_admin" }),
      admin.rpc("has_role", { _user_id: auth.user.id, _role: "responsable_operations" }),
    ]);
    if (!isSuperAdmin && !isOperationsLead) return respond(req, { error: "Accès non autorisé." }, 403);

    const body = await req.json().catch(() => null);
    if (!body || !["single", "batch"].includes(body.mode)) {
      return respond(req, { error: "Demande invalide : mode single ou batch requis." }, 400);
    }

    if (body.mode === "single") {
      if (typeof body.cardId !== "string" || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(body.cardId)
        || typeof body.sourcePath !== "string" || body.sourcePath.length < 3 || body.sourcePath.length > 500) {
        return respond(req, { error: "Identifiant de carte ou chemin de photo invalide." }, 400);
      }
      const path = await processOne(admin, body.cardId, body.sourcePath);
      return respond(req, { processed: 1, path });
    }

    const { data: cards, error } = await admin.from("cartes_personnel")
      .select("id, profile_id, photo_url")
      .not("photo_url", "is", null)
      .limit(100);
    if (error) throw error;

    let processed = 0;
    const failures: string[] = [];
    for (const card of cards || []) {
      if (!card.photo_url || card.photo_url.startsWith("processed/") || !card.photo_url.startsWith(`originals/${card.profile_id}/`)) continue;
      try {
        await processOne(admin, card.id, card.photo_url);
        processed += 1;
      } catch (error) {
        failures.push(`${card.id}: ${error instanceof Error ? error.message : "Échec du traitement"}`);
      }
    }
    return respond(req, { processed, failed: failures.length, failures });
  } catch (error) {
    console.error("process-card-photo failed", error instanceof Error ? error.message : "unknown error");
    return respond(req, { error: error instanceof Error ? error.message : "Erreur interne de traitement photo." }, 500);
  }
});
