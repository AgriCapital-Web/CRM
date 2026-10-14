import { useState, useEffect } from "react";
import { formatUserShortName } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useRealtime } from "@/hooks/useRealtime";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import SearchableSelect from "@/components/common/SearchableSelect";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Search, Users, Plus, Edit, MoreHorizontal, CheckCircle, XCircle, UserPlus, UserMinus, Briefcase, Wrench, ImagePlus, X } from "lucide-react";
import { getSafeErrorMessage } from "@/lib/safeError";
import { useResponsivePageSize } from "@/hooks/useResponsivePageSize";
import ResponsiveTablePagination from "@/components/common/ResponsiveTablePagination";

const ROLE_SHORT: Record<string, string> = {
  commercial: "Commercial",
  technicien: "Technicien",
  chef_equipe: "CE",
  superviseur_tc: "STC",
};

const Equipes = () => {
  const [equipes, setEquipes] = useState<any[]>([]);
  const [regions, setRegions] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isMembersOpen, setIsMembersOpen] = useState(false);
  const [selectedEquipe, setSelectedEquipe] = useState<any>(null);
  const [membersEquipe, setMembersEquipe] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [availableMembers, setAvailableMembers] = useState<any[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState("");
  const [activeTab, setActiveTab] = useState("commercial");
  const [tablePage, setTablePage] = useState(1);
  const pageSize = useResponsivePageSize();
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    nom: "",
    responsable_id: "",
    region_id: "",
    type_equipe: "commercial" as "commercial" | "technique",
    actif: true,
    zone_couverture: "",
    photo_url: "",
  });

  const fetchData = async () => {
    try {
      const [{ data: equipesData, error }, { data: regionsData }, { data: profilesData }, { data: membershipData, error: membershipError }] = await Promise.all([
        (supabase as any).from("equipes").select(`*, responsable:profiles!equipes_responsable_id_fkey(nom_complet, telephone), region:regions(nom)`).order("created_at", { ascending: false }),
        (supabase as any).from("v_geo_regions").select("id,nom").eq("est_active_effectif",true).order("nom"),
        (supabase as any).from("profiles").select("id, nom_complet, user_id, actif").eq("actif", true).order("nom_complet"),
        (supabase as any).from("equipe_membres").select("equipe_id, profile_id, profile:profiles!equipe_membres_profile_id_fkey(actif)"),
      ]);
      if (error) throw error;
      if (membershipError) throw membershipError;
      const memberCounts = new Map<string, Set<string>>();
      (membershipData || []).forEach((m: any) => {
        if (m.profile?.actif === false) return;
        const current = memberCounts.get(m.equipe_id) || new Set<string>();
        current.add(m.profile_id);
        memberCounts.set(m.equipe_id, current);
      });
      setEquipes((equipesData || []).map((team: any) => ({ ...team, effectif: memberCounts.get(team.id)?.size || 0 })));
      setRegions(regionsData || []);
      const baseProfiles = (profilesData || []) as any[];
      const userIds = baseProfiles.map((p: any) => p.user_id).filter(Boolean);
      let rolesRows: any[] = [];
      if (userIds.length) {
        const { data: rr } = await (supabase as any).from("user_roles").select("user_id, role").in("user_id", userIds);
        rolesRows = rr || [];
      }
      const roleMap: Record<string,string[]> = {};
      rolesRows.forEach((r: any) => { (roleMap[r.user_id] ||= []).push(r.role); });
      setProfiles(baseProfiles.map((p: any) => ({ ...p, roles: roleMap[p.user_id] || [] })));
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erreur", description: getSafeErrorMessage(error) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);
  useEffect(() => setTablePage(1), [searchTerm, activeTab, pageSize]);
  useRealtime({ table: "equipes", onChange: fetchData });

  const fetchMembers = async (equipe: any) => {
    setMembersEquipe(equipe);
    const targetRole = equipe.type_equipe === "technique" ? "technicien" : "commercial";

    const { data: membershipRows, error: membershipError } = await (supabase as any)
      .from("equipe_membres")
      .select("profile_id, profile:profiles!equipe_membres_profile_id_fkey(id, nom_complet, telephone, user_id, actif)")
      .eq("equipe_id", equipe.id);
    if (membershipError) throw membershipError;
    const teamMembers = (membershipRows || []).map((row: any) => row.profile).filter((p: any) => p?.actif);

    const memberIds = (teamMembers || []).map((m:any) => m.user_id).filter(Boolean);
    const { data: memberRoles } = memberIds.length
      ? await (supabase as any).from("user_roles").select("user_id, role").in("user_id", memberIds)
      : { data: [] };

    const memberRoleMap: Record<string,string[]> = {};
    (memberRoles || []).forEach((r:any) => { (memberRoleMap[r.user_id] ||= []).push(r.role); });
    setMembers((teamMembers || []).map((m:any) => ({ ...m, roles: memberRoleMap[m.user_id] || [] })));

    const { data: alreadyAssignedRows, error: alreadyAssignedError } = await (supabase as any)
      .from("equipe_membres")
      .select("profile_id")
      .eq("equipe_id", equipe.id);
    if (alreadyAssignedError) throw alreadyAssignedError;
    const alreadyAssigned = new Set((alreadyAssignedRows || []).map((row: any) => row.profile_id));
    const { data: available, error: availableError } = await (supabase as any)
      .from("profiles")
      .select("id, nom_complet, user_id, equipe_id")
      .eq("actif", true)
      .not("user_id", "is", null);
    if (availableError) throw availableError;

    const availableIds = (available || []).map((p:any) => p.user_id).filter(Boolean);
    const { data: availableRoles } = availableIds.length
      ? await (supabase as any).from("user_roles").select("user_id, role").in("user_id", availableIds)
      : { data: [] };

    const availableRoleMap: Record<string,string[]> = {};
    (availableRoles || []).forEach((r:any) => { (availableRoleMap[r.user_id] ||= []).push(r.role); });

    setAvailableMembers(
      (available || [])
        .filter((p: any) => !alreadyAssigned.has(p.id))
        .map((p:any) => ({ ...p, roles: availableRoleMap[p.user_id] || [] }))
        .filter((p:any) => p.roles.some((role: string) => ["pdg", "dg"].includes(role.toLowerCase())) || p.roles.includes(targetRole) || p.roles.includes(
          equipe.type_equipe === "technique" ? "chef_equipe_technique" : "chef_equipe_commercial"
        ))
    );
    setIsMembersOpen(true);
  };

  const addMember = async () => {
    if (!selectedMemberId || !membersEquipe) return;
    try {
      const { error } = await (supabase as any).rpc("assign_profile_to_equipe", {
        p_profile_id: selectedMemberId,
        p_equipe_id: membersEquipe.id,
      });
      if (error) throw error;

      // Vérifier l'état réellement persisté : un retour RPC sans erreur ne suffit pas
      // si la fonction n'a modifié aucune ligne.
      const { data: persistedMembership, error: verifyError } = await (supabase as any)
        .from("equipe_membres")
        .select("profile_id, equipe_id")
        .eq("profile_id", selectedMemberId)
        .eq("equipe_id", membersEquipe.id)
        .maybeSingle();
      if (verifyError) throw verifyError;
      if (!persistedMembership) {
        throw new Error("L'affectation à cette équipe n'est pas confirmée dans la base.");
      }

      toast({ title: "Membre ajouté", description: "L'affectation est confirmée dans la base." });
      setSelectedMemberId("");
      await fetchMembers(membersEquipe);
      await fetchData();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erreur", description: getSafeErrorMessage(error) });
    }
  };

  const removeMember = async (profileId: string) => {
    try {
      if (!membersEquipe) return;
      const { error } = await (supabase as any).rpc("remove_profile_from_equipe", {
        p_profile_id: profileId,
        p_equipe_id: membersEquipe.id,
      });
      if (error) throw error;
      const { data: persistedMembership, error: verifyError } = await (supabase as any)
        .from("equipe_membres")
        .select("profile_id")
        .eq("profile_id", profileId)
        .eq("equipe_id", membersEquipe.id)
        .maybeSingle();
      if (verifyError) throw verifyError;
      if (persistedMembership) {
        throw new Error("Le retrait du membre de cette équipe n'est pas confirmé.");
      }
      toast({ title: "Membre retiré", description: "Le retrait est confirmé dans la base." });
      if (membersEquipe) {
        await fetchMembers(membersEquipe);
        await fetchData();
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erreur", description: getSafeErrorMessage(error) });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        nom: formData.nom.trim(),
        responsable_id: formData.responsable_id || null,
        region_id: formData.region_id || null,
        type_equipe: formData.type_equipe,
        actif: formData.actif,
        zone_couverture: formData.zone_couverture.trim() || null,
        photo_url: formData.photo_url || null,
      };
      let equipeId = selectedEquipe?.id as string | undefined;
      if (selectedEquipe) {
        const { error } = await (supabase as any).from("equipes").update(payload).eq("id", selectedEquipe.id);
        if (error) throw error;
      } else {
        const { data, error } = await (supabase as any).from("equipes").insert([payload]).select("id").single();
        if (error) throw error;
        equipeId = data.id;
      }

      // Le trigger SQL ajoute le responsable comme membre dès l'enregistrement de l'équipe.
      if (logoFile && equipeId) {
        const extension = logoFile.name.split(".").pop()?.toLowerCase() || "png";
        const objectPath = `${equipeId}/${Date.now()}.${extension}`;
        const { error: uploadError } = await supabase.storage.from("photos-equipes").upload(objectPath, logoFile, {
          upsert: true,
          contentType: logoFile.type,
        });
        if (uploadError) throw uploadError;
        const { data: publicData } = supabase.storage.from("photos-equipes").getPublicUrl(objectPath);
        const { error: photoError } = await (supabase as any).from("equipes").update({ photo_url: publicData.publicUrl }).eq("id", equipeId);
        if (photoError) throw photoError;
      }

      toast({ title: selectedEquipe ? "Équipe modifiée" : "Équipe créée", description: formData.responsable_id ? "Le responsable est automatiquement membre de l'équipe." : undefined });
      setIsFormOpen(false);
      setSelectedEquipe(null);
      setLogoFile(null);
      setLogoPreview("");
      setFormData({ nom: "", responsable_id: "", region_id: "", type_equipe: "commercial", actif: true, zone_couverture: "", photo_url: "" });
      await fetchData();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erreur", description: getSafeErrorMessage(error) });
    }
  };

  const handleEdit = (equipe: any) => {
    setSelectedEquipe(equipe);
    setFormData({
      nom: equipe.nom,
      responsable_id: equipe.responsable_id || "",
      region_id: equipe.region_id || "",
      type_equipe: equipe.type_equipe || "commercial",
      actif: equipe.actif ?? true,
      zone_couverture: equipe.zone_couverture || "",
      photo_url: equipe.photo_url || "",
    });
    setLogoFile(null);
    setLogoPreview(equipe.photo_url || "");
    setIsFormOpen(true);
  };

  const handleStatusChange = async (equipeId: string, newStatus: boolean) => {
    try {
      const { error } = await (supabase as any).from("equipes").update({ actif: newStatus }).eq("id", equipeId);
      if (error) throw error;
      toast({ title: `Équipe ${newStatus ? "activée" : "désactivée"}` });
      fetchData();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erreur", description: getSafeErrorMessage(error) });
    }
  };

  const responsablesDisponibles = profiles.filter((p: any) => {
    const roles = (p.roles || []) as string[];
    const isChef = roles.includes("chef_equipe_commercial") || roles.includes("chef_equipe_technique") || roles.includes("chef_equipe");
    const sameTeamRole = formData.type_equipe === "technique" ? roles.includes("chef_equipe_technique") : roles.includes("chef_equipe_commercial");
    return isChef && sameTeamRole;
  });

  const filteredEquipes = equipes.filter((e) => {
    const matchesSearch = e.nom?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.responsable?.nom_complet?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTab = (e.type_equipe || "commercial") === activeTab;
    return matchesSearch && matchesTab;
  });

  const paginatedEquipes = filteredEquipes.slice((tablePage - 1) * pageSize, tablePage * pageSize);

  const commercialCount = equipes.filter(e => (e.type_equipe || "commercial") === "commercial").length;
  const techniqueCount = equipes.filter(e => e.type_equipe === "technique").length;

  const EquipeTable = () => (
    <div className="border rounded-lg overflow-x-auto">
      <Table className="responsive-data-table">
        <TableHeader>
          <TableRow>
            <TableHead>Logo</TableHead>
            <TableHead>Équipe</TableHead>
            <TableHead>Responsable</TableHead>
            <TableHead>Région</TableHead>
            <TableHead>Zone de couverture</TableHead>
            <TableHead>Effectif</TableHead>
            <TableHead>Statut</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow><TableCell colSpan={8} className="text-center py-4">Chargement...</TableCell></TableRow>
          ) : filteredEquipes.length === 0 ? (
            <TableRow><TableCell colSpan={5} className="text-center py-8">Aucune équipe {activeTab === "technique" ? "technique" : "commerciale"}</TableCell></TableRow>
          ) : (
            paginatedEquipes.map((equipe) => (
              <TableRow key={equipe.id} className="h-11">
                <TableCell className="w-14 px-2 py-1">
                  {equipe.photo_url ? <img src={equipe.photo_url} alt={`Logo ${equipe.nom}`} className="h-8 w-8 rounded-md border object-cover" loading="lazy" /> : <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground">{equipe.type_equipe === "technique" ? <Wrench className="h-4 w-4" /> : <Briefcase className="h-4 w-4" />}</div>}
                </TableCell>
                <TableCell className="max-w-[10rem] truncate py-1 font-medium" title={equipe.nom}>{equipe.nom}</TableCell>
                <TableCell className="max-w-[10rem] truncate py-1" title={equipe.responsable?.nom_complet || "Non assigné"}>{formatUserShortName(equipe.responsable?.nom_complet || "Non assigné")}</TableCell>
                <TableCell className="whitespace-nowrap py-1">{equipe.region?.nom || "—"}</TableCell>
                <TableCell className="max-w-[12rem] truncate py-1" title={equipe.zone_couverture || ""}>{equipe.zone_couverture || "—"}</TableCell>
                <TableCell className="py-1 text-center tabular-nums">{equipe.effectif || 0}</TableCell>
                <TableCell className="py-1">
                  <Badge className={`whitespace-nowrap px-1.5 py-0 text-[10px] ${equipe.actif ? "bg-green-500" : "bg-red-500"}`}>
                    {equipe.actif ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm"><MoreHorizontal className="h-4 w-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => fetchMembers(equipe)}>
                        <Users className="h-4 w-4 mr-2" />Gérer les membres
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleEdit(equipe)}>
                        <Edit className="h-4 w-4 mr-2" />Modifier
                      </DropdownMenuItem>
                      {equipe.actif ? (
                        <DropdownMenuItem onClick={() => handleStatusChange(equipe.id, false)} className="text-orange-600">
                          <XCircle className="h-4 w-4 mr-2" />Désactiver
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onClick={() => handleStatusChange(equipe.id, true)} className="text-green-600">
                          <CheckCircle className="h-4 w-4 mr-2" />Activer
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      <ResponsiveTablePagination page={tablePage} pageSize={pageSize} total={filteredEquipes.length} onPageChange={setTablePage} />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Gestion des Équipes</h1>
          
        </div>
        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => {
              setSelectedEquipe(null);
              setFormData({ nom: "", responsable_id: "", region_id: "", type_equipe: activeTab as any, actif: true, zone_couverture: "", photo_url: "" });
              setLogoFile(null);
              setLogoPreview("");
            }}>
              <Plus className="mr-2 h-4 w-4" />
              Nouvelle Équipe
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90dvh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{selectedEquipe ? "Modifier l'équipe" : "Nouvelle équipe"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Type d'équipe</Label>
                <Select value={formData.type_equipe} onValueChange={(v: any) => setFormData({ ...formData, type_equipe: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="commercial"><div className="flex items-center gap-2"><Briefcase className="h-4 w-4 text-green-600" />Commerciale</div></SelectItem>
                    <SelectItem value="technique"><div className="flex items-center gap-2"><Wrench className="h-4 w-4 text-teal-600" />Technique</div></SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Nom de l'équipe</Label>
                <Input value={formData.nom} onChange={(e) => setFormData({ ...formData, nom: e.target.value })} required />
              </div>
              <div>
                <Label>Chef d'équipe</Label>
                <Select value={formData.responsable_id} onValueChange={(v) => setFormData({ ...formData, responsable_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                  <SelectContent>
                    {responsablesDisponibles.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{formatUserShortName(p.nom_complet)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Région</Label>
                <Select value={formData.region_id} onValueChange={(v) => setFormData({ ...formData, region_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                  <SelectContent>
                    {regions.map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.nom}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Zone de couverture</Label>
                <Input value={formData.zone_couverture} onChange={(e) => setFormData({ ...formData, zone_couverture: e.target.value })} placeholder="Ex. Daloa, Gonaté et localités voisines" />
              </div>
              <div className="space-y-2">
                <Label>Logo / photo de l'équipe</Label>
                <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed p-3 transition-colors hover:bg-muted/50">
                  {logoPreview ? <img src={logoPreview} alt="Prévisualisation du logo de l'équipe" className="h-16 w-16 rounded-md border object-cover" /> : <div className="flex h-16 w-16 items-center justify-center rounded-md bg-muted text-muted-foreground"><ImagePlus className="h-6 w-6" /></div>}
                  <div className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">Choisir une image</span>
                    <span className="block text-xs text-muted-foreground">PNG, JPG ou WebP — 5 Mo maximum</span>
                    <input type="file" accept="image/png,image/jpeg,image/webp" className="mt-1 block w-full text-xs file:mr-2 file:rounded file:border-0 file:bg-primary/10 file:px-2 file:py-1" onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
                        toast({ variant: "destructive", title: "Image non valide", description: "Choisissez un fichier PNG, JPG ou WebP de 5 Mo maximum." });
                        e.currentTarget.value = "";
                        return;
                      }
                      setLogoFile(file);
                      setLogoPreview(URL.createObjectURL(file));
                    }} />
                  </div>
                  {logoPreview && <Button type="button" variant="ghost" size="icon" onClick={(event) => { event.preventDefault(); setLogoFile(null); setLogoPreview(""); setFormData({ ...formData, photo_url: "" }); }} aria-label="Retirer le logo"><X className="h-4 w-4" /></Button>}
                </label>
              </div>
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>Annuler</Button>
                <Button type="submit">{selectedEquipe ? "Modifier" : "Créer"}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 bg-primary/10 rounded-lg"><Users className="h-5 w-5 text-primary" /></div>
            <div>
              <div className="text-2xl font-bold">{equipes.length}</div>
              <div className="text-sm text-muted-foreground">Total</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 bg-green-100 rounded-lg"><Briefcase className="h-5 w-5 text-green-600" /></div>
            <div>
              <div className="text-2xl font-bold">{commercialCount}</div>
              <div className="text-sm text-muted-foreground">Commerciales</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 bg-teal-100 rounded-lg"><Wrench className="h-5 w-5 text-teal-600" /></div>
            <div>
              <div className="text-2xl font-bold">{techniqueCount}</div>
              <div className="text-sm text-muted-foreground">Techniques</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 bg-green-100 rounded-lg"><CheckCircle className="h-5 w-5 text-green-600" /></div>
            <div>
              <div className="text-2xl font-bold">{equipes.filter(e => e.actif).length}</div>
              <div className="text-sm text-muted-foreground">Actives</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Rechercher..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="commercial" className="gap-2">
            <Briefcase className="h-4 w-4" />Commerciale ({commercialCount})
          </TabsTrigger>
          <TabsTrigger value="technique" className="gap-2">
            <Wrench className="h-4 w-4" />Technique ({techniqueCount})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="commercial"><EquipeTable /></TabsContent>
        <TabsContent value="technique"><EquipeTable /></TabsContent>
      </Tabs>

      {/* Members Dialog */}
      <Dialog open={isMembersOpen} onOpenChange={setIsMembersOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {membersEquipe?.type_equipe === "technique" ? <Wrench className="h-5 w-5 text-teal-600" /> : <Briefcase className="h-5 w-5 text-green-600" />}
              Membres — {membersEquipe?.nom}
              <Badge variant="outline" className="ml-2 text-xs">{membersEquipe?.type_equipe === "technique" ? "Technique" : "Commerciale"}</Badge>
            </DialogTitle>
          </DialogHeader>
          
          <div className="flex gap-2">
            <Select value={selectedMemberId} onValueChange={setSelectedMemberId}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder={`Ajouter un ${membersEquipe?.type_equipe === "technique" ? "technicien" : "commercial"}...`} />
              </SelectTrigger>
              <SelectContent>
                {availableMembers.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {formatUserShortName(p.nom_complet)} ({p.roles.map((r: string) => ROLE_SHORT[r] || r).join(", ")})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={addMember} disabled={!selectedMemberId} size="sm">
              <UserPlus className="h-4 w-4" />
            </Button>
          </div>

          <div className="space-y-2 max-h-80 overflow-y-auto">
            {members.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Aucun membre dans cette équipe</p>
            ) : (
              members.map((m) => (
                <div key={m.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-medium text-sm">{formatUserShortName(m.nom_complet)}</p>
                    <div className="flex gap-1 mt-1">
                      {m.roles.map((r: string) => (
                        <Badge key={r} variant="secondary" className="text-xs">
                          {ROLE_SHORT[r] || r}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => removeMember(m.id)} className="text-destructive">
                    <UserMinus className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Equipes;
