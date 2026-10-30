import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const ChampsPersonnalises = () => (
  <div className="space-y-6">
    <Card>
      <CardHeader>
        <CardTitle>Champs personnalisés</CardTitle>
      </CardHeader>
      <CardContent>
        <div role="note" className="rounded-md border bg-muted/30 p-4 text-sm leading-relaxed">
          <p className="font-medium">Fonction en préparation : les champs ne sont pas encore enregistrés ni reliés aux formulaires.</p>
          <p className="mt-2 text-muted-foreground"></p>
        </div>
      </CardContent>
    </Card>
  </div>
);

export default ChampsPersonnalises;
