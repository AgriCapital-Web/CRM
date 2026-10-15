import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { logActivity } from "@/utils/traceability";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Globe, Mail, DollarSign, Settings, Bell, Save, Loader2, Shield,
  FileText, AlertTriangle, Building2, Search, Info, RefreshCw,
  Sprout, Users, CreditCard, SlidersHorizontal, CheckCircle2
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Configuration {
  id: string;
  cle: string;
  valeur: string;
  description: string | null;
  categorie: string;
  type_valeur: string;
  modifiable: boolean;
  updated_at?: string | null;
}

const CATEGORY_META: Record<string, { label: string; help: string; icon: React.ElementType; order: number }> = {
  acquisition: { label: "Acquisition", help: "Règles et valeurs par défaut du parcours de prospection, de qualification et d’acquisition. Vérifiez l’impact sur les formulaires avant toute modification.", icon: Users, order: 1 },
  agronomie: { label: "Agronomie", help: "Paramètres métier utilisés pour le suivi technique des plantations. Ne modifiez les valeurs agronomiques qu’après validation par le responsable technique.", icon: Sprout, order: 2 },
  alertes: { label: "Alertes", help: "Seuils et conditions pouvant déclencher des avertissements dans le CRM. Une valeur inadaptée peut créer trop d’alertes ou en masquer.", icon: AlertTriangle, order: 3 },
  alerte: { label: "Alertes", help: "Seuils et conditions pouvant déclencher des avertissements dans le CRM. Une valeur inadaptée peut créer trop d’alertes ou en masquer.", icon: AlertTriangle, order: 3 },
  contact: { label: "Contacts", help: "Coordonnées et informations de contact utilisées par l’application. Vérifiez les adresses et numéros avant de les changer.", icon: Mail, order: 5 },
  contacts: { label: "Contacts", help: "Coordonnées et informations de contact utilisées par l’application. Vérifiez les adresses et numéros avant de les changer.", icon: Mail, order: 5 },
  general: { label: "Général", help: "Informations générales et valeurs communes de l’organisation. Ces réglages peuvent apparaître dans plusieurs écrans.", icon: Building2, order: 6 },
  notification: { label: "Notifications", help: "Préférences générales relatives aux notifications. Les identifiants secrets et la configuration technique des fournisseurs se gèrent dans leur écran dédié.", icon: Bell, order: 7 },
  notifications: { label: "Notifications", help: "Préférences générales relatives aux notifications. Les identifiants secrets et la configuration technique des fournisseurs se gèrent dans leur écran dédié.", icon: Bell, order: 7 },
  paiement: { label: "Paiements", help: "Paramètres métier liés aux paiements. Ne changez pas les règles de montant, d’échéance ou de calcul sans vérifier les conséquences financières.", icon: CreditCard, order: 8 },
  paiements: { label: "Paiements", help: "Paramètres métier liés aux paiements. Ne changez pas les règles de montant, d’échéance ou de calcul sans vérifier les conséquences financières.", icon: CreditCard, order: 8 },
  securite: { label: "Sécurité", help: "Paramètres qui peuvent affecter la protection ou l’accès au système. Ne modifiez pas une valeur de sécurité si son effet n’est pas clairement compris.", icon: Shield, order: 9 },
  sécurité: { label: "Sécurité", help: "Paramètres qui peuvent affecter la protection ou l’accès au système. Ne modifiez pas une valeur de sécurité si son effet n’est pas clairement compris.", icon: Shield, order: 9 },
  souscriptions: { label: "Acquisition", help: "Paramètres de souscription/acquisition. Vérifiez l’usage réel de chaque clé avant modification.", icon: FileText, order: 1 },
};

const normalizeCategory = (category: string) => category.trim().toLocaleLowerCase("fr");
const getMeta = (category: string) => CATEGORY_META[normalizeCategory(category)] ?? {
  label: category || "Autres paramètres",
  help: "Cette catégorie n’est pas encore documentée. Lisez la clé et la description de chaque réglage avant de le modifier.",
  icon: Settings,
  order: 99,
};

