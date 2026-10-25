import MainLayout from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, FileSpreadsheet, Presentation, Files, ExternalLink, Calculator, ShieldCheck, Cloud, Settings2 } from "lucide-react";
import { Link } from "react-router-dom";

const officeUrl = (import.meta.env.VITE_OFFICE_SUITE_URL || "").trim().replace(/\/$/, "");

const WorkspaceOffice = () => {
  const configured = /^https:\/\//i.test(officeUrl);

  const openOffice = () => {
    if (!configured) return;
    window.open(officeUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <MainLayout>
      <div className="mx-auto w-full max-w-7xl min-w-0 space-y-6">
        <header className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Suite bureautique</h1>
            <Badge variant={configured ? "default" : "secondary"}>{configured ? "URL configurée" : "Configuration requise"}</Badge>
          </div>
          <p className="max-w-3xl text-sm text-muted-foreground md:text-base">
            Espace de travail documentaire d’AgriCapital 360. Ouvrez la suite collaborative pour créer et modifier vos documents, tableurs et présentations.
          </p>
        </header>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-3 text-primary"><Files className="h-6 w-6" /></div>
              <div className="min-w-0">
                <CardTitle>Documents collaboratifs</CardTitle>
                <CardDescription>Nextcloud et ONLYOFFICE Document Server</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {configured ? (
              <>
                <p className="text-sm text-muted-foreground">
                  La suite s’ouvre dans un nouvel onglet sécurisé. Connectez-vous avec le compte documentaire qui vous a été attribué.
                </p>
                <Button onClick={openOffice} className="gap-2">
                  Ouvrir la suite bureautique <ExternalLink className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
                <div className="flex items-center gap-2 font-medium"><Settings2 className="h-4 w-4" /> Configuration nécessaire</div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Définissez <code>VITE_OFFICE_SUITE_URL</code> dans l’environnement de production Vercel après avoir déployé et testé Nextcloud et ONLYOFFICE sur le serveur documentaire. Aucun secret ne doit être placé dans cette variable publique.
                </p>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border p-3"><FileText className="mb-2 h-5 w-5 text-primary" /><p className="font-medium">Documents</p><p className="text-xs text-muted-foreground">Courriers, contrats et rapports</p></div>
              <div className="rounded-lg border p-3"><FileSpreadsheet className="mb-2 h-5 w-5 text-primary" /><p className="font-medium">Tableurs</p><p className="text-xs text-muted-foreground">Budgets, calculs et analyses</p></div>
              <div className="rounded-lg border p-3"><Presentation className="mb-2 h-5 w-5 text-primary" /><p className="font-medium">Présentations</p><p className="text-xs text-muted-foreground">Supports et synthèses</p></div>
            </div>
          </CardContent>
        </Card>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Accès rapides dans AgriCapital 360</h2>
          <div className="grid gap-3 md:grid-cols-3">
            <Card>
              <CardHeader><Calculator className="h-5 w-5 text-primary" /><CardTitle className="text-base">Planification budgétaire</CardTitle><CardDescription>Prévisions, scénarios, exécution et rapprochement financier.</CardDescription></CardHeader>
              <CardContent><Button asChild variant="outline" className="w-full"><Link to="/planification-budgetaire">Ouvrir la planification</Link></Button></CardContent>
            </Card>
            <Card>
              <CardHeader><Files className="h-5 w-5 text-primary" /><CardTitle className="text-base">Documents CRM</CardTitle><CardDescription>Contrôler, valider et retrouver les pièces associées aux dossiers.</CardDescription></CardHeader>
              <CardContent><Button asChild variant="outline" className="w-full"><Link to="/documents">Ouvrir les documents</Link></Button></CardContent>
            </Card>
            <Card>
              <CardHeader><Cloud className="h-5 w-5 text-primary" /><CardTitle className="text-base">Espace de travail</CardTitle><CardDescription>Retrouver l’agenda, les tâches, les projets et les équipes.</CardDescription></CardHeader>
              <CardContent><Button asChild variant="outline" className="w-full"><Link to="/espace-travail-360">Ouvrir l’espace de travail</Link></Button></CardContent>
            </Card>
          </div>
        </section>

        <Card className="border-dashed">
          <CardContent className="flex items-start gap-3 p-4">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div className="space-y-1">
              <p className="font-medium">Sécurité et état de l’intégration</p>
              <p className="text-sm text-muted-foreground">
                L’accès au portail documentaire est relié aux permissions CRM. Les comptes et droits internes de Nextcloud restent administrés sur le serveur documentaire. La synchronisation automatique des fichiers entre le stockage CRM et Nextcloud/ONLYOFFICE n’est pas considérée active tant que la liaison API/WebDAV sécurisée et les tests de bout en bout ne sont pas déployés et validés.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
};

export default WorkspaceOffice;
