import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const STATUTS_PLANTATION = [
  { valeur: "en_attente_da", label: "En attente PI", color: "secondary", description: "Dossier en attente de versement du Paiement Initial" },
  { valeur: "da_valide", label: "PI validé", color: "default", description: "Paiement Initial versé et validé" },
  { valeur: "en_delimitation_gps", label: "En délimitation GPS", color: "default", description: "Délimitation géographique en cours" },
  { valeur: "en_piquetage", label: "En piquetage", color: "default", description: "Piquetage du terrain en cours" },
  { valeur: "en_plantation", label: "En plantation", color: "default", description: "Mise en terre des plants en cours" },
  { valeur: "en_croissance", label: "En croissance", color: "default", description: "Phase de croissance des plants" },
  { valeur: "en_production", label: "En production", color: "default", description: "Plantation en phase de production" },
  { valeur: "autonomie", label: "Autonomie", color: "default", description: "Plantation autonome" },
  { valeur: "suspendue", label: "Suspendue", color: "destructive", description: "Plantation temporairement suspendue" },
  { valeur: "hypothequee", label: "Hypothéquée", color: "destructive", description: "Plantation mise en garantie" },
  { valeur: "resiliee", label: "Résiliée", color: "destructive", description: "Contrat résilié" },
  { valeur: "abandonnee", label: "Abandonnée", color: "destructive", description: "Plantation abandonnée" },
];

const STATUTS_CLIENT = [
  { valeur: "actif", label: "Actif", color: "default", description: "Client actif" },
  { valeur: "inactif", label: "Inactif", color: "secondary", description: "Client inactif temporairement" },
  { valeur: "suspendu", label: "Suspendu", color: "destructive", description: "Compte suspendu" },
  { valeur: "resilie", label: "Résilié", color: "destructive", description: "Contrat résilié" },
  { valeur: "blacklist", label: "Liste noire", color: "destructive", description: "Client en liste noire" },
];

const STATUTS_PAIEMENT = [
  { valeur: "en_attente", label: "En attente", color: "secondary", description: "En attente de paiement" },
  { valeur: "preuve_fournie", label: "Preuve fournie", color: "default", description: "Preuve de paiement reçue" },
  { valeur: "en_verification", label: "En vérification", color: "default", description: "Vérification en cours" },
  { valeur: "valide", label: "Validé", color: "default", description: "Paiement validé" },
  { valeur: "rejete", label: "Rejeté", color: "destructive", description: "Paiement rejeté" },
];

const StatusTable = ({ items }: { items: typeof STATUTS_PLANTATION }) => (
  <div className="overflow-x-auto rounded-lg border">
    <Table>
      <TableHeader><TableRow><TableHead>Statut</TableHead><TableHead>Valeur technique</TableHead><TableHead>Description</TableHead></TableRow></TableHeader>
      <TableBody>{items.map((item) => <TableRow key={item.valeur}>
        <TableCell><Badge variant={item.color as any}>{item.label}</Badge></TableCell>
        <TableCell><code className="rounded bg-muted px-2 py-1 text-xs">{item.valeur}</code></TableCell>
        <TableCell><span className="text-sm text-muted-foreground">{item.description}</span></TableCell>
      </TableRow>)}</TableBody>
    </Table>
  </div>
);

const GestionStatuts = () => (
  <div className="space-y-6">
    <Card>
      <CardHeader>
        <CardTitle>Gestion des statuts</CardTitle>
        <p className="text-sm text-muted-foreground">Référentiel des statuts métier actuellement utilisés par les processus AgriCapital.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div role="note" className="rounded-md border bg-muted/30 p-3 text-sm">
          Ces statuts sont des valeurs de référence utilisées par les workflows et la base de données. La création ou la modification libre n’est pas activée ici : les anciennes commandes d’ajout et de modification ne sauvegardaient rien. Cette page est désormais en lecture seule pour éviter toute fausse confirmation ou valeur non reconnue.
        </div>
        <Tabs defaultValue="plantation">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="plantation">Plantations</TabsTrigger>
            <TabsTrigger value="client">Clients</TabsTrigger>
            <TabsTrigger value="paiement">Paiements</TabsTrigger>
          </TabsList>
          <TabsContent value="plantation"><StatusTable items={STATUTS_PLANTATION} /></TabsContent>
          <TabsContent value="client"><StatusTable items={STATUTS_CLIENT} /></TabsContent>
          <TabsContent value="paiement"><StatusTable items={STATUTS_PAIEMENT} /></TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  </div>
);

export default GestionStatuts;
