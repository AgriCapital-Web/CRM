import { useEffect, useMemo, useState } from "react";
import { KeyRound, Loader2, RotateCcw, Search, ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

export default function ReinitialiserCodesAcces() {
  const { toast } = useToast();
  const [clients, setClients] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data, error } = await (supabase as any)
        .from("clients")
        .select("id,nom_complet,telephone,email,compte_actif,statut_global")
        .order("nom_complet", { ascending: true });
      if (error) {
        toast({ variant: "destructive", title: "Erreur", description: error.message });
      } else {
        setClients(data || []);
      }
      setLoading(false);
    };
    void load();
  }, [toast]);

  const filteredClients = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) =>
      [c.nom_complet, c.telephone, c.email].filter(Boolean).some((v) => String(v).toLowerCase().includes(q))
    );
  }, [clients, search]);

  const selected = clients.find((c) => c.id === selectedId);

  const reset = async () => {
    if (!selectedId || !selected) return;
    if (!window.confirm("Réinitialiser le code d'accès de " + (selected.nom_complet || "ce client") + " ? Le client devra créer un nouveau code à sa prochaine connexion.")) return;
    setResetting(true);
    try {
      const { data, error } = await supabase.functions.invoke("reset-client-access-code", {
        body: { client_id: selectedId },
      });
      if (error || !data?.success) throw new Error(data?.error || error?.message || "Réinitialisation impossible.");
      toast({
        title: "Code réinitialisé",
        description: "Le client devra créer un nouveau code à 4 chiffres à sa prochaine connexion. Le SMS d'information a été déclenché.",
      });
      setSelectedId("");
      setSearch("");
    } catch (e: any) {
      toast({ variant: "destructive", title: "Réinitialisation impossible", description: e?.message || "Une erreur est survenue." });
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2"><KeyRound className="h-7 w-7" /> Réinitialiser les codes d'accès</h1>
            <p className="mt-1 text-sm text-muted-foreground">Remettez le portail d'un client à zéro sans modifier son dossier, ses plantations ou ses paiements.</p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><RotateCcw className="h-5 w-5" /> Réinitialisation d'un code d'accès client</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="rounded-xl border bg-muted/30 p-4 text-sm">
                <div className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4 text-primary" /> Ce que fait la réinitialisation</div>
                <ul className="mt-2 list-disc pl-5 text-muted-foreground space-y-1">
                  <li>supprime le code d'accès actuel ;</li>
                  <li>révoque les sessions portail encore ouvertes ;</li>
                  <li>force une nouvelle création de code à 4 chiffres lors de la prochaine connexion ;</li>
                  <li>déclenche l'information du client par SMS via le système de notifications.</li>
                </ul>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Rechercher un client</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nom, téléphone ou e-mail…" className="pl-9" />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Client</label>
                <Select value={selectedId} onValueChange={setSelectedId} disabled={loading}>
                  <SelectTrigger><SelectValue placeholder={loading ? "Chargement des clients…" : "Sélectionner un client"} /></SelectTrigger>
                  <SelectContent>
                    {filteredClients.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {(client.nom_complet || "Client sans nom") + (client.telephone ? " — " + client.telephone : "")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!loading && filteredClients.length === 0 && <p className="text-xs text-muted-foreground">Aucun client ne correspond à la recherche.</p>}
              </div>

              {selected && (
                <div className="rounded-xl border p-4 text-sm space-y-1">
                  <p className="font-semibold">{selected.nom_complet}</p>
                  <p className="text-muted-foreground">{selected.telephone || "Téléphone non renseigné"}</p>
                  {selected.email && <p className="text-muted-foreground">{selected.email}</p>}
                </div>
              )}

              <Button onClick={reset} disabled={!selectedId || resetting} className="w-full sm:w-auto">
                {resetting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-2" />}
                Réinitialiser le code d'accès
              </Button>
            </CardContent>
          </Card>
      </div>
  );
}