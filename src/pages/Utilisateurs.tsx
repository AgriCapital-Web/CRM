import { useState, useEffect } from "react";
import { useResponsivePageSize } from "@/hooks/useResponsivePageSize";
import ResponsiveTablePagination from "@/components/common/ResponsiveTablePagination";
import { formatUserShortName } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useRealtime } from "@/hooks/useRealtime";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Users, Plus, Search, Edit, Shield, MoreHorizontal, UserCheck, UserX, KeyRound, AtSign, Trash2, Eye } from "lucide-react";
import UtilisateurFormNew from "@/components/forms/UtilisateurFormNew";
import { getSafeErrorMessage } from "@/lib/safeError";
import { useAppRoles } from "@/hooks/useReferentiels";

const Utilisateurs = () => {
  const [utilisateurs, setUtilisateurs] = useState<any[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<any[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = useResponsivePageSize();
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [viewUser, setViewUser] = useState<any>(null);
  const [viewPhotoUrl, setViewPhotoUrl] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [adminAction, setAdminAction] = useState<null | "roles" | "password" | "username">(null);
  const [adminTarget, setAdminTarget] = useState<any>(null);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [newPassword, setNewPassword] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const { hasRole } = useAuth();
  const { toast } = useToast();
  const { roles: appRoles } = useAppRoles();
  const isSuperAdmin = hasRole("super_admin");
  const canManageUserCredentials = isSuperAdmin || hasRole("pdg") || hasRole("dg") || hasRole("responsable_operations");

  const fetchUtilisateurs = async () => {
    try {
      const term = search.trim();
      let query = (supabase as any)
        .from("profiles")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1);

      if (term) {
        const safe = term.replace(/[,%()]/g, " ");
        query = query.or(`nom_complet.ilike.%${safe}%,email.ilike.%${safe}%,username.ilike.%${safe}%`);
      }

      const { data: profiles, error: profilesError, count } = await query;
      if (profilesError) throw profilesError;

      const userIds = (profiles || []).map((profile: any) => profile.user_id).filter(Boolean);
      let roles: any[] = [];
      if (userIds.length) {
        const { data: roleData, error: rolesError } = await (supabase as any)
          .from("user_roles")
          .select("*")
          .in("user_id", userIds);
        if (rolesError) throw rolesError;
        roles = roleData || [];
      }

      const profilesWithRoles = (profiles || []).map((profile: any) => ({
        ...profile,
        user_roles: roles.filter((role: any) => role.user_id === profile.user_id),
      }));

      setUtilisateurs(profilesWithRoles);
      setFilteredUsers(profilesWithRoles);
      setTotalUsers(count || 0);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erreur", description: getSafeErrorMessage(error) });
    }
  };

  useEffect(() => {
    void fetchUtilisateurs();
  }, [page, pageSize, search]);

  useEffect(() => {
    setPage(1);
  }, [search, pageSize]);

  useEffect(() => {
    let cancelled = false;
    const loadPhoto = async () => {
      if (!viewUser?.photo_url) { setViewPhotoUrl(""); return; }
      if (/^(https?:|data:)/.test(viewUser.photo_url)) { setViewPhotoUrl(viewUser.photo_url); return; }
      const { data } = await supabase.storage.from("photos-profils").createSignedUrl(viewUser.photo_url, 3600);
      if (!cancelled) setViewPhotoUrl(data?.signedUrl || "");
    };
    void loadPhoto();
    return () => { cancelled = true; };
  }, [viewUser?.photo_url]);

  useRealtime({ table: "profiles", onChange: fetchUtilisateurs });
  useRealtime({ table: "user_roles", onChange: fetchUtilisateurs });

  const getRoles = (user: any) => {
    return user.user_roles?.map((r: any) => r.role) || [];
  };

  const openAdminAction = (user: any, action: "roles" | "password" | "username") => {
    setAdminTarget(user);
    setAdminAction(action);
    setSelectedRoles(getRoles(user));
    setNewPassword("");
    setNewUsername(user.username || "");
  };

  const runAdminAction = async () => {
    if (!adminTarget || !adminAction) return;
    if ((adminAction === "password" || adminAction === "username") && !adminTarget.user_id) {
      toast({ variant: "destructive", title: "Compte de connexion requis", description: "Ce profil doit d'abord être rattaché à son compte Auth." });
      return;
    }
    setBusy(true);
    try {
      if (adminAction === "roles" && !adminTarget.user_id) {
        const tempPassword = crypto.randomUUID().replace(/-/g, "").slice(0, 16) + "Aa!";
        const { data: created, error: createError } = await supabase.functions.invoke("create-user", {
          body: {
            username: adminTarget.username || String(adminTarget.email || "").split("@")[0],
            email: adminTarget.email,
            password: tempPassword,
            nom_complet: adminTarget.nom_complet,
            telephone: adminTarget.telephone || null,
            telephone_indicatif: adminTarget.telephone_indicatif || null,
            telephone_local: adminTarget.telephone_local || null,
            whatsapp: adminTarget.whatsapp || null,
            whatsapp_indicatif: adminTarget.whatsapp_indicatif || null,
            whatsapp_local: adminTarget.whatsapp_local || null,
            departement: adminTarget.departement || null,
            relation_rh: adminTarget.relation_rh || "Employé",
            taux_commission: adminTarget.taux_commission || null,
            district_id: adminTarget.district_id || null,
            region_id: adminTarget.region_id || null,
            equipe_id: adminTarget.equipe_id || null,
            photo_url: adminTarget.photo_url || null,
            roles: selectedRoles,
          },
        });
        if (createError || !created?.success) throw new Error(created?.error || createError?.message || "Création du compte impossible");
        toast({ title: "Compte créé et rôle attribué", description: `Mot de passe temporaire : ${tempPassword}`, duration: 20000 });
        setAdminAction(null);
        setAdminTarget(null);
        fetchUtilisateurs();
        return;
      }

      const body: any = { user_id: adminTarget.user_id };
      if (adminAction === "roles") { body.action = "set_roles"; body.roles = selectedRoles; }
      if (adminAction === "password") { body.action = "set_password"; body.password = newPassword; }
      if (adminAction === "username") { body.action = "set_username"; body.username = newUsername; }

      const { data, error } = await supabase.functions.invoke("admin-manage-user", { body });
      let payload: any = data;
      if (error && typeof (error as any).context?.json === "function") {
        try { payload = await (error as any).context.json(); } catch { /* non JSON */ }
      }
      if (payload?.error || (error && !payload?.success)) {
        throw new Error(`${payload?.error || error?.message} (étape : ${payload?.step || "inconnue"})`);
      }

      toast({
        title: "Modification appliquée",
        description: adminAction === "roles"
          ? `Rôles : ${(payload?.roles || selectedRoles).join(", ")}`
          : adminAction === "password"
            ? "Mot de passe mis à jour."
            : `Identifiant : ${payload?.username || newUsername}`,
      });
      setAdminAction(null);
      setAdminTarget(null);
      fetchUtilisateurs();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erreur", description: getSafeErrorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const handleStatusChange = async (userId: string, newStatus: boolean) => {
    try {
      const { error } = await (supabase as any)
        .from("profiles")
        .update({ actif: newStatus })
        .eq("id", userId);

      if (error) throw error;

      toast({
        title: "Succès",
        description: `Utilisateur ${newStatus ? "activé" : "suspendu"} avec succès`,
      });
      fetchUtilisateurs();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erreur", description: getSafeErrorMessage(error) });
    }
  };

  const isImmutableAdmin = (user: any) =>
    ['innocentkoffi1@gmail.com', 'admin@agricapital.ci'].includes(String(user?.email || '').toLowerCase());

  const deleteUser = async () => {
    if (!deleteTarget) return;
    if (isImmutableAdmin(deleteTarget)) {
      toast({ variant: "destructive", title: "Compte protégé", description: "Ce compte administratif permanent ne peut pas être supprimé." });
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-manage-user", { body: { action: "delete_user", user_id: deleteTarget.user_id || deleteTarget.id } });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      toast({ title: "Utilisateur supprimé définitivement" });
      setDeleteTarget(null);
      fetchUtilisateurs();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Suppression impossible", description: getSafeErrorMessage(e) });
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">Gestion des Utilisateurs</h1>
            <p className="text-muted-foreground">{totalUsers} utilisateur(s)</p>
          </div>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setSelectedUser(null)}>
              <Plus className="h-4 w-4 mr-2" />
              Nouvel Utilisateur
            </Button>
          </DialogTrigger>
          <DialogContent className="w-[calc(100vw-1rem)] max-w-2xl max-h-[92dvh] overflow-y-auto p-4 sm:p-6">
            <DialogHeader>
              <DialogTitle>
                {selectedUser ? "Modifier l'Utilisateur" : "Créer un Utilisateur"}
              </DialogTitle>
            </DialogHeader>
            <UtilisateurFormNew
              utilisateur={selectedUser}
              onSuccess={() => {
                setDialogOpen(false);
                setSelectedUser(null);
                fetchUtilisateurs();
              }}
              onCancel={() => setDialogOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Liste des Utilisateurs</CardTitle>
          <div className="flex items-center gap-2 mt-4">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher par nom ou email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-md"
            />
          </div>
        </CardHeader>
        <CardContent>
          <Table className="responsive-data-table">
            <TableHeader>
              <TableRow>
                <TableHead>Nom Complet</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Identifiant</TableHead>
                <TableHead>Téléphone</TableHead>
                <TableHead>Rôles</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{formatUserShortName(user.nom_complet)}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell className="font-mono text-xs">{user.username || "—"}</TableCell>
                  <TableCell>{user.telephone || "N/A"}</TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      {getRoles(user).map((role: string, idx: number) => (
                        <Badge key={idx} variant="outline" className="text-xs">
                          {appRoles.find((item) => item.code === role)?.nom || role.replace(/_/g, " ")}
                        </Badge>
                      ))}
                      {getRoles(user).length === 0 && (
                        <Badge variant="destructive" className="text-xs">Aucun rôle</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={user.actif ? "bg-green-500" : "bg-red-500"}>
                      {user.actif ? "Actif" : "Inactif"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setViewUser(user)}>
                          <Eye className="h-4 w-4 mr-2" />
                          Voir la fiche
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => {
                          setSelectedUser(user);
                          setDialogOpen(true);
                        }}>
                          <Edit className="h-4 w-4 mr-2" />
                          Modifier
                        </DropdownMenuItem>
                        {canManageUserCredentials && !['8d616fdc-6f25-43e9-baaa-51ead746222e','bd9579fd-1d07-4431-9cc4-b57dfeeab593'].includes(user.user_id || user.id) && (
                          <>
                            <DropdownMenuItem onClick={() => openAdminAction(user, "roles")}>
                              <Shield className="h-4 w-4 mr-2" />
                              Gérer les rôles
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openAdminAction(user, "password")}>
                              <KeyRound className="h-4 w-4 mr-2" />
                              Changer le mot de passe
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openAdminAction(user, "username")}>
                              <AtSign className="h-4 w-4 mr-2" />
                              Changer l'identifiant
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget(user)}>
                              <Trash2 className="h-4 w-4 mr-2" />Supprimer définitivement
                            </DropdownMenuItem>
                          </>
                        )}
                        {!['8d616fdc-6f25-43e9-baaa-51ead746222e','bd9579fd-1d07-4431-9cc4-b57dfeeab593'].includes(user.user_id || user.id) && (
                          user.actif ? (
                            <DropdownMenuItem 
                              onClick={() => handleStatusChange(user.id, false)}
                              className="text-orange-600"
                            >
                              <UserX className="h-4 w-4 mr-2" />
                              Suspendre
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem 
                              onClick={() => handleStatusChange(user.id, true)}
                              className="text-green-600"
                            >
                              <UserCheck className="h-4 w-4 mr-2" />
                              Activer
                            </DropdownMenuItem>
                          )
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <ResponsiveTablePagination page={page} pageSize={pageSize} total={totalUsers} onPageChange={setPage} />
        </CardContent>
      </Card>

      <Dialog open={!!viewUser} onOpenChange={(o) => !o && setViewUser(null)}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-2xl max-h-[90dvh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader><DialogTitle>Fiche utilisateur — {formatUserShortName(viewUser?.nom_complet || "Utilisateur")}</DialogTitle></DialogHeader>
          {viewUser ? (
            <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-6">
              <div className="flex justify-center">
                {viewPhotoUrl ? <img src={viewPhotoUrl} alt={formatUserShortName(viewUser.nom_complet)} className="h-32 w-32 rounded-2xl object-cover border" /> : <div className="h-32 w-32 rounded-2xl border bg-muted flex items-center justify-center text-muted-foreground text-xs text-center">Aucune photo</div>}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Nom</span><p className="font-medium">{formatUserShortName(viewUser.nom_complet || "—")}</p></div>
                <div><span className="text-muted-foreground">Email</span><p className="font-medium break-all">{viewUser.email || "—"}</p></div>
                <div><span className="text-muted-foreground">Téléphone</span><p>{viewUser.telephone || "—"}</p></div>
                <div><span className="text-muted-foreground">Relation RH</span><p>{viewUser.relation_rh || "—"}</p></div>
                <div><span className="text-muted-foreground">Département</span><p>{viewUser.departement || "—"}</p></div>
                <div><span className="text-muted-foreground">Équipe</span><p>{viewUser.equipe_id || "—"}</p></div>
                <div className="sm:col-span-2"><span className="text-muted-foreground">Rôles</span><div className="flex flex-wrap gap-1 mt-1">{getRoles(viewUser).map((role:string)=><Badge key={role} variant="outline">{appRoles.find((item) => item.code === role)?.nom || role}</Badge>)}</div></div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={!!adminAction} onOpenChange={(o) => !o && setAdminAction(null)}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-lg max-h-[90dvh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>
              {adminAction === "roles" && `Rôles de ${formatUserShortName(adminTarget?.nom_complet)}`}
              {adminAction === "password" && `Nouveau mot de passe — ${formatUserShortName(adminTarget?.nom_complet)}`}
              {adminAction === "username" && `Identifiant — ${formatUserShortName(adminTarget?.nom_complet)}`}
            </DialogTitle>
          </DialogHeader>

          {adminAction === "roles" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {appRoles.map((r) => (
                <label key={r.code} className="flex items-center gap-2 text-sm rounded border p-2 cursor-pointer">
                  <Checkbox
                    checked={selectedRoles.includes(r.code)}
                    onCheckedChange={(c) =>
                      setSelectedRoles((prev) => (c ? [...prev, r.code] : prev.filter((x) => x !== r.code)))
                    }
                  />
                  {r.nom}
                </label>
              ))}
            </div>
          )}

          {adminAction === "password" && (
            <div className="space-y-2">
              <Label>Mot de passe (8 caractères minimum)</Label>
              <Input type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </div>
          )}

          {adminAction === "username" && (
            <div className="space-y-2">
              <Label>Identifiant de connexion</Label>
              <Input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} />
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAdminAction(null)}>Annuler</Button>
            <Button onClick={runAdminAction} disabled={busy}>{busy ? "..." : "Enregistrer"}</Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Supprimer définitivement cet utilisateur ?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Le compte Auth, le profil, ses rôles et sa demande de compte seront supprimés. Cette action est irréversible.</p>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setDeleteTarget(null)}>Annuler</Button><Button variant="destructive" onClick={deleteUser} disabled={busy}>Supprimer</Button></div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Utilisateurs;