const ConfigurationSysteme = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editedValues, setEditedValues] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("");

  const { data: configurations, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["configurations"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("configurations_systeme")
        .select("*")
        .order("categorie", { ascending: true })
        .order("cle", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Configuration[];
    },
  });

  const handleValueChange = (configId: string, value: string) => {
    setEditedValues((prev) => ({ ...prev, [configId]: value }));
  };

  const saveOneMutation = useMutation({
    mutationFn: async ({ id, valeur }: { id: string; valeur: string }) => {
      const { error } = await (supabase as any)
        .from("configurations_systeme")
        .update({ valeur, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      return { id, valeur };
    },
    onSuccess: async ({ id, valeur }) => {
      await queryClient.invalidateQueries({ queryKey: ["configurations"] });
      void logActivity({ tableName: "configurations_systeme", recordId: id, action: "UPDATE", details: "Configuration système modifiée" });
      setEditedValues((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      toast({ title: "Configuration enregistrée", description: "La valeur a été sauvegardée." });
    },
    onError: (err) => toast({ title: "Échec de l’enregistrement", description: err instanceof Error ? err.message : "La configuration n’a pas été modifiée.", variant: "destructive" }),
  });

  const saveAllMutation = useMutation({
    mutationFn: async () => {
      const entries = Object.entries(editedValues).filter(([id, valeur]) => {
        const config = configurations?.find((item) => item.id === id);
        return config && config.modifiable && config.valeur !== valeur;
      });
      if (!entries.length) return 0;
      const changes = entries.map(([id, valeur]) => ({ id, valeur }));
      const { data, error } = await (supabase as any).rpc("update_configurations_systeme_batch", { p_changes: changes });
      if (error) throw error;
      return Number(data ?? entries.length);
    },
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: ["configurations"] });
      setEditedValues({});
      void logActivity({ tableName: "configurations_systeme", action: "UPDATE", details: `${saved} réglage(s) système modifié(s) via l’enregistrement groupé` });
      toast({ title: "Configurations enregistrées", description: `${saved} réglage(s) sauvegardé(s) en une seule transaction.` });
    },
    onError: (err) => toast({ title: "Enregistrement refusé", description: err instanceof Error ? err.message : "Aucun réglage n’a été enregistré. Vérifiez les droits et les valeurs.", variant: "destructive" }),
  });

  const groupedConfigs = useMemo(() => {
    const grouped = new Map<string, Configuration[]>();
    for (const config of configurations ?? []) {
      const key = config.categorie || "autres";
      if (["commission", "commissions"].includes(normalizeCategory(key))) continue;
      grouped.set(key, [...(grouped.get(key) ?? []), config]);
    }
    return [...grouped.entries()].sort((a, b) => {
      const orderA = getMeta(a[0]).order;
      const orderB = getMeta(b[0]).order;
      return orderA - orderB || getMeta(a[0]).label.localeCompare(getMeta(b[0]).label, "fr");
    });
  }, [configurations]);

  const filteredGroups = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("fr");
    return groupedConfigs
      .map(([category, configs]) => [category, configs.filter((config) => {
        if (!term) return true;
        return [config.cle, config.description ?? "", config.valeur, getMeta(category).label]
          .some((value) => value.toLocaleLowerCase("fr").includes(term));
      })] as [string, Configuration[]])
      .filter(([category, configs]) => configs.length > 0 && (!activeCategory || activeCategory === category));
  }, [groupedConfigs, search, activeCategory]);

  const pendingCount = Object.keys(editedValues).filter((id) => {
    const original = configurations?.find((config) => config.id === id);
    return original && original.valeur !== editedValues[id];
  }).length;
  const enabledCount = (configurations ?? []).filter((config) => config.valeur === "true").length;

  const renderInput = (config: Configuration) => {
    const currentValue = editedValues[config.id] ?? config.valeur ?? "";
    const hasChanged = editedValues[config.id] !== undefined && editedValues[config.id] !== config.valeur;
    const disabled = !config.modifiable || saveAllMutation.isPending || saveOneMutation.isPending;

    if (config.type_valeur === "boolean") {
      return (
        <div className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between" key={config.id}>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-sm">{config.description || config.cle}</p>
            <p className="mt-1 break-all text-xs text-muted-foreground">{config.cle}</p>
            <p className="mt-1 text-xs text-muted-foreground">Valeur actuelle : {currentValue === "true" ? "Activé" : "Désactivé"}</p>
          </div>
          <div className="flex items-center gap-3">
            {!config.modifiable && <Badge variant="outline">Lecture seule</Badge>}
            <Switch checked={currentValue === "true"} onCheckedChange={(checked) => handleValueChange(config.id, checked ? "true" : "false")} disabled={disabled} aria-label={config.description || config.cle} />
            {hasChanged && <Badge variant="outline">À enregistrer</Badge>}
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-2 rounded-lg border p-3" key={config.id}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <Label htmlFor={`config-${config.id}`} className="font-medium">{config.description || config.cle}</Label>
            <p className="mt-1 break-all text-xs text-muted-foreground">{config.cle}</p>
          </div>
          <div className="flex items-center gap-2">
            {!config.modifiable && <Badge variant="outline">Lecture seule</Badge>}
            {hasChanged && <Badge variant="outline">Modifié</Badge>}
          </div>
        </div>
        <Input
          id={`config-${config.id}`}
          type={config.type_valeur === "number" ? "number" : config.type_valeur === "email" ? "email" : config.type_valeur === "url" ? "url" : "text"}
          value={currentValue}
          onChange={(e) => handleValueChange(config.id, e.target.value)}
          disabled={disabled || !config.modifiable}
          className="max-w-2xl"
          aria-label={config.description || config.cle}
        />
        {hasChanged && <div className="flex justify-end"><Button size="sm" variant="outline" onClick={() => saveOneMutation.mutate({ id: config.id, valeur: currentValue })} disabled={disabled}><Save className="mr-2 h-4 w-4" />Enregistrer ce réglage</Button></div>}
      </div>
    );
  };

  if (isLoading) return <div className="flex items-center justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /><span className="ml-3 text-sm text-muted-foreground">Chargement des réglages…</span></div>;

  if (isError) return (
    <Card><CardHeader><CardTitle>Impossible de charger la configuration</CardTitle><CardDescription>{error instanceof Error ? error.message : "La table de configuration est inaccessible ou votre compte n’a pas les droits nécessaires."}</CardDescription></CardHeader><CardContent><Button variant="outline" onClick={() => void refetch()}><RefreshCw className="mr-2 h-4 w-4" />Réessayer</Button></CardContent></Card>
  );

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Globe className="h-5 w-5" />Configuration système</CardTitle>
          <CardDescription>Centre de réglages du CRM AgriCapital. Les nombres sur les onglets indiquent combien de réglages existent dans chaque catégorie, pas des erreurs ni des tâches à faire.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Réglages recensés</p><p className="text-2xl font-semibold">{configurations?.length ?? 0}</p></div>
          <div className="rounded-lg bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Valeurs activées (booléens)</p><p className="text-2xl font-semibold">{enabledCount}</p></div>
          <div className="rounded-lg bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Modifications en attente</p><p className="text-2xl font-semibold">{pendingCount}</p></div>
        </CardContent>
      </Card>

      <Card className="border-primary/20">
        <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Info className="h-4 w-4" />Comment utiliser cette page</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p><strong>1. Choisissez une catégorie.</strong> Le chiffre à côté de son nom indique le nombre de réglages qu’elle contient.</p>
          <p><strong>2. Lisez la description et la clé.</strong> La description explique l’usage connu ; la clé technique identifie le réglage. Si son effet reste incertain, ne changez pas sa valeur.</p>
          <p><strong>3. Modifiez la valeur.</strong> Un interrupteur sert aux options activées/désactivées ; les autres champs servent aux nombres, adresses ou textes.</p>
          <p><strong>4. Enregistrez.</strong> Utilisez « Enregistrer ce réglage » pour une seule valeur, ou « Enregistrer les modifications » pour toutes les valeurs modifiées. Attendez la confirmation avant de quitter.</p>
          <p><strong>Où régler quoi ?</strong> Les taux, barèmes et règles de commission se gèrent exclusivement dans Paramètres → Rémunération. Les canaux et modèles de notification se règlent dans Paramètres → Notifications et dans la configuration Senndo. Les coordonnées de l’entreprise se règlent dans « Contacts » et « Général ».</p>
          <p><strong>Attention :</strong> après avoir activé/désactivé une option ou modifié un champ, cliquez sur « Enregistrer les modifications ». Cliquer sur un interrupteur seul ne sauvegarde pas la valeur.</p>
          <p><strong>Droits et sécurité :</strong> l’enregistrement est réservé aux administrateurs globaux (PDG/DG habilités). La base refuse les écritures non autorisées, les valeurs incompatibles avec leur type et les réglages marqués non modifiables.</p>
          <p><strong>Propagation :</strong> la valeur enregistrée devient la référence centrale en base. Elle ne change un comportement métier que dans les modules et fonctions qui lisent explicitement cette clé ; les secrets Senndo restent dans Vault et se règlent dans la page Senndo.</p>
          <p><strong>Enregistrement groupé :</strong> toutes les modifications sont validées et appliquées dans une seule transaction : si une valeur ou un droit échoue, l’ensemble est annulé.</p>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher par nom, clé ou valeur…" aria-label="Rechercher un réglage" /></div>
        <Button variant="outline" onClick={() => { setSearch(""); setActiveCategory(""); void refetch(); }}><RefreshCw className="mr-2 h-4 w-4" />Réinitialiser</Button>
        {pendingCount > 0 && <Button onClick={() => saveAllMutation.mutate()} disabled={saveAllMutation.isPending || saveOneMutation.isPending}><Save className="mr-2 h-4 w-4" />{saveAllMutation.isPending ? "Enregistrement…" : `Enregistrer les modifications (${pendingCount})`}</Button>}
      </div>

      {groupedConfigs.length === 0 ? (
        <Card><CardContent className="py-10 text-center"><Settings className="mx-auto mb-3 h-10 w-10 text-muted-foreground" /><p className="font-medium">Aucun réglage disponible</p><p className="mt-1 text-sm text-muted-foreground">Aucune ligne n’a été trouvée dans configurations_systeme.</p></CardContent></Card>
      ) : (
        <Tabs value={activeCategory || filteredGroups[0]?.[0] || groupedConfigs[0][0]} onValueChange={setActiveCategory} className="space-y-4">
          <div className="-mx-2 overflow-x-auto px-2"><TabsList className="flex h-auto w-max min-w-full flex-wrap justify-start gap-1 p-1 sm:w-auto">
            {groupedConfigs.map(([category, configs]) => {
              const meta = getMeta(category);
              const Icon = meta.icon;
              return <TabsTrigger key={category} value={category} className="gap-2 whitespace-nowrap"><Icon className="h-4 w-4" /><span>{meta.label}</span><Badge variant="secondary">{configs.length}</Badge></TabsTrigger>;
            })}
          </TabsList></div>
          {groupedConfigs.map(([category, configs]) => {
            const meta = getMeta(category);
            const Icon = meta.icon;
            const shown = configs.filter((config) => {
              const term = search.trim().toLocaleLowerCase("fr");
              return !term || [config.cle, config.description ?? "", config.valeur, meta.label].some((value) => value.toLocaleLowerCase("fr").includes(term));
            });
            return <TabsContent key={category} value={category}>
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><Icon className="h-5 w-5" />{meta.label}</CardTitle><CardDescription>{meta.help}</CardDescription><div className="text-xs text-muted-foreground">{shown.length} réglage(s) affiché(s) sur {configs.length}</div></CardHeader>
                <CardContent className="space-y-3">
                  {shown.length ? shown.map((config) => <div key={config.id}>{renderInput(config)}</div>) : <div className="py-8 text-center text-sm text-muted-foreground"><SlidersHorizontal className="mx-auto mb-2 h-7 w-7" />Aucun réglage ne correspond à cette recherche.</div>}
                </CardContent>
              </Card>
            </TabsContent>;
          })}
        </Tabs>
      )}

      {pendingCount > 0 && <div className="sticky bottom-3 z-10 flex flex-col gap-2 rounded-lg border bg-background/95 p-3 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between"><p className="text-sm"><CheckCircle2 className="mr-2 inline h-4 w-4 text-amber-600" />{pendingCount} modification(s) non enregistrée(s)</p><Button onClick={() => saveAllMutation.mutate()} disabled={saveAllMutation.isPending || saveOneMutation.isPending}>{saveAllMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Enregistrer les modifications</Button></div>}
    </div>
  );
};

export default ConfigurationSysteme;
