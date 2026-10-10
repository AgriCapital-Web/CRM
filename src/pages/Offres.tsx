import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Check, Crown, TrendingUp, Leaf, Plus, Pencil, Loader2, Trash2, Gift, Percent, CheckCircle, XCircle, Edit } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Tables } from "@/integrations/supabase/types";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { useSystemReferences } from "@/hooks/useSystemReferences";
import { getSafeErrorMessage } from "@/lib/safeError";
import { useOffresPrixEffectif } from "@/hooks/useOffresPrixEffectif";
import TableSearchInput from "@/components/common/TableSearchInput";
import { useResponsivePageSize } from "@/hooks/useResponsivePageSize";
import ResponsiveTablePagination from "@/components/common/ResponsiveTablePagination";

type Offre = Tables<'offres'>;
type Promotion = Tables<'promotions'>;

const getIcone = (code: string) => {
  switch (code) {
    case 'palm-invest-plus':
      return Crown;
    case 'palm-invest':
      return TrendingUp;
    case 'terra-palm':
      return Leaf;
    default:
      return Crown;
  }
};

const getCouleur = (code: string, couleur?: string | null) => {
  if (couleur) {
    return {
      text: `text-[${couleur}]`,
      bg: `bg-[${couleur}]/10`,
      border: `border-[${couleur}]/30`
    };
  }
  switch (code) {
    case 'palm-invest-plus':
      return { text: 'text-amber-600', bg: 'bg-amber-500/10', border: 'border-amber-500/30' };
    case 'palm-invest':
      return { text: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/30' };
    case 'terra-palm':
      return { text: 'text-emerald-700', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' };
    default:
      return { text: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/30' };
  }
};

const Offres = () => {
  const { byCategory: refs } = useSystemReferences(["offre_tarification_mode"]);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { parOffre } = useOffresPrixEffectif();
  const [activeTab, setActiveTab] = useState<'offres' | 'promotions'>('offres');
  const [editOffre, setEditOffre] = useState<Offre | null>(null);
  const [isOffreDialogOpen, setIsOffreDialogOpen] = useState(false);
  const [isPromoDialogOpen, setIsPromoDialogOpen] = useState(false);
  const [editingPromo, setEditingPromo] = useState<Promotion | null>(null);
  const [detailsFamily, setDetailsFamily] = useState<string | null>(null);
  const [tableSearch, setTableSearch] = useState("");
  const [tablePage, setTablePage] = useState(1);
  const pageSize = useResponsivePageSize();

  const [promoFormData, setPromoFormData] = useState({
    nom: "",
    pourcentage_reduction: "30",
    montant_fixe_reduction: "",
    date_debut: "",
    date_fin: "",
    description: "",
    applique_toutes_offres: true,
    cible: "paiement_initial",
    type_promotion: "paiement_initial",
  });

  // Fetch offres
  const { data: offres, isLoading: loadingOffres } = useQuery({
    queryKey: ['offres'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('offres')
        .select('*')
        .order('ordre', { ascending: true });
      
      if (error) throw error;
      return data as Offre[];
    }
  });

  // Fetch promotions
  const { data: promotions, isLoading: loadingPromos } = useQuery({
    queryKey: ['promotions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('promotions')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    }
  });

  const filteredPromotions = (promotions || []).filter((promo: any) => JSON.stringify(promo).toLowerCase().includes(tableSearch.trim().toLowerCase()));
  const paginatedPromotions = filteredPromotions.slice((tablePage - 1) * pageSize, tablePage * pageSize);
  useEffect(() => setTablePage(1), [tableSearch, pageSize]);

  // Update offre
  const updateOffreMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Offre> }) => {
      const current = (offres || []).find((o: any) => o.id === id) as any;
      const family = String(current?.famille_offre || "").toUpperCase();
      const targets = ["PALMINVEST","TERRAPALM"].includes(family)
        ? (offres || []).filter((o: any) => String(o.famille_offre || "").toUpperCase() === family)
        : [current];
      for (const target of targets) {
        const { error } = await supabase.from('offres').update(updates).eq('id', target.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offres'] });
      queryClient.invalidateQueries({ queryKey: ['offres-prix-effectif'] });
      queryClient.invalidateQueries({ queryKey: ['offres-acquisition'] });
      toast({ title: "Offre mise à jour" });
      setIsOffreDialogOpen(false);
      setEditOffre(null);
    },
    onError: () => {
      toast({ variant: "destructive", title: "Erreur", description: "Impossible de mettre à jour l'offre." });
    }
  });

  // Toggle offre
  const toggleOffreMutation = useMutation({
    mutationFn: async ({ id, actif }: { id: string; actif: boolean }) => {
      const { error } = await supabase
        .from('offres')
        .update({ actif })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offres'] });
      queryClient.invalidateQueries({ queryKey: ['offres-prix-effectif'] });
      queryClient.invalidateQueries({ queryKey: ['offres-acquisition'] });
    }
  });

  const deleteOffreMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('offres').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Offre supprimée' });
      queryClient.invalidateQueries({ queryKey: ['offres'] });
      queryClient.invalidateQueries({ queryKey: ['offres-prix-effectif'] });
      queryClient.invalidateQueries({ queryKey: ['offres-acquisition'] });
    },
    onError: (err: any) => {
      toast({ variant: 'destructive', title: 'Suppression impossible', description: err?.message });
    },
  });

  // Save promotion
  const savePromoMutation = useMutation({
    mutationFn: async (data: typeof promoFormData) => {
      const promoData = {
        nom: data.nom,
        pourcentage_reduction: Number(data.pourcentage_reduction || 0),
        montant_fixe_reduction: Number(data.montant_fixe_reduction || 0),
        date_debut: new Date(`${data.date_debut}T00:00:00`).toISOString(),
        // Une date de fin saisie dans le formulaire couvre toute la journée.
        date_fin: new Date(`${data.date_fin}T23:59:59.999`).toISOString(),
        description: data.description,
        active: true,
        applique_toutes_offres: data.applique_toutes_offres,
        cible: data.cible,
        type_promotion: data.cible,
      };

      if (editingPromo) {
        const { error } = await supabase
          .from('promotions')
          .update(promoData)
          .eq('id', editingPromo.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('promotions')
          .insert([promoData]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['promotions'] });
      queryClient.invalidateQueries({ queryKey: ['offres-prix-effectif'] });
      queryClient.invalidateQueries({ queryKey: ['promotion-active'] });
      queryClient.invalidateQueries({ queryKey: ['offres-acquisition'] });
      toast({ title: editingPromo ? "Promotion modifiée" : "Promotion créée" });
      resetPromoForm();
      setIsPromoDialogOpen(false);
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Erreur", description: getSafeErrorMessage(error) });
    }
  });

  // Toggle promo status
  const togglePromoMutation = useMutation({
    mutationFn: async ({ id, newStatus }: { id: string; newStatus: boolean }) => {
      const { error } = await supabase
        .from('promotions')
        .update({ active: newStatus })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['promotions'] });
      queryClient.invalidateQueries({ queryKey: ['offres-prix-effectif'] });
      queryClient.invalidateQueries({ queryKey: ['promotion-active'] });
      queryClient.invalidateQueries({ queryKey: ['offres-acquisition'] });
    }
  });

  // Delete promo
  const deletePromoMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('promotions')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['promotions'] });
      queryClient.invalidateQueries({ queryKey: ['offres-prix-effectif'] });
      queryClient.invalidateQueries({ queryKey: ['promotion-active'] });
      queryClient.invalidateQueries({ queryKey: ['offres-acquisition'] });
      toast({ title: "Promotion supprimée" });
    }
  });

  const formatMontant = (montant: number) => {
    return new Intl.NumberFormat('fr-FR').format(montant);
  };

  const getTranches = (offre: any) => {
    const raw = Array.isArray(offre?.tranches_paiement) ? offre.tranches_paiement : [];
    const mensualites = raw.filter((tranche: any) => tranche.type !== "paiement_initial" && Number(tranche.mensualite_par_ha ?? 0) > 0);
    if (mensualites.length) return mensualites;
    const duree = Number(offre?.duree_paiement_mois) || 0;
    const mensuel = Number(offre?.mensualite_par_ha) || 0;
    return mensuel > 0 && duree > 0 ? [{ annee: 1, mois_debut: 1, mois_fin: duree, mois: duree, mensualite_par_ha: mensuel, total_periode_par_ha: mensuel * duree }] : [];
  };

  const buildFormulaTranches = (duration: number, monthly: number) => {
    const tranches: any[] = [];
    let start = 1;
    let year = 1;
    while (start <= duration) {
      const months = Math.min(12, duration - start + 1);
      tranches.push({
        annee: year,
        mois_debut: start,
        mois_fin: start + months - 1,
        mois: months,
        mensualite_par_ha: monthly,
        total_periode_par_ha: monthly * months,
      });
      start += months;
      year += 1;
    }
    return tranches;
  };

  const handleSaveOffre = () => {
    if (!editOffre) return;
    const family = String((editOffre as any).famille_offre || "").toUpperCase();
    if (family === "PALMTERROIR") {
      const formulas = (Array.isArray((editOffre as any).formules_configuration) ? (editOffre as any).formules_configuration : []).map((formula: any) => {
        const pi = Math.max(0, Number(formula.montant_pi_par_ha) || 0);
        const monthly = Math.max(0, Number(formula.mensualite_par_ha) || 0);
        const duration = Math.max(1, Number(formula.duree_paiement_mois) || 36);
        const tranches = buildFormulaTranches(duration, monthly);
        const total = pi + tranches.reduce((sum, tranche) => sum + tranche.total_periode_par_ha, 0);
        return {
          ...formula,
          utilise_tarif_commun: false,
          montant_pi_par_ha: pi,
          montant_cash_par_ha: total,
          mensualite_par_ha: monthly,
          montant_total_par_ha: total,
          duree_paiement_mois: duration,
          tranches_paiement: tranches,
        };
      });
      const essentielle = formulas.find((formula: any) => /ESSENTIELLE/i.test(String(formula.code || ""))) || formulas[0];
      if (!essentielle) {
        toast({ variant: "destructive", title: "Configuration incomplète", description: "Les formules PalmTerroir sont absentes du référentiel." });
        return;
      }
      updateOffreMutation.mutate({
        id: editOffre.id,
        updates: {
          nom: editOffre.nom,
          montant_pi_par_ha: essentielle.montant_pi_par_ha,
          montant_cash_par_ha: essentielle.montant_cash_par_ha,
          mensualite_par_ha: essentielle.mensualite_par_ha,
          montant_total_par_ha: essentielle.montant_total_par_ha,
          duree_paiement_mois: essentielle.duree_paiement_mois,
          tranches_paiement: essentielle.tranches_paiement as any,
          formules_configuration: formulas as any,
        } as any,
      });
      return;
    }

    const pi = Math.max(0, Number(editOffre.montant_pi_par_ha) || 0);
    const tranches = getTranches(editOffre).map((t: any, index: number) => {
      const mois = Math.max(0, Number(t.mois) || ((Number(t.mois_fin) || 0) - (Number(t.mois_debut) || 0) + 1));
      const mensuel = Math.max(0, Number(t.mensualite_par_ha) || 0);
      const debut = Number(t.mois_debut) || tranchesStartMonth(index, getTranches(editOffre));
      return { ...t, annee: Number(t.annee) || index + 1, mois_debut: debut, mois_fin: Number(t.mois_fin) || debut + mois - 1, mois, mensualite_par_ha: mensuel, total_periode_par_ha: mensuel * mois };
    });
    const duree = Math.max(0, Number(editOffre.duree_paiement_mois) || tranches.reduce((sum: number, t: any) => sum + Number(t.mois || 0), 0));
    const totalMensualites = tranches.reduce((sum: number, t: any) => sum + (Number(t.mensualite_par_ha || 0) * Number(t.mois || 0)), 0);
    const total = pi + totalMensualites;
    const lastMonthly = Number(tranches[tranches.length - 1]?.mensualite_par_ha || 0);
    updateOffreMutation.mutate({
      id: editOffre.id,
      updates: {
        nom: editOffre.nom,
        description: editOffre.description,
        montant_pi_par_ha: pi,
        montant_cash_par_ha: Math.max(0, Number(editOffre.montant_cash_par_ha) || 0),
        mensualite_par_ha: lastMonthly,
        montant_total_par_ha: total,
        duree_paiement_mois: duree,
        tranches_paiement: tranches as any,
        couleur: editOffre.couleur,
        avantages: editOffre.avantages
      }
    });
  };

  const tranchesStartMonth = (index: number, tranches: any[]) => {
    const previous = tranches.slice(0, index).reduce((sum, tranche) => sum + Number(tranche.mois || 0), 0);
    return previous + 1;
  };

  const resetPromoForm = () => {
    setPromoFormData({
      nom: "",
      pourcentage_reduction: "30",
      montant_fixe_reduction: "",
      date_debut: "",
      date_fin: "",
      description: "",
      applique_toutes_offres: true,
      cible: "paiement_initial",
      type_promotion: "paiement_initial",
    });
    setEditingPromo(null);
  };

  const handleEditPromo = (promo: Promotion) => {
    setEditingPromo(promo);
    setPromoFormData({
      nom: promo.nom,
      pourcentage_reduction: promo.pourcentage_reduction.toString(),
      montant_fixe_reduction: String(promo.montant_fixe_reduction || 0),
      date_debut: format(new Date(promo.date_debut), 'yyyy-MM-dd'),
      date_fin: format(new Date(promo.date_fin), 'yyyy-MM-dd'),
      description: promo.description || "",
      applique_toutes_offres: promo.applique_toutes_offres ?? true,
      cible: promo.cible || (promo.type_promotion === "cout_global" ? "cout_global" : "paiement_initial"),
      type_promotion: promo.cible || (promo.type_promotion === "cout_global" ? "cout_global" : "paiement_initial"),
    });
    setIsPromoDialogOpen(true);
  };

  const handleSubmitPromo = (e: React.FormEvent) => {
    e.preventDefault();
    savePromoMutation.mutate(promoFormData);
  };

  const parseAvantages = (avantages: any): string[] => {
    if (Array.isArray(avantages)) return avantages;
    if (typeof avantages === 'string') {
      try {
        return JSON.parse(avantages);
      } catch {
        return [avantages];
      }
    }
    return [];
  };

  const calculateReducedAmount = (offreMontant: number, percentage: number, fixed = 0) => {
    return Math.max(offreMontant - (offreMontant * percentage / 100) - fixed, 0);
  };

  // Récupérer la promo active
  const activePromo = promotions?.find(p => {
    if (!p.active) return false;
    const now = new Date();
    return new Date(p.date_debut) <= now && new Date(p.date_fin) >= now;
  });

  if (loadingOffres) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Offres & Promotions</h2>
          <p className="text-muted-foreground">Gérez les offres clients et les promotions</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'offres' | 'promotions')}>
        <TabsList>
          <TabsTrigger value="offres" className="gap-2">
            <Crown className="h-4 w-4" />
            Offres
          </TabsTrigger>
          <TabsTrigger value="promotions" className="gap-2">
            <Gift className="h-4 w-4" />
            Promotions
            {activePromo && (
              <Badge className="ml-1 bg-green-500" variant="secondary">1 active</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Onglet Offres */}
        <TabsContent value="offres" className="space-y-4">
          {activePromo && (
            <Card className="bg-green-50 border-green-200">
              <CardContent className="p-4 flex items-center gap-3">
                <Gift className="h-6 w-6 text-green-600" />
                <div>
                  <p className="font-semibold text-green-800">Promotion active: {activePromo.nom}</p>
                  <p className="text-sm text-green-600">
                    -{activePromo.pourcentage_reduction}% sur {activePromo.cible === "cout_global" ? "le CG" : "le PI"} jusqu'au {format(new Date(activePromo.date_fin), 'dd/MM/yyyy', { locale: fr })}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {[
              { key: "PALMINVEST", label: "PalmInvest", description: "Plantation avec gestion autonome ou déléguée.", icon: TrendingUp, tone: "text-primary", bg: "bg-primary/10" },
              { key: "TERRAPALM", label: "TerraPalm", description: "Plantation sur foncier du client.", icon: Leaf, tone: "text-emerald-700", bg: "bg-emerald-500/10" },
              { key: "PALMTERROIR", label: "PalmTerroir", description: "Formules Essentielle et Flexible.", icon: Crown, tone: "text-amber-700", bg: "bg-amber-500/10" },
            ].map((family) => {
              const familyOffers = (offres || []).filter((o: any) => String(o.famille_offre || "").toUpperCase() === family.key);
              const Icon = family.icon;
              const active = familyOffers.some((o: any) => o.actif);
              return (
                <Card key={family.key} className="overflow-hidden border-border/80">
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${family.bg}`}>
                        <Icon className={`h-5 w-5 ${family.tone}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className={`truncate font-bold ${family.tone}`}>{family.label}</h3>
                        <p className="truncate text-xs text-muted-foreground">{family.description}</p>
                      </div>
                      <Badge variant={active ? "default" : "secondary"} className="shrink-0">{active ? "Active" : "Inactive"}</Badge>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-2 border-t pt-3">
                      <span className="text-xs text-muted-foreground">{familyOffers.reduce((count: number, offer: any) => count + (Array.isArray(offer.formules_configuration) ? offer.formules_configuration.length : 1), 0)} formules</span>
                      <Button size="sm" variant="outline" onClick={() => setDetailsFamily(family.key)}>Voir les détails</Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Dialog open={!!detailsFamily} onOpenChange={(open) => !open && setDetailsFamily(null)}>
            <DialogContent className="max-h-[90vh] w-[calc(100vw-1rem)] max-w-3xl overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Détails et configuration de l'offre</DialogTitle>
                <DialogDescription>Les modalités tarifaires communes de PalmInvest et TerraPalm s'appliquent automatiquement à leurs deux formules. Les différences de gestion restent propres à chaque formule.</DialogDescription>
              </DialogHeader>
              {detailsFamily && (
                <div className="space-y-3">
                  {(offres || []).filter((o: any) => String(o.famille_offre || "").toUpperCase() === detailsFamily).map((offre: any) => {
                    const pe = parOffre(offre.id);
                    const tranches = pe?.tranches_effectives?.length ? pe.tranches_effectives : getTranches(offre);
                    return (
                      <Card key={offre.id} className="border-border">
                        <CardContent className="p-4">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <p className="font-semibold">{offre.formule_nom || offre.nom}</p>
                              <p className="text-xs text-muted-foreground">{offre.formule_code}</p>
                            </div>
                            <Button size="sm" variant="outline" onClick={() => { setEditOffre(offre); setDetailsFamily(null); setIsOffreDialogOpen(true); }}>
                              <Pencil className="mr-1 h-4 w-4" /> Modifier
                            </Button>
                          </div>
                          {String(detailsFamily || "").toUpperCase() === "PALMTERROIR" ? (
                            <div className="mt-3 grid gap-3 sm:grid-cols-2">
                              {(Array.isArray(offre.formules_configuration) ? offre.formules_configuration : []).map((formula: any) => (
                                <div key={formula.code} className="rounded-lg border p-3">
                                  <p className="font-semibold">{formula.nom}</p>
                                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                                    <div className="rounded bg-muted/40 p-2"><span className="block text-muted-foreground">Paiement initial / ha</span><b>{formatMontant(Number(formula.montant_pi_par_ha || 0))} F</b></div>
                                    <div className="rounded bg-muted/40 p-2"><span className="block text-muted-foreground">Mensualité / ha</span><b>{formatMontant(Number(formula.mensualite_par_ha || 0))} F</b></div>
                                    <div className="rounded bg-muted/40 p-2"><span className="block text-muted-foreground">Durée</span><b>{Number(formula.duree_paiement_mois || 36)} mois</b></div>
                                    <div className="rounded bg-muted/40 p-2"><span className="block text-muted-foreground">Total / ha</span><b>{formatMontant(Number(formula.montant_total_par_ha || 0))} F</b></div>
                                  </div>
                                  <div className="mt-2 space-y-1">
                                    {(Array.isArray(formula.tranches_paiement) ? formula.tranches_paiement : []).map((tranche: any, index: number) => (
                                      <div key={tranche.annee || index} className="flex justify-between gap-2 rounded bg-background p-2 text-xs">
                                        <span>An {tranche.annee || index + 1} · {tranche.mois || 12} mois</span>
                                        <b>{formatMontant(Number(tranche.mensualite_par_ha || 0))} F/ha</b>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <>
                              <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                                <div className="rounded-lg bg-muted/40 p-2"><span className="block text-[10px] text-muted-foreground">PI / ha</span><b>{formatMontant((pe as any)?.pi_effectif ?? offre.montant_pi_par_ha)} F</b></div>
                                <div className="rounded-lg bg-muted/40 p-2"><span className="block text-[10px] text-muted-foreground">Mensualité / ha</span><b>{formatMontant(offre.mensualite_par_ha || 0)} F</b></div>
                                <div className="rounded-lg bg-muted/40 p-2"><span className="block text-[10px] text-muted-foreground">Durée</span><b>{offre.duree_paiement_mois || 0} mois</b></div>
                                <div className="rounded-lg bg-muted/40 p-2"><span className="block text-[10px] text-muted-foreground">Formules</span><b>{(offre.formules_configuration || []).map((formula: any) => formula.nom).join(" / ") || offre.formule_nom || offre.nom}</b></div>
                              </div>
                              <div className="mt-3 space-y-1">
                                {tranches.map((t: any, i: number) => (
                                  <div key={i} className="flex min-w-0 justify-between gap-3 rounded-md bg-background p-2 text-xs">
                                    <span>An {t.annee ?? i + 1} · {t.mois ?? ((t.mois_fin ?? 0) - (t.mois_debut ?? 0) + 1)} mois</span>
                                    <span className="shrink-0 font-semibold">{formatMontant(Number(t.mensualite_par_ha_effective ?? t.mensualite_par_ha ?? 0))} F/ha</span>
                                  </div>
                                ))}
                              </div>
                            </>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </DialogContent>
          </Dialog>

          <Dialog open={isOffreDialogOpen} onOpenChange={(open) => { setIsOffreDialogOpen(open); if (!open) setEditOffre(null); }}>
            <DialogContent className="max-h-[90vh] w-[calc(100vw-1rem)] max-w-2xl overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Modifier la configuration {editOffre?.famille_offre || editOffre?.nom}</DialogTitle>
                <DialogDescription>Pour PalmInvest et TerraPalm, les paramètres tarifaires enregistrés ici sont répliqués sur les deux formules de la même offre.</DialogDescription>
              </DialogHeader>
              {editOffre && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div><Label>Nom d'affichage</Label><Input value={editOffre.nom || ""} onChange={e => setEditOffre({...editOffre, nom:e.target.value})} /></div>
                    <div><Label>PI / ha (F)</Label><Input type="number" min="0" value={editOffre.montant_pi_par_ha ?? ""} onChange={e => setEditOffre({...editOffre, montant_pi_par_ha:Number(e.target.value)})} /></div>
                    <div><Label>Comptant / ha (F)</Label><Input type="number" min="0" value={editOffre.montant_cash_par_ha ?? ""} onChange={e => setEditOffre({...editOffre, montant_cash_par_ha:Number(e.target.value)})} /></div>
                    <div><Label>Durée (mois)</Label><Input type="number" min="0" value={editOffre.duree_paiement_mois ?? ""} onChange={e => setEditOffre({...editOffre, duree_paiement_mois:Number(e.target.value)})} /></div>
                  </div>
                  <div className="rounded-xl border p-3">
                    <p className="mb-2 text-sm font-semibold">Échéancier</p>
                    {getTranches(editOffre).map((t:any,i:number) => (
                      <div key={i} className="grid grid-cols-1 gap-2 border-t py-2 first:border-t-0 sm:grid-cols-3">
                        <Label className="text-xs">An {i+1} · {t.mois ?? 0} mois</Label>
                        <Input type="number" min="0" placeholder="Mois" value={t.mois ?? ""} onChange={e => {
                          const next=getTranches(editOffre).map((x:any,j:number)=>j===i?{...x,mois:Number(e.target.value)}:x);
                          setEditOffre({...editOffre,tranches_paiement:next});
                        }} />
                        <Input type="number" min="0" placeholder="Mensualité / ha" value={t.mensualite_par_ha ?? ""} onChange={e => {
                          const next=getTranches(editOffre).map((x:any,j:number)=>j===i?{...x,mensualite_par_ha:Number(e.target.value)}:x);
                          setEditOffre({...editOffre,tranches_paiement:next});
                        }} />
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button variant="outline" onClick={() => { setIsOffreDialogOpen(false); setEditOffre(null); }}>Annuler</Button>
                    <Button onClick={handleSaveOffre} disabled={updateOffreMutation.isPending}>{updateOffreMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Enregistrer</Button>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* Onglet Promotions */}
        <TabsContent value="promotions" className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-semibold">Gestion des promotions</h3>
              <p className="text-sm text-muted-foreground">
                Les promotions s'appliquent automatiquement à toutes les offres
              </p>
            </div>
            
            <Dialog open={isPromoDialogOpen} onOpenChange={(open) => {
              setIsPromoDialogOpen(open);
              if (!open) resetPromoForm();
            }}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Nouvelle Promotion
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>
                    {editingPromo ? "Modifier la promotion" : "Créer une promotion"}
                  </DialogTitle>
                  <DialogDescription>
                    La réduction sera appliquée automatiquement sur le Paiement Initial (PI) ou le Coût Global (CG), selon le choix ci-dessous.
                  </DialogDescription>
                </DialogHeader>
                
                <form onSubmit={handleSubmitPromo} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="promo-nom">Nom de la promotion *</Label>
                    <Input
                      id="promo-nom"
                      value={promoFormData.nom}
                      onChange={(e) => setPromoFormData({...promoFormData, nom: e.target.value})}
                      placeholder="Ex: Promo Lancement Phase Pilote"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Assiette de la promotion *</Label>
                    <Select
                      value={promoFormData.cible}
                      onValueChange={(v) => setPromoFormData({ ...promoFormData, cible: v, type_promotion: v })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {refs("offre_tarification_mode").map((r:any)=><SelectItem key={r.id} value={r.code}>{r.libelle}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {promoFormData.cible === "paiement_initial"
                        ? "La remise porte uniquement sur le Paiement Initial."
                        : "La remise porte sur le prix global du contrat. Le PI et les mensualités sont recalculés."}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="pourcentage">Pourcentage de réduction (%)</Label>
                      <div className="relative">
                        <Input
                          id="pourcentage"
                          type="number"
                          value={promoFormData.pourcentage_reduction}
                          onChange={(e) => setPromoFormData({...promoFormData, pourcentage_reduction: e.target.value})}
                          min="1"
                          max="99"

                        />
                        <Percent className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Aperçu indicatif</Label>
                      <div className="p-2 bg-green-50 rounded border border-green-200">
                        <p className="text-sm text-green-700">
                          20 000F → {formatMontant(calculateReducedAmount(promoFormData.cible === "paiement_initial" ? 20000 : 100000, Number(promoFormData.pourcentage_reduction || "0"), Number((promoFormData as any).montant_fixe_reduction || 0)))}F
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="debut">Date début *</Label>
                      <Input
                        id="debut"
                        type="date"
                        value={promoFormData.date_debut}
                        onChange={(e) => setPromoFormData({...promoFormData, date_debut: e.target.value})}
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="fin">Date fin *</Label>
                      <Input
                        id="fin"
                        type="date"
                        value={promoFormData.date_fin}
                        onChange={(e) => setPromoFormData({...promoFormData, date_fin: e.target.value})}
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="desc">Description</Label>
                    <Textarea
                      id="desc"
                      value={promoFormData.description}
                      onChange={(e) => setPromoFormData({...promoFormData, description: e.target.value})}
                      placeholder="Informations complémentaires..."
                      rows={3}
                    />
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setIsPromoDialogOpen(false)}>
                      Annuler
                    </Button>
                    <Button type="submit" disabled={savePromoMutation.isPending}>
                      {savePromoMutation.isPending ? "Enregistrement..." : "Enregistrer"}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="p-4"><TableSearchInput value={tableSearch} onChange={setTableSearch} placeholder="Rechercher une promotion…" /></div>
              {loadingPromos ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : promotions && filteredPromotions.length > 0 ? (
                <div className="overflow-x-auto"><Table className="min-w-[760px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nom</TableHead>
                      <TableHead>Réduction</TableHead>
                      <TableHead>Période</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedPromotions.map((promo) => {
                      const now = new Date();
                      const isCurrentlyActive = promo.active && 
                        new Date(promo.date_debut) <= now && 
                        new Date(promo.date_fin) >= now;
                      
                      return (
                        <TableRow key={promo.id}>
                          <TableCell className="font-medium">{promo.nom}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-primary font-bold">
                              -{promo.pourcentage_reduction}%
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            {format(new Date(promo.date_debut), 'dd/MM/yyyy', { locale: fr })} -{' '}
                            {format(new Date(promo.date_fin), 'dd/MM/yyyy', { locale: fr })}
                          </TableCell>
                          <TableCell>
                            {isCurrentlyActive ? (
                              <Badge className="bg-green-500">ACTIVE</Badge>
                            ) : promo.active ? (
                              <Badge variant="secondary">Programmée</Badge>
                            ) : (
                              <Badge variant="outline">Inactive</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right space-x-2">
                            <Button size="sm" variant="ghost" onClick={() => handleEditPromo(promo)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => togglePromoMutation.mutate({ id: promo.id, newStatus: !promo.active })}
                            >
                              {promo.active ? (
                                <XCircle className="h-4 w-4 text-destructive" />
                              ) : (
                                <CheckCircle className="h-4 w-4 text-primary" />
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                if (confirm('Supprimer cette promotion ?')) {
                                  deletePromoMutation.mutate(promo.id);
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table></div>
              ) : (
                <p className="text-center py-8 text-muted-foreground">
                  Aucune promotion configurée. Créez-en une pour commencer.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Offres;
