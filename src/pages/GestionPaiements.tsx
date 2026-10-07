import { useState, useEffect, useMemo } from "react";
import MainLayout from "@/components/layout/MainLayout";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { supabase } from "@/integrations/supabase/client";
import { PERMISSIONS } from "@/lib/roles";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { useRealtime } from "@/hooks/useRealtime";
import { useKkiapay } from "@/hooks/useKkiapay";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  Search, 
  CreditCard, 
  Coins, 
  ArrowRightLeft, 
  RefreshCcw,
  CheckCircle,
  XCircle,
  Clock,
  Eye,
  Loader2,
  TrendingUp,
  Users,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownLeft,
  Wallet,
  Smartphone
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSafeErrorMessage } from "@/lib/safeError";
import { getCachedItems, STORES } from "@/lib/offlineDb";

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
  clients?: { nom_complet: string; telephone: string; statut_global?: string };
  plantations?: { id_unique: string; nom_plantation: string };
}

const GestionPaiements = () => {
  const { toast } = useToast();
  const { hasRole } = useAuth();
  const canFinancialOverview = hasRole("pdg") || hasRole("dg") || hasRole("comptable") || hasRole("responsable_operations");
  const canViewClientMoney = canFinancialOverview;
  const queryClient = useQueryClient();
  const { openPayment, onSuccess, onFailed, onClose } = useKkiapay();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPaiement, setSelectedPaiement] = useState<Paiement | null>(null);
  const [isTransferDialogOpen, setIsTransferDialogOpen] = useState(false);
  const [isRefundDialogOpen, setIsRefundDialogOpen] = useState(false);
  const [isConvertDialogOpen, setIsConvertDialogOpen] = useState(false);
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const [isKkiapayDialogOpen, setIsKkiapayDialogOpen] = useState(false);
  const [kkiapayLoading, setKkiapayLoading] = useState(false);
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

  // Convert state
  const [convertPeriod, setConvertPeriod] = useState<'jour' | 'mois' | 'trimestre' | 'semestre' | 'annee'>('mois');
  const [convertCount, setConvertCount] = useState(1);
  const [selectedClientId, setSelectedClientId] = useState("");

  const canManage = hasRole('pdg') || hasRole('dg') || hasRole('comptable');

  // KKiaPay payment handler
  const handleKkiapayPayment = async (paiement: Paiement) => {
    setSelectedPaiement(paiement);
    setKkiapayLoading(true);

    // Setup callbacks before opening
    onSuccess(async (response) => {
      console.log('KKiaPay payment success:', response);
      
      // Verify the transaction server-side
      try {
        // La vérification ET l'enregistrement du paiement sont faits côté serveur :
        // montant, rattachement et unicité de la transaction y sont contrôlés.
        const { data, error } = await supabase.functions.invoke('kkiapay-verify-transaction', {
          body: { transactionId: response.transactionId, paiementId: paiement.id }
        });

        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        if (data?.transaction?.isPaymentSuccessful && data?.applied) {
          toast({
            title: "Paiement réussi ✅",
            description: `${formatMontant(paiement.montant)} payé via KKiaPay`
          });
        } else {
          toast({
            variant: "destructive",
            title: "Paiement échoué",
            description: data?.transaction?.failureMessage || "La vérification a échoué"
          });
        }
      } catch (err: any) {
        console.error('Verification error:', err);
        toast({
          variant: "destructive",
          title: "Erreur de vérification",
          description: getSafeErrorMessage(err)
        });
      }

      setKkiapayLoading(false);
      queryClient.invalidateQueries({ queryKey: ['gestion-paiements'] });
    });

    onFailed((error) => {
      console.error('KKiaPay payment failed:', error);
      toast({
        variant: "destructive",
        title: "Paiement échoué",
        description: error.reason || "Le paiement a échoué"
      });
      setKkiapayLoading(false);
    });

    onClose(() => {
      setKkiapayLoading(false);
    });

    // Open the widget
    const success = await openPayment({
      amount: paiement.montant,
      name: paiement.clients?.nom_complet || 'Client AgriCapital',
      phone: paiement.clients?.telephone || '',
      data: {
        paiement_id: paiement.id,
        reference: paiement.reference,
        type: paiement.type_paiement
      }
    });

    if (!success) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Le widget KKiaPay n'a pas pu s'ouvrir. Vérifiez votre connexion."
      });
      setKkiapayLoading(false);
    }
  };

  // Realtime refresh: when a payment changes (webhooks / validation), refresh lists + stats
  useRealtime({
    table: 'paiements',
    event: '*',
    onChange: () => {
      queryClient.invalidateQueries({ queryKey: ['gestion-paiements'] });
      queryClient.invalidateQueries({ queryKey: ['clients-monnaie'] });
    }
  });

  const { data: paiements = [], isLoading, refetch } = useQuery({
    queryKey: ['gestion-paiements', searchTerm.trim()],
    queryFn: async () => {
      const selectClause = `
        *,
        clients!inner (nom_complet, telephone, id_unique, statut_global),
        plantations (id_unique, nom_plantation)
      `;
      const safeSearch = searchTerm.trim().replace(/[,%()]/g, " ");

      if (!safeSearch) {
        const { data, error } = await supabase
          .from('paiements')
          .select(selectClause)
          .eq('statut', 'valide')
          .order('created_at', { ascending: false })
          .limit(50);
        if (error) throw error;
        return data as Paiement[];
      }

      const [paymentSearch, clientSearch] = await Promise.all([
        supabase
          .from('paiements')
          .select(selectClause)
          .eq('statut', 'valide')
          .or(`reference.ilike.%${safeSearch}%,id_transaction.ilike.%${safeSearch}%`)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('paiements')
          .select(selectClause)
          .eq('statut', 'valide')
          .or(`nom_complet.ilike.%${safeSearch}%,telephone.ilike.%${safeSearch}%,id_unique.ilike.%${safeSearch}%`, { referencedTable: 'clients' })
          .order('created_at', { ascending: false })
          .limit(50)
      ]);

      if (paymentSearch.error) throw paymentSearch.error;
      if (clientSearch.error) throw clientSearch.error;

      const merged = new Map<string, Paiement>();
      for (const row of [...(paymentSearch.data || []), ...(clientSearch.data || [])]) {
        merged.set(row.id, row as Paiement);
      }
      return Array.from(merged.values())
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 50);
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
        .select("compte_actif,montant_total_contrat,total_paye,reste_a_payer")
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

  // Filtered paiements
  const filteredPaiements = useMemo(() => {
    if (!searchTerm) return paiements;
    const term = searchTerm.toLowerCase();
    return paiements.filter(p => 
      p.reference?.toLowerCase().includes(term) ||
      p.clients?.nom_complet?.toLowerCase().includes(term) ||
      p.clients?.telephone?.includes(term) ||
      p.plantations?.id_unique?.toLowerCase().includes(term)
    );
  }, [paiements, searchTerm]);

  const formatMontant = (m: number) => {
    return new Intl.NumberFormat("fr-FR").format(m) + " F CFA";
  };

  const getStatutBadge = (statut: string) => {
    switch (statut) {
      case 'valide':
        return <Badge className="bg-green-100 text-green-800"><CheckCircle className="h-3 w-3 mr-1" />Validé</Badge>;
      case 'en_attente':
        return <Badge className="bg-yellow-100 text-yellow-800"><Clock className="h-3 w-3 mr-1" />En attente</Badge>;
      case 'echoue':
      case 'rejete':
        return <Badge className="bg-red-100 text-red-800"><XCircle className="h-3 w-3 mr-1" />Échoué</Badge>;
      default:
        return <Badge variant="outline">{statut}</Badge>;
    }
  };  const getStatutClientBadge = (statut: string) => {
    const normalized = String(statut || "").toLowerCase();
    const value = normalized === "a_jour" || normalized === "actif" ? "À jour" :
      normalized === "retard" ? "En retard" :
      normalized === "suspendu" ? "Suspendu" :
      normalized === "ferme" ? "Fermé" : "À jour";
    const cls = normalized === "retard"
      ? "bg-red-100 text-red-800 border-red-200"
      : normalized === "suspendu"
      ? "bg-amber-100 text-amber-800 border-amber-200"
      : normalized === "ferme"
      ? "bg-slate-100 text-slate-700 border-slate-200"
      : "bg-green-100 text-green-800 border-green-200";
    return <Badge variant="outline" className={cls}>{value}</Badge>;
  };

  // Search client by phone
  const searchClient = async (phone: string, target: 'source' | 'target') => {
    if (phone.length < 8) return;
    const { data } = await supabase
      .from('clients')
      .select('id, nom_complet, telephone, id_unique')
      .or(`telephone.ilike.%${phone}%,id_unique.ilike.%${phone}%`)
      .eq('statut', 'actif')
      .limit(5);
    
    if (data && data.length > 0) {
      if (target === 'source') {
        setSourceClient(data[0]);
        // Fetch paiements for this client
        const { data: paiements } = await supabase
          .from('paiements')
          .select('*')
          .eq('client_id', data[0].id)
          .eq('statut', 'valide')
          .order('created_at', { ascending: false })
          .limit(10);
        setSourcePaiements(paiements || []);
      } else {
        setTargetClient(data[0]);
      }
    }
  };

  // Handle transfer between accounts
  const handleTransfer = async () => {
    if (!sourceClient || !targetClient || !transferAmount) {
      toast({ variant: "destructive", title: "Erreur", description: "Veuillez remplir tous les champs" });
      return;
    }
    setLoading(true);
    
    try {
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
      refetch();
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
      refetch();
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

  // Handle convert monnaie to payment
  const handleConvertMonnaie = async () => {
    if (!canViewClientMoney) return;
    if (!selectedClientId || convertCount <= 0) return;
    setLoading(true);

    try {
      const client = clientsMonnaie.find((s: any) => s?.id === selectedClientId);
      if (!client) throw new Error('Client non trouvé');

      // Calculate amount based on period
      const tarifs: Record<string, number> = {
        jour: 65,
        mois: 1900,
        trimestre: 5500,
        semestre: 10500,
        annee: 20000
      };
      const montant = tarifs[convertPeriod] * convertCount;

      if (montant > (client as any).monnaie) {
        throw new Error('Monnaie insuffisante pour cette conversion');
      }

      // Create a new payment record for the conversion
      const { error } = await supabase
        .from('paiements')
        .insert({
          client_id: selectedClientId,
          montant: montant,
          montant_paye: montant,
          type_paiement: 'MENSUALITE',
          statut: 'valide',
          mode_paiement: 'Conversion monnaie',
          reference: `CONV-${Date.now()}`,
          date_paiement: new Date().toISOString(),
          metadata: {
            conversion: {
              periode: convertPeriod,
              nombre: convertCount,
              montant_converti: montant,
              date: new Date().toISOString()
            }
          }
        });

      if (error) throw error;

      toast({
        title: "Conversion effectuée",
        description: `${formatMontant(montant)} de monnaie convertis en ${convertCount} ${convertPeriod}(s)`
      });

      setIsConvertDialogOpen(false);
      resetForms();
      refetch();
      queryClient.invalidateQueries({ queryKey: ['clients-monnaie'] });
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
    setSelectedPaiement(null);
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
    setSelectedClientId("");
    setConvertCount(1);
  };

  return (
    <ProtectedRoute requiredPermission={PERMISSIONS.VIEW_PAIEMENTS}>
      <MainLayout>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
                <CreditCard className="h-7 w-7 text-primary" />
                Gestion des Paiements
              </h1>
              <p className="text-muted-foreground mt-1">
                Suivi, transferts, remboursements et conversion de monnaie
              </p>
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
            <TabsList className="grid w-full sm:w-auto grid-cols-1 min-[420px]:grid-cols-3 gap-2">
              <TabsTrigger value="paiements" className="gap-2">
                <CreditCard className="h-4 w-4" />
                Paiements
              </TabsTrigger>
              {canViewClientMoney && <TabsTrigger value="monnaie" className="gap-2">
                <Coins className="h-4 w-4" />
                Monnaie
              </TabsTrigger>}
              <TabsTrigger value="operations" className="gap-2">
                <ArrowRightLeft className="h-4 w-4" />
                Opérations
              </TabsTrigger>
            </TabsList>

            {/* Paiements Tab */}
            <TabsContent value="paiements" className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Rechercher par nom, téléphone, référence"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Button variant="outline" onClick={() => refetch()}>
                  <RefreshCcw className="h-4 w-4" />
                </Button>
              </div>

              <div className="border rounded-lg overflow-hidden">
                <Table className="responsive-data-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Client</TableHead>
                      
                      <TableHead>Mensualité</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                        </TableCell>
                      </TableRow>
                    ) : filteredPaiements.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          Aucun paiement trouvé
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredPaiements.map((paiement) => (
                        <TableRow key={paiement.id}>
                          <TableCell className="text-sm">
                            {new Date(paiement.date_paiement || paiement.created_at).toLocaleDateString('fr-FR')}
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium">{paiement.clients?.nom_complet || '-'}</p>
                              <p className="text-xs text-muted-foreground">{paiement.clients?.telephone}</p>
                            </div>
                          </TableCell>
                          <TableCell className="font-bold">
                            {formatMontant(paiement.montant_paye || paiement.montant)}
                          </TableCell>
                          <TableCell>{getStatutClientBadge(paiement.clients?.statut_global)}</TableCell>
                          <TableCell>
                            <div className="flex gap-1 flex-wrap">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setSelectedPaiement(paiement);
                                  setIsDetailsDialogOpen(true);
                                }}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              {canManage && paiement.statut === 'en_attente' && (
                                <Button
                                  variant="default"
                                  size="sm"
                                  className="gap-1"
                                  disabled={kkiapayLoading}
                                  onClick={() => handleKkiapayPayment(paiement)}
                                  title="Payer via KKiaPay"
                                >
                                  {kkiapayLoading && selectedPaiement?.id === paiement.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Smartphone className="h-3 w-3" />
                                  )}
                                  <span className="hidden sm:inline">Payer</span>
                                </Button>
                              )}
                              {canManage && paiement.statut === 'valide' && (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setSelectedPaiement(paiement);
                                      setIsTransferDialogOpen(true);
                                    }}
                                    title="Transférer"
                                  >
                                    <ArrowRightLeft className="h-4 w-4 text-blue-600" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setSelectedPaiement(paiement);
                                      setRefundAmount(String(paiement.montant_paye || paiement.montant));
                                      setIsRefundDialogOpen(true);
                                    }}
                                    title="Rembourser"
                                  >
                                    <ArrowDownLeft className="h-4 w-4 text-red-600" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            {/* Monnaie Tab */}
            {canViewClientMoney && <TabsContent value="monnaie" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Coins className="h-5 w-5 text-amber-600" />
                    Clients avec solde disponible
                  </CardTitle>
                  <CardDescription>
                    Les montants excédentaires payés par les clients peuvent être convertis en jours/mois de mensualité
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Client</TableHead>
                          <TableHead>Téléphone</TableHead>
                          <TableHead>Monnaie client</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {clientsMonnaie.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                              Aucun client avec monnaie disponible
                            </TableCell>
                          </TableRow>
                        ) : (
                          clientsMonnaie.map((sous: any) => (
                            <TableRow key={sous?.id}>
                              <TableCell className="font-medium">{sous?.nom_complet}</TableCell>
                              <TableCell>{sous?.telephone}</TableCell>
                              
                              <TableCell>
                                <Badge className="bg-amber-100 text-amber-800">
                                  {formatMontant(sous?.monnaie || 0)}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {canManage && canViewClientMoney && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      setSelectedClientId(sous?.id);
                                      setIsConvertDialogOpen(true);
                                    }}
                                  >
                                    <Wallet className="h-4 w-4 mr-1" />
                                    Convertir
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>}

            {/* Operations Tab */}
            <TabsContent value="operations" className="space-y-4">
              <div className="grid md:grid-cols-3 gap-4">
                <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => setIsTransferDialogOpen(true)}>
                  <CardContent className="p-6 text-center">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
                      <ArrowRightLeft className="h-8 w-8 text-blue-600" />
                    </div>
                    <h3 className="font-semibold text-lg">Transfert</h3>
                    <p className="text-sm text-muted-foreground mt-2">
                      Transférer un paiement vers un autre compte
                    </p>
                  </CardContent>
                </Card>

                <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => setIsRefundDialogOpen(true)}>
                  <CardContent className="p-6 text-center">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-4">
                      <ArrowDownLeft className="h-8 w-8 text-red-600" />
                    </div>
                    <h3 className="font-semibold text-lg">Remboursement</h3>
                    <p className="text-sm text-muted-foreground mt-2">
                      Effectuer un remboursement partiel ou total
                    </p>
                  </CardContent>
                </Card>

                <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => setIsConvertDialogOpen(true)}>
                  <CardContent className="p-6 text-center">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-amber-100 rounded-full mb-4">
                      <Coins className="h-8 w-8 text-amber-600" />
                    </div>
                    <h3 className="font-semibold text-lg">Conversion monnaie</h3>
                    <p className="text-sm text-muted-foreground mt-2">
                      Convertir la monnaie en jours/mois de mensualité
                    </p>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>

          {/* Details Dialog */}
          <Dialog open={isDetailsDialogOpen} onOpenChange={setIsDetailsDialogOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Détails du paiement</DialogTitle>
              </DialogHeader>
              {selectedPaiement && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Référence</p>
                      <p className="font-mono text-sm">{selectedPaiement.reference}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Statut</p>
                      {getStatutBadge(selectedPaiement.statut)}
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Type</p>
                      <p>{selectedPaiement.type_paiement === 'PI' ? "Paiement Initial" : 'mensualité'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Montant</p>
                      <p className="font-bold text-primary">{formatMontant(selectedPaiement.montant_paye || selectedPaiement.montant)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Client</p>
                      <p>{selectedPaiement.clients?.nom_complet}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Plantation</p>
                      <p>{selectedPaiement.plantations?.nom_plantation || selectedPaiement.plantations?.id_unique}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-sm text-muted-foreground">Date</p>
                      <p>{new Date(selectedPaiement.date_paiement || selectedPaiement.created_at).toLocaleString('fr-FR')}</p>
                    </div>
                  </div>
                  {selectedPaiement.metadata && (
                    <div>
                      <p className="text-sm text-muted-foreground mb-2">Métadonnées</p>
                      <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-32">
                        {JSON.stringify(selectedPaiement.metadata, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </DialogContent>
          </Dialog>

          {/* Transfer Dialog */}
          <Dialog open={isTransferDialogOpen} onOpenChange={(open) => { setIsTransferDialogOpen(open); if (!open) resetForms(); }}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ArrowRightLeft className="h-5 w-5 text-blue-600" />
                  Transférer un paiement
                </DialogTitle>
                <DialogDescription>
                  Transférer un montant d'un compte vers un autre
                </DialogDescription>
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
                <DialogDescription>
                  Sélectionnez le paiement source et le montant à rembourser
                </DialogDescription>
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
                  <p className="text-sm text-yellow-800">
                    Le remboursement sera enregistré. Le paiement effectif doit être fait manuellement.
                  </p>
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

          {/* Convert Monnaie Dialog */}
          <Dialog open={isConvertDialogOpen} onOpenChange={setIsConvertDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Coins className="h-5 w-5 text-amber-600" />
                  Convertir la monnaie
                </DialogTitle>
                <DialogDescription>
                  Convertir le solde excédentaire en jours/mois de mensualité
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                {!selectedClientId && (
                  <div className="space-y-2">
                    <Label>Sélectionner un client</Label>
                    <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choisir un client" />
                      </SelectTrigger>
                      <SelectContent>
                        {clientsMonnaie.map((sous: any) => (
                          <SelectItem key={sous?.id} value={sous?.id}>
                            {sous?.nom_complet} - {formatMontant(sous?.monnaie || 0)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                
                {selectedClientId && (
                  <>
                    <div className="bg-amber-50 p-3 rounded-lg">
                      <p className="text-sm">
                        Monnaie disponible: <strong className="text-amber-800">
                          {formatMontant(clientsMonnaie.find((s: any) => s?.id === selectedClientId)?.monnaie || 0)}
                        </strong>
                      </p>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Période</Label>
                        <Select value={convertPeriod} onValueChange={(v) => setConvertPeriod(v as any)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="jour">Jour (65 F)</SelectItem>
                            <SelectItem value="mois">Mois (1 900 F)</SelectItem>
                            <SelectItem value="trimestre">Trimestre (5 500 F)</SelectItem>
                            <SelectItem value="semestre">Semestre (10 500 F)</SelectItem>
                            <SelectItem value="annee">Année (20 000 F)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Nombre</Label>
                        <Input
                          type="number"
                          min="1"
                          value={convertCount}
                          onChange={(e) => setConvertCount(parseInt(e.target.value) || 1)}
                        />
                      </div>
                    </div>

                    <div className="bg-muted p-3 rounded-lg">
                      <p className="text-sm">
                        Montant à convertir: <strong>
                          {formatMontant({
                            jour: 65,
                            mois: 1900,
                            trimestre: 5500,
                            semestre: 10500,
                            annee: 20000
                          }[convertPeriod] * convertCount)}
                        </strong>
                      </p>
                    </div>
                  </>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setIsConvertDialogOpen(false); setSelectedClientId(''); }}>
                  Annuler
                </Button>
                <Button onClick={handleConvertMonnaie} disabled={loading || !selectedClientId}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Coins className="h-4 w-4 mr-2" />}
                  Convertir
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
