import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, AlertTriangle, CheckCircle2, Copy, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type CR = {
  titre: string; type_intervention: string; resume: string; actions_realisees: string[];
  observations: string; problemes_constates: string[]; recommandations: string[];
  nombre_plants_realises: number | null; informations_manquantes: string[]; complet: boolean;
};

const List = ({ title, items }: { title: string; items: string[] }) =>
  items?.length ? (
    <div><p className="text-sm font-semibold">{title}</p><ul className="ml-5 list-disc text-sm">{items.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
  ) : null;

export default function CompteRenduIA({ contexte }: { contexte?: string }) {
  const { toast } = useToast();
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [cr, setCr] = useState<CR | null>(null);

  const generer = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("compte-rendu-intervention", { body: { description, contexte } });
      if (error) {
        let msg = error.message;
        try { msg = (await (error as any).context?.json())?.error || msg; } catch { /* ignore */ }
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);
      setCr(data.compte_rendu);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Compte rendu impossible", description: e?.message || "Erreur" });
    } finally {
      setLoading(false);
    }
  };

  const texte = cr ? [
    cr.titre, `Type : ${cr.type_intervention || "—"}`, "", cr.resume, "",
    cr.actions_realisees.length ? "Actions réalisées :\n- " + cr.actions_realisees.join("\n- ") : "",
    cr.observations ? `Observations : ${cr.observations}` : "",
    cr.problemes_constates.length ? "Problèmes :\n- " + cr.problemes_constates.join("\n- ") : "",
    cr.recommandations.length ? "Recommandations :\n- " + cr.recommandations.join("\n- ") : "",
    cr.nombre_plants_realises != null ? `Plants réalisés : ${cr.nombre_plants_realises}` : "",
  ].filter(Boolean).join("\n") : "";

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" />Compte rendu assisté par IA</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <Textarea rows={5} value={description} onChange={(e) => setDescription(e.target.value)}
          placeholder="Décrivez librement l'intervention : client/parcelle, travaux faits, nombre de plants, état observé, problèmes, suite à donner…" />
        <Button onClick={generer} disabled={loading || description.trim().length < 10}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          {loading ? "Rédaction…" : "Générer le compte rendu"}
        </Button>

        {cr && (
          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-bold">{cr.titre}</h3>
              {cr.complet
                ? <Badge className="gap-1"><CheckCircle2 className="h-3 w-3" />Complet</Badge>
                : <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />Incomplet</Badge>}
            </div>
            {cr.type_intervention && <p className="text-sm text-muted-foreground">Type : {cr.type_intervention}</p>}
            <p className="text-sm">{cr.resume}</p>
            <List title="Actions réalisées" items={cr.actions_realisees} />
            {cr.observations && <p className="text-sm"><span className="font-semibold">Observations : </span>{cr.observations}</p>}
            <List title="Problèmes constatés" items={cr.problemes_constates} />
            <List title="Recommandations" items={cr.recommandations} />
            {cr.nombre_plants_realises != null && <p className="text-sm"><span className="font-semibold">Plants réalisés : </span>{cr.nombre_plants_realises}</p>}
            {cr.informations_manquantes.length > 0 && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
                <p className="flex items-center gap-1 text-sm font-semibold text-destructive"><AlertTriangle className="h-4 w-4" />Informations manquantes</p>
                <ul className="ml-5 list-disc text-sm">{cr.informations_manquantes.map((x, i) => <li key={i}>{x}</li>)}</ul>
              </div>
            )}
            <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(texte); toast({ title: "Compte rendu copié" }); }}>
              <Copy className="mr-2 h-4 w-4" />Copier
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
