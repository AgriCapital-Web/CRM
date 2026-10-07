import { useEffect, useState } from "react";
import MainLayout from "@/components/layout/MainLayout";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Check, X, ExternalLink, FileCheck } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import TableSearchInput from "@/components/common/TableSearchInput";

type Doc = {
  id: string;
  type_document: string;
  fichier_url: string;
  statut: string;
  observations: string | null;
  created_at: string;
  validated_at: string | null;
  client_id: string | null;
  clients?: { nom_complet: string | null; id_unique: string | null } | null;
};

const STATUTS = [
  { value: "en_attente", label: "En attente", variant: "secondary" as const },
  { value: "valide", label: "Validé", variant: "default" as const },
  { value: "rejete", label: "Refusé", variant: "destructive" as const },
];

const Documents = () => {
  const { user } = useAuth();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("en_attente");
  const [motifs, setMotifs] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("documents_acquisition")
      .select("*, clients(nom_complet, id_unique)")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setDocs(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const updateStatut = async (id: string, statut: "valide" | "rejete") => {
    const obs = motifs[id] || null;
    if (statut === "rejete" && !obs) {
      toast.error("Veuillez préciser le motif du refus");
      return;
    }
    const { error } = await (supabase as any)
      .from("documents_acquisition")
      .update({
        statut,
        observations: obs,
        validated_at: new Date().toISOString(),
        validated_by: user?.id,
      })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(statut === "valide" ? "Document validé" : "Document refusé");
    load();
  };

  const getSignedUrl = async (path: string) => {
    if (!path) return;
    if (path.startsWith("http")) {
      window.open(path, "_blank");
      return;
    }
    const { data } = await supabase.storage.from("documents").createSignedUrl(path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
    else toast.error("Fichier introuvable");
  };

  const normalizedDocs = docs.map((d) => ({ ...d, statut: d.statut === "soumis" ? "en_attente" : d.statut }));
  const filtered = normalizedDocs.filter((d) =>
    (filter === "all" || d.statut === filter) &&
    JSON.stringify(d).toLowerCase().includes(search.trim().toLowerCase())
  );
  const pendingCount = normalizedDocs.filter((d) => d.statut === "en_attente").length;
  const validCount = normalizedDocs.filter((d) => d.statut === "valide").length;
  const rejectedCount = normalizedDocs.filter((d) => d.statut === "rejete").length;

  return (
    <ProtectedRoute>
      <MainLayout>
        <div className="w-full max-w-7xl mx-auto min-w-0 space-y-6">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <FileCheck className="h-7 w-7 text-primary" /> Documents
            </h1>
            <p className="text-muted-foreground">Validation des pièces réellement téléversées dans les dossiers clients.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">En attente</p><p className="mt-1 text-2xl font-bold">{pendingCount}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Validés</p><p className="mt-1 text-2xl font-bold">{validCount}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Refusés</p><p className="mt-1 text-2xl font-bold">{rejectedCount}</p></CardContent></Card>
          </div>
          </div>

          <Tabs value={filter} onValueChange={setFilter}>
            <TabsList>
              <TabsTrigger value="en_attente">En attente</TabsTrigger>
              <TabsTrigger value="valide">Validés</TabsTrigger>
              <TabsTrigger value="rejete">Refusés</TabsTrigger>
              <TabsTrigger value="all">Tous</TabsTrigger>
            </TabsList>
            <TabsContent value={filter} className="mt-4">
              <Card>
                <CardHeader>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <CardTitle className="text-base">{filtered.length} document(s)</CardTitle>
                    <TableSearchInput value={search} onChange={setSearch} placeholder="Rechercher un document…" />
                  </div>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <p className="text-center text-muted-foreground py-8">Chargement…</p>
                  ) : filtered.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">Aucun document</p>
                  ) : (
                    <div className="overflow-x-auto rounded-lg">
                      <Table className="min-w-[760px]">
                        <TableHeader>
                          <TableRow>
                            <TableHead>Client</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Statut</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filtered.map((d) => {
                            const stat = STATUTS.find((s) => s.value === d.statut);
                            return (
                              <TableRow key={d.id}>
                                <TableCell>
                                  <div className="font-medium">{d.clients?.nom_complet || "—"}</div>
                                  <div className="font-mono text-xs text-muted-foreground">{d.clients?.id_unique}</div>
                                </TableCell>
                                <TableCell className="capitalize">{d.type_document.replace(/_/g, " ")}</TableCell>
                                <TableCell className="text-xs">{new Date(d.created_at).toLocaleDateString("fr-FR")}</TableCell>
                                <TableCell>
                                  <Badge variant={stat?.variant || "secondary"}>{stat?.label || d.statut}</Badge>
                                  {d.observations && <div className="text-xs text-muted-foreground mt-1">{d.observations}</div>}
                                </TableCell>
                                <TableCell>
                                  <div className="flex flex-col items-end gap-2">
                                    <Button size="sm" variant="ghost" onClick={() => getSignedUrl(d.fichier_url)}>
                                      <ExternalLink className="h-4 w-4 mr-1" /> Ouvrir
                                    </Button>
                                    {d.statut === "en_attente" && (
                                      <>
                                        <Textarea
                                          placeholder="Motif (si refus)"
                                          className="h-16 text-xs"
                                          value={motifs[d.id] || ""}
                                          onChange={(e) => setMotifs({ ...motifs, [d.id]: e.target.value })}
                                        />
                                        <div className="flex gap-2">
                                          <Button size="sm" onClick={() => updateStatut(d.id, "valide")}>
                                            <Check className="h-4 w-4 mr-1" /> Valider
                                          </Button>
                                          <Button size="sm" variant="destructive" onClick={() => updateStatut(d.id, "rejete")}>
                                            <X className="h-4 w-4 mr-1" /> Refuser
                                          </Button>
                                        </div>
                                      </>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
};

export default Documents;