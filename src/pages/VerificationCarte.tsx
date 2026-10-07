import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { BadgeCheck, ShieldAlert, Search, Loader2 } from "lucide-react";
import ScanCarteDialog from "@/components/cartes/ScanCarteDialog";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import logo from "@/assets/logo-white.png";
import { contratLabel } from "@/components/cartes/CartePersonnel";

interface CarteVerifiee {
  matricule: string;
  nom_complet: string;
  poste: string | null;
  type_contrat: string | null;
  date_expiration: string | null;
  statut: string | null;
  valide: boolean;
}

const fdate = (d?: string | null) => (d ? format(new Date(d), "dd MMMM yyyy", { locale: fr }) : "—");

const VerificationCarte = () => {
  const { code } = useParams();
  const navigate = useNavigate();
  const [saisie, setSaisie] = useState(code || "");
  const [loading, setLoading] = useState(false);
  const [carte, setCarte] = useState<CarteVerifiee | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [scanOpen, setScanOpen] = useState(true);

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
    if (code) verifier(code);
  }, [code]);

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-gradient-to-br from-primary via-primary to-primary-hover px-3 py-8 sm:px-4">
      <div className="mx-auto w-full max-w-lg space-y-4">
        <div className="flex flex-col items-center gap-2 text-center">
          <img src={logo} alt="AgriCapital" className="h-14 w-auto sm:h-20" />
          <h1 className="text-lg font-bold text-primary-foreground sm:text-2xl">
            Vérification d'une carte professionnelle
          </h1>
          <p className="max-w-md text-xs text-primary-foreground/80 sm:text-sm">
            Saisissez ou scannez le code figurant sur la carte pour confirmer son authenticité.
          </p>
        </div>

        <Card className="w-full">
          <CardHeader className="pb-3">
            <CardTitle className="text-base sm:text-lg">Code de vérification</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <form
              className="flex flex-col gap-2 sm:flex-row"
              onSubmit={(e) => {
                e.preventDefault();
                navigate(`/verify/${saisie.trim()}`);
                verifier(saisie);
              }}
            >
              <Input
                value={saisie}
                onChange={(e) => setSaisie(e.target.value)}
                placeholder="Ex: AC7F3K9QX2"
                className="h-11 w-full min-w-0"
                autoCapitalize="characters"
              />
              <Button type="submit" className="h-11 w-full sm:w-auto" disabled={loading}>
                {loading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Search className="mr-1 h-4 w-4" />}
                Vérifier
              </Button>
            </form>

            <ScanCarteDialog
              open={scanOpen}
              onOpenChange={setScanOpen}
              onCode={(c) => {
                setSaisie(c);
                navigate(`/verify/${c}`);
                verifier(c);
              }}
            />


            {erreur && (
              <div className="flex items-start gap-2 rounded-lg border-2 border-destructive/40 bg-destructive/5 p-3">
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-destructive">Carte non vérifiée</p>
                  <p className="break-words text-xs text-muted-foreground">{erreur}</p>
                </div>
              </div>
            )}

            {carte && (
              <div
                className={`space-y-3 rounded-lg border-2 p-3 sm:p-4 ${
                  carte.valide ? "border-primary/40 bg-primary/5" : "border-destructive/40 bg-destructive/5"
                }`}
              >
                <div className="flex items-center gap-2">
                  {carte.valide ? (
                    <BadgeCheck className="h-6 w-6 shrink-0 text-primary" />
                  ) : (
                    <ShieldAlert className="h-6 w-6 shrink-0 text-destructive" />
                  )}
                  <p className={`text-sm font-bold sm:text-base ${carte.valide ? "text-primary" : "text-destructive"}`}>
                    {carte.valide ? "Carte authentique et valide" : "Carte non valide"}
                  </p>
                </div>

                <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                  <div className="min-w-0">
                    <dt className="text-xs text-muted-foreground">Nom complet</dt>
                    <dd className="break-words font-semibold uppercase">{carte.nom_complet}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-xs text-muted-foreground">Matricule</dt>
                    <dd className="break-all font-mono">{carte.matricule}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-xs text-muted-foreground">Fonction</dt>
                    <dd className="break-words">{carte.poste || "—"}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-xs text-muted-foreground">Type de contrat</dt>
                    <dd>{contratLabel(carte.type_contrat)}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-xs text-muted-foreground">Valide jusqu'au</dt>
                    <dd>{fdate(carte.date_expiration)}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-xs text-muted-foreground">Statut</dt>
                    <dd>
                      <Badge variant={carte.statut === "active" ? "default" : "destructive"}>
                        {carte.statut === "active" ? "Active" : carte.statut === "suspendue" ? "Suspendue" : "Révoquée"}
                      </Badge>
                    </dd>
                  </div>
                </dl>
              </div>
            )}

            <p className="text-[11px] leading-snug text-muted-foreground">
              Seules les informations strictement nécessaires à la vérification sont affichées. En cas de doute,
              contactez AgriCapital.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default VerificationCarte;
