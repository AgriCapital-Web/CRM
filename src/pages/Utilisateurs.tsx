import { useState, useEffect } from "react";
import { useResponsivePageSize } from "@/hooks/useResponsivePageSize";
import ResponsiveTablePagination from "@/components/common/ResponsiveTablePagination";
import { formatUserShortName } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useRealtime } from "@/hooks/useRealtime";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import ContactLauncher from "@/components/common/ContactLauncher";
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
import { Users, Plus, Search, Edit, Shield, MoreHorizontal, UserCheck, UserX, KeyRound, AtSign, Trash2, Eye, EyeOff } from "lucide-react";
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
  const [primaryRole, setPrimaryRole] = useState<string>("");
  const [newPassword, setNewPassword] = useState("");
  const [showAdminPassword, setShowAdminPassword] = useState(false);
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

  // Le rôle affiché est exactement celui marqué principal en base.
  // Les rôles secondaires restent attribués et leurs permissions restent complémentaires.
  const getHighestRole = (user: any) =>
    user.user_roles?.find((r: any) => r.is_primary === true)?.role || null;

  const openAdminAction = (user: any, action: "roles" | "password" | "username") => {
    setAdminTarget(user);
    setAdminAction(action);
    const assignedRoles = getRoles(user);
    setSelectedRoles(assignedRoles);
    setPrimaryRole(user.user_roles?.find((r: any) => r.is_primary)?.role || assignedRoles[0] || "");
    setNewPassword("");
    setShowAdminPassword(false);
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
            primary_role: primaryRole || selectedRoles[0],
          },
        });
        if (createError || !created?.success) throw new Error(created?.error || createError?.message || "Création du compte impossible");
        if (created.user_id && selectedRoles.length) {
          const roleSave = await supabase.functions.invoke("admin-manage-user", { body: { action: "set_roles", user_id: created.user_id, roles: selectedRoles, primary_role: primaryRole || selectedRoles[0] } });
          if (roleSave.error || roleSave.data?.error) throw new Error(roleSave.data?.error || roleSave.error?.message || "Enregistrement du rôle principal impossible");
        }
        toast({ title: "Compte créé et rôle attribué", description: `Mot de passe temporaire : ${tempPassword}`, duration: 20000 });
        setAdminAction(null);
        setAdminTarget(null);
        fetchUtilisateurs();
        return;
      }

      const body: any = { user_id: adminTarget.user_id };
      if (adminAction === "roles") { body.action = "set_roles"; body.roles = selectedRoles; body.primary_role = primaryRole; }
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
            ? "Mot de passe administrateur enregistré. L’utilisateur devra le modifier à sa prochaine connexion."
            : `Identifiant : ${payload?.username || newUsername}`,
      });
      setAdminAction(null);
      setAdminTarget(null);
      fetchUtilisateurs();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erreur", description: adminAction === "password" ? (e?.message || getSafeErrorMessage(e)) : getSafeErrorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const handleStatusChange = async (profileId: string, newStatus: boolean) => {
    try {
      const target = utilisateurs.find((item) => item.id === profileId);
      const authUserId = target?.user_id || target?.id;
      if (!authUserId) throw new Error("Ce profil n'est pas relié à un compte utilisateur.");

      const { data, error } = await supabase.functions.invoke("admin-manage-user", {
        body: { action: "set_active", user_id: authUserId, actif: newStatus },
      });
      let payload: any = data;
      if (error && typeof (error as any).context?.json === "function") {
        try { payload = await (error as any).context.json(); } catch { /* réponse non JSON */ }
      }
      if (error || !payload?.success) {
        throw new Error(payload?.error || error?.message || "La modification du statut n'a pas été confirmée.");
      }

      // Ne jamais afficher « Succès » sans relire la valeur persistée côté serveur.
      if (payload.actif !== newStatus) {
        throw new Error("Le serveur n'a pas confirmé le nouveau statut du compte.");
      }
      toast({
        title: "Succès",
        description: `Utilisateur ${newStatus ? "activé" : "suspendu"} et statut confirmé.`,
      });
      await fetchUtilisateurs();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Modification non confirmée", description: getSafeErrorMessage(error) });
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
    <div className="w-full min-w-0 space-y-4 sm:space-y-5">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <Shield className="h-6 w-6 shrink-0 text-primary sm:h-7 sm:w-7" />
          <div>
            <h1 className="text-lg font-bold leading-tight sm:text-2xl">Gestion des Utilisateurs</h1>
            <p className="text-xs text-muted-foreground sm:text-sm">{totalUsers} utilisateur(s)</p>
          </div>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button
              onClick={() => setSelectedUser(null)}
              className="h-9 w-9 shrink-0 p-0 sm:h-9 sm:w-auto sm:px-3"
              title="Nouvel Utilisateur"
              aria-label="Nouvel Utilisateur"
            >
              <Plus className="h-5 w-5 sm:mr-2" />
              <span className="hidden sm:inline">Nouvel Utilisateur</span>
            </Button>
          </DialogTrigger>
          <DialogContent className="w-[calc(100vw-0.75rem)] max-w-5xl max-h-[96dvh] overflow-y-auto p-3 sm:p-4">
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
          <div className="w-full max-w-full overflow-x-auto">
          <Table className="responsive-data-table">
            <TableHeader>
              <TableRow>
                <TableHead>Nom Complet</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Téléphone</TableHead>
                <TableHead>Rôle principal</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium whitespace-nowrap">{formatUserShortName(user.nom_complet)}</TableCell>
                  <TableCell className="whitespace-nowrap">{user.email || "—"}</TableCell>
                  <TableCell className="whitespace-nowrap"><ContactLauncher phone={user.telephone} email={user.email} name={user.full_name || user.nom_complet || user.email || "Utilisateur"} kind="staff" status={user.statut || user.status || ""}/></TableCell>
                  <TableCell>
                    {getHighestRole(user) ? (
                      <Badge variant="outline" className="whitespace-nowrap text-xs">
                        {appRoles.find((item) => item.code === getHighestRole(user))?.nom || String(getHighestRole(user) ?? "").replace(/_/g, " ")}
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="text-xs">Aucun rôle</Badge>
                    )}
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
          </div>
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
                <div><span className="text-muted-foreground">Téléphone</span><p><ContactLauncher phone={viewUser.telephone} email={viewUser.email} name={viewUser.full_name || viewUser.nom_complet || viewUser.email || "Utilisateur"} kind="staff" status={viewUser.statut || viewUser.status || ""}/></p></div>
                <div><span className="text-muted-foreground">Relation RH</span><p>{viewUser.relation_rh || "—"}</p></div>
                <div><span className="text-muted-foreground">Département</span><p>{viewUser.departement || "—"}</p></div>
                <div><span className="text-muted-foreground">Équipe</span><p>{viewUser.equipe_id || "—"}</p></div>
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
                <div key={r.code} className="rounded border p-2">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox checked={selectedRoles.includes(r.code)} onCheckedChange={(c) => {
                      if (c) { setSelectedRoles((prev) => prev.includes(r.code) ? prev : [...prev, r.code]); if (!primaryRole) setPrimaryRole(r.code); }
                      else { setSelectedRoles((prev) => prev.filter((x) => x !== r.code)); if (primaryRole === r.code) setPrimaryRole(selectedRoles.find((x) => x !== r.code) || ""); }
                    }} />
                    <span>{r.nom}</span>
                  </label>
                  {selectedRoles.includes(r.code) && <label className="mt-2 flex items-center gap-2 border-t pt-2 pl-1 text-xs text-muted-foreground cursor-pointer">
                    <Checkbox checked={primaryRole === r.code} onCheckedChange={(c) => c && setPrimaryRole(r.code)} />
                    <span>Rôle principal</span>
                  </label>}
                </div>
              ))}
            </div>
          )}

          {adminAction === "password" && (
            <div className="space-y-2">
              <Label>Nouveau mot de passe (choix libre)</Label>
              <div className="relative">
                <Input type={showAdminPassword ? "text" : "password"} autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Saisir librement le mot de passe choisi par le PDG" className="pr-11" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
                <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1 h-8 w-8" onClick={() => setShowAdminPassword((visible) => !visible)} aria-label={showAdminPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"} title={showAdminPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}>
                  {showAdminPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Champ libre : aucun contrôle de longueur ni de composition ajouté par le formulaire. L’utilisateur devra le modifier à sa prochaine connexion.</p>
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
