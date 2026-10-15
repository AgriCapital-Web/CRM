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

const INSTRUCTIONS = `Tu es le rédacteur technique professionnel d'AgriCapital, spécialisé dans le suivi des plantations de palmier à huile en Côte d'Ivoire.
Ta mission : transformer les notes dictées par le technicien en un rapport de terrain clair, factuel, précis, utile et directement publiable au client.

RÈGLES IMPÉRATIVES :
- Le contexte fourni contient les métadonnées fiables du formulaire : date déjà sélectionnée, nom du technicien connecté, type de visite/intervention et contexte de dossier. Utilise-les ; ne redemande pas ces données.
- N'écris JAMAIS le nom du client, le nom de la plantation, un identifiant de dossier ou une formule générique comme « Visite de suivi de la plantation… ». Le client voit déjà le dossier auquel ce rapport est rattaché.
- Ne commence jamais par « Bonjour », « Cher client », ni aucune formule de politesse. Le texte client est un message professionnel direct.
- N'invente aucune date, quantité, action réalisée, observation ou donnée agronomique. Distingue ce qui a été observé de ce qui est recommandé.
- Évite le remplissage et les répétitions. Pas de phrases creuses comme « tout est en bon état » sans éléments précis fournis.
- Si une quantité de plants mis en terre, trouvés ou remplacés n'est pas donnée, ne l'invente pas. Utilise uniquement le nombre réellement indiqué.
- Formule les recommandations de façon opérationnelle avec un délai lorsque celui-ci est fourni par le technicien. Pour les herbicides, conserve précisément les précautions données par le technicien ; ne transforme pas une consigne en validation agronomique générale et ne suggère pas de pulvériser sur les plants.
- Le titre de sortie doit être exactement « Rapport de visite » ou « Rapport d'intervention » selon le contexte, sans nom de client ou de plantation.
- Le rapport sera automatiquement précédé dans le formulaire de l'en-tête « Rapport de visite du [date] » puis « Par : [nom du technicien] ». Le corps doit donc commencer par des observations concrètes, pas répéter cet en-tête.

STRUCTURE DU CORPS :
1. « Observations » : état constaté sur le terrain, emplacement/parties concernées seulement si décrits, état des plants et nombre de plants uniquement si connu.
2. « Travaux réalisés » : uniquement les actes effectivement réalisés pendant la visite. Si aucun n'est mentionné, omettre cette rubrique.
3. « Points à corriger » : problèmes constatés, sans dramatiser ni inventer.
4. « Recommandations » : actions attendues, échéance et précautions clairement formulées.
5. « Prochaine étape » : seulement si elle découle explicitement des notes.

Pour le champ resume, fournis un bref résumé professionnel du constat principal, sans titre générique ni répétition de l'en-tête. Utilise observations, actions_realisees, problemes_constates et recommandations pour les détails. Les tableaux/listes doivent rester concis et exploitables.
"complet" vaut true uniquement lorsque les informations essentielles disponibles pour ce type de compte rendu sont présentes ; ne considère pas la date, le technicien, le nom du client ou le nom de la plantation comme des informations manquantes, car ils viennent du formulaire.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);

  const auth = req.headers.get("Authorization") || "";
  const accessToken = auth.replace(/^Bearer\s+/i, "").trim();
  if (!accessToken || accessToken.split(".").length !== 3) {
    return json({ error: "Session en ligne invalide ou expirée. Reconnectez-vous puis réessayez." }, 401);
  }
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: authError } = await supabase.auth.getUser(accessToken);
  const user = userData?.user;
  if (authError || !user) {
    console.warn("Compte rendu: session Supabase refusée", authError?.message || "utilisateur absent");
    return json({ error: "Session en ligne invalide ou expirée. Reconnectez-vous puis réessayez." }, 401);
  }
  const adminClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const [{ data: staff }, { data: assignedRoles, error: rolesError }] = await Promise.all([
    adminClient.rpc("is_staff", { _user_id: user.id }),
    adminClient.from("user_roles").select("role").eq("user_id", user.id),
  ]);
  if (rolesError) console.error("Impossible de vérifier les rôles du compte rendu technique", rolesError);
  const roles = (assignedRoles || []).map((row: { role: string }) => String(row.role || "").trim().toLowerCase());
  const executiveAccess = roles.some((role: string) => ["pdg", "dg", "admin", "super_admin"].includes(role));
  if (!staff && !executiveAccess) return json({ error: "Accès réservé au personnel" }, 403);

  let description = "";
  let contexte = "";
  try {
    const body = await req.json();
    description = String(body?.description || "").trim();
    contexte = String(body?.contexte || "").trim();
  } catch { /* invalid body */ }
  if (description.length < 10) return json({ error: "Décrivez l'intervention (au moins quelques mots)." }, 400);
  if (description.length > 8000) return json({ error: "Description trop longue (8000 caractères max)." }, 400);

  // Moteur interne déterministe : aucune API de modèle externe, aucun crédit IA consommé.
  // Il organise les notes fournies, mais ne prétend pas comprendre comme un grand modèle.
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const clean = (value: string) => value.replace(/\s+/g, " ").trim().replace(/[.;, ]+$/, "");
  const chunks = description.split(/(?<=[.!?])\s+|\n+/).map(clean).filter(Boolean);
  const source = description.trim();
  const normalized = normalize(source);
  const pick = (patterns: RegExp[]) => chunks.filter((line) => patterns.some((pattern) => pattern.test(normalize(line))));
  const actionLines = pick([/\b(j ai|j'ai|nous avons|effectue|realise|nettoye|plante|remplace|taille|desherbe|desherbage|mesure|controle|verifie|installe|repare|applique|pose|termine|acheve)\b/]);
  const problemLines = pick([/\b(probleme|malade|jaune|seche|mort|manquant|mauvais|envahi|mauvais etat|ravageur|attaque|adventice|mauvaises herbes|retard|casse|absence|defaut|difficulte)\b/]);
  const recommendationLines = pick([/\b(recomm|prevoir|doit|devrait|il faut|a faire|programmer|planifier|dans [0-9]+ jours|semaine prochaine|suivi|surveiller|nettoyer|entretenir|proteger)\b/]).filter((line) => !actionLines.includes(line));
  const knownCounts = source.match(/\b\d+\s*(?:plants?|palmiers?|pieds?)\b/ig) || [];
  const countMatch = knownCounts.join(" ").match(/\d+/);
  const title = /intervention/i.test(contexte) ? "Rapport d'intervention" : "Rapport de visite technique";
  const observations = chunks.filter((line) => !actionLines.includes(line) && !recommendationLines.includes(line));
  const resume = clean(observations[0] || chunks[0] || source);
  const missing: string[] = [];
  if (!observations.length) missing.push("Préciser les observations réellement constatées sur le terrain.");
  if (!actionLines.length) missing.push("Préciser les travaux effectivement réalisés, ou indiquer qu'aucun travail n'a été réalisé.");
  if (!recommendationLines.length) missing.push("Ajouter une prochaine étape ou confirmer qu'aucune action complémentaire n'est nécessaire.");
  const output = {
    titre: title,
    type_intervention: contexte.slice(0, 300),
    resume,
    actions_realisees: actionLines,
    observations: observations.join(" "),
    problemes_constates: problemLines,
    recommandations: recommendationLines,
    nombre_plants_realises: countMatch ? Number(countMatch[0]) : null,
    informations_manquantes: missing,
    complet: missing.length === 0,
  };
  return json({ compte_rendu: output, moteur: "AgriCapital Interne", mode: "regles", avertissement: "Brouillon structuré par règles. Vérifiez les observations, les actions et les recommandations avant publication." });

});
