import { useEffect, useMemo, useState } from "react";
import { MessageSquare, Search, ChevronsUpDown, ArrowDownLeft, ArrowUpRight, Loader2 } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import MainLayout from "@/components/layout/MainLayout";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { PERMISSIONS } from "@/lib/roles";
import ClientMessagingPanel from "@/components/clients/ClientMessagingPanel";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePermissions } from "@/hooks/usePermissions";
import TableSearchInput from "@/components/common/TableSearchInput";

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
  const [results, setResults] = useState<ClientRow[]>([]);
  const [recent, setRecent] = useState<RecentMessage[]>([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loadingResults, setLoadingResults] = useState(false);
  const [loadingRecent, setLoadingRecent] = useState(true);
  const [tableSearch, setTableSearch] = useState("");

  const loadRecent = async () => {
    setLoadingRecent(true);
    const { data } = await (supabase as any)
      .from("portail_messages")
      .select("id,client_id,auteur_type,auteur_nom,message,lu,created_at,clients(id,nom_complet,telephone,type_client,type_client_foncier,proprietaire_id)")
      .order("created_at", { ascending: false })
      .limit(5);
    setRecent((data || []) as RecentMessage[]);
    setLoadingRecent(false);
  };

  const searchClients = async (term: string) => {
    setLoadingResults(true);
    let request = (supabase as any)
      .from("clients")
      .select("id,nom_complet,telephone,type_client,type_client_foncier,proprietaire_id")
      .eq("compte_actif", true)
      .order("nom_complet", { ascending: true })
      .limit(25);

    const q = term.trim();
    if (q) request = request.or(`nom_complet.ilike.%${q}%,telephone.ilike.%${q}%,id_unique.ilike.%${q}%`);

    const { data } = await request;
    setResults((data || []) as ClientRow[]);
    setLoadingResults(false);
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
    const clientId = params.get("client");
    if (clientId) void loadSelected(clientId);
    const channel = supabase.channel("crm-messaging-index")
      .on("postgres_changes", { event: "*", schema: "public", table: "portail_messages" }, () => {
        void loadRecent();
        if (selected?.id) void loadSelected(selected.id);
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => void searchClients(query), 180);
    return () => window.clearTimeout(timer);
  }, [query, open]);

  const choose = (client: ClientRow) => {
    setSelected(client);
    setParams({ client: client.id });
    setOpen(false);
  };

  const latest = useMemo(() => recent.filter((row) => JSON.stringify(row).toLowerCase().includes(tableSearch.trim().toLowerCase())), [recent, tableSearch]);

  if (!can("clients.view")) {
    return <ProtectedRoute requiredPermission={PERMISSIONS.VIEW_CLIENTS}><MainLayout><Card><CardContent className="p-8 text-center">Accès non autorisé.</CardContent></Card></MainLayout></ProtectedRoute>;
  }

  return (
    <ProtectedRoute requiredPermission={PERMISSIONS.VIEW_CLIENTS}>
      <MainLayout>
        <div className="min-w-0 space-y-5">
          <div>
            <div className="flex items-center gap-2">
              <MessageSquare className="h-6 w-6 text-primary" />
              <h1 className="text-2xl font-bold">Messagerie</h1>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Échanges avec les personnes suivies dans le portail.</p>
          </div>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Conversation</CardTitle></CardHeader>
            <CardContent>
              <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" aria-expanded={open} className="w-full max-w-xl justify-between">
                    <span className="truncate">
                      {selected ? `${selected.nom_complet || "Dossier"} · ${selected.telephone || ""}` : "Rechercher une personne…"}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[min(520px,calc(100vw-2rem))] p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput placeholder="Nom, téléphone ou identifiant…" value={query} onValueChange={setQuery} />
                    <CommandList>
                      {loadingResults ? (
                        <div className="flex items-center justify-center gap-2 p-5 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Recherche…</div>
                      ) : (
                        <>
                          <CommandEmpty>Aucun résultat.</CommandEmpty>
                          <CommandGroup>
                            {results.map((client) => (
                              <CommandItem key={client.id} value={client.id} onSelect={() => choose(client)}>
                                <div className="min-w-0">
                                  <p className="truncate font-medium">{client.nom_complet || "Dossier sans nom"}</p>
                                  <p className="truncate text-xs text-muted-foreground">{client.telephone || "—"} · {typeLabel(client)}</p>
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </>
                      )}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Derniers échanges</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table className="min-w-[760px]">
                  <div className="mb-3"><TableSearchInput value={tableSearch} onChange={setTableSearch} placeholder="Rechercher un message…" /></div>
                  <TableHeader><TableRow><TableHead>Personne</TableHead><TableHead>Sens</TableHead><TableHead>Message</TableHead><TableHead>Date</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {loadingRecent ? (
                      <TableRow><TableCell colSpan={4} className="py-8 text-center">Chargement…</TableCell></TableRow>
                    ) : latest.length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">Aucun message.</TableCell></TableRow>
                    ) : latest.map((m) => (
                      <TableRow key={m.id} className="cursor-pointer hover:bg-muted/50" onClick={() => m.clients && choose(m.clients)}>
                        <TableCell>
                          <p className="font-medium">{m.clients?.nom_complet || "—"}</p>
                          <p className="text-xs text-muted-foreground">{typeLabel(m.clients)}</p>
                        </TableCell>
                        <TableCell>
                          <Badge variant={m.auteur_type === "client" ? "outline" : "secondary"} className="gap-1">
                            {m.auteur_type === "client" ? <ArrowDownLeft className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3" />}
                            {m.auteur_type === "client" ? "Reçu" : "Envoyé"}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[420px] truncate">{m.message}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{new Date(m.created_at).toLocaleString("fr-FR")}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {selected ? (
            <ClientMessagingPanel key={selected.id} clientId={selected.id} />
          ) : (
            <Card><CardContent className="flex min-h-[300px] items-center justify-center text-center text-sm text-muted-foreground">Sélectionnez une personne pour ouvrir la conversation.</CardContent></Card>
          )}
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}
