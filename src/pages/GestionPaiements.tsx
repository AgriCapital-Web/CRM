import { useState, useMemo } from "react";
import MainLayout from "@/components/layout/MainLayout";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { supabase } from "@/integrations/supabase/client";
import { PERMISSIONS } from "@/lib/roles";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { useRealtime } from "@/hooks/useRealtime";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  CreditCard,
  Coins,
  ArrowRightLeft,
  CheckCircle,
  Loader2,
  TrendingUp,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownLeft,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSafeErrorMessage } from "@/lib/safeError";
import ClientPaymentWorkspace from "@/components/finance/ClientPaymentWorkspace";

interface Paiement {
  id: string;
  client_id: string;
  plantation_id: string;
  montant: number;
  montant_paye: number | null;
  type_paiement: string;
  statut: string;
  reference: string;
  date_paiement: string | null;
  created_at: string;
  metadata: any;
  clients?: { nom_complet: string; telephone: string; statut_global?: string; type_client?: string; is_internal?: boolean; contrat_solde_at?: string | null };
  plantations?: { id_unique: string; nom_plantation: string };
}

const GestionPaiements = () => {
  const { toast } = useToast();
  const { hasRole } = useAuth();
  const { can } = usePermissions();
  const canFinancialOverview = hasRole("pdg") || hasRole("dg") || hasRole("comptable") || hasRole("responsable_operations") || can("finance.view") || can("paiements.view");
  const canViewClientMoney = canFinancialOverview;
  const canTransferPayment = hasRole("pdg") || hasRole("dg") || hasRole("comptable") || hasRole("responsable_operations") || can("paiements.update") || can("finance.manage");
  const canRefundPayment = hasRole("pdg") || hasRole("dg") || hasRole("comptable") || can("paiements.cancel") || can("finance.manage");
  const canManage = canTransferPayment || canRefundPayment;
  const queryClient = useQueryClient();
  const [isTransferDialogOpen, setIsTransferDialogOpen] = useState(false);
  const [isRefundDialogOpen, setIsRefundDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Transfer state
  const [sourcePhone, setSourcePhone] = useState("");
  const [targetAccount, setTargetAccount] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferNotes, setTransferNotes] = useState("");
  const [sourceClient, setSourceClient] = useState<any>(null);
  const [targetClient, setTargetClient] = useState<any>(null);

  // Refund state
  const [refundSourcePhone, setRefundSourcePhone] = useState("");
  const [refundPaiementId, setRefundPaiementId] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundNotes, setRefundNotes] = useState("");
  const [refundMode, setRefundMode] = useState("Mobile Money");
  const [refundNumero, setRefundNumero] = useState("");
  const [sourcePaiements, setSourcePaiements] = useState<Paiement[]>([]);


  // Realtime refresh: when a payment changes (webhooks / validation), refresh lists + stats
  useRealtime({
    table: 'paiements',
    event: '*',
    onChange: () => {
      queryClient.invalidateQueries({ queryKey: ['gestion-paiements'] });
      queryClient.invalidateQueries({ queryKey: ['gestion-paiements-clients'] });
      queryClient.invalidateQueries({ queryKey: ['clients-monnaie'] });
    }
  });

  // Monnaie client : solde calculé par le moteur financier centralisé.
  const { data: clientsMonnaie = [] } = useQuery({
    queryKey: ['clients-monnaie'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('v_monnaie_clients')
        .select('client_id,monnaie_client,clients(id,nom_complet,telephone)')
        .gt('monnaie_client', 0)
        .order('monnaie_client', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []).map((row: any) => ({
        id: row.client_id,
        nom_complet: row.clients?.nom_complet,
        telephone: row.clients?.telephone,
        monnaie: Number(row.monnaie_client || 0),
      }));
    },
    staleTime: 30_000,
    enabled: canViewClientMoney,
  });

  const { data: financeSynthese = [] } = useQuery({
    queryKey: ["gestion-paiements-finance-synthese"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("v_client_synthese")
        .select("client_id,compte_actif,montant_total_contrat,total_paye,reste_a_payer")
        .eq("compte_actif", true);
      if (error) throw error;
      return data || [];
    },
    staleTime: 30_000,
  });

  // Les indicateurs financiers portent sur les montants contractuels et encaissés,
  // jamais sur le nombre d'échéances ou de transactions.
  const stats = useMemo(() => {
    const caPrevisionnel = financeSynthese.reduce((sum: number, row: any) => sum + Number(row.montant_total_contrat || 0), 0);
    const montantTotal = financeSynthese.reduce((sum: number, row: any) => sum + Number(row.total_paye || 0), 0);
    const montantRestant = financeSynthese.reduce((sum: number, row: any) => sum + Number(row.reste_a_payer || 0), 0);
    const totalMonnaie = clientsMonnaie.reduce((sum, s: any) => sum + (s?.monnaie || 0), 0);

    return {
      caPrevisionnel,
      montantTotal,
      montantRestant,
      monnaieDisponible: totalMonnaie,
    };
  }, [financeSynthese, clientsMonnaie]);

  const formatMontant = (m: number) => {
    return new Intl.NumberFormat("fr-FR").format(m) + " F CFA";
  };

  const financialBlockReason = async (client:any): Promise<string | null> => {
    if (!client) return "Client introuvable.";
    if (client.type_client === "beneficiaire_particulier") return "Les bénéficiaires particuliers ne disposent pas d’actions financières.";
    const landRole = String(client.type_client_foncier || "").toLowerCase();
    const clientRole = String(client.type_client || "").toLowerCase();
    if (client.proprietaire_id || ["proprietaire_foncier", "propriétaire_foncier", "partenaire_foncier"].includes(landRole) || ["proprietaire_foncier", "propriétaire_foncier", "partenaire"].includes(clientRole)) {
      return "Les partenaires et propriétaires fonciers n’ont pas d’actions financières dans ce parcours.";
    }
    if (client.is_internal) return "Cet actif AgriCapital n’est pas encore transféré à un client.";
    const {data:summary,error} = await (supabase as any).from("v_client_synthese").select("montant_total_contrat,reste_a_payer").eq("client_id",client.id).maybeSingle();
    if (error) throw error;
    // Le timestamp peut concerner le contrat principal : les souscriptions additionnelles
    // restent autorisées tant que le solde financier global du client est positif.
    if (summary && Number(summary.montant_total_contrat||0)>0 && Number(summary.reste_a_payer||0)<=0) return "Le dossier financier du client est soldé : aucune action financière n’est autorisée.";
    if (!summary && client.contrat_solde_at) return "Le dossier financier du client est soldé : aucune action financière n’est autorisée.";
    return null;
  };

  // Search client by phone
  const searchClient = async (phone: string, target: 'source' | 'target') => {
    const safe = phone.replace(/[^\p{L}\p{N}\s+\-_.]/gu, "").trim();
    if (safe.length < 8) return;
    const { data, error } = await (supabase as any).from('clients')
      .select('id,nom_complet,telephone,id_unique,type_client,type_client_foncier,proprietaire_id,is_internal,contrat_solde_at,montant_total_contrat')
      .or(`telephone.ilike.%${safe}%,whatsapp.ilike.%${safe}%,id_unique.ilike.%${safe}%`)
      .eq('statut','actif').limit(10);
    if (error) { toast({variant:"destructive",title:"Recherche impossible",description:getSafeErrorMessage(error)}); return; }
    const candidate = (data||[])[0];
    if (!candidate) return;
    const blocked = await financialBlockReason(candidate);
    if (blocked) {
      if (target === "source") { setSourceClient(null); setSourcePaiements([]); } else setTargetClient(null);
      toast({variant:"destructive",title:"Action financière interdite",description:blocked});
      return;
    }
    if (target === 'source') {
      setSourceClient(candidate);
      const { data: paiements } = await (supabase as any).from('paiements').select('*').eq('client_id',candidate.id).eq('statut','valide').order('created_at',{ascending:false}).limit(10);
      setSourcePaiements(paiements || []);
    } else setTargetClient(candidate);
  };

  // Handle transfer between accounts
  const handleTransfer = async () => {
    if (!sourceClient || !targetClient || !transferAmount) {
      toast({ variant: "destructive", title: "Erreur", description: "Veuillez remplir tous les champs" });
      return;
    }
    setLoading(true);
    
    try {
      const [sourceBlocked,targetBlocked] = await Promise.all([financialBlockReason(sourceClient),financialBlockReason(targetClient)]);
      if (sourceBlocked || targetBlocked) throw new Error(sourceBlocked || targetBlocked || "Action financière interdite.");
      const amount = parseFloat(transferAmount);
      
      // Create transfer record
      const { error: transferError } = await supabase
        .from('transferts_paiements')
        .insert({
          client_source_id: sourceClient.id,
          client_dest_id: targetClient.id,
          montant: amount,
          motif: transferNotes
        });

      if (transferError) throw transferError;

      // Create new payment for target
      const { error: insertError } = await supabase
        .from('paiements')
        .insert({
          client_id: targetClient.id,
          montant: amount,
          montant_paye: amount,
          type_paiement: 'MENSUALITE',
          statut: 'valide',
          mode_paiement: 'Transfert interne',
          reference: `TRF-${Date.now()}`,
          date_paiement: new Date().toISOString(),
          metadata: {
            transfert_entrant: {
              depuis: sourceClient.id,
              depuis_nom: sourceClient.nom_complet,
              montant: amount,
              date: new Date().toISOString(),
              notes: transferNotes
            }
          }
        });

      if (insertError) throw insertError;

      toast({
        title: "Transfert effectué",
        description: `${formatMontant(amount)} transféré de ${sourceClient.nom_complet} vers ${targetClient.nom_complet}`
      });

      setIsTransferDialogOpen(false);
      resetForms();
      queryClient.invalidateQueries({ queryKey: ["gestion-paiements-clients"] });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: getSafeErrorMessage(error)
      });
    } finally {
      setLoading(false);
    }
  };

  // Handle refund
  const handleRefund = async () => {
    if (!sourceClient || !refundPaiementId || !refundAmount) {
      toast({ variant: "destructive", title: "Erreur", description: "Veuillez remplir tous les champs" });
      return;
    }
    setLoading(true);

    try {
      const blocked = await financialBlockReason(sourceClient);
      if (blocked) throw new Error(blocked);
      const amount = parseFloat(refundAmount);
      const sourcePaiement = sourcePaiements.find(p => p.id === refundPaiementId);
      
      if (!sourcePaiement) throw new Error("Paiement source non trouvé");
      
      // Create refund record
      const { error: refundError } = await supabase
        .from('remboursements')
        .insert({
          paiement_id: refundPaiementId,
          client_id: sourceClient.id,
          montant: amount,
          motif: refundNotes,
          mode_remboursement: refundMode,
          numero_compte: refundNumero,
          statut: 'en_attente'
        });

      if (refundError) throw refundError;

      // Update payment with refund info
      await supabase
        .from('paiements')
        .update({
          montant_paye: (sourcePaiement.montant_paye || sourcePaiement.montant) - amount,
          metadata: {
            ...sourcePaiement.metadata,
            remboursement: {
              montant: amount,
              date: new Date().toISOString(),
              notes: refundNotes,
              mode: refundMode
            }
          }
        })
        .eq('id', refundPaiementId);

      toast({
        title: "Remboursement enregistré",
        description: `${formatMontant(amount)} à rembourser à ${sourceClient.nom_complet}`
      });

      setIsRefundDialogOpen(false);
      resetForms();
      queryClient.invalidateQueries({ queryKey: ["gestion-paiements-clients"] });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: getSafeErrorMessage(error)
      });
    } finally {
      setLoading(false);
    }
  };

  const resetForms = () => {
    setSourcePhone("");
    setTargetAccount("");
    setTransferAmount("");
    setTransferNotes("");
    setSourceClient(null);
    setTargetClient(null);
    setRefundSourcePhone("");
    setRefundPaiementId("");
    setRefundAmount("");
    setRefundNotes("");
    setRefundMode("Mobile Money");
    setRefundNumero("");
    setSourcePaiements([]);
  };

  return (
    <ProtectedRoute requiredPermission={PERMISSIONS.VIEW_PAIEMENTS}>
      <MainLayout>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2"><CreditCard className="h-7 w-7 text-primary" />Gestion des Paiements</h1>
              
            </div>
          </div>

          {canFinancialOverview && (
          <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg"><TrendingUp className="h-5 w-5 text-blue-600" /></div>
                  <div><p className="text-xs text-muted-foreground">Chiffre d'affaires prévisionnel</p><p className="text-sm font-bold">{formatMontant(stats.caPrevisionnel)}</p></div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 rounded-lg"><CheckCircle className="h-5 w-5 text-green-600" /></div>
                  <div><p className="text-xs text-muted-foreground">Montant encaissé</p><p className="text-sm font-bold">{formatMontant(stats.montantTotal)}</p></div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-orange-100 rounded-lg"><ArrowUpRight className="h-5 w-5 text-orange-600" /></div>
                  <div><p className="text-xs text-muted-foreground">Montant restant à encaisser</p><p className="text-sm font-bold">{formatMontant(stats.montantRestant)}</p></div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-amber-50 border-amber-200">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-100 rounded-lg"><Coins className="h-5 w-5 text-amber-600" /></div>
                  {canViewClientMoney && <div><p className="text-xs text-amber-700">Monnaie client</p><p className="text-sm font-bold text-amber-800">{formatMontant(stats.monnaieDisponible)}</p></div>}
                </div>
              </CardContent>
            </Card>
          </div>
          </>
          )}

          {/* Tabs */}
          <Tabs defaultValue="paiements" className="space-y-4">
            <TabsList className="grid w-full sm:w-auto grid-cols-1 min-[420px]:grid-cols-2 gap-2">
              <TabsTrigger value="paiements" className="gap-2">
                <CreditCard className="h-4 w-4" />
                Paiements
              </TabsTrigger>

              {canManage && <TabsTrigger value="operations" className="gap-2">
                <ArrowRightLeft className="h-4 w-4" />
                Opérations
              </TabsTrigger>}
            </TabsList>

            {/* Vue financière par client : les paiements se lancent depuis la fiche client via KKiaPay. */}
            <TabsContent value="paiements" className="space-y-4">
              <ClientPaymentWorkspace
                onTransfer={canTransferPayment ? (client: any) => {
                  setSourcePhone(client.telephone || "");
                  setTargetAccount("");
                  setTransferAmount("");
                  setTransferNotes("");
                  void searchClient(client.telephone || "", "source");
                  setIsTransferDialogOpen(true);
                } : undefined}
                onRefund={canRefundPayment ? (client: any) => {
                  setRefundSourcePhone(client.telephone || "");
                  setRefundPaiementId("");
                  setRefundAmount("");
                  setRefundNotes("");
                  setRefundMode("Mobile Money");
                  void searchClient(client.telephone || "", "source");
                  setIsRefundDialogOpen(true);
                } : undefined}
              />
            </TabsContent>

            {/* Monnaie client conservée dans les indicateurs; aucune conversion tarifaire artificielle. */}

            {/* Operations Tab */}
            {canManage && <TabsContent value="operations" className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                {canTransferPayment && <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => setIsTransferDialogOpen(true)}>
                  <CardContent className="p-6 text-center">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
                      <ArrowRightLeft className="h-8 w-8 text-blue-600" />
                    </div>
                    <h3 className="font-semibold text-lg">Transfert</h3>
                    
                  </CardContent>
                </Card>}

                {canRefundPayment && <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => setIsRefundDialogOpen(true)}>
                  <CardContent className="p-6 text-center">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-4">
                      <ArrowDownLeft className="h-8 w-8 text-red-600" />
                    </div>
                    <h3 className="font-semibold text-lg">Remboursement</h3>
                    
                  </CardContent>
                </Card>}
              </div>
            </TabsContent>}
          </Tabs>

          {/* Transfer Dialog */}
          <Dialog open={isTransferDialogOpen} onOpenChange={(open) => { setIsTransferDialogOpen(open); if (!open) resetForms(); }}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ArrowRightLeft className="h-5 w-5 text-blue-600" />
                  Transférer un paiement
                </DialogTitle>
                
              </DialogHeader>
              <div className="space-y-4">
                {/* Source - Débiteur */}
                <div className="space-y-2">
                  <Label>Numéro téléphone du débiteur (source)</Label>
                  <Input
                    type="tel"
                    placeholder="Ex: 0759566087"
                    value={sourcePhone}
                    onChange={(e) => {
                      setSourcePhone(e.target.value);
                      searchClient(e.target.value, 'source');
                    }}
                  />
                  {sourceClient && (
                    <div className="bg-green-50 p-2 rounded border border-green-200">
                      <p className="text-sm font-medium text-green-800">✓ {sourceClient.nom_complet}</p>
                      <p className="text-xs text-green-600">ID: {sourceClient.id_unique}</p>
                    </div>
                  )}
                </div>

                {/* Destination - Bénéficiaire */}
                <div className="space-y-2">
                  <Label>Numéro de compte du bénéficiaire (destination)</Label>
                  <Input
                    type="text"
                    placeholder="Ex: AC-2025-000123 ou téléphone"
                    value={targetAccount}
                    onChange={(e) => {
                      setTargetAccount(e.target.value);
                      searchClient(e.target.value, 'target');
                    }}
                  />
                  {targetClient && (
                    <div className="bg-blue-50 p-2 rounded border border-blue-200">
                      <p className="text-sm font-medium text-blue-800">✓ {targetClient.nom_complet}</p>
                      <p className="text-xs text-blue-600">ID: {targetClient.id_unique}</p>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Montant à transférer (F CFA)</Label>
                  <Input
                    type="number"
                    placeholder="Montant"
                    value={transferAmount}
                    onChange={(e) => setTransferAmount(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Motif du transfert (optionnel)</Label>
                  <Textarea
                    placeholder="Raison du transfert"
                    value={transferNotes}
                    onChange={(e) => setTransferNotes(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsTransferDialogOpen(false)}>Annuler</Button>
                <Button onClick={handleTransfer} disabled={loading || !sourceClient || !targetClient || !transferAmount}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ArrowRightLeft className="h-4 w-4 mr-2" />}
                  Transférer
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Refund Dialog */}
          <Dialog open={isRefundDialogOpen} onOpenChange={(open) => { setIsRefundDialogOpen(open); if (!open) resetForms(); }}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ArrowDownLeft className="h-5 w-5 text-red-600" />
                  Effectuer un remboursement
                </DialogTitle>
                
              </DialogHeader>
              <div className="space-y-4">
                {/* Source - Client */}
                <div className="space-y-2">
                  <Label>Numéro téléphone du client</Label>
                  <Input
                    type="tel"
                    placeholder="Ex: 0759566087"
                    value={refundSourcePhone}
                    onChange={(e) => {
                      setRefundSourcePhone(e.target.value);
                      searchClient(e.target.value, 'source');
                    }}
                  />
                  {sourceClient && (
                    <div className="bg-muted p-2 rounded">
                      <p className="text-sm font-medium">✓ {sourceClient.nom_complet}</p>
                    </div>
                  )}
                </div>

                {/* Sélection du paiement source */}
                {sourcePaiements.length > 0 && (
                  <div className="space-y-2">
                    <Label>Paiement source à rembourser</Label>
                    <Select value={refundPaiementId} onValueChange={setRefundPaiementId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionner le paiement" />
                      </SelectTrigger>
                      <SelectContent>
                        {sourcePaiements.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.reference} - {formatMontant(p.montant_paye || p.montant)} ({new Date(p.date_paiement || p.created_at).toLocaleDateString('fr-FR')})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Montant à rembourser (F CFA)</Label>
                  <Input
                    type="number"
                    placeholder="Montant"
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Mode de remboursement</Label>
                    <Select value={refundMode} onValueChange={setRefundMode}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Mobile Money">Mobile Money</SelectItem>
                        <SelectItem value="Orange Money">Orange Money</SelectItem>
                        <SelectItem value="Virement">Virement bancaire</SelectItem>
                        <SelectItem value="Espèces">Espèces</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Numéro de compte</Label>
                    <Input
                      placeholder="Numéro du compte"
                      value={refundNumero}
                      onChange={(e) => setRefundNumero(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Motif du remboursement</Label>
                  <Textarea
                    placeholder="Raison du remboursement"
                    value={refundNotes}
                    onChange={(e) => setRefundNotes(e.target.value)}
                  />
                </div>

                <div className="bg-yellow-50 p-3 rounded-lg flex items-start gap-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0" />
                  
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsRefundDialogOpen(false)}>Annuler</Button>
                <Button variant="destructive" onClick={handleRefund} disabled={loading || !sourceClient || !refundPaiementId || !refundAmount}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ArrowDownLeft className="h-4 w-4 mr-2" />}
                  Rembourser
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

        </div>
      </MainLayout>
    </ProtectedRoute>
  );
};

export default GestionPaiements;
