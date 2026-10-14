import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Shield, Users, Plus, Loader2, Pencil, Trash2, ShieldCheck, Database } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { getSafeErrorMessage } from "@/lib/safeError";
import { useAppRoles, useDepartementsEntreprise } from "@/hooks/useReferentiels";
import { useRolePermissionMatrix, usePermissions } from "@/hooks/usePermissions";
import { PERMISSION_CATALOG, PermissionDef } from "@/lib/permissions";
import { ROLES as APP_ROLES, RoleDefinition, roleLabel } from "@/lib/roles";
import { logAdminAction } from "@/lib/audit";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import TableSearchInput from "@/components/common/TableSearchInput";

const emptyRole = {
  code: "",
  nom: "",
  court: "",
  description: "",
  niveau: 5,
  niveau_label: "Opérationnel",
};

const GestionRoles = () => {
  const { toast } = useToast();
  const { can } = usePermissions();
  const { roles, reload: reloadRoles, fromDatabase: rolesFromDb } = useAppRoles();
  const { matrix, reload: reloadMatrix, fromDatabase: matrixFromDb } = useRolePermissionMatrix();
  const { departements } = useDepartementsEntreprise();

  const [profiles, setProfiles] = useState<any[]>([]);
  const [userRoles, setUserRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<string>("");
  const [selectedRole, setSelectedRole] = useState<string>("");

  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [roleDraft, setRoleDraft] = useState<any>(emptyRole);
  const [editingCode, setEditingCode] = useState<string | null>(null);

  const [permDialogRole, setPermDialogRole] = useState<RoleDefinition | null>(null);
  const [permDraft, setPermDraft] = useState<string[]>([]);
  const [customPermissions, setCustomPermissions] = useState<any[]>([]);
  const [permissionDialogOpen, setPermissionDialogOpen] = useState(false);
  const [permissionDraft, setPermissionDraft] = useState({ code: "", module: "", action: "", libelle: "", description: "" });

  const [roleToDelete, setRoleToDelete] = useState<RoleDefinition | null>(null);
  const [userRoleToRemove, setUserRoleToRemove] = useState<any>(null);
  const [tableSearch, setTableSearch] = useState("");
  const [roleTableSearch, setRoleTableSearch] = useState("");
  const canManageRoles = can("roles.manage_permissions") && rolesFromDb && matrixFromDb;
  const permissionGroups = useMemo(() => {
    const all: PermissionDef[] = [...PERMISSION_CATALOG, ...customPermissions.filter((p) => p.actif !== false).map((p) => ({ code: p.code, module: p.module, action: p.action, libelle: p.libelle }))];
    return all.reduce<Record<string, PermissionDef[]>>((acc, permission) => { (acc[permission.module] ||= []).push(permission); return acc; }, {});
  }, [customPermissions]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [{ data: profilesData, error: profilesError }, { data: rolesData, error: rolesError }, { data: permissionData, error: permissionError }] = await Promise.all([
        supabase.from("profiles").select("id, user_id, nom_complet, email, actif, departement").eq("actif", true).order("nom_complet"),
        supabase.from("user_roles").select("*"),
        (supabase as any).from("app_permissions").select("*").eq("actif", true).order("module").order("code"),
      ]);
      if (profilesError) throw profilesError;
      if (rolesError) throw rolesError;
      if (permissionError) throw permissionError;
      setProfiles(profilesData || []);
      setUserRoles(rolesData || []);
      setCustomPermissions(permissionData || []);
    } catch (error: any) {
      console.error("[GestionRoles] chargement impossible", error);
      setProfiles([]); setUserRoles([]);
      toast({ variant: "destructive", title: "Erreur de chargement", description: getSafeErrorMessage(error) });
    } finally { setLoading(false); }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const getUserRoles = (profileId: string) => {
    const profile = profiles.find((p) => p.id === profileId);
    const uid = profile?.user_id;
    return userRoles.filter((ur) => ur.user_id === uid);
  };

  /** Utilisateurs dont le rôle n'appartient pas au catalogue officiel en base */
  const divergences = useMemo(() => {
    const officiels = roles.map((r) => r.code);
    return userRoles
      .filter((ur) => !officiels.includes(ur.role))
      .map((ur) => {
        const profile = profiles.find((p) => p.user_id === ur.user_id);
        return {
          ...ur,
          nom: profile?.nom_complet || profile?.email || ur.user_id,
          suggestion: ur.role,
        };
      });
  }, [userRoles, roles, profiles]);

  const filteredProfiles = useMemo(() => profiles.filter((p) => JSON.stringify(p).toLowerCase().includes(tableSearch.trim().toLowerCase())), [profiles, tableSearch]);
  const filteredUserRoles = useMemo(() => userRoles.filter((r) => JSON.stringify(r).toLowerCase().includes(tableSearch.trim().toLowerCase())), [userRoles, tableSearch]);
  const filteredRoles = useMemo(() => roles.filter((r) => JSON.stringify(r).toLowerCase().includes(roleTableSearch.trim().toLowerCase())), [roles, roleTableSearch]);
  const sansRole = useMemo(
    () => profiles.filter((p) => getUserRoles(p.id).length === 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profiles, userRoles],
  );

  // ---------- Attribution des rôles ----------
  const handleAssignRole = async () => {
    if (!selectedProfile || !selectedRole) {
      toast({ variant: "destructive", title: "Erreur", description: "Sélectionnez un utilisateur et un rôle" });
      return;
    }
    setSaving(true);
    try {
      const profile = profiles.find((p) => p.id === selectedProfile);
      if (!profile) throw new Error("Personnel introuvable");
      if (profile.user_id && userRoles.some((ur) => ur.user_id === profile.user_id && ur.role === selectedRole)) {
        toast({ variant: "destructive", title: "Erreur", description: "Ce rôle est déjà assigné" });
        return;
      }

      let uid = profile.user_id;
      if (!uid) {
        const tempPassword = crypto.randomUUID().replace(/-/g, "").slice(0, 16) + "Aa!";
        const { data: created, error: createError } = await supabase.functions.invoke("create-user", {
          body: {
            username: profile.username || String(profile.email || "").split("@")[0],
            email: profile.email,
            password: tempPassword,
            nom_complet: profile.nom_complet,
            telephone: profile.telephone || null,
            telephone_indicatif: profile.telephone_indicatif || null,
            telephone_local: profile.telephone_local || null,
            whatsapp: profile.whatsapp || null,
            whatsapp_indicatif: profile.whatsapp_indicatif || null,
            whatsapp_local: profile.whatsapp_local || null,
            departement: profile.departement || null,
            relation_rh: profile.relation_rh || "Employé",
            taux_commission: profile.taux_commission || null,
            district_id: profile.district_id || null,
            region_id: profile.region_id || null,
            equipe_id: profile.equipe_id || null,
            photo_url: profile.photo_url || null,
            roles: [selectedRole],
          },
        });
        if (createError || !created?.success) throw new Error(created?.error || createError?.message || "Création du compte impossible");
        uid = created.user_id;
      } else {
        const { error } = await (supabase as any).from("user_roles").insert({ user_id: uid, role: selectedRole });
        if (error) throw error;
      }

      await logAdminAction({
        action: "ATTRIBUTION_ROLE",
        entite: "user_roles",
        cible_user_id: uid,
        cible_libelle: profiles.find((p) => p.id === selectedProfile)?.nom_complet,
        nouvelle_valeur: { role: selectedRole },
      });

      toast({ title: "Succès", description: "Rôle assigné" });
      setAssignDialogOpen(false);
      setSelectedProfile("");
      setSelectedRole("");
      fetchData();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erreur", description: getSafeErrorMessage(error) });
    } finally {
      setSaving(false);
    }
  };

  const confirmRemoveRole = async () => {
    if (!userRoleToRemove) return;
    setSaving(true);
    try {
      const { error } = await (supabase as any).from("user_roles").delete().eq("id", userRoleToRemove.id);
      if (error) throw error;
      await logAdminAction({
        action: "RETRAIT_ROLE",
        entite: "user_roles",
        cible_user_id: userRoleToRemove.user_id,
        ancienne_valeur: { role: userRoleToRemove.role },
      });
      toast({ title: "Succès", description: "Rôle retiré" });
      setUserRoleToRemove(null);
      fetchData();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erreur", description: getSafeErrorMessage(error) });
    } finally {
      setSaving(false);
    }
  };

  // ---------- CRUD des rôles ----------
  const openCreateRole = () => {
    setRoleDraft(emptyRole);
    setEditingCode(null);
    setRoleDialogOpen(true);
  };

  const openEditRole = (role: RoleDefinition) => {
    setRoleDraft({
      code: role.code,
      nom: role.nom,
      court: role.court,
      description: role.description,
      niveau: role.niveau,
      niveau_label: role.niveauLabel,
    });
    setEditingCode(role.code);
    setRoleDialogOpen(true);
  };

  const saveRole = async () => {
    const code = (roleDraft.code || "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
    if (!code || !roleDraft.nom) {
      toast({ variant: "destructive", title: "Champs requis", description: "Code et nom du rôle obligatoires." });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        code,
        nom: roleDraft.nom,
        court: roleDraft.court || roleDraft.nom.slice(0, 6),
        description: roleDraft.description || "",
        niveau: Number(roleDraft.niveau) || 5,
        niveau_label: roleDraft.niveau_label || "Opérationnel",
        actif: true,
      };
      const { error } = editingCode
        ? await (supabase as any).from("app_roles").update(payload).eq("code", editingCode)
        : await (supabase as any).from("app_roles").insert(payload);
      if (error) throw error;

      await logAdminAction({
        action: editingCode ? "MODIFICATION_ROLE" : "CREATION_ROLE",
        entite: "app_roles",
        entite_id: code,
        cible_libelle: payload.nom,
        nouvelle_valeur: payload,
      });

      toast({ title: "Succès", description: editingCode ? "Rôle modifié" : "Rôle créé" });
      setRoleDialogOpen(false);
      reloadRoles();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erreur", description: getSafeErrorMessage(error) });
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteRole = async () => {
    if (!roleToDelete) return;
    setSaving(true);
    try {
      // Désactivation (jamais de suppression définitive)
      const { error } = await (supabase as any).from("app_roles").update({ actif: false }).eq("code", roleToDelete.code);
      if (error) throw error;
      await logAdminAction({
        action: "DESACTIVATION_ROLE",
        entite: "app_roles",
        entite_id: roleToDelete.code,
        cible_libelle: roleToDelete.nom,
      });
      toast({ title: "Succès", description: "Rôle désactivé" });
      setRoleToDelete(null);
      reloadRoles();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erreur", description: getSafeErrorMessage(error) });
    } finally {
      setSaving(false);
    }
  };

  // ---------- Matrice de permissions ----------
  const openPermissions = (role: RoleDefinition) => {
    setPermDialogRole(role);
    setPermDraft(matrix[role.code] || []);
  };

  const togglePerm = (code: string) => {
    setPermDraft((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  };

  const toggleModule = (codes: string[], checked: boolean) => {
    setPermDraft((prev) => (checked ? Array.from(new Set([...prev, ...codes])) : prev.filter((c) => !codes.includes(c))));
  };

  const savePermissionDefinition = async () => {
    const code = permissionDraft.code.trim().toLowerCase();
    const validCode = code.split(".").length === 2 && code.split(".").every((part) => /^[a-z][a-z0-9_]*$/.test(part));
    if (!validCode || !permissionDraft.module.trim() || !permissionDraft.action.trim() || !permissionDraft.libelle.trim()) {
      toast({ variant: "destructive", title: "Informations invalides", description: "Renseignez un code module.action, le module, l’action et le libellé." });
      return;
    }
    setSaving(true);
    try {
      const { error } = await (supabase as any).from("app_permissions").insert({ code, module: permissionDraft.module.trim(), action: permissionDraft.action.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_"), libelle: permissionDraft.libelle.trim(), description: permissionDraft.description.trim(), actif: true });
      if (error) throw error;
      await logAdminAction({ action: "CREATION_PERMISSION", entite: "app_permissions", entite_id: code, cible_libelle: permissionDraft.libelle.trim(), nouvelle_valeur: permissionDraft });
      const { data, error: reloadError } = await (supabase as any).from("app_permissions").select("*").eq("actif", true).order("module").order("code");
      if (reloadError) throw reloadError;
      setCustomPermissions(data || []);
      setPermissionDraft({ code: "", module: "", action: "", libelle: "", description: "" });
      setPermissionDialogOpen(false);
      toast({ title: "Permission créée", description: "Disponible dans la matrice d’attribution des rôles. Les écrans concernés doivent utiliser ce code pour protéger une action." });
    } catch (error: any) { toast({ variant: "destructive", title: "Création impossible", description: getSafeErrorMessage(error) }); }
    finally { setSaving(false); }
  };

  const savePermissions = async () => {
    if (!permDialogRole) return;
    setSaving(true);
    try {
      const ancien = matrix[permDialogRole.code] || [];
      const { error: delError } = await (supabase as any)
        .from("role_permissions")
        .delete()
        .eq("role_code", permDialogRole.code);
      if (delError) throw delError;

      if (permDraft.length > 0) {
        const { error: insError } = await (supabase as any).from("role_permissions").insert(
          permDraft.map((permission_code) => ({ role_code: permDialogRole.code, permission_code })),
        );
        if (insError) throw insError;
      }

      await logAdminAction({
        action: "MODIFICATION_PERMISSIONS_ROLE",
        entite: "role_permissions",
        entite_id: permDialogRole.code,
        cible_libelle: permDialogRole.nom,
        ancienne_valeur: { permissions: ancien },
        nouvelle_valeur: { permissions: permDraft },
      });

      toast({
        title: "Permissions enregistrées",
        description: `${permDraft.length} permission(s) appliquée(s) à ${permDialogRole.nom}.`,
      });
      setPermDialogRole(null);
      await reloadMatrix();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erreur", description: getSafeErrorMessage(error) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {(!rolesFromDb || !matrixFromDb) && !loading && (
        <Card className="border-dashed">
          <CardContent className="flex items-start gap-3 py-4 text-sm text-muted-foreground">
            <Database className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              Le référentiel des rôles et des permissions n'est pas disponible en base. La gestion est désactivée
              jusqu'au rétablissement de <code>app_roles</code> et <code>role_permissions</code>.
            </span>
          </CardContent>
        </Card>
      )}

      {/* Attribution des rôles */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Attribution des Rôles aux Utilisateurs
              </CardTitle>
            </div>
            <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Assigner un rôle
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Assigner un rôle</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Utilisateur</Label>
                    <Select value={selectedProfile} onValueChange={setSelectedProfile}>
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionner un utilisateur" />
                      </SelectTrigger>
                      <SelectContent>
                        {profiles.map((profile) => (
                          <SelectItem key={profile.id} value={profile.id}>
                            {profile.nom_complet || profile.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Rôle officiel</Label>
                    <Select value={selectedRole} onValueChange={setSelectedRole}>
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionner un rôle" />
                      </SelectTrigger>
                      <SelectContent>
                        {roles.map((role) => (
                          <SelectItem key={role.code} value={role.code}>
                            {role.nom}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>
                    Annuler
                  </Button>
                  <Button onClick={handleAssignRole} disabled={saving}>
                    {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Assigner
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border overflow-x-auto">
            <div className="mb-3"><TableSearchInput value={tableSearch} onChange={setTableSearch} placeholder="Rechercher un rôle ou un utilisateur" /></div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Utilisateur</TableHead>
                  <TableHead>Département</TableHead>
                  <TableHead>Rôles assignés</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : profiles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      Aucun utilisateur
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredProfiles.map((profile) => {
                    const profileRoles = getUserRoles(profile.id);
                    return (
                      <TableRow key={profile.id}>
                        <TableCell className="font-medium">
                          {profile.nom_complet || "Non renseigné"}
                          <span className="block text-xs text-muted-foreground">{profile.email}</span>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {profile.departement || "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {profileRoles.length === 0 ? (
                              <span className="text-muted-foreground text-sm">Aucun rôle</span>
                            ) : (
                              profileRoles.map((ur) => (
                                <Badge
                                  key={ur.id}
                                  variant={ur.role === APP_ROLES.PDG ? "destructive" : "secondary"}
                                  className="cursor-pointer hover:opacity-80"
                                  onClick={() => setUserRoleToRemove(ur)}
                                  title="Cliquer pour retirer"
                                >
                                  {roles.find((r) => r.code === ur.role)?.nom || ur.role} ×
                                </Badge>
                              ))
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedProfile(profile.id);
                              setAssignDialogOpen(true);
                            }}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Définition des rôles + matrice */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Définition des Rôles et Permissions
              </CardTitle>
            </div>
            {canManageRoles && (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => setPermissionDialogOpen(true)}><Plus className="h-4 w-4 mr-2" />Nouvelle permission</Button>
                <Button onClick={openCreateRole}><Plus className="h-4 w-4 mr-2" />Nouveau rôle</Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border overflow-x-auto">
            <div className="mb-3"><TableSearchInput value={roleTableSearch} onChange={setRoleTableSearch} placeholder="Rechercher un rôle" /></div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rôle</TableHead>
                  <TableHead>Niveau</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Permissions</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRoles.map((role) => (
                  <TableRow key={role.code}>
                    <TableCell>
                      <Badge className={role.couleur}>{role.nom}</Badge>
                      <span className="block text-xs text-muted-foreground mt-1">{role.code}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {role.niveauLabel} ({role.niveau})
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">{role.description}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {role.code === APP_ROLES.PDG
                          ? `${PERMISSION_CODES.length} (toutes)`
                          : (matrix[role.code] || []).length}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button variant="outline" size="sm" onClick={() => openPermissions(role)}>
                        <ShieldCheck className="h-4 w-4 mr-1" />
                        Permissions
                      </Button>
                      {canManageRoles && (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => openEditRole(role)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {role.code !== APP_ROLES.PDG && (
                            <Button variant="ghost" size="sm" onClick={() => setRoleToDelete(role)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Contrôle de cohérence */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Contrôle de cohérence
          </CardTitle>
          <CardDescription>Divergences entre rôles attribués, référentiel officiel et départements</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{roles.length} rôles officiels</Badge>
            <Badge variant="outline">{new Set(Object.values(matrix).flat()).size} permissions</Badge>
            <Badge variant="outline">{departements.length} départements</Badge>
            <Badge variant={divergences.length ? "destructive" : "secondary"}>
              {divergences.length} rôle(s) obsolète(s)
            </Badge>
            <Badge variant={sansRole.length ? "destructive" : "secondary"}>
              {sansRole.length} utilisateur(s) sans rôle
            </Badge>
          </div>
          {divergences.length > 0 && (
            <ul className="list-disc pl-5 text-muted-foreground">
              {divergences.map((d) => (
                <li key={d.id}>
                  {d.nom} : « {d.role} » → rôle absent du catalogue actif
                </li>
              ))}
            </ul>
          )}
          {sansRole.length > 0 && (
            <p className="text-muted-foreground">
              Sans rôle : {sansRole.map((p) => p.nom_complet || p.email).join(", ")}
            </p>
          )}
        </CardContent>
      </Card>


      <Dialog open={permissionDialogOpen} onOpenChange={setPermissionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Créer une permission</DialogTitle>
            <DialogDescription>Ajoutez un code de permission réutilisable dans la matrice des rôles. Les contrôles applicatifs doivent ensuite utiliser ce code pour protéger une action.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>Code unique (module.action) *</Label><Input value={permissionDraft.code} onChange={(e) => setPermissionDraft({ ...permissionDraft, code: e.target.value })} placeholder="ex. plantations.exporter" /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1"><Label>Module *</Label><Input value={permissionDraft.module} onChange={(e) => setPermissionDraft({ ...permissionDraft, module: e.target.value })} placeholder="Plantations" /></div>
              <div className="space-y-1"><Label>Action *</Label><Input value={permissionDraft.action} onChange={(e) => setPermissionDraft({ ...permissionDraft, action: e.target.value })} placeholder="exporter" /></div>
            </div>
            <div className="space-y-1"><Label>Libellé *</Label><Input value={permissionDraft.libelle} onChange={(e) => setPermissionDraft({ ...permissionDraft, libelle: e.target.value })} placeholder="Exporter les plantations" /></div>
            <div className="space-y-1"><Label>Description</Label><Textarea value={permissionDraft.description} onChange={(e) => setPermissionDraft({ ...permissionDraft, description: e.target.value })} placeholder="Décrivez précisément l’action autorisée." /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setPermissionDialogOpen(false)}>Annuler</Button><Button onClick={savePermissionDefinition} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Créer la permission</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog CRUD rôle */}
      <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCode ? "Modifier le rôle" : "Nouveau rôle"}</DialogTitle>
            
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Code *</Label>
                <Input
                  value={roleDraft.code}
                  disabled={!!editingCode}
                  onChange={(e) => setRoleDraft({ ...roleDraft, code: e.target.value })}
                  placeholder="ex: chef_equipe_commercial"
                />
              </div>
              <div className="space-y-2">
                <Label>Abréviation</Label>
                <Input
                  value={roleDraft.court}
                  onChange={(e) => setRoleDraft({ ...roleDraft, court: e.target.value })}
                  placeholder="ex: CEC"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Nom *</Label>
              <Input value={roleDraft.nom} onChange={(e) => setRoleDraft({ ...roleDraft, nom: e.target.value })} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Niveau</Label>
                <Input
                  type="number"
                  min={1}
                  max={9}
                  value={roleDraft.niveau}
                  onChange={(e) => setRoleDraft({ ...roleDraft, niveau: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Libellé du niveau</Label>
                <Select
                  value={roleDraft.niveau_label}
                  onValueChange={(v) => setRoleDraft({ ...roleDraft, niveau_label: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Direction Suprême">Direction Suprême</SelectItem>
                    <SelectItem value="Direction">Direction</SelectItem>
                    <SelectItem value="Management">Management</SelectItem>
                    <SelectItem value="Encadrement">Encadrement</SelectItem>
                    <SelectItem value="Opérationnel">Opérationnel</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={roleDraft.description}
                onChange={(e) => setRoleDraft({ ...roleDraft, description: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleDialogOpen(false)}>
              Annuler
            </Button>
            <Button onClick={saveRole} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog matrice de permissions */}
      <Dialog open={!!permDialogRole} onOpenChange={(o) => !o && setPermDialogRole(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Permissions — {permDialogRole?.nom}</DialogTitle>
            <DialogDescription>
              Les permissions cochées sont immédiatement appliquées dans toute l'application après enregistrement.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            {Object.entries(permissionGroups).map(([module, perms]) => {
              const codes = perms.map((p) => p.code);
              const allChecked = codes.every((c) => permDraft.includes(c));
              return (
                <div key={module} className="space-y-2 border rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-sm">{module}</h4>
                    <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                      <Checkbox
                        checked={allChecked}
                                                onCheckedChange={(c) => toggleModule(codes, !!c)}
                      />
                      Tout le module
                    </label>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pl-1">
                    {perms.map((permission) => (
                      <div key={permission.code} className="flex items-center space-x-2">
                        <Checkbox
                          id={`${permDialogRole?.code}-${permission.code}`}
                          checked={permDraft.includes(permission.code)}
                                                    onCheckedChange={() => togglePerm(permission.code)}
                        />
                        <label htmlFor={`${permDialogRole?.code}-${permission.code}`} className="text-sm cursor-pointer">
                          {permission.libelle}
                          <span className="block text-[11px] text-muted-foreground">{permission.code}</span>
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPermDialogRole(null)}>
              Fermer
            </Button>
            <Button
              onClick={savePermissions}
              disabled={saving || !canManageRoles}
            >
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Enregistrer les permissions
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!roleToDelete}
        onOpenChange={(o) => !o && setRoleToDelete(null)}
        title="Désactiver ce rôle ?"
        description={`Le rôle « ${roleToDelete?.nom} » sera désactivé (aucune suppression définitive). Les utilisateurs concernés perdront les accès associés.`}
        confirmLabel="Désactiver"
        destructive
        loading={saving}
        onConfirm={confirmDeleteRole}
      />

      <ConfirmDialog
        open={!!userRoleToRemove}
        onOpenChange={(o) => !o && setUserRoleToRemove(null)}
        title="Retirer ce rôle ?"
        description={`Le rôle « ${roleLabel(userRoleToRemove?.role)} » sera retiré à cet utilisateur.`}
        confirmLabel="Retirer"
        destructive
        loading={saving}
        onConfirm={confirmRemoveRole}
      />
    </div>
  );
};

export default GestionRoles;
