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
import { Search, Users, Plus, Edit, MoreHorizontal, CheckCircle, XCircle, UserPlus, UserMinus, Briefcase, Wrench } from "lucide-react";
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
  });

  const fetchData = async () => {
    try {
      const [{ data: equipesData, error }, { data: regionsData }, { data: profilesData }] = await Promise.all([
        (supabase as any).from("equipes").select(`*, responsable:profiles!equipes_responsable_id_fkey(nom_complet, telephone), region:regions(nom)`).order("created_at", { ascending: false }),
        (supabase as any).from("v_geo_regions").select("id,nom").eq("est_active_effectif",true).order("nom"),
        (supabase as any).from("profiles").select("id, nom_complet, user_id, actif").eq("actif", true).order("nom_complet"),
      ]);
      if (error) throw error;
      setEquipes(equipesData || []);
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

    const { data: teamMembers } = await (supabase as any)
      .from("profiles")
      .select("id, nom_complet, telephone, user_id")
      .eq("equipe_id", equipe.id)
      .eq("actif", true);

    const memberIds = (teamMembers || []).map((m:any) => m.user_id).filter(Boolean);
    const { data: memberRoles } = memberIds.length
      ? await (supabase as any).from("user_roles").select("user_id, role").in("user_id", memberIds)
      : { data: [] };

    const memberRoleMap: Record<string,string[]> = {};
    (memberRoles || []).forEach((r:any) => { (memberRoleMap[r.user_id] ||= []).push(r.role); });
    setMembers((teamMembers || []).map((m:any) => ({ ...m, roles: memberRoleMap[m.user_id] || [] })));

    const { data: available } = await (supabase as any)
      .from("profiles")
      .select("id, nom_complet, user_id")
      .eq("actif", true)
      .is("equipe_id", null)
      .not("user_id", "is", null);

    const availableIds = (available || []).map((p:any) => p.user_id).filter(Boolean);
    const { data: availableRoles } = availableIds.length
      ? await (supabase as any).from("user_roles").select("user_id, role").in("user_id", availableIds)
      : { data: [] };

    const availableRoleMap: Record<string,string[]> = {};
    (availableRoles || []).forEach((r:any) => { (availableRoleMap[r.user_id] ||= []).push(r.role); });

    setAvailableMembers(
      (available || [])
        .map((p:any) => ({ ...p, roles: availableRoleMap[p.user_id] || [] }))
        .filter((p:any) => p.roles.includes(targetRole) || p.roles.includes(
          equipe.type_equipe === "technique" ? "chef_equipe_technique" : "chef_equipe_commercial"
        ))
    );
    setIsMembersOpen(true);
  };

  const addMember = async () => {
    if (!selectedMemberId || !membersEquipe) return;
    try {
      const { error } = await (supabase as any).from("profiles").update({ equipe_id: membersEquipe.id }).eq("id", selectedMemberId);
      if (error) throw error;
      toast({ title: "Membre ajouté" });
      setSelectedMemberId("");
      fetchMembers(membersEquipe);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erreur", description: getSafeErrorMessage(error) });
    }
  };

  const removeMember = async (profileId: string) => {
    try {
      const { error } = await (supabase as any).from("profiles").update({ equipe_id: null }).eq("id", profileId);
      if (error) throw error;
      toast({ title: "Membre retiré" });
      if (membersEquipe) fetchMembers(membersEquipe);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erreur", description: getSafeErrorMessage(error) });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (selectedEquipe) {
        const { error } = await (supabase as any).from("equipes").update(formData).eq("id", selectedEquipe.id);
        if (error) throw error;
        toast({ title: "Équipe modifiée" });
      } else {
        const { error } = await (supabase as any).from("equipes").insert([formData]);
        if (error) throw error;
        toast({ title: "Équipe créée" });
      }
      setIsFormOpen(false);
      setSelectedEquipe(null);
      setFormData({ nom: "", responsable_id: "", region_id: "", type_equipe: "commercial", actif: true });
      fetchData();
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
    });
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
            <TableHead>Équipe</TableHead>
            <TableHead>Responsable</TableHead>
            <TableHead className="hidden sm:table-cell">Région</TableHead>
            <TableHead>Statut</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow><TableCell colSpan={5} className="text-center py-8">Chargement...</TableCell></TableRow>
          ) : filteredEquipes.length === 0 ? (
            <TableRow><TableCell colSpan={5} className="text-center py-8">Aucune équipe {activeTab === "technique" ? "technique" : "commerciale"}</TableCell></TableRow>
          ) : (
            paginatedEquipes.map((equipe) => (
              <TableRow key={equipe.id}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    {equipe.type_equipe === "technique" ? <Wrench className="h-4 w-4 text-teal-600" /> : <Briefcase className="h-4 w-4 text-green-600" />}
                    {equipe.nom}
                  </div>
                </TableCell>
                <TableCell>{formatUserShortName(equipe.responsable?.nom_complet || "Non assigné")}</TableCell>
                <TableCell className="hidden sm:table-cell">{equipe.region?.nom || "-"}</TableCell>
                <TableCell>
                  <Badge className={equipe.actif ? "bg-green-500" : "bg-red-500"}>
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
          <p className="text-muted-foreground mt-1">{equipes.length} équipe(s) — {commercialCount} commerciale(s), {techniqueCount} technique(s)</p>
        </div>
        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => {
              setSelectedEquipe(null);
              setFormData({ nom: "", responsable_id: "", region_id: "", type_equipe: activeTab as any, actif: true });
            }}>
              <Plus className="mr-2 h-4 w-4" />
              Nouvelle Équipe
            </Button>
          </DialogTrigger>
          <DialogContent>
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
                <Input value={formData.nom} onChange={(e) => setFormData({ ...formData, nom: e.target.value.toLocaleUpperCase("fr-FR") })} required />
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
