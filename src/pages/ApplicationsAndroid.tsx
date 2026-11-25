import MainLayout from "@/components/layout/MainLayout";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Smartphone, Download, ShieldCheck, Clock3 } from "lucide-react";

export default function ApplicationsAndroid() {
  const { userRoles } = useAuth();
  const isPdg = userRoles.includes("pdg");

  return (
    <MainLayout>
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Applications Android</h1>
          <p className="mt-1 text-sm text-muted-foreground">Téléchargement des applications officielles AgriCapital.</p>
        </div>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Smartphone className="h-5 w-5" /> AgriCapital Client · APK</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">Application Android destinée aux clients AgriCapital.</p>
            <Button disabled className="gap-2"><Download className="h-4 w-4" /> Télécharger l’APK</Button>
            <p className="text-xs text-muted-foreground">Le fichier APK signé n’est pas encore disponible. Le bouton sera activé après génération et dépôt du build officiel.</p>
          </CardContent>
        </Card>
        {isPdg && <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" /> AgriCapital Client · AAB</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">Format Android App Bundle réservé au PDG pour dépôt manuel dans Google Play Console.</p>
            <Button disabled className="gap-2"><Download className="h-4 w-4" /> Télécharger l’AAB</Button>
            <p className="text-xs text-muted-foreground">Le fichier AAB signé n’est pas encore disponible. Aucun dépôt automatique sur Google Play ne sera effectué.</p>
          </CardContent>
        </Card>}
        <div className="flex items-start gap-2 rounded-lg border p-3 text-sm text-muted-foreground">
          <Clock3 className="mt-0.5 h-4 w-4 shrink-0" />
          Les accès sont séparés : APK pour les utilisateurs du CRM, AAB visible uniquement par le PDG. Les téléchargements seront activés après génération et signature des fichiers.
        </div>
      </div>
    </MainLayout>
  );
}
