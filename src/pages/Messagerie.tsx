import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, MessageSquare, Search, Loader2, UserRound } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import MainLayout from "@/components/layout/MainLayout";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import ClientMessagingPanel from "@/components/clients/ClientMessagingPanel";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/usePermissions";

type ClientRow = {
  id: string;
  nom_complet: string | null;
  telephone: string | null;
  type_client: string | null;
  type_client_foncier: string | null;
  proprietaire_id: string | null;
};

type RecentMessage = {
  id: string;
  client_id: string;
  auteur_type: string;
  auteur_nom: string | null;
  message: string;
  lu: boolean;
  created_at: string;
  clients?: ClientRow | null;
};

const typeLabel = (c?: ClientRow | null) => {
  if (!c) return "Client";
  if (c.proprietaire_id && c.type_client === "beneficiaire_particulier") return "Propriétaire · Bénéficiaire";
  if (c.proprietaire_id) return "Propriétaire foncier";
  if (c.type_client === "beneficiaire_particulier") return "Bénéficiaire particulier";
  return "Client";
};

export default function Messagerie() {
  const { can } = usePermissions();
  const [params, setParams] = useSearchParams();
  const [selected, setSelected] = useState<ClientRow | null>(null);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [recent, setRecent] = useState<RecentMessage[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [query, setQuery] = useState("");
  const [loadingClients, setLoadingClients] = useState(true);
  const [mobileConversation, setMobileConversation] = useState(Boolean(params.get("client")));

  const loadRecent = async () => {
    const [{ data }, { count, error: unreadError }] = await Promise.all([
      (supabase as any).from("portail_messages")
        .select("id,client_id,auteur_type,auteur_nom,message,lu,created_at,clients(id,nom_complet,telephone,type_client,type_client_foncier,proprietaire_id)")
        .order("created_at", { ascending: false })
        .limit(100),
      (supabase as any).from("portail_messages")
        .select("id", { count: "exact", head: true })
        .eq("auteur_type", "client")
        .eq("lu", false),
    ]);
    setRecent((data || []) as RecentMessage[]);
    if (!unreadError) setUnreadCount(count || 0);
  };

  const loadClients = async (term = "") => {
    setLoadingClients(true);
    let request = (supabase as any)
      .from("clients")
      .select("id,nom_complet,telephone,type_client,type_client_foncier,proprietaire_id")
      .eq("compte_actif", true)
      .order("nom_complet", { ascending: true })
      .limit(100);
    const q = term.replace(/[^\p{L}\p{N}\s+\-_.']/gu, "").trim();
    if (q) request = request.or(`nom_complet.ilike.%${q}%,telephone.ilike.%${q}%,id_unique.ilike.%${q}%`);
    const { data } = await request;
    setClients((data || []) as ClientRow[]);
    setLoadingClients(false);
  };

  const loadSelected = async (id: string) => {
    const { data } = await (supabase as any)
      .from("clients")
      .select("id,nom_complet,telephone,type_client,type_client_foncier,proprietaire_id")
      .eq("id", id)
      .maybeSingle();
    if (data) setSelected(data as ClientRow);
  };

  useEffect(() => {
    void loadRecent();
    void loadClients();
    const channel = supabase.channel("crm-messaging-index")
      .on("postgres_changes", { event: "*", schema: "public", table: "portail_messages" }, () => { void loadRecent(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    const clientId = params.get("client");
    if (!clientId) {
      setMobileConversation(false);
      return;
    }
    setMobileConversation(true);
    if (selected?.id !== clientId) void loadSelected(clientId);
  }, [params, selected?.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadClients(query), 220);
    return () => window.clearTimeout(timer);
  }, [query]);

  const choose = (client: ClientRow) => {
    setSelected(client);
    setParams({ client: client.id });
    setMobileConversation(true);
  };

  const recentByClient = useMemo(() => {
    const map = new Map<string, RecentMessage>();
    recent.forEach((message) => {
      if (!map.has(message.client_id)) map.set(message.client_id, message);
    });
    return map;
  }, [recent]);

  const orderedClients = useMemo(() => {
    const clientsCopy = [...clients];
    clientsCopy.sort((a, b) => {
      const aDate = recentByClient.get(a.id)?.created_at || "";
      const bDate = recentByClient.get(b.id)?.created_at || "";
      return bDate.localeCompare(aDate) || (a.nom_complet || "").localeCompare(b.nom_complet || "", "fr");
    });
    return clientsCopy;
  }, [clients, recentByClient]);


  if (!can("messagerie.view")) {
    return <ProtectedRoute requiredPermission={"messagerie.view" as any}><MainLayout><Card><CardContent className="p-6 text-center">Accès non autorisé.</CardContent></Card></MainLayout></ProtectedRoute>;
  }

  return (
    <ProtectedRoute requiredPermission={"messagerie.view" as any}>
      <MainLayout>
        <section className="messaging-page min-w-0 space-y-4">
          <header className="page-header gap-2">
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <MessageSquare className="h-5 w-5 shrink-0 text-primary sm:h-6 sm:w-6" />
                <h1 className="truncate text-2xl font-semibold sm:text-3xl">Messagerie</h1>
                {unreadCount > 0 && <Badge className="shrink-0">{unreadCount} non lu(s)</Badge>}
              </div>
             
            </div>
          </header>

          <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-[minmax(250px,320px)_minmax(0,1fr)] lg:gap-4">
            <Card className={`messaging-contacts min-w-0 overflow-hidden ${mobileConversation ? "hidden lg:block" : "block"}`}>
              <CardHeader className="space-y-3 p-3 sm:p-4">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">Clients</CardTitle>
                  <Badge variant="secondary">{clients.length}</Badge>
                </div>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nom, téléphone, identifiant…" className="h-10 pl-9" aria-label="Rechercher un client" />
                </div>
              </CardHeader>
              <CardContent className="max-h-[calc(100dvh-255px)] min-h-[260px] overflow-y-auto p-2 pt-0 lg:max-h-[calc(100dvh-230px)]">
                {loadingClients && clients.length === 0 ? (
                  <div className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Chargement des clients…</div>
                ) : orderedClients.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">Aucun client trouvé.</div>
                ) : (
                  <div className="space-y-1">
                    {orderedClients.map((client) => {
                      const last = recentByClient.get(client.id);
                      const active = selected?.id === client.id;
                      return (
                        <button key={client.id} type="button" onClick={() => choose(client)} className={`flex min-h-[66px] w-full min-w-0 items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? "bg-primary/10 ring-1 ring-primary/20" : ""}`}>
                          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"><UserRound className="h-4 w-4" /></span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold">{client.nom_complet || "Dossier sans nom"}</span>
                            <span className="mt-0.5 block truncate text-xs text-muted-foreground">{client.telephone || typeLabel(client)}</span>
                            <span className="mt-1 block truncate text-xs text-muted-foreground">{last?.message || typeLabel(client)}</span>
                          </span>
                          {last?.auteur_type === "client" && !last.lu && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Message non lu" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className={`messaging-conversation flex min-w-0 flex-col overflow-hidden ${mobileConversation ? "flex" : "hidden lg:flex"}`}>
              {selected ? (
                <>
                  <CardHeader className="border-b p-3 sm:p-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 lg:hidden" onClick={() => setMobileConversation(false)} aria-label="Retour à la liste des clients"><ArrowLeft className="h-4 w-4" /></Button>
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><UserRound className="h-4 w-4" /></div>
                      <div className="min-w-0 flex-1">
                        <CardTitle className="truncate text-base">{selected.nom_complet || "Dossier sans nom"}</CardTitle>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">{selected.telephone || "Téléphone non renseigné"} · {typeLabel(selected)}</p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="min-h-0 min-w-0 flex-1 p-2 sm:p-4">
                    <ClientMessagingPanel key={selected.id} clientId={selected.id} />
                  </CardContent>
                </>
              ) : (
                <CardContent className="flex min-h-[360px] flex-1 flex-col items-center justify-center px-5 py-10 text-center">
                  <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground"><MessageSquare className="h-5 w-5" /></span>
                  <p className="font-medium">Aucune conversation sélectionnée</p>
                  
                  <Button variant="outline" className="mt-4 lg:hidden" onClick={() => setMobileConversation(false)}>Voir les clients</Button>
                </CardContent>
              )}
            </Card>
          </div>
        </section>
      </MainLayout>
    </ProtectedRoute>
  );
}
