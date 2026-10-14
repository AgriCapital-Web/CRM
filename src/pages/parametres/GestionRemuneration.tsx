import { useEffect, useMemo, useState } from "react";
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
  partnerYear1: "COMMERCIAL_REC_PARTENAIRE_AN1",
  partnerYear2: "COMMERCIAL_REC_PARTENAIRE_AN2",
  partnerYear3: "COMMERCIAL_REC_PARTENAIRE_AN3",
  essentialSale: "COMMERCIAL_ACQUISITION_ESSENTIEL",
  flexibleSale: "COMMERCIAL_ACQUISITION_FLEXIBLE",
  flexibleRecovery: "COMMERCIAL_REC_FLEXIBLE",
  land: "MOBILISATEUR_FONCIER_PAR_HA",
  technical: "TECHNIQUE_MISE_EN_TERRE",
} as const;

export default function GestionRemuneration() {
  const { toast } = useToast();
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
      const { data, error } = await (supabase as any).rpc("recalculer_commissions_depuis_grille");
      if (error) throw error;
      toast({ title: "Rémunération enregistrée", description: `Règles enregistrées. Foncier recalculé : ${data?.foncier_recalcule ?? 0} · Technique recalculé : ${data?.technique_recalcule ?? 0}. Les commissions déjà payées sont conservées.` });
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
      <div className="min-w-0"><h2 className="text-lg font-semibold">Rémunération et commissions</h2><p className="text-sm text-muted-foreground">Configurez les règles par équipe et par offre.</p></div>
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
          <CardHeader className="pb-3"><CardTitle className="text-base">Palme Invest et Terra Palm</CardTitle></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <RuleEditor code={RULES.partnerSale} label="Commission de vente — versée une seule fois" unit="money" />
            <RuleEditor code={RULES.partnerYear1} label="Recouvrement mensuel — année 1" unit="percent" />
            <RuleEditor code={RULES.partnerYear2} label="Recouvrement mensuel — année 2" unit="percent" />
            <RuleEditor code={RULES.partnerYear3} label="Recouvrement mensuel — année 3" unit="percent" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">PalmTerroir — Formule essentielle</CardTitle></CardHeader>
          <CardContent><RuleEditor code={RULES.essentialSale} label="Commission de vente — versée une seule fois" unit="money" /><p className="mt-2 text-sm text-muted-foreground">Aucune commission de recouvrement mensuel pour cette formule.</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">PalmTerroir — Formule flexible</CardTitle></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <RuleEditor code={RULES.flexibleSale} label="Commission de vente — versée une seule fois" unit="money" />
            <RuleEditor code={RULES.flexibleRecovery} label="Commission sur chaque mensualité" unit="percent" />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="technique" className="space-y-3">
        <Card><CardHeader className="pb-3"><CardTitle className="text-base">Commissions techniques</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-2">
          <div className="rounded-md border p-3"><label className="mb-2 block text-sm font-medium">Commission sur réalisation technique (FCFA)</label><Input type="number" disabled value="" placeholder="—" /></div>
          <div className="rounded-md border p-3"><label className="mb-2 block text-sm font-medium">Commission mensuelle (%)</label><Input type="number" disabled value="" placeholder="—" /></div>
        </CardContent></Card>
      </TabsContent>

      <TabsContent value="foncier">
        <Card><CardHeader className="pb-3"><CardTitle className="text-base">Mobilisation foncière</CardTitle></CardHeader><CardContent><RuleEditor code={RULES.land} label="Prime par hectare — propriétaire validé" unit="money" /></CardContent></Card>
      </TabsContent>
    </Tabs>}
    <p className="text-xs text-muted-foreground">Les commissions de vente sont uniques. Le paiement des commissions est organisé par quinzaine.</p>
  </div>;
}
