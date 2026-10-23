import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, Save, Users, Wrench, MapPinned } from "lucide-react";

type Rule = {
  id: string;
  role_cible: string;
  type_remuneration: string;
  montant: number | string | null;
  taux_pourcentage: number | string | null;
  annee_application: number | null;
  description: string | null;
  actif: boolean | null;
  code_regle: string | null;
};

const money = (value: unknown) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Number(value || 0));
const RULES = {
  partnerSale: "COMMERCIAL_ACQUISITION_PARTENAIRE",
  partnerRecovery: "COMMERCIAL_REC_PARTENAIRE_AN1",
  essentialSale: "COMMERCIAL_ACQUISITION_ESSENTIEL",
  essentialRecovery: "COMMERCIAL_REC_ESSENTIEL",
  flexibleSale: "COMMERCIAL_ACQUISITION_FLEXIBLE",
  flexibleRecovery: "COMMERCIAL_REC_FLEXIBLE",
  land: "MOBILISATEUR_FONCIER_PAR_HA",
  technical: "TECHNIQUE_MISE_EN_TERRE",
} as const;

export default function GestionRemuneration() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any).from("grille_remuneration").select("*")
      .in("role_cible", ["commercial", "mobilisateur_foncier", "equipe_technique"])
      .in("type_remuneration", ["acquisition", "recouvrement_mensuel", "mobilisation_fonciere", "commission_technique"]);
    if (error) toast({ variant: "destructive", title: "Rémunération indisponible", description: error.message });
    else setRows((data || []) as Rule[]);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);
  const byCode = useMemo(() => new Map(rows.filter(row => row.code_regle).map(row => [row.code_regle as string, row])), [rows]);
  const update = (code: string, patch: Partial<Rule>) => {
    const row = byCode.get(code);
    if (row) setRows(current => current.map(item => item.id === row.id ? { ...item, ...patch } : item));
  };

  const save = async () => {
    setSaving(true);
    try {
      for (const row of rows.filter(item => item.code_regle && Object.values(RULES).includes(item.code_regle as any))) {
        const { error } = await (supabase as any).from("grille_remuneration").update({
          montant: row.montant === "" || row.montant === null ? null : Number(row.montant),
          taux_pourcentage: row.taux_pourcentage === "" || row.taux_pourcentage === null ? null : Number(row.taux_pourcentage),
          actif: row.actif !== false,
          updated_at: new Date().toISOString(),
        }).eq("id", row.id);
        if (error) throw error;
      }
      const recovery = byCode.get(RULES.partnerRecovery);
      if (recovery) {
        for (const legacyCode of ["COMMERCIAL_REC_PARTENAIRE_AN2", "COMMERCIAL_REC_PARTENAIRE_AN3"]) {
          const legacy = rows.find(item => item.code_regle === legacyCode);
          if (legacy) {
            const { error } = await (supabase as any).from("grille_remuneration").update({
              taux_pourcentage: recovery.taux_pourcentage === "" || recovery.taux_pourcentage === null ? null : Number(recovery.taux_pourcentage),
              actif: recovery.actif !== false,
              updated_at: new Date().toISOString(),
            }).eq("id", legacy.id);
            if (error) throw error;
          }
        }
      }
      // Les règles de rémunération sont consommées par plusieurs modules (paiements, finance, commissions et tableaux de bord).
      await queryClient.invalidateQueries();
      toast({ title: "Rémunération enregistrée", description: "Les nouveaux paiements utiliseront les règles mises à jour. Les commissions déjà calculées et les paiements historiques sont conservés." });
      await load();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Enregistrement impossible", description: error?.message || "Une erreur est survenue." });
    } finally { setSaving(false); }
  };

  const RuleEditor = ({ code, label, unit }: { code: string; label: string; unit: "money" | "percent" }) => {
    const row = byCode.get(code);
    if (!row) return <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground"><div className="font-medium text-foreground">{label}</div><div>Règle non configurée</div></div>;
    return <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(110px,160px)] items-center gap-3 rounded-md border p-3">
      <div className="min-w-0">
        <div className="font-medium leading-snug">{label}</div>
        <label className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          <Checkbox checked={row.actif !== false} onCheckedChange={checked => update(code, { actif: checked === true })} />
          Règle active
        </label>
      </div>
      <div className="min-w-0">
        <label className="mb-1 block text-xs text-muted-foreground">{unit === "money" ? "Montant (FCFA)" : "Taux (%)"}</label>
        <Input className="h-9 text-right tabular-nums" type="number" min="0" step={unit === "money" ? "500" : "0.1"} value={unit === "money" ? row.montant ?? "" : row.taux_pourcentage ?? ""} onChange={event => update(code, unit === "money" ? { montant: event.target.value } : { taux_pourcentage: event.target.value })} />
      </div>
    </div>;
  };

  return <div className="space-y-4">
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0"><h2 className="text-lg font-semibold">Rémunération et commissions</h2><p className="text-sm text-muted-foreground">Configurez une seule règle de vente et une seule règle de recouvrement par famille d’offres. Les modifications s’appliquent aux nouveaux paiements sans réécrire les commissions déjà calculées.</p></div>
      <div className="flex shrink-0 gap-2">
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className="mr-2 h-4 w-4" />Actualiser</Button>
        <Button size="sm" onClick={() => void save()} disabled={saving || loading}><Save className="mr-2 h-4 w-4" />Enregistrer</Button>
      </div>
    </div>
    {loading ? <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">Chargement…</div> : <Tabs defaultValue="commercial" className="space-y-4">
      <TabsList className="grid h-auto w-full grid-cols-3">
        <TabsTrigger value="commercial" className="gap-2 py-2"><Users className="h-4 w-4" /><span>Commercial</span></TabsTrigger>
        <TabsTrigger value="technique" className="gap-2 py-2"><Wrench className="h-4 w-4" /><span>Technique</span></TabsTrigger>
        <TabsTrigger value="foncier" className="gap-2 py-2"><MapPinned className="h-4 w-4" /><span>Mobilisateur foncier</span></TabsTrigger>
      </TabsList>

      <TabsContent value="commercial" className="space-y-4">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">PalmInvest</CardTitle></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <RuleEditor code={RULES.partnerSale} label="Commission de vente — paiement unique" unit="money" />
            <RuleEditor code={RULES.partnerRecovery} label="Pourcentage de commission sur chaque mensualité encaissée" unit="percent" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">TerraPalm</CardTitle></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <RuleEditor code={RULES.partnerSale} label="Commission de vente — paiement unique (règle commune PalmInvest/TerraPalm)" unit="money" />
            <RuleEditor code={RULES.partnerRecovery} label="Pourcentage de commission sur chaque mensualité encaissée (règle commune PalmInvest/TerraPalm)" unit="percent" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">PalmTerroir</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border p-3">
              <h4 className="mb-3 text-sm font-semibold">Formule essentielle</h4>
              <div className="grid gap-3 md:grid-cols-2">
                <RuleEditor code={RULES.essentialSale} label="Commission de vente — paiement unique" unit="money" />
                <RuleEditor code={RULES.essentialRecovery} label="Pourcentage sur chaque mensualité encaissée" unit="percent" />
              </div>
            </div>
            <div className="rounded-md border p-3">
              <h4 className="mb-3 text-sm font-semibold">Formule flexible</h4>
              <div className="grid gap-3 md:grid-cols-2">
                <RuleEditor code={RULES.flexibleSale} label="Commission de vente — paiement unique" unit="money" />
                <RuleEditor code={RULES.flexibleRecovery} label="Pourcentage sur chaque mensualité encaissée" unit="percent" />
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="technique" className="space-y-3">
        <Card><CardHeader className="pb-3"><CardTitle className="text-base">Commissions techniques</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2"><RuleEditor code={RULES.technical} label="Commission technique par intervention réalisée" unit="money" /></div>
        </CardContent></Card>
      </TabsContent>

      <TabsContent value="foncier">
        <Card><CardHeader className="pb-3"><CardTitle className="text-base">Mobilisation foncière</CardTitle></CardHeader><CardContent><RuleEditor code={RULES.land} label="Prime par hectare — propriétaire validé" unit="money" /></CardContent></Card>
      </TabsContent>
    </Tabs>}
    <p className="text-xs text-muted-foreground">Règles de référence : vente 10 000 F CFA par offre ; recouvrement 2,5 % par mensualité pour PalmInvest, TerraPalm et les formules PalmTerroir ; commission technique 5 000 F CFA par intervention ; recouvrement mensuel 2,5 % selon les formules éligibles. Les modifications enregistrées doivent recalculer les commissions non payées.</p>
  </div>;
}
