import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CheckCircle, XCircle, Eye, Trash2 } from "lucide-react";
import { getSafeErrorMessage } from "@/lib/safeError";
import { SignedImg } from "@/hooks/useSignedUrl";
import TableSearchInput from "@/components/common/TableSearchInput";

const AccountRequests = () => {
  const [requests, setRequests] = useState<any[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [actionType, setActionType] = useState<"approve" | "reject" | "delete" | null>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const { hasRole, user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (hasRole('pdg') || hasRole('dg') || hasRole('responsable_operations')) {
      fetchRequests();
    }
  }, [hasRole]);

  const fetchRequests = async () => {
    const { data, error } = await (supabase as any)
      .from('account_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      toast({ variant: "destructive", title: "Erreur", description: getSafeErrorMessage(error) });
      return;
    }

    setRequests(data || []);
  };

  const handleAction = async () => {
    if (!selectedRequest || !user) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('approve-account-request', {
        body: {
          request_id: selectedRequest.id,
          action: actionType,
          motif_rejet: actionType === 'reject' ? rejectReason : undefined,
        },
      });
      const payload: any = data;
      if (error || payload?.error) throw new Error(payload?.error || error?.message);

      if (actionType === 'approve') {
        try {
          await supabase.functions.invoke('send-account-approved-notification', {
            body: {
              email: selectedRequest.email,
              nom_complet: selectedRequest.nom_complet,
              login_url: `${window.location.origin}/login`,
              used_own_password: !payload?.temp_password,
              temp_password: payload?.temp_password || undefined,
            },
          });
        } catch (e) { console.log('notif email fail (non-blocking)', e); }

        toast({
          title: "Demande approuvée",
          description: payload?.temp_password
            ? `Compte créé. Mot de passe temporaire : ${payload.temp_password}`
            : `Accès activé (rôle : ${payload?.role}). L'utilisateur peut se connecter avec son identifiant.`,
          duration: 15000,
        });
      } else if (actionType === 'reject') {
        toast({ title: "Demande rejetée", description: "La demande a été rejetée." });
      } else {
        toast({ title: "Demande supprimée" });
      }

      fetchRequests();
      setDialogOpen(false);
      setRejectReason("");
      setActionType(null);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erreur", description: getSafeErrorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  const filteredRequests = requests.filter((request) =>
    JSON.stringify(request).toLowerCase().includes(search.trim().toLowerCase())
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'en_attente':
        return <Badge variant="outline">En attente</Badge>;
      case 'approuve':
        return <Badge className="bg-green-500">Approuvé</Badge>;
      case 'rejete':
        return <Badge variant="destructive">Rejeté</Badge>;
      default:
        return null;
    }
  };

  if (!(hasRole('pdg') || hasRole('dg') || hasRole('responsable_operations'))) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted-foreground">Accès réservé à la Direction et à la responsabilité des opérations</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-3xl font-bold">Demandes de Création de Compte</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Liste des Demandes</CardTitle>
          <TableSearchInput value={search} onChange={setSearch} placeholder="Rechercher une demande" />
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto"><Table className="min-w-[900px]">
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Nom</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Identifiant</TableHead>
                <TableHead>Poste</TableHead>
                <TableHead>Rôle</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRequests.map((request) => (
                <TableRow key={request.id}>
                  <TableCell>
                    {new Date(request.created_at).toLocaleDateString('fr-FR')}
                  </TableCell>
                  <TableCell>{request.nom_complet}</TableCell>
                  <TableCell>{request.email}</TableCell>
                  <TableCell className="font-mono text-xs">{request.username || '—'}</TableCell>
                  <TableCell>{request.poste_souhaite}</TableCell>
                  <TableCell>{request.role_souhaite}</TableCell>
                  <TableCell>{getStatusBadge(request.statut)}</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedRequest(request);
                          setActionType(null);
                          setDialogOpen(true);
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      {request.statut === 'en_attente' && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedRequest(request);
                              setActionType('approve');
                              setDialogOpen(true);
                            }}
                          >
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedRequest(request);
                              setActionType('reject');
                              setDialogOpen(true);
                            }}
                          >
                            <XCircle className="h-4 w-4 text-red-500" />
                          </Button>
                        </>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedRequest(request);
                          setActionType('delete');
                          setDialogOpen(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table></div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {actionType === 'approve' ? 'Approuver la demande' : 
               actionType === 'reject' ? 'Rejeter la demande' :
               actionType === 'delete' ? 'Supprimer la demande' :
               'Détails de la demande'}
            </DialogTitle>
          </DialogHeader>

          {selectedRequest && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Nom complet</Label>
                  <p className="text-sm">{selectedRequest.nom_complet}</p>
                </div>
                <div>
                  <Label>Email</Label>
                  <p className="text-sm">{selectedRequest.email}</p>
                </div>
                <div>
                  <Label>Téléphone</Label>
                  <p className="text-sm">{selectedRequest.telephone}</p>
                </div>
                <div>
                  <Label>Poste souhaité</Label>
                  <p className="text-sm">{selectedRequest.poste_souhaite}</p>
                </div>
                <div>
                  <Label>Rôle souhaité</Label>
                  <p className="text-sm">{selectedRequest.role_souhaite}</p>
                </div>
                <div>
                  <Label>Identifiant de connexion</Label>
                  <p className="text-sm font-mono">{selectedRequest.username || '—'}</p>
                </div>
                <div>
                  <Label>Département</Label>
                  <p className="text-sm">{selectedRequest.departement || 'N/A'}</p>
                </div>
              </div>

              <div>
                <Label>Justification</Label>
                <p className="text-sm mt-1">{selectedRequest.justification}</p>
              </div>

              {selectedRequest.photo_url && (
                <div>
                  <Label>Photo</Label>
                  <SignedImg
                    bucket={String(selectedRequest.photo_url).startsWith("profiles/") ? "photos-profils" : String(selectedRequest.photo_url).startsWith("pending/") ? "account-request-photos" : "documents"}
                    value={selectedRequest.photo_url}
                    alt="Photo"
                    className="w-32 h-32 object-cover rounded-full mt-2"
                  />
                </div>
              )}

              {actionType === 'approve' && (
                <div className="rounded-lg border bg-muted/30 p-3">
                  <Label>Accès automatique</Label>
                  <p className="mt-1 text-sm">
                    Le rôle sera attribué automatiquement à partir du poste demandé : <span className="font-semibold">{selectedRequest.role_souhaite || "à déterminer"}</span>.
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Le rôle est enregistré dans user_roles au moment de l'activation du compte.
                  </p>
                </div>
              )}

              {actionType === 'delete' && (
                <p className="text-sm text-destructive">
                  Cette demande sera définitivement supprimée (ainsi que le compte non validé associé).
                </p>
              )}

              {actionType === 'reject' && (
                <div>
                  <Label>Motif du rejet *</Label>
                  <Textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    rows={4}
                    placeholder="Expliquez pourquoi la demande est rejetée"
                  />
                </div>
              )}

              {actionType && (
                <div className="flex gap-4 justify-end">
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>
                    Annuler
                  </Button>
                  <Button
                    onClick={handleAction}
                    disabled={busy || (actionType === 'reject' && !rejectReason)}
                    variant={actionType === 'approve' ? 'default' : 'destructive'}
                  >
                    {busy ? 'Traitement' : actionType === 'approve' ? 'Approuver' : actionType === 'reject' ? 'Rejeter' : 'Supprimer'}
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AccountRequests;
