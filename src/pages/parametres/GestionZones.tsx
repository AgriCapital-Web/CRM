import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import SearchableSelect from "@/components/common/SearchableSelect";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useRealtime } from "@/hooks/useRealtime";
import { ROLE_LABELS } from "@/lib/roles";
import { MapPin, Plus, Trash2, Users } from "lucide-react";
import { getSafeErrorMessage } from "@/lib/safeError";
import TableSearchInput from "@/components/common/TableSearchInput";

interface ZoneAssignment {
  id: string;
  user_id: string;
  zone_type: string;
  zone_id: string;
  created_at: string;
  profile?: { nom_complet: string };
  zone_name?: string;
  role?: string;
}

const ZONE_TYPE_LABELS: Record<string, string> = {
  district: "District",
  region: "Région",
  departement: "Département",
  sous_prefecture: "Sous-préfecture",
};

const ROLE_ZONE_MAP: Record<string, string> = {
  responsable_commercial: "region",
  chef_equipe_commercial: "departement",
  chef_equipe_technique: "departement",
  commercial: "sous_prefecture",
  technicien: "sous_prefecture",
};

const GestionZones = () => {
  const { toast } = useToast();
  const [assignments, setAssignments] = useState<ZoneAssignment[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<string>("");
  const [selectedUser, setSelectedUser] = useState<string>("");
  const [selectedZone, setSelectedZone] = useState<string>("");
  const [editingAssignment, setEditingAssignment] = useState<ZoneAssignment | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    try {
      const { data: assignData } = await (supabase as any)
        .from("zone_assignments")
        .select("*")
        .order("created_at", { ascending: false });

      // Fetch profiles and roles for assignable field staff.
      const [{ data: profilesData, error: profilesError }, { data: rolesData, error: rolesError }] = await Promise.all([
        (supabase as any).from("profiles").select("id, user_id, nom_complet, actif").eq("actif", true),
        (supabase as any).from("user_roles").select("user_id, role").in("role", ["responsable_commercial", "chef_equipe_commercial", "chef_equipe_technique", "commercial", "technicien"]),
      ]);
      if (profilesError) throw profilesError;
      if (rolesError) throw rolesError;

      // Fetch all zone names
      const [{ data: districts }, { data: regions }, { data: depts }, { data: sps }] = await Promise.all([
        (supabase as any).from("v_geo_districts").select("id, nom").eq("est_actif_effectif", true),
        (supabase as any).from("v_geo_regions").select("id, nom").eq("est_active_effectif", true),
        (supabase as any).from("v_geo_departements").select("id, nom").eq("est_actif_effectif", true),
        (supabase as any).from("v_geo_sous_prefectures").select("id, nom").eq("est_active_effectif", true),
      ]);

      const zoneMap: Record<string, string> = {};
      [...(districts || []), ...(regions || []), ...(depts || []), ...(sps || [])].forEach((z: any) => {
        zoneMap[z.id] = z.nom;
      });

      const profileMap: Record<string, string> = {};
      (profilesData || []).forEach((p: any) => {
        if (p.user_id) profileMap[p.user_id] = p.nom_complet;
      });

      const roleMap: Record<string, string> = {};
      (rolesData || []).forEach((r: any) => {
        roleMap[r.user_id] = r.role;
      });

      const enriched = (assignData || []).map((a: any) => ({
        ...a,
        zone_name: zoneMap[a.zone_id] || "Inconnu",
        profile: { nom_complet: profileMap[a.user_id] || "Inconnu" },
        role: roleMap[a.user_id] || "",
      }));

      setAssignments(enriched);

      // Build user list with their roles
      const usersWithRoles = (rolesData || [])
        .filter((r: any) => r.user_id && profileMap[r.user_id])
        .map((r: any) => ({
          user_id: r.user_id, role: r.role, nom_complet: profileMap[r.user_id],
        }))
        .filter((item: any, index: number, arr: any[]) =>
          arr.findIndex((x) => x.user_id === item.user_id && x.role === item.role) === index
        );
      setUsers(usersWithRoles);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erreur", description: getSafeErrorMessage(error) });
    } finally {
      setLoading(false);
    }
  };

  useRealtime({ table: "zone_assignments", onChange: fetchAll });

  const fetchZonesForRole = async (role: string) => {
    const zoneType = ROLE_ZONE_MAP[role];
    if (!zoneType) return;

    let data: any[] = [];
    if (zoneType === "region") {
      const res = await (supabase as any).from("v_geo_regions").select("id, nom").eq("est_active_effectif", true).order("nom");
      data = res.data || [];
    } else if (zoneType === "district") {
      const res = await (supabase as any).from("v_geo_districts").select("id, nom").eq("est_actif_effectif", true).order("nom");
      data = res.data || [];
    } else if (zoneType === "departement") {
      const res = await (supabase as any).from("v_geo_departements").select("id, nom").eq("est_actif_effectif", true).order("nom");
      data = res.data || [];
    } else if (zoneType === "sous_prefecture") {
      const res = await (supabase as any).from("v_geo_sous_prefectures").select("id, nom").eq("est_active_effectif", true).order("nom");
      data = res.data || [];
    }
    setZones(data);
  };

  const handleRoleFilter = (role: string) => {
    setSelectedRole(role);
    setSelectedUser("");
    setSelectedZone("");
    fetchZonesForRole(role);
  };

  const handleAssign = async () => {
    if (!selectedUser || !selectedZone || !selectedRole) return;
    const zoneType = ROLE_ZONE_MAP[selectedRole];
    try {
      const payload = { user_id: selectedUser, zone_type: zoneType, zone_id: selectedZone };
      const { error } = editingAssignment
        ? await (supabase as any).from("zone_assignments").update(payload).eq("id", editingAssignment.id)
        : await (supabase as any).from("zone_assignments").insert(payload);
      if (error) throw error;
      toast({ title: "Succès", description: editingAssignment ? "Assignation mise à jour" : "Zone assignée avec succès" });
      setIsFormOpen(false);
      setSelectedUser("");
      setSelectedZone("");
      setEditingAssignment(null);
      fetchAll();
    } catch (error: any) {
      if (error.message?.includes("duplicate")) {
        toast({ variant: "destructive", title: "Erreur", description: "Cette zone est déjà assignée à cet utilisateur" });
      } else {
        toast({ variant: "destructive", title: "Erreur", description: getSafeErrorMessage(error) });
      }
    }
  };

  const handleRemove = async (id: string) => {
    try {
      const { error } = await (supabase as any).from("zone_assignments").delete().eq("id", id);
      if (error) throw error;
      toast({ title: "Succès", description: "Assignation supprimée" });
      fetchAll();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erreur", description: getSafeErrorMessage(error) });
    }
  };

  const filteredUsers = selectedRole ? users.filter(u => u.role === selectedRole) : users;
  const filteredAssignments = assignments.filter(a =>
    (!selectedRole || a.role === selectedRole) &&
    JSON.stringify(a).toLowerCase().includes(search.trim().toLowerCase())
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Assignation des Zones de Couverture
          </CardTitle>
          <CardDescription>
             Responsable de zone → une région • Chef d'équipe → un département • Commercial/technicien → une ou plusieurs sous-préfectures
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <TableSearchInput value={search} onChange={setSearch} placeholder="Rechercher une assignation…" />
            <Select value={selectedRole} onValueChange={handleRoleFilter}>
              <SelectTrigger className="w-full sm:w-[250px]">
                <SelectValue placeholder="Filtrer par rôle" />
              </SelectTrigger>
              <SelectContent>
                 <SelectItem value="responsable_commercial">Responsable Commercial</SelectItem>
                 <SelectItem value="chef_equipe_commercial">Chef d'Équipe Commercial</SelectItem>
                <SelectItem value="commercial">Commercial</SelectItem>
                <SelectItem value="technicien">Technicien</SelectItem>
                 <SelectItem value="chef_equipe_technique">Chef d'Équipe Technique</SelectItem>
              </SelectContent>
            </Select>

            <Dialog open={isFormOpen} onOpenChange={(open) => { setIsFormOpen(open); if (!open) setEditingAssignment(null); }}>
              <DialogTrigger asChild>
                <Button disabled={!selectedRole} onClick={() => setEditingAssignment(null)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Assigner une zone
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingAssignment ? "Modifier l'assignation" : "Assigner une zone"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Utilisateur ({ROLE_LABELS[selectedRole] || selectedRole})</Label>
                    <Select value={selectedUser} onValueChange={setSelectedUser}>
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionner" />
                      </SelectTrigger>
                      <SelectContent>
                        {filteredUsers.map(u => (
                          <SelectItem key={u.user_id} value={u.user_id}>{u.nom_complet}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>{ZONE_TYPE_LABELS[ROLE_ZONE_MAP[selectedRole]] || "Zone"}</Label>
                    <Select value={selectedZone} onValueChange={setSelectedZone}>
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionner" />
                      </SelectTrigger>
                      <SelectContent>
                        {zones.map(z => (
                          <SelectItem key={z.id} value={z.id}>{z.nom}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={handleAssign} disabled={!selectedUser || !selectedZone} className="w-full">
                    {editingAssignment ? "Enregistrer" : "Assigner"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {loading ? (
            <p className="text-center py-8">Chargement...</p>
          ) : (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Utilisateur</TableHead>
                    <TableHead>Rôle</TableHead>
                    <TableHead>Type de zone</TableHead>
                    <TableHead>Zone</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAssignments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        {selectedRole ? "Aucune assignation pour ce rôle" : "Sélectionnez un rôle pour commencer"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredAssignments.map(a => (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium">{a.profile?.nom_complet}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{ROLE_LABELS[a.role || ""] || a.role}</Badge>
                        </TableCell>
                        <TableCell>{ZONE_TYPE_LABELS[a.zone_type]}</TableCell>
                        <TableCell>{a.zone_name}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" onClick={() => {
                            setEditingAssignment(a);
                            setSelectedRole(a.role || "");
                            setSelectedUser(a.user_id);
                            setSelectedZone(a.zone_id);
                            fetchZonesForRole(a.role || "");
                            setIsFormOpen(true);
                          }}>Modifier</Button>
                          <Button variant="ghost" size="icon" onClick={() => handleRemove(a.id)} className="text-destructive hover:text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="mt-4 pt-4 border-t">
            <p className="text-sm text-muted-foreground">
              💡 {assignments.length} assignation(s) au total • {assignments.filter(a => a.role === "responsable_commercial").length} RCom • {assignments.filter(a => a.role === "chef_equipe").length} Chef(s) d'équipe • {assignments.filter(a => a.role === "commercial").length} Commercial(aux)
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default GestionZones;
