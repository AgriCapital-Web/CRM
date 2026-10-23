import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import MainLayout from "@/components/layout/MainLayout";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { PERMISSIONS } from "@/lib/roles";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Plus, MapPin, Layers, Ruler, Upload } from "lucide-react";
import GeographieCascade from "@/components/common/GeographieCascade";
import { offlineInsert, offlineUpdate } from "@/lib/offlineWrite";
import { getSafeErrorMessage } from "@/lib/safeError";
import { uploadFile, resolveStorageUrl } from "@/utils/storage";
import FileUploadVisual from "@/components/ui/file-upload-visual";

const ProprietaireTerreDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { can } = usePermissions();
  const { userRoles = [] } = useAuth();
  const canEditOwner = can("proprietaires.update");
  const canValidateOwner = can("proprietaires.validate") || ["pdg", "service_client", "chef_equipe_service_client"].some((role) => userRoles.includes(role));
  const canCreateOwnerDocs = can("documents.upload") || can("proprietaires.create") || canEditOwner;
  const canEditOwnerDocs = can("documents.upload") || canEditOwner;
  const [validationBusy, setValidationBusy] = useState(false);
  const [validationNotes, setValidationNotes] = useState("");
  const [owner, setOwner] = useState<any>(null);
  const [parcelles, setParcelles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ownerDocuments,setOwnerDocuments]=useState<any[]>([]);
  const [ownerEditing,setOwnerEditing]=useState(false);
  const [ownerSaving,setOwnerSaving]=useState(false);
  const [ownerEditForm,setOwnerEditForm]=useState<any>({});
  const [ownerPhotoFile,setOwnerPhotoFile]=useState<File|null>(null);
  const [ownerRectoFile,setOwnerRectoFile]=useState<File|null>(null);
  const [ownerVersoFile,setOwnerVersoFile]=useState<File|null>(null);
  const [ownerPhotoPreview,setOwnerPhotoPreview]=useState<string|null>(null);
  const [ownerRectoPreview,setOwnerRectoPreview]=useState<string|null>(null);
  const [ownerVersoPreview,setOwnerVersoPreview]=useState<string|null>(null);
  const [ownerDocumentFile,setOwnerDocumentFile]=useState<File|null>(null);
  const [ownerDocumentLabel,setOwnerDocumentLabel]=useState("");
  const [replacingDocumentId,setReplacingDocumentId]=useState<string|null>(null);
  const [form, setForm] = useState({
    nom: "", surface_totale_ha: "", district_id: "", region_id: "", departement_id: "",
    sous_prefecture_id: "", village: "", date_convention: "", notes: "",
  });

  const uploadOwnerDocument=async()=>{if(!canCreateOwnerDocs){toast({variant:"destructive",title:"Accès refusé",description:"Votre rôle ne permet pas de téléverser des documents fonciers."});return;}if(!id||!ownerDocumentFile)return;try{const uploaded=await uploadFile("documents-fonciers",ownerDocumentFile,`proprietaires/${id}/${Date.now()}-${ownerDocumentFile.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`);if(!uploaded)throw new Error("Téléversement impossible");const {error}=await (supabase as any).from("documents_convention").insert({proprietaire_id:id,type_document:"annexe_libre",designation:ownerDocumentLabel.trim()||ownerDocumentFile.name,statut:"en_attente",fichier_url:uploaded.url,notes:null,uploaded_by:null});if(error)throw error;toast({title:"Document foncier ajouté"});setOwnerDocumentFile(null);setOwnerDocumentLabel("");await load();}catch(e:any){toast({variant:"destructive",title:"Téléversement impossible",description:getSafeErrorMessage(e)});}};

  const replaceOwnerDocument = async (doc: any, file: File) => {
    if (!can("documents.upload")) {
      toast({ variant: "destructive", title: "Accès refusé", description: "Votre rôle ne permet pas de remplacer les documents fonciers." });
      return;
    }
    if (!id || !doc?.id || !file || replacingDocumentId) return;
    setReplacingDocumentId(doc.id);
    try {
      const uploaded = await uploadFile("documents-fonciers", file, `proprietaires/${id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`);
      if (!uploaded?.path) throw new Error("Le nouveau document n’a pas été téléversé.");
      const { error } = await (supabase as any).from("documents_convention").update({
        fichier_url: uploaded.path,
        designation: doc.designation || file.name,
        updated_at: new Date().toISOString(),
      }).eq("id", doc.id).eq("proprietaire_id", id);
      if (error) throw error;
      toast({ title: "Document foncier remplacé" });
      await load();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Remplacement impossible", description: getSafeErrorMessage(e) });
    } finally {
      setReplacingDocumentId(null);
    }
  };

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [ownerRes, parcelRes, docRes] = await Promise.all([
        (supabase as any).from("proprietaires_terres").select("*").eq("id", id).maybeSingle(),
        (supabase as any).from("parcelles")
          .select("*, districts(nom), regions(nom), departements(nom), sous_prefectures(nom)")
          .eq("proprietaire_id", id)
          .order("created_at", { ascending: true }),
        (supabase as any).from("documents_convention").select("*").eq("proprietaire_id",id).order("created_at",{ascending:true}),
      ]);
      if (ownerRes.error) throw ownerRes.error;
      if (parcelRes.error) throw parcelRes.error;
      setOwner(ownerRes.data);
      setOwnerEditForm({ ...(ownerRes.data || {}) });
      const resolveOwnerMedia = async (value:string|null|undefined, bucket:string) =>
        await resolveStorageUrl(bucket, value || null) ||
        await resolveStorageUrl("documents-fonciers", value || null) ||
        await resolveStorageUrl("documents", value || null);
      const [photoPreview, rectoPreview, versoPreview] = await Promise.all([
        resolveOwnerMedia(ownerRes.data?.photo_profil_url, "photos-profils"),
        resolveOwnerMedia(ownerRes.data?.fichier_piece_recto_url, "pieces-identite"),
        resolveOwnerMedia(ownerRes.data?.fichier_piece_verso_url, "pieces-identite"),
      ]);
      setOwnerPhotoPreview(photoPreview);
      setOwnerRectoPreview(rectoPreview);
      setOwnerVersoPreview(versoPreview);
      setParcelles(parcelRes.data || []);
      const docsWithUrls = await Promise.all((docRes.data || []).map(async (doc:any) => ({
        ...doc,
        displayUrl: await resolveStorageUrl("documents-fonciers", doc.fichier_url) || await resolveStorageUrl("documents", doc.fichier_url) || doc.fichier_url || null,
      })));
      setOwnerDocuments(docsWithUrls);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erreur", description: getSafeErrorMessage(e) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [id]);

  const totals = useMemo(() => ({
    count: parcelles.length,
    total: parcelles.reduce((s, p) => s + Number(p.surface_totale_ha || 0), 0),
    available: parcelles.reduce((s, p) => {
      const ac = Number(p.surface_agricapital_ha ?? p.surface_totale_ha ?? 0);
      const used = Number(p.surface_attribuee_ha || 0);
      return s + Math.max(0, ac - used);
    }, 0),
  }), [parcelles]);

  const decideOwnerValidation = async (decision: "valide" | "refuse") => {
    if (!id || !owner || !canValidateOwner || validationBusy || owner.validation_statut !== "a_valider") return;
    setValidationBusy(true);
    try {
      const { data, error } = await (supabase as any).rpc("validate_proprietaire_foncier", {
        _proprietaire_id: id,
        _decision: decision,
        _notes: validationNotes.trim() || null,
      });
      if (error) throw error;
      if (!data?.proprietaire_id) throw new Error("La base n’a pas confirmé la validation du dossier.");
      toast({
        title: decision === "valide" ? "Dossier foncier validé" : "Dossier foncier refusé",
        description: decision === "valide"
          ? "Le propriétaire, ses parcelles et sa convention ont été traités."
          : "Le refus et son motif éventuel ont été enregistrés.",
      });
      setValidationNotes("");
      await load();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Validation impossible", description: getSafeErrorMessage(error) });
    } finally {
      setValidationBusy(false);
    }
  };

  const saveOwner = async () => {
    if (!id || !owner || !canEditOwner || ownerSaving) return;
    setOwnerSaving(true);
    try {
      const payload: any = {
        nom_complet: ownerEditForm.type_proprietaire === "personne_morale"
          ? (ownerEditForm.denomination_sociale || ownerEditForm.nom_complet || null)
          : ownerEditForm.type_proprietaire === "famille_groupement"
            ? (ownerEditForm.nom_representant || ownerEditForm.nom_complet || null)
            : ([ownerEditForm.nom, ownerEditForm.prenoms].filter(Boolean).join(" ").trim() || ownerEditForm.nom_complet || null),
        nom: ownerEditForm.nom || ownerEditForm.nom_complet || null,
        prenoms: ownerEditForm.prenoms || null,
        telephone: ownerEditForm.telephone || null,
        whatsapp: ownerEditForm.whatsapp || null,
        email: ownerEditForm.email || null,
        lieu_residence: ownerEditForm.lieu_residence || null,
        type_piece: ownerEditForm.type_piece || null,
        numero_piece: ownerEditForm.numero_piece || null,
        date_delivrance_piece: ownerEditForm.date_delivrance_piece || null,
        date_naissance: ownerEditForm.date_naissance || null,
        lieu_naissance: ownerEditForm.lieu_naissance || null,
        statut_foncier: ownerEditForm.statut_foncier || null,
        reference_cadastrale: ownerEditForm.reference_cadastrale || null,
        notes: ownerEditForm.notes || null,
        updated_by: (await supabase.auth.getUser()).data.user?.id || null,
      };
      if (ownerPhotoFile) {
        const file = await uploadFile("photos-profils", ownerPhotoFile, "proprietaires/" + id + "/profil");
        if (!file?.path) throw new Error("La photo du propriétaire n'a pas pu être enregistrée.");
        payload.photo_profil_url = file.path;
      }
      if (ownerRectoFile) {
        const file = await uploadFile("pieces-identite", ownerRectoFile, "proprietaires/" + id + "/pieces");
        if (!file?.path) throw new Error("Le recto de la pièce n'a pas pu être enregistré.");
        payload.fichier_piece_recto_url = file.path;
      }
      if (ownerVersoFile) {
        const file = await uploadFile("pieces-identite", ownerVersoFile, "proprietaires/" + id + "/pieces");
        if (!file?.path) throw new Error("Le verso de la pièce n'a pas pu être enregistré.");
        payload.fichier_piece_verso_url = file.path;
      }
      const { error } = await offlineUpdate("proprietaires_terres", id, payload);
      if (error) throw error;
      toast({ title: "Propriétaire mis à jour", description: "Les informations et les fichiers sélectionnés ont été enregistrés." });
      setOwnerEditing(false);
      setOwnerPhotoFile(null); setOwnerRectoFile(null); setOwnerVersoFile(null);
      await load();
    } catch (error:any) {
      toast({ variant: "destructive", title: "Modification impossible", description: getSafeErrorMessage(error) });
    } finally {
      setOwnerSaving(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!can("parcelles.create")) { toast({ variant: "destructive", title: "Accès refusé", description: "Votre rôle ne permet pas de créer une parcelle." }); return; }
    if (!id) return;
    const surface = Number(form.surface_totale_ha);
    if (!Number.isFinite(surface) || surface < 2) {
      toast({ variant: "destructive", title: "Surface invalide", description: "La surface doit être d’au moins 2 hectares." });
      return;
    }
    setSaving(true);
    try {
      const { error } = await offlineInsert("parcelles", {
        proprietaire_id: id,
        nom: form.nom || `Parcelle — ${owner?.nom_complet || "Propriétaire"}`,
        surface_totale_ha: surface,
        surface_proprietaire_ha: surface / 2,
        surface_agricapital_ha: surface / 2,
        surface_attribuee_ha: 0,
        surface_disponible_ha: surface / 2,
        district_id: form.district_id || null,
        region_id: form.region_id || null,
        departement_id: form.departement_id || null,
        sous_prefecture_id: form.sous_prefecture_id || null,
        village: form.village || null,
        date_convention: form.date_convention || null,
        notes: form.notes || null,
        statut: "disponible",
      });
      if (error) throw error;
      toast({ title: "Parcelle enregistrée" });
      setOpen(false);
      setForm({ nom: "", surface_totale_ha: "", district_id: "", region_id: "", departement_id: "", sous_prefecture_id: "", village: "", date_convention: "", notes: "" });
      await load();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Enregistrement impossible", description: getSafeErrorMessage(e) });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <ProtectedRoute requiredPermission={PERMISSIONS.VIEW_PROPRIETAIRES}><MainLayout><div className="py-20 text-center">Chargement…</div></MainLayout></ProtectedRoute>;
  if (!owner) return <ProtectedRoute requiredPermission={PERMISSIONS.VIEW_PROPRIETAIRES}><MainLayout><Card><CardContent className="py-10 text-center">Propriétaire introuvable.</CardContent></Card></MainLayout></ProtectedRoute>;

  return (
    <ProtectedRoute requiredPermission={PERMISSIONS.VIEW_PROPRIETAIRES}>
      <MainLayout>
        <div className="min-w-0 space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => navigate("/proprietaires-terres")}><ArrowLeft className="mr-2 h-4 w-4" />Retour</Button>
              <div>
                <h1 className="text-2xl font-bold">{owner.nom_complet}</h1>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{owner.statut === "actif" ? "Actif" : owner.statut}</Badge>
              <Badge variant={owner.validation_statut === "valide" ? "default" : owner.validation_statut === "refuse" ? "destructive" : "outline"}>
                {owner.validation_statut === "valide" ? "Dossier validé" : owner.validation_statut === "refuse" ? "Dossier refusé" : "À valider"}
              </Badge>
            </div>
          </div>

          {canValidateOwner && owner.validation_statut === "a_valider" && <Card>
            <CardHeader><CardTitle>Validation du dossier foncier</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">Vérifiez les informations, la parcelle et les pièces jointes avant de valider. La validation active la convention et rend les parcelles soumises disponibles dans le suivi foncier.</p>
              <div className="space-y-1">
                <Label htmlFor="owner-validation-notes">Commentaire de validation ou motif de refus</Label>
                <Textarea id="owner-validation-notes" value={validationNotes} onChange={e => setValidationNotes(e.target.value)} rows={3} placeholder="Observations facultatives…" />
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="destructive" onClick={() => void decideOwnerValidation("refuse")} disabled={validationBusy}>
                  {validationBusy ? "Traitement…" : "Refuser le dossier"}
                </Button>
                <Button type="button" onClick={() => void decideOwnerValidation("valide")} disabled={validationBusy}>
                  {validationBusy ? "Traitement…" : "Valider le dossier"}
                </Button>
              </div>
            </CardContent>
          </Card>}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Parcelles</p><p className="mt-1 text-2xl font-bold">{totals.count}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Surface totale</p><p className="mt-1 text-2xl font-bold">{Math.round(totals.total).toLocaleString("fr-FR")} ha</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Surface disponible</p><p className="mt-1 text-2xl font-bold">{Math.round(totals.available).toLocaleString("fr-FR")} ha</p></CardContent></Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center justify-between gap-3">
                <span>Fiche du propriétaire foncier</span>
                {canEditOwner && <div className="flex gap-2">
                  {ownerEditing ? <>
                    <Button type="button" variant="outline" size="sm" onClick={()=>{setOwnerEditForm({...owner});setOwnerPhotoFile(null);setOwnerRectoFile(null);setOwnerVersoFile(null);setOwnerEditing(false);}}>Annuler</Button>
                    <Button type="button" size="sm" onClick={()=>void saveOwner()} disabled={ownerSaving}>{ownerSaving?"Enregistrement…":"Enregistrer"}</Button>
                  </> : <Button type="button" size="sm" variant="outline" onClick={()=>setOwnerEditing(true)}>Modifier</Button>}
                </div>}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  ["Nom", "nom"], ["Prénoms", "prenoms"], ["Téléphone", "telephone"],
                  ["WhatsApp", "whatsapp"], ["Email", "email"], ["Lieu de résidence", "lieu_residence"],
                  ["Type de pièce", "type_piece"], ["Numéro de pièce", "numero_piece"],
                  ["Date de naissance", "date_naissance"], ["Lieu de naissance", "lieu_naissance"],
                  ["Statut foncier", "statut_foncier"], ["Référence cadastrale", "reference_cadastrale"],
                ].map(([label,key])=><div key={key} className="min-w-0 space-y-1">
                  <Label className="text-xs">{label}</Label>
                  {ownerEditing ? <Input type={key==="date_naissance"?"date":"text"} value={ownerEditForm[key]||""} onChange={e=>setOwnerEditForm((current:any)=>({...current,[key]:e.target.value}))}/> : <p className="min-h-9 break-words rounded-md border bg-muted/20 px-3 py-2 text-sm">{owner?.[key]||"—"}</p>}
                </div>)}
                <div className="sm:col-span-2 lg:col-span-3 space-y-1">
                  <Label className="text-xs">Notes</Label>
                  {ownerEditing ? <Textarea rows={3} value={ownerEditForm.notes||""} onChange={e=>setOwnerEditForm((current:any)=>({...current,notes:e.target.value}))}/> : <p className="min-h-9 whitespace-pre-wrap rounded-md border bg-muted/20 px-3 py-2 text-sm">{owner?.notes||"—"}</p>}
                </div>
              </div>
              {!ownerEditing && <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {[
                  ["Photo du propriétaire",ownerPhotoPreview],
                  ["Pièce d'identité — recto",ownerRectoPreview],
                  ["Pièce d'identité — verso",ownerVersoPreview],
                ].map(([label,src]:any)=><div key={label} className="min-w-0 space-y-2 rounded-lg border p-3">
                  <p className="text-xs font-medium">{label}</p>
                  {src ? (String(label).includes("Photo") || /\.(?:jpe?g|png|webp|gif)(?:[?#]|$)/i.test(String(src)) ? <a href={src} target="_blank" rel="noreferrer"><img src={src} alt={label} className="h-36 w-full rounded-md object-contain bg-muted/20"/></a> : <a href={src} target="_blank" rel="noreferrer" className="flex h-36 items-center justify-center rounded-md bg-muted/20 text-sm font-medium text-primary underline">Ouvrir le document enregistré</a>) : <div className="flex h-36 items-center justify-center rounded-md bg-muted/30 text-xs text-muted-foreground">Aucun fichier enregistré</div>}
                </div>)}
              </div>}
              {ownerEditing && <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <FileUploadVisual label="Remplacer la photo" field="owner-photo" accept="image/*" currentFile={ownerPhotoFile} currentPreview="" existingPreview={ownerPhotoPreview||""} onFileChange={(_,file)=>setOwnerPhotoFile(file)}/>
                <FileUploadVisual label="Remplacer le recto" field="owner-recto" accept="image/*,.pdf" currentFile={ownerRectoFile} currentPreview="" existingPreview={ownerRectoPreview||""} onFileChange={(_,file)=>setOwnerRectoFile(file)}/>
                <FileUploadVisual label="Remplacer le verso" field="owner-verso" accept="image/*,.pdf" currentFile={ownerVersoFile} currentPreview="" existingPreview={ownerVersoPreview||""} onFileChange={(_,file)=>setOwnerVersoFile(file)}/>
              </div>}
            </CardContent>
          </Card>

          <Card><CardHeader><CardTitle className="flex items-center justify-between gap-3"><span>Documents fonciers</span>{canCreateOwnerDocs&&<div className="inline-flex"><input id="owner-document-upload" type="file" className="sr-only" accept=".pdf,image/*,.doc,.docx,.xls,.xlsx,.ppt,.pptx" onChange={e=>{e.stopPropagation();setOwnerDocumentFile(e.currentTarget.files?.[0]||null);e.currentTarget.value="";}}/><Button type="button" variant="outline" size="sm" onClick={(e)=>{e.preventDefault();e.stopPropagation();document.getElementById("owner-document-upload")?.click();}}><Upload className="mr-2 h-4 w-4"/>Ajouter</Button></div>}</CardTitle></CardHeader><CardContent>{canCreateOwnerDocs&&<div className="mb-3 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2"><Input placeholder="Libellé du document (convention, annexe…)" value={ownerDocumentLabel} onChange={e=>setOwnerDocumentLabel(e.target.value)}/>{ownerDocumentFile&&<Button onClick={()=>void uploadOwnerDocument()}>Enregistrer</Button>}</div>}<div className="space-y-2">{ownerDocuments.length?ownerDocuments.map((doc:any)=><div key={doc.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"><div className="min-w-0"><p className="break-words font-medium">{doc.designation||doc.type_document}</p><p className="text-xs text-muted-foreground">{doc.statut||"en_attente"}</p></div><div className="flex flex-wrap items-center gap-2">{doc.displayUrl&&<Button variant="outline" size="sm" asChild><a href={doc.displayUrl} target="_blank" rel="noreferrer">Ouvrir</a></Button>}{canEditOwnerDocs&&<><input id={`replace-owner-doc-${doc.id}`} type="file" className="sr-only" accept=".pdf,image/*,.doc,.docx,.xls,.xlsx,.ppt,.pptx" disabled={replacingDocumentId===doc.id} onChange={e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value="";if(file)void replaceOwnerDocument(doc,file);}}/><Button type="button" variant="outline" size="sm" disabled={replacingDocumentId===doc.id} onClick={()=>document.getElementById(`replace-owner-doc-${doc.id}`)?.click()}>{replacingDocumentId===doc.id?"Remplacement…":"Remplacer"}</Button></>}</div></div>):<p className="text-sm text-muted-foreground">Aucun document enregistré.</p>}</div></CardContent></Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <div><CardTitle>Parcelles</CardTitle></div>
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Nouvelle parcelle</Button></DialogTrigger>
                <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
                  <DialogHeader><DialogTitle>Nouvelle parcelle</DialogTitle></DialogHeader>
                  <form onSubmit={submit} className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="space-y-2"><Label>Nom</Label><Input value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value.toLocaleUpperCase("fr-FR") }))} /></div>
                      <div className="space-y-2"><Label>Surface totale (ha)</Label><Input type="number" min="2" step="0.1" required value={form.surface_totale_ha} onChange={e => setForm(f => ({ ...f, surface_totale_ha: e.target.value }))} /></div>
                    </div>
                    <GeographieCascade districtId={form.district_id} regionId={form.region_id} departementId={form.departement_id} sousPrefectureId={form.sous_prefecture_id} onChange={g => setForm(f => ({ ...f, district_id: g.districtId || "", region_id: g.regionId || "", departement_id: g.departementId || "", sous_prefecture_id: g.sousPrefectureId || "", village: g.villageName || "", village_id: g.villageId || "" } as any))} villageId={(form as any).village_id || null} />
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="space-y-2"><Label>Date de convention</Label><Input type="date" value={form.date_convention} onChange={e => setForm(f => ({ ...f, date_convention: e.target.value }))} /></div>
                    </div>
                    <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Annuler</Button><Button type="submit" disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"}</Button></div>
                  </form>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table className="min-w-[820px]">
                  <TableHeader><TableRow><TableHead>Localisation</TableHead><TableHead>Total</TableHead><TableHead>Part AgriCapital</TableHead><TableHead>Attribuée</TableHead><TableHead>Disponible</TableHead><TableHead>Statut</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {parcelles.length === 0 ? <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">Aucune parcelle.</TableCell></TableRow> :
                      parcelles.map(p => {
                        const ac = Number(p.surface_agricapital_ha ?? p.surface_totale_ha ?? 0);
                        const used = Number(p.surface_attribuee_ha || 0);
                        const available = Math.max(0, ac - used);
                        return <TableRow key={p.id}>
                          <TableCell><div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-muted-foreground" /><span>{[p.village,p.departements?.nom,p.regions?.nom].filter(Boolean).join(", ") || "—"}</span></div></TableCell>
                          <TableCell>{Math.round(Number(p.surface_totale_ha || 0)).toLocaleString("fr-FR")} ha</TableCell>
                          <TableCell>{Math.round(ac).toLocaleString("fr-FR")} ha</TableCell>
                          <TableCell>{Math.round(used).toLocaleString("fr-FR")} ha</TableCell>
                          <TableCell>{Math.round(available).toLocaleString("fr-FR")} ha</TableCell>
                          <TableCell><Badge>{p.statut === "partiellement_attribuee" ? "Partiellement attribuée" : p.statut === "saturee" ? "Saturée" : "Disponible"}</Badge></TableCell>
                        </TableRow>;
                      })
                    }
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-wrap gap-2 text-sm">
            <Badge variant="outline"><Ruler className="mr-1 h-3 w-3" />{Math.round(Number(owner.surface_totale_ha ?? totals.total)).toLocaleString("fr-FR")} ha déclarés</Badge>
            <Badge variant="outline"><Layers className="mr-1 h-3 w-3" />{totals.count} parcelle(s)</Badge>
          </div>
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
};

export default ProprietaireTerreDetail;
