import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRealtime } from "@/hooks/useRealtime";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { CheckCircle2, XCircle, ExternalLink } from "lucide-react";

type Row = { id: string; montant: number; montant_paye: number; type_paiement: string; mode_paiement: string | null; reference: string | null;
  date_echeance: string | null; created_at: string; validation_comptable_at: string | null; fichier_preuve_url: string | null; preuve_paiement_url: string | null;
  clients?: { nom_complet: string } | null };

const money = (n: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n) + " F";

export default function PaiementsAValider() {
  const { userRoles } = useAuth() as any;
  const roles: string[] = userRoles || [];
  const isCpt = roles.includes("comptable"), isPdg = roles.includes("pdg");
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [rejet, setRejet] = useState<Row | null>(null);
  const [motif, setMotif] = useState("");

  const load = useCallback(async () => {
    if (!isCpt && !isPdg) return;
    const { data } = await (supabase as any).from("paiements")
      .select("id,montant,montant_paye,type_paiement,mode_paiement,reference,date_echeance,created_at,validation_comptable_at,fichier_preuve_url,preuve_paiement_url,clients(nom_complet)")
      .eq("statut", "en_attente").order("created_at", { ascending: false }).limit(500);
    setRows(data || []);
  }, [isCpt, isPdg]);
  useEffect(() => { void load(); }, [load]);
  useRealtime({ table: "paiements", onChange: () => void load() } as any);

  if (!isCpt && !isPdg) return null;

  const decide = async (r: Row, decision: "valider" | "rejeter", m?: string) => {
    setBusy(r.id);
    const { data, error } = await (supabase as any).rpc("paiement_decider", { _paiement_id: r.id, _decision: decision, _motif: m ?? null });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success(data === "valide" ? "Paiement validé" : data === "valide_comptable" ? "Validé, transmis au PDG" : "Paiement refusé");
    setRejet(null); setMotif(""); void load();
  };
  const canAct = (r: Row) => (r.validation_comptable_at ? isPdg : isCpt);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <Card className="border-l-4 border-l-accent">
      <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base">Paiements à valider <Badge variant="secondary">{rows.filter(canAct).length}</Badge></CardTitle></CardHeader>
      <CardContent>
        {rows.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Aucun paiement en attente.</p> : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Client</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Montant</TableHead>
              <TableHead>Échéance</TableHead><TableHead>Étape</TableHead><TableHead>Justificatif</TableHead><TableHead className="text-right">Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>{rows.map(r => {
              const late = r.date_echeance && r.date_echeance < today;
              const proof = r.fichier_preuve_url || r.preuve_paiement_url;
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.clients?.nom_complet || "—"}</TableCell>
                  <TableCell>{r.type_paiement === "PI" ? "Paiement initial" : "Mensualité"}</TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">{money(Number(r.montant_paye || r.montant || 0))}</TableCell>
                  <TableCell>{r.date_echeance ? <Badge variant={late ? "destructive" : "outline"}>{new Date(r.date_echeance).toLocaleDateString("fr-FR")}</Badge> : "—"}</TableCell>
                  <TableCell><Badge variant={r.validation_comptable_at ? "default" : "secondary"}>{r.validation_comptable_at ? "Attente PDG" : "Attente comptable"}</Badge></TableCell>
                  <TableCell>{proof ? <a href={proof} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline">Voir <ExternalLink className="h-3 w-3" /></a> : <span className="text-muted-foreground">Aucun</span>}</TableCell>
                  <TableCell className="text-right">{canAct(r) ? (
                    <div className="flex justify-end gap-1">
                      <Button size="sm" disabled={busy === r.id} onClick={() => void decide(r, "valider")}><CheckCircle2 className="mr-1 h-4 w-4" />Valider</Button>
                      <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => setRejet(r)}><XCircle className="mr-1 h-4 w-4" />Refuser</Button>
                    </div>) : <span className="text-xs text-muted-foreground">—</span>}
                  </TableCell>
                </TableRow>);
            })}</TableBody>
          </Table>)}
      </CardContent>
      <Dialog open={!!rejet} onOpenChange={o => { if (!o) { setRejet(null); setMotif(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Refuser le paiement</DialogTitle></DialogHeader>
          <Textarea value={motif} onChange={e => setMotif(e.target.value)} placeholder="Motif du refus" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejet(null)}>Annuler</Button>
            <Button disabled={!motif.trim() || !rejet || busy === rejet?.id} onClick={() => rejet && void decide(rejet, "rejeter", motif.trim())}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
