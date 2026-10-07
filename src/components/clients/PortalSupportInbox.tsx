import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowUpRight, Search, UserRound } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

type RequestRow = {
  id: string;
  client_id: string;
  nom_complet: string;
  telephone: string;
  objet: string;
  message: string;
  statut: "ouvert" | "en_cours" | "resolu" | "ferme";
  created_at: string;
  clients?: { nom_complet: string | null; telephone: string | null } | null;
};

const statusLabel: Record<RequestRow["statut"], string> = {
  ouvert: "À traiter",
  en_cours: "En cours",
  resolu: "Résolu",
  ferme: "Fermé",
};

export default function PortalSupportInbox({ onOpenClient }: { onOpenClient: (clientId: string) => void }) {
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<RequestRow | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await (supabase as any)
      .from("portail_support_requests")
      .select("id,client_id,nom_complet,telephone,objet,message,statut,created_at,clients(nom_complet,telephone)")
      .order("created_at", { ascending: false })
      .limit(50);
    if (!error) {
      const rows = (data || []) as RequestRow[];
      setRequests(rows);
      setSelected((current) => current ? rows.find((r) => r.id === current.id) || null : null);
    }
  }, []);

  useEffect(() => {
    void load();
    const channel = supabase.channel("crm-portal-support-requests")
      .on("postgres_changes", { event: "*", schema: "public", table: "portail_support_requests" }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return requests;
    return requests.filter((r) => [r.nom_complet, r.telephone, r.objet, r.message].join(" ").toLowerCase().includes(q));
  }, [requests, query]);

  const openRequest = async (request: RequestRow) => {
    setSelected(request);
    if (request.statut === "ouvert") {
      await (supabase as any).from("portail_support_requests").update({ statut: "en_cours" }).eq("id", request.id);
      setRequests((items) => items.map((r) => r.id === request.id ? { ...r, statut: "en_cours" } : r));
      setSelected({ ...request, statut: "en_cours" });
    }
  };

  const pendingCount = requests.filter((r) => r.statut === "ouvert").length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertCircle className="h-5 w-5 text-primary" />
            Demandes d’accès au portail
            {pendingCount > 0 && <Badge>{pendingCount}</Badge>}
          </CardTitle>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Rechercher une demande…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 lg:grid-cols-[330px_minmax(0,1fr)]">
          <div className="max-h-[280px] overflow-y-auto space-y-1">
            {filtered.length === 0 ? (
              <p className="rounded-xl bg-muted/40 p-5 text-center text-xs text-muted-foreground">Aucune demande d’accès.</p>
            ) : filtered.map((request) => (
              <button key={request.id} onClick={() => void openRequest(request)} className={`w-full rounded-xl border p-3 text-left transition ${selected?.id === request.id ? "border-primary bg-primary/5" : "hover:bg-muted"}`}>
                <div className="flex items-start gap-2">
                  <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{request.nom_complet}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{request.telephone}</p>
                    <div className="mt-1 flex items-center gap-1">
                      <Badge variant={request.statut === "ouvert" ? "default" : "outline"} className="text-[9px]">{statusLabel[request.statut]}</Badge>
                      <span className="text-[9px] text-muted-foreground">{new Date(request.created_at).toLocaleString("fr-FR")}</span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {selected ? (
            <div className="rounded-xl border bg-muted/20 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Demande reçue</p>
                  <h3 className="mt-1 text-base font-semibold">{selected.objet}</h3>
                  <p className="text-xs text-muted-foreground">{selected.nom_complet} · {selected.telephone}</p>
                </div>
                <Badge variant={selected.statut === "ouvert" ? "default" : "outline"}>{statusLabel[selected.statut]}</Badge>
              </div>
              <div className="mt-4 whitespace-pre-wrap rounded-lg bg-background p-3 text-sm">{selected.message}</div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => onOpenClient(selected.client_id)}>
                  <ArrowUpRight className="mr-2 h-4 w-4" /> Répondre dans la conversation
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex min-h-[180px] items-center justify-center rounded-xl border border-dashed text-center text-xs text-muted-foreground">
              Sélectionnez une demande pour voir son contenu et répondre.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}