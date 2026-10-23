import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { BadgeCheck, ShieldAlert, Search, Loader2, UserRound, IdCard, CalendarCheck, BriefcaseBusiness, ShieldCheck } from "lucide-react";
import ScanCarteDialog from "@/components/cartes/ScanCarteDialog";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { contratLabel } from "@/components/cartes/CartePersonnel";

interface CarteVerifiee {
  matricule: string;
  nom_complet: string;
  poste: string | null;
  type_contrat: string | null;
  role_code?: string | null;
  date_expiration: string | null;
  date_delivrance?: string | null;
  statut: string | null;
  valide: boolean;
  photo_url?: string | null;
  photo_bucket?: string | null;
}

const fdate = (d?: string | null) => {
  if (!d) return "—";
  const date = new Date(d);
  return Number.isNaN(date.getTime()) ? "—" : format(date, "dd MMMM yyyy", { locale: fr });
};

const VerificationCarte = () => {
  const { code } = useParams();
  const navigate = useNavigate();
  const [saisie, setSaisie] = useState(code || "");
  const [loading, setLoading] = useState(false);
  const [carte, setCarte] = useState<CarteVerifiee | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [scanOpen, setScanOpen] = useState(true);
  // verifier-carte supplies a short-lived signed URL; use it directly because public visitors cannot sign private storage objects.
  const isPdg = String(carte?.role_code || "").toLowerCase() === "pdg";

  const verifier = async (valeur: string) => {
    const c = valeur.trim();
    setCarte(null);
    setErreur(null);
    if (!/^[A-Za-z0-9-]{6,64}$/.test(c)) {
      setErreur("Code de vérification invalide.");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("verifier-carte", { body: { code: c } });
      const payload: any = data;
      if (error || !payload?.carte) {
        setErreur("Aucune carte ne correspond à ce code.");
      } else {
        setCarte(payload.carte as CarteVerifiee);
      }
    } catch {
      setErreur("Vérification impossible pour le moment.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (code) void verifier(code);
  }, [code]);

  const initials = (carte?.nom_complet || "AC").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((n) => n[0]?.toUpperCase()).join("");

  return (
    <main className="min-h-screen w-full overflow-x-hidden bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/90 via-primary to-primary-hover px-3 py-6 sm:px-5 sm:py-10">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
        <header className="flex flex-col items-center gap-3 text-center">
          <div className="rounded-xl bg-white px-3 py-2 shadow-sm"><img src="/images/Logo%20%20AgriCapital%20-360%C2%B0.png?v=20261023-official" alt="AgriCapital" className="h-12 max-w-[min(80vw,18rem)] object-contain sm:h-16" /></div>
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary-foreground/75">Sécurité & authenticité</p>
            <h1 className="text-xl font-extrabold tracking-tight text-primary-foreground sm:text-3xl">Vérification de carte professionnelle</h1>
            <p className="mx-auto max-w-lg text-sm leading-relaxed text-primary-foreground/80">Contrôlez l’identité du titulaire et le statut de sa carte depuis le registre AgriCapital.</p>
          </div>
        </header>

        <Card className="w-full overflow-hidden rounded-2xl border-0 shadow-2xl">
          <CardHeader className="border-b bg-muted/30 px-4 py-4 sm:px-6">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg"><Search className="h-5 w-5 shrink-0 text-primary" />Rechercher une carte</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 p-4 sm:p-6">
            <form className="flex min-w-0 flex-col gap-2 sm:flex-row" onSubmit={(e) => {
              e.preventDefault();
              const nextCode = saisie.trim();
              navigate(nextCode ? `/verify/${encodeURIComponent(nextCode)}` : "/verify");
              if (nextCode) void verifier(nextCode);
            }}>
              <Input value={saisie} onChange={(e) => setSaisie(e.target.value)} placeholder="Code de vérification" className="h-11 w-full min-w-0" autoCapitalize="characters" />
              <Button type="submit" className="h-11 w-full shrink-0 sm:w-auto" disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                Vérifier
              </Button>
            </form>

            <ScanCarteDialog open={scanOpen} onOpenChange={setScanOpen} onCode={(c) => {
              setSaisie(c);
              navigate(`/verify/${encodeURIComponent(c)}`);
              void verifier(c);
            }} />

            {erreur && <div role="alert" className="flex min-w-0 items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3 sm:p-4">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              <div className="min-w-0"><p className="text-sm font-bold text-destructive">Carte non vérifiée</p><p className="mt-1 break-words text-sm text-muted-foreground">{erreur}</p></div>
            </div>}

            {carte && <section aria-live="polite" className={`overflow-hidden rounded-2xl border ${carte.valide ? "border-emerald-600/30" : "border-destructive/30"}`}>
              <div className={`flex min-w-0 items-start gap-3 p-4 sm:items-center sm:gap-4 sm:p-5 ${carte.valide ? "bg-emerald-600/10" : "bg-destructive/10"}`}>
                <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border-2 border-background bg-muted shadow-sm sm:h-28 sm:w-28">
                  {carte.photo_url ? <img src={carte.photo_url} alt={`Photo de ${carte.nom_complet}`} className="h-full w-full object-cover object-center" /> : <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground"><UserRound className="h-7 w-7 sm:h-9 sm:w-9" /><span className="px-1 text-center text-[9px] font-semibold uppercase leading-tight tracking-wide">Photo non renseignée</span><span className="text-[10px] font-semibold text-muted-foreground/70">{initials || "AC"}</span></div>}
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <Badge variant={carte.valide ? "default" : "destructive"} className="max-w-full whitespace-normal">
                    {carte.valide ? <BadgeCheck className="mr-1 h-3.5 w-3.5 shrink-0" /> : <ShieldAlert className="mr-1 h-3.5 w-3.5 shrink-0" />}
                    {carte.valide ? "Carte authentique et valide" : "Carte non valide"}
                  </Badge>
                  <h2 className="break-words text-lg font-extrabold uppercase leading-tight tracking-tight sm:text-2xl">{carte.nom_complet || "Titulaire non renseigné"}</h2>
                  <p className="break-words text-sm font-medium text-muted-foreground">{carte.poste || (isPdg ? "Fondateur — PDG" : "Fonction non renseignée")}</p>
                  <p className="break-all font-mono text-xs text-muted-foreground">Matricule : {carte.matricule || "—"}</p>
                </div>
              </div>

              <div className="grid min-w-0 grid-cols-1 gap-0 sm:grid-cols-2">
                <div className="flex min-w-0 items-start gap-3 border-b p-4 sm:border-r">
                  <BriefcaseBusiness className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0"><p className="text-xs font-medium text-muted-foreground">Type de contrat</p><p className="break-words text-sm font-semibold">{isPdg ? "Sans objet — Fondateur" : contratLabel(carte.type_contrat)}</p></div>
                </div>
                <div className="flex min-w-0 items-start gap-3 border-b p-4">
                  <CalendarCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0"><p className="text-xs font-medium text-muted-foreground">Validité</p><p className="break-words text-sm font-semibold">{isPdg ? "Indéterminée" : carte.date_expiration ? fdate(carte.date_expiration) : "Indéterminée"}</p></div>
                </div>
                <div className="flex min-w-0 items-start gap-3 border-b p-4 sm:border-r sm:border-b-0">
                  <IdCard className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0"><p className="text-xs font-medium text-muted-foreground">Délivrance</p><p className="break-words text-sm font-semibold">{fdate(carte.date_delivrance)}</p></div>
                </div>
                <div className="flex min-w-0 items-start gap-3 p-4">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0"><p className="text-xs font-medium text-muted-foreground">Statut administratif</p><div className="mt-1"><Badge variant={carte.statut === "active" ? "default" : "destructive"}>{carte.statut === "active" ? "Active" : carte.statut === "suspendue" ? "Suspendue" : "Révoquée"}</Badge></div></div>
                </div>
              </div>
              <div className="flex items-start gap-2 border-t bg-muted/30 px-4 py-3 text-xs leading-relaxed text-muted-foreground sm:px-5">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <p className="min-w-0 break-words">Cette fiche est issue du registre de vérification AgriCapital. La photo et les informations affichées dépendent des données enregistrées pour cette carte.</p>
              </div>
            </section>}
          </CardContent>
        </Card>
        <footer className="pb-2 text-center text-xs text-primary-foreground/70">AgriCapital S.A.R.L. · Daloa-Gonaté, Côte d’Ivoire</footer>
      </div>
    </main>
  );
};

export default VerificationCarte;
