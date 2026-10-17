Deno.serve(async (req) => {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  return new Response(JSON.stringify({
    success: false,
    error: "Cet endpoint historique est désactivé. Utilisez le parcours client et paiement actuel d’AgriCapital.",
  }), { status: 410, headers });
});