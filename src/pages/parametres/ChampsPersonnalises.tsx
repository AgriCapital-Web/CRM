import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const ChampsPersonnalises = () => (
  <div className="space-y-6">
    <Card>
      <CardHeader>
        <CardTitle>Champs personnalisés</CardTitle>
      </CardHeader>
      <CardContent>
        <div role="note" className="rounded-md border bg-muted/30 p-4 text-sm leading-relaxed">
          <p className="font-medium">La création de champs personnalisés n’est pas encore connectée à la base de données ni aux formulaires métier.</p>
          <p className="mt-2 text-muted-foreground">L’ancien écran affichait des champs de saisie et un bouton « Ajouter le champ », mais aucune donnée n’était enregistrée. Ces commandes ont été retirées afin de ne pas laisser croire qu’un champ a été créé. Pour activer cette fonction correctement, il faudra une définition persistée en base et son intégration explicite aux formulaires concernés.</p>
        </div>
      </CardContent>
    </Card>
  </div>
);

export default ChampsPersonnalises;
