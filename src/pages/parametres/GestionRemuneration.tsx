import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, Save, Users, Wrench } from "lucide-react";

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
  technical: "TECHNIQUE_MISE_EN_TERRE",
} as const;

export default function GestionRemuneration() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any).from("grille_remuneration").select("*")
      .in("role_cible", ["commercial", "equipe_technique"])
      .in("type_remuneration", ["acquisition", "recouvrement_mensuel", "commission_technique"]);
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
      // Actualiser les portefeuilles sans réécrire les commissions historiques.
      const { error: portfolioError } = await (supabase as any).rpc("recalculer_commissions_depuis_grille");
      if (portfolioError) throw portfolioError;
      // Les nouvelles opérations liront la grille à jour; les instantanés historiques restent figés.
      await queryClient.invalidateQueries();
      toast({ title: "Enregistré" });
      setEditOpen(false);
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
    <div className="flex justify-end gap-2">
      <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className="mr-2 h-4 w-4" />Actualiser</Button>
      <Button size="sm" onClick={() => setEditOpen(true)} disabled={loading}>Modifier les paramètres</Button>
    </div>
    {loading ? <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">Chargement…</div> : <Dialog open={editOpen} onOpenChange={setEditOpen}><DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-5xl"><div className="flex justify-end"><Button onClick={() => void save()} disabled={saving || loading}><Save className="mr-2 h-4 w-4" />{saving?"Enregistrement…":"Enregistrer les paramètres"}</Button></div><Tabs defaultValue="commercial" className="space-y-4">
      <TabsList className="grid h-auto w-full grid-cols-2">
        <TabsTrigger value="commercial" className="gap-2 py-2"><Users className="h-4 w-4" /><span>Commercial</span></TabsTrigger>
        <TabsTrigger value="technique" className="gap-2 py-2"><Wrench className="h-4 w-4" /><span>Technique</span></TabsTrigger>
        </TabsList>

      <TabsContent value="commercial" className="space-y-4">
        <div className="grid min-w-0 grid-cols-1 gap-3">
          <Card className="min-w-0">
            <CardHeader className="pb-3"><CardTitle className="text-base">PalmInvest</CardTitle></CardHeader>
            <CardContent className="grid min-w-0 gap-3">
              <RuleEditor code={RULES.partnerSale} label="Commission de vente — paiement unique" unit="money" />
              <RuleEditor code={RULES.partnerRecovery} label="Commission sur chaque mensualité encaissée" unit="percent" />
            </CardContent>
          </Card>
          <Card className="min-w-0">
            <CardHeader className="pb-3"><CardTitle className="text-base">TerraPalm</CardTitle></CardHeader>
            <CardContent className="grid min-w-0 gap-3">
              <RuleEditor code={RULES.partnerSale} label="Commission de vente — paiement unique" unit="money" />
              <RuleEditor code={RULES.partnerRecovery} label="Commission sur chaque mensualité encaissée" unit="percent" />
            </CardContent>
          </Card>
          <Card className="min-w-0">
            <CardHeader className="pb-3"><CardTitle className="text-base">PalmTerroir — Essentielle</CardTitle></CardHeader>
            <CardContent className="grid min-w-0 gap-3">
              <RuleEditor code={RULES.essentialSale} label="Commission de vente — paiement unique" unit="money" />
              <RuleEditor code={RULES.essentialRecovery} label="Commission sur chaque mensualité encaissée" unit="percent" />
            </CardContent>
          </Card>
          <Card className="min-w-0">
            <CardHeader className="pb-3"><CardTitle className="text-base">PalmTerroir — Flexible</CardTitle></CardHeader>
            <CardContent className="grid min-w-0 gap-3">
              <RuleEditor code={RULES.flexibleSale} label="Commission de vente — paiement unique" unit="money" />
              <RuleEditor code={RULES.flexibleRecovery} label="Commission sur chaque mensualité encaissée" unit="percent" />
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="technique" className="space-y-3">
        <Card><CardHeader className="pb-3"><CardTitle className="text-base">Commissions techniques</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2"><RuleEditor code={RULES.technical} label="Commission technique par intervention réalisée" unit="money" /></div>
        </CardContent></Card>
      </TabsContent>

    </Tabs></DialogContent></Dialog>}

  </div>;
}
