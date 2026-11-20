import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type StatusItem = { valeur: string; nombre: number };
type StatusCatalog = {
  clients_statut: StatusItem[];
  clients_statut_global: StatusItem[];
  clients_validation_statut: StatusItem[];
  plantations_statut: StatusItem[];
  plantations_statut_global: StatusItem[];
  paiements_statut: StatusItem[];
};

const EMPTY_CATALOG: StatusCatalog = {
  clients_statut: [],
  clients_statut_global: [],
  clients_validation_statut: [],
  plantations_statut: [],
  plantations_statut_global: [],
  paiements_statut: [],
};

function StatusTable({ items }: { items: StatusItem[] }) {
  if (!items.length) return <p className="py-5 text-center text-sm text-muted-foreground">Aucune valeur enregistrée.</p>;
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Valeur enregistrée</TableHead>
            <TableHead className="text-right">Enregistrements</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.valeur}>
              <TableCell><Badge variant="outline">{item.valeur}</Badge></TableCell>
              <TableCell className="text-right tabular-nums">{item.nombre.toLocaleString("fr-FR")}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function StatusSection({ title, items }: { title: string; items: StatusItem[] }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      <StatusTable items={items} />
    </section>
  );
}

const GestionStatuts = () => {
  const [catalog, setCatalog] = useState<StatusCatalog>(EMPTY_CATALOG);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void (async () => {
      setLoading(true);
      setError("");
      const { data, error: loadError } = await (supabase as any).rpc("get_crm_status_catalog");
      if (!active) return;
      if (loadError) {
        setError(loadError.message || "Impossible de charger les statuts.");
      } else {
        setCatalog({ ...EMPTY_CATALOG, ...(data || {}) });
      }
      setLoading(false);
    })();
    return () => { active = false; };
  }, []);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Statuts enregistrés dans le CRM</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Chargement des statuts…
            </div>
          ) : error ? (
            <p className="py-5 text-sm text-destructive">{error}</p>
          ) : (
            <Tabs defaultValue="clients" className="space-y-4">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="clients">Clients</TabsTrigger>
                <TabsTrigger value="plantations">Plantations</TabsTrigger>
                <TabsTrigger value="paiements">Paiements</TabsTrigger>
              </TabsList>
              <TabsContent value="clients" className="space-y-5">
                <StatusSection title="Statut du dossier" items={catalog.clients_statut} />
                <StatusSection title="Statut global" items={catalog.clients_statut_global} />
                <StatusSection title="Validation du client" items={catalog.clients_validation_statut} />
              </TabsContent>
              <TabsContent value="plantations" className="space-y-5">
                <StatusSection title="Statut de la plantation" items={catalog.plantations_statut} />
                <StatusSection title="Statut global" items={catalog.plantations_statut_global} />
              </TabsContent>
              <TabsContent value="paiements">
                <StatusSection title="Statut du paiement" items={catalog.paiements_statut} />
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default GestionStatuts;
