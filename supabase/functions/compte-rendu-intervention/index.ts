import { createOpenAI } from "npm:@ai-sdk/openai";
import { streamText, Output, jsonSchema } from "npm:ai";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-lovable-aig-run-id",
  "Access-Control-Expose-Headers": "X-Lovable-AIG-Run-ID",
};
const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, ...extra, "Content-Type": "application/json" } });

const schema = jsonSchema({
  type: "object",
  additionalProperties: false,
  properties: {
    titre: { type: "string" },
    type_intervention: { type: "string" },
    resume: { type: "string" },
    actions_realisees: { type: "array", items: { type: "string" } },
    observations: { type: "string" },
    problemes_constates: { type: "array", items: { type: "string" } },
    recommandations: { type: "array", items: { type: "string" } },
    nombre_plants_realises: { type: ["number", "null"] },
    informations_manquantes: { type: "array", items: { type: "string" } },
    complet: { type: "boolean" },
  },
  required: ["titre", "type_intervention", "resume", "actions_realisees", "observations", "problemes_constates", "recommandations", "nombre_plants_realises", "informations_manquantes", "complet"],
});

const INSTRUCTIONS = `Tu es l'assistant technique d'AgriCapital (plantations de palmier à huile, Côte d'Ivoire).
À partir de la description libre d'un agent technique, rédige un compte rendu d'intervention structuré, en français professionnel.
N'invente jamais d'information : si une donnée n'est pas dans la description, laisse le champ vide (ou null) et ajoute-la dans "informations_manquantes".
Informations attendues pour un compte rendu complet : date, client ou parcelle concernée, type d'intervention (validation parcelle, défrichage, piquetage, trouaison, mise en terre, entretien, remplacement…), surface ou nombre de plants, état observé, problèmes, actions réalisées, prochaines étapes.
"complet" vaut true seulement si aucune information essentielle ne manque.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);

  const auth = req.headers.get("Authorization") || "";
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: { user } } = await supabase.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
  if (!user) return json({ error: "Connexion requise" }, 401);
  const { data: staff } = await supabase.rpc("is_staff", { _user_id: user.id });
  if (!staff) return json({ error: "Accès réservé au personnel" }, 403);

  let description = "";
  let contexte = "";
  try {
    const body = await req.json();
    description = String(body?.description || "").trim();
    contexte = String(body?.contexte || "").trim();
  } catch { /* invalid body */ }
  if (description.length < 10) return json({ error: "Décrivez l'intervention (au moins quelques mots)." }, 400);
  if (description.length > 8000) return json({ error: "Description trop longue (8000 caractères max)." }, 400);

  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return json({ error: "IA non configurée" }, 500);

  let runId = req.headers.get("X-Lovable-AIG-Run-ID")?.trim() || undefined;
  const provider = createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: async (input, init) => {
      const headers = new Headers(init?.headers);
      if (runId && !headers.has("X-Lovable-AIG-Run-ID")) headers.set("X-Lovable-AIG-Run-ID", runId);
      const res = await fetch(input, { ...init, headers });
      runId ??= res.headers.get("X-Lovable-AIG-Run-ID")?.trim() || undefined;
      return res;
    },
  });

  let streamError: any = null;
  try {
    const result = streamText({
      model: provider.responses("openai/gpt-6-astra"),
      system: INSTRUCTIONS,
      messages: [{ role: "user", content: `${contexte ? `Contexte connu : ${contexte}\n\n` : ""}Description de l'agent :\n${description}` }],
      output: Output.object({ schema }),
      abortSignal: req.signal,
      onError: ({ error }) => { streamError = error; },
      providerOptions: {
        openai: {
          store: false,
          forceReasoning: true,
          reasoningEffort: "low",
          reasoningSummary: "auto",
          include: ["reasoning.encrypted_content"],
        },
      },
    });
    const output = await result.output;
    return json({ compte_rendu: output }, 200, runId ? { "X-Lovable-AIG-Run-ID": runId } : {});
  } catch (e: any) {
    const err = streamError || e;
    const status = Number(err?.statusCode || err?.status || 0);
    if (req.signal.aborted) return json({ error: "Annulé" }, 499);
    if (status === 429) return json({ error: "Trop de demandes, réessayez dans un instant." }, 429);
    if (status === 402) return json({ error: "Crédits IA épuisés. Ajoutez des crédits dans l'espace de travail Lovable." }, 402);
    if (status === 403) return json({ error: "Accès à l'IA refusé pour cet espace de travail." }, 403);
    console.error("compte-rendu error", err);
    return json({ error: "Génération impossible pour le moment." }, status >= 400 ? status : 500);
  }
});
