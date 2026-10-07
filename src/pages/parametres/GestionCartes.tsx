import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PERMISSIONS, roleLabel } from "@/lib/roles";
import { usePermissions } from "@/hooks/usePermissions";
import { logAdminAction } from "@/lib/audit";
import { uploaderPhotoCarte, CARTE_BUCKET } from "@/lib/photoCarte";
import { CarteRecto, CarteVerso, CONTRATS, STATUTS_AGENT, contratLabel, CarteData, highestRoleCode } from "@/components/cartes/CartePersonnel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, IdCard, Printer, Search, Upload } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import html2canvas from "html2canvas";

type Row = Record<string, any>;

const STATUTS = [
  { v: "en_attente", l: "En attente" },
  { v: "active", l: "Validée / Active" },
  { v: "suspendue", l: "Suspendue" },
  { v: "revoquee", l: "Révoquée" },
];

const GestionCartes = () => {
  const { user } = useAuth();
  const { can } = usePermissions();
  const peutVoir = can("utilisateurs.view");
  const peutModifierPhoto = can("utilisateurs.update");
  const peutGerer = peutVoir;

  const [profiles, setProfiles] = useState<Row[]>([]);
  const [cartes, setCartes] = useState<Row[]>([]);
  const [roles, setRoles] = useState<Record<string, string[]>>({});
  const [roleLevels, setRoleLevels] = useState<Record<string, number>>({});
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Row | null>(null);
  const rectoRef = useRef<HTMLDivElement>(null);
  const versoRef = useRef<HTMLDivElement>(null);
  const [carteTab, setCarteTab] = useState("recto");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, c, r, a] = await Promise.all([
        (supabase as any).from("profiles").select("id, user_id, nom_complet, email, telephone, poste, departement, photo_url, actif").eq("actif", true).order("nom_complet"),
        (supabase as any).from("cartes_personnel").select("*"),
        (supabase as any).from("user_roles").select("user_id, role"),
        (supabase as any).from("app_roles").select("code, niveau"),
      ]);
      const firstError = p.error || c.error || r.error || a.error;
      if (firstError) throw firstError;
      const profileRows = (p.data || []) as Row[];
      const cardRows = (c.data || []) as Row[];
      const roleRows = (r.data || []) as Row[];
      const map: Record<string, string[]> = {};
      roleRows.forEach((x) => { if (x.user_id && x.role) (map[x.user_id] ||= []).push(x.role); });
      setProfiles(profileRows);
      setCartes(cardRows);
      setRoles(map);
      const levels: Record<string, number> = {};
      (a.data || []).forEach((x: any) => { if (x.code) levels[x.code] = Number(x.niveau); });
      setRoleLevels(levels);
    } catch (error: any) {
      console.error("[GestionCartes] chargement impossible", error);
      setProfiles([]); setCartes([]); setRoles({}); setRoleLevels({});
      toast.error(error?.message || "Impossible de charger les utilisateurs et les cartes.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!peutModifierPhoto) return;
    void supabase.functions.invoke("process-card-photo", { body: { mode: "batch" } })
      .then(({ error }) => {
        if (error) console.warn("[GestionCartes] traitement automatique des photos", error);
      });
  }, [peutModifierPhoto]);

  const carteDe = useCallback((profileId: string) => cartes.find((c) => c.profile_id === profileId), [cartes]);

  /** Rôles exclus : comptes non salariés — la carte est réservée aux équipes AgriCapital. */
  const NON_STAFF = ["user", "client", "demo", "proprietaire"];

  const lignes = useMemo(() => {
    const t = q.trim().toLowerCase();
    return profiles
      .filter((p) => {
        const rr = roles[p.user_id] || [];
        const staffRole = rr.find((r:string) => !NON_STAFF.includes(r));
        return !!staffRole;
      })
      .filter((p) => !t || [p.nom_complet, p.email, p.poste].some((v) => (v || "").toLowerCase().includes(t)))

      .map((p, i) => {
        const c = carteDe(p.id);
        return {
          profile: p,
          carte: c,
          data: {
            id: c?.id,
            matricule: c?.matricule || "—",
            code_verification: c?.code_verification || "",
            nom_complet: p.nom_complet,
            poste: c?.poste || p.poste,
            departement: c?.departement || p.departement,
            role_code: highestRoleCode(roles[p.user_id] || [], roleLevels),
            role_codes: roles[p.user_id] || [],
            type_contrat: c?.type_contrat || null,
            statut_agent: c?.statut_agent || null,
            mission: c?.mission || null,
            zone_intervention: c?.zone_intervention || null,
            photo_url: c?.photo_url || p.photo_url || null,
            photo_bucket: c?.photo_url ? CARTE_BUCKET : "photos-profils",
            date_delivrance: c?.date_delivrance || null,
            date_expiration: c?.date_expiration || null,
            statut: c?.statut || null,
            telephone: p.telephone,
            email: p.email,
          } as CarteData,
        };
      });
  }, [profiles, carteDe, q, roles, roleLevels]);

  const nextMatricule = () => {
    const nums = cartes
      .map((c) => Number(String(c.matricule || "").replace(/\D/g, "")))
      .filter((n) => Number.isFinite(n));
    return `AC-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(4, "0")}`;
  };

  const changerPhoto = async (carte: Row, file: File) => {
    try {
      const path = await uploaderPhotoCarte(carte.profile_id, carte.id, file);
      const { error } = await (supabase as any).from("cartes_personnel").update({ photo_url: path, updated_by: user?.id || null }).eq("id", carte.id);
      if (error) throw error;
      await logAdminAction({
        action: "carte_photo_maj",
        entite: "cartes_personnel",
        entite_id: carte.id,
        details: `Photo traitée et enregistrée pour la carte ${carte.matricule}`,
      });
      toast.success("Photo de la carte mise à jour");
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Échec du traitement de la photo");
    }
  };

  const exporter = async (ref: RefObject<HTMLDivElement>, nom: string) => {
    const source = ref.current;
    if (!source) {
      toast.error("La carte n'est pas prête à être exportée.");
      return;
    }
    let exportNode: HTMLDivElement | null = null;
    try {
      if (document.fonts?.ready) await document.fonts.ready;
      await document.fonts?.load("700 25px Arial");
      await document.fonts?.load("400 12px Arial");

      exportNode = source.cloneNode(true) as HTMLDivElement;
      Object.assign(exportNode.style, {
        position: "fixed", left: "-10000px", top: "0",
        width: "540px", height: "856px", margin: "0", padding: "0",
        transform: "none", zoom: "1", display: "block", overflow: "hidden",
        opacity: "1", pointerEvents: "none", zIndex: "-1",
      });
      document.body.appendChild(exportNode);

      const images = Array.from(exportNode.querySelectorAll("img"));
      await Promise.all(images.map(async (img) => {
        if (!img.complete || img.naturalWidth === 0) {
          await new Promise<void>((resolve) => {
            const done = () => {
              img.removeEventListener("load", done);
              img.removeEventListener("error", done);
              resolve();
            };
            img.addEventListener("load", done, { once: true });
            img.addEventListener("error", done, { once: true });
          });
        }
        if (img.decode) await img.decode().catch(() => undefined);
      }));

      const canvas = await html2canvas(exportNode, {
        width: 540, height: 856, scale: 2,
        backgroundColor: "#ffffff", useCORS: true, allowTaint: false,
        logging: false, imageTimeout: 15000, scrollX: 0, scrollY: 0,
        windowWidth: 540, windowHeight: 856, foreignObjectRendering: false,
      });

      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = nom + ".png";
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.success(nom + ".png exporté en 1080 × 1712 px.");
    } catch (e: any) {
      toast.error(e?.message || "Échec de l'export de la carte.");
    } finally {
      exportNode?.remove();
    }
  };

  if (!peutGerer) {
    return <p className="p-6 text-sm text-muted-foreground">Accès réservé à l'administrateur et au responsable des opérations.</p>;
  }

  const carteSelection = selected ? carteDe(selected.id) : null;
  const dataSelection = lignes.find((l) => l.profile.id === selected?.id)?.data;

  if (!peutVoir) return null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><IdCard className="h-5 w-5" />Cartes du personnel</CardTitle>
            <CardDescription>Génération, validation et impression des cartes professionnelles — nouveau format portrait 54 × 85,6 mm, haute résolution 1080 × 1712 px.</CardDescription>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <div className="relative w-full sm:w-48">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="w-full pl-8" placeholder="Rechercher…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Chargement…</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agent</TableHead>
                    <TableHead>Poste / Rôle</TableHead>
                    <TableHead>Matricule</TableHead>
                    <TableHead>Contrat</TableHead>
                    <TableHead>Validité</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lignes.map(({ profile, carte, data }) => (
                    <TableRow key={profile.id}>
                      <TableCell className="font-medium">
                        {profile.nom_complet}
                        <div className="text-xs text-muted-foreground">{profile.email}</div>
                      </TableCell>
                      <TableCell className="text-sm">{data.poste || roleLabel(data.role_code)}</TableCell>
                      <TableCell className="text-sm">{carte ? data.matricule : <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="text-sm">{carte ? contratLabel(data.type_contrat) : "—"}</TableCell>
                      <TableCell className="text-sm">
                        {data.date_expiration ? format(new Date(data.date_expiration), "dd/MM/yyyy", { locale: fr }) : "—"}
                      </TableCell>
                      <TableCell>
                        {!carte ? (
                          <Badge variant="outline">Sans carte</Badge>
                        ) : data.statut === "en_attente" ? (
                          <Badge variant="outline" className="border-accent text-accent">En attente</Badge>
                        ) : data.statut === "active" ? (
                          <Badge className="bg-primary">Validée</Badge>
                        ) : data.statut === "suspendue" ? (
                          <Badge variant="secondary">Suspendue</Badge>
                        ) : (
                          <Badge variant="destructive">Révoquée</Badge>
                        )}
                      </TableCell>
                      <TableCell className="space-x-1 text-right">
                        {carte ? (
                          <Button size="sm" variant="outline" onClick={() => setSelected(profile)}>Voir la carte</Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">Génération automatique</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {lignes.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Aucun utilisateur</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <DialogContent className="max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>Carte de {selected?.nom_complet}</DialogTitle></DialogHeader>
          {dataSelection && (
            <>
            <Tabs value={carteTab} onValueChange={setCarteTab}>
              <TabsList>
                <TabsTrigger value="recto">Recto</TabsTrigger>
                <TabsTrigger value="verso">Verso</TabsTrigger>
                <TabsTrigger value="both">Recto / Verso</TabsTrigger>
              </TabsList>
              <TabsContent value="recto" className="flex justify-center overflow-x-auto py-4">
                <div className="id-card-preview"><CarteRecto ref={rectoRef} carte={dataSelection} /></div>
              </TabsContent>
              <TabsContent value="verso" className="flex justify-center overflow-x-auto py-4">
                <div className="id-card-preview"><CarteVerso ref={versoRef} carte={dataSelection} /></div>
              </TabsContent>
              <TabsContent value="both" className="flex flex-wrap justify-center gap-4 overflow-x-auto py-4">
                <div className="id-card-preview"><CarteRecto ref={rectoRef} carte={dataSelection} /></div>
                <div className="id-card-preview"><CarteVerso ref={versoRef} carte={dataSelection} /></div>
              </TabsContent>
            </Tabs>
            </>
          )}
          <DialogFooter className="flex-wrap gap-2">
            {peutModifierPhoto && <label className="inline-flex">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f && carteSelection) changerPhoto(carteSelection, f);
                }}
              />
              <Button variant="outline" asChild><span><Upload className="mr-1 h-4 w-4" />Photo</span></Button>
            </label>}
            <Button
              variant="outline"
              onClick={async () => {
                if (carteTab !== "recto") {
                  setCarteTab("recto");
                  await new Promise<void>((resolve) => {
                    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
                  });
                }
                await exporter(rectoRef, `carte-recto-${dataSelection?.matricule}`);
              }}
            >
              <Download className="mr-1 h-4 w-4" />Recto
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                if (carteTab !== "verso") {
                  setCarteTab("verso");
                  await new Promise<void>((resolve) => {
                    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
                  });
                }
                await exporter(versoRef, `carte-verso-${dataSelection?.matricule}`);
              }}
            >
              <Download className="mr-1 h-4 w-4" />Verso
            </Button>
            <Button onClick={() => window.print()}><Printer className="mr-1 h-4 w-4" />Imprimer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default GestionCartes;
