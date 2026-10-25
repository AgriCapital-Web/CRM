import { useCallback, useEffect, useMemo, useState } from "react";
import MainLayout from "@/components/layout/MainLayout";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import OfficeFormatTools, { type OfficeDocumentType } from "@/components/workspace/OfficeFormatTools";
import { toast } from "sonner";
import { FileText, FileSpreadsheet, Presentation, Files, ExternalLink, Calculator, Cloud, Plus, Save, Trash2, RefreshCw, Search, ShieldCheck, LoaderCircle, Download } from "lucide-react";
import { Link } from "react-router-dom";

type WorkspaceDocument = {
  id: string; title: string; document_type: OfficeDocumentType; content_text: string;
  owner_profile_id: string; storage_path: string | null; file_name: string | null;
  mime_type: string | null; created_at: string; updated_at: string;
};
const officeUrl = (import.meta.env.VITE_OFFICE_SUITE_URL || "").trim().replace(/\/$/, "");
const types: { value: OfficeDocumentType; label: string }[] = [
  { value: "document", label: "Document" }, { value: "spreadsheet", label: "Tableur" },
  { value: "presentation", label: "Présentation" }, { value: "file", label: "Fichier" },
];
const typeIcon = (type: string) => type === "spreadsheet" ? FileSpreadsheet : type === "presentation" ? Presentation : type === "file" ? Files : FileText;
const safeName = (name: string) => name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "document";

export default function WorkspaceOffice() {
  const { user, profile } = useAuth();
  const [profileId, setProfileId] = useState<string | null>(profile?.id || null);
  const [documents, setDocuments] = useState<WorkspaceDocument[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [documentType, setDocumentType] = useState<OfficeDocumentType>("document");
  const [content, setContent] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const configured = /^https:\/\//i.test(officeUrl);
  const selected = documents.find((doc) => doc.id === selectedId) || null;

  const loadDocuments = useCallback(async (preferredId?: string | null) => {
    if (!user?.id) { setLoading(false); return; }
    setLoading(true);
    try {
      let pid = profile?.id as string | undefined;
      if (!pid) {
        const { data, error } = await (supabase as any).from("profiles").select("id").eq("user_id", user.id).maybeSingle();
        if (error) throw error;
        pid = data?.id;
      }
      if (!pid) throw new Error("Profil collaborateur introuvable. Connectez-vous avec un compte interne actif.");
      setProfileId(pid);
      const { data, error } = await (supabase as any).from("workspace_documents").select("id,title,document_type,content_text,owner_profile_id,storage_path,file_name,mime_type,created_at,updated_at").order("updated_at", { ascending: false }).limit(200);
      if (error) throw error;
      const rows = (data || []) as WorkspaceDocument[];
      setDocuments(rows);
      const nextId = preferredId && rows.some((row) => row.id === preferredId) ? preferredId : rows[0]?.id || null;
      setSelectedId(nextId);
      const active = rows.find((row) => row.id === nextId);
      setTitle(active?.title || "");
      setDocumentType(active?.document_type || "document");
      setContent(active?.content_text || "");
      setDirty(false);
    } catch (error: any) {
      toast.error("Chargement des documents impossible : " + (error?.message || "erreur inconnue"));
    } finally { setLoading(false); }
  }, [user?.id, profile?.id]);

  useEffect(() => { void loadDocuments(); }, [loadDocuments]);

  const filteredDocuments = useMemo(() => documents.filter((doc) => (doc.title + " " + doc.document_type + " " + (doc.file_name || "")).toLowerCase().includes(search.trim().toLowerCase())), [documents, search]);
  const chooseDocument = (doc: WorkspaceDocument) => {
    if (dirty && !window.confirm("Les modifications non enregistrées seront perdues. Continuer ?")) return;
    setSelectedId(doc.id); setTitle(doc.title); setDocumentType(doc.document_type); setContent(doc.content_text || ""); setDirty(false);
  };
  const newDocument = () => {
    if (dirty && !window.confirm("Les modifications non enregistrées seront perdues. Continuer ?")) return;
    setSelectedId(null); setTitle("Nouveau document"); setDocumentType("document"); setContent(""); setDirty(true);
  };
  const saveDocument = async () => {
    if (!profileId) { toast.error("Profil collaborateur introuvable."); return; }
    if (!title.trim()) { toast.error("Le titre du document est obligatoire."); return; }
    setSaving(true);
    try {
      const payload = { title: title.trim(), document_type: documentType, content_text: content, updated_at: new Date().toISOString() };
      if (selectedId) {
        const { data, error } = await (supabase as any).from("workspace_documents").update(payload).eq("id", selectedId).select("id").single();
        if (error) throw error;
        toast.success("Document enregistré dans la base de données.");
        await loadDocuments(data.id);
      } else {
        const { data, error } = await (supabase as any).from("workspace_documents").insert({ ...payload, owner_profile_id: profileId }).select("id").single();
        if (error) throw error;
        toast.success("Document créé et enregistré dans la base de données.");
        await loadDocuments(data.id);
      }
    } catch (error: any) { toast.error("Enregistrement impossible : " + (error?.message || "vérifiez vos permissions.")); }
    finally { setSaving(false); }
  };
  const importFile = async (file: File, type: OfficeDocumentType, importedContent: string) => {
    if (!profileId || !user?.id) throw new Error("Profil collaborateur introuvable.");
    const path = user.id + "/workspace/" + crypto.randomUUID() + "-" + safeName(file.name);
    const { error: uploadError } = await supabase.storage.from("documents").upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
    if (uploadError) throw uploadError;
    const { data, error } = await (supabase as any).from("workspace_documents").insert({
      title: file.name.replace(/\.[^.]+$/, "") || "Document importé", document_type: type,
      content_text: importedContent, owner_profile_id: profileId, storage_path: path,
      file_name: file.name, mime_type: file.type || null,
    }).select("id").single();
    if (error) {
      await supabase.storage.from("documents").remove([path]);
      throw error;
    }
    await loadDocuments(data.id);
  };
  const deleteDocument = async () => {
    if (!selectedId || !selected) return;
    if (!window.confirm("Supprimer définitivement ce document de l’espace de travail ?")) return;
    setSaving(true);
    try {
      const { error } = await (supabase as any).from("workspace_documents").delete().eq("id", selectedId);
      if (error) throw error;
      if (selected.storage_path) {
        const { error: storageError } = await supabase.storage.from("documents").remove([selected.storage_path]);
        if (storageError) toast.error("Document supprimé, mais le fichier joint n’a pas pu être supprimé.");
      }
      toast.success("Document supprimé.");
      setSelectedId(null);
      await loadDocuments(null);
    } catch (error: any) { toast.error("Suppression impossible : " + (error?.message || "vérifiez vos droits.")); }
    finally { setSaving(false); }
  };
  const downloadAttachment = async () => {
    if (!selected?.storage_path) return;
    const { data, error } = await supabase.storage.from("documents").createSignedUrl(selected.storage_path, 60);
    if (error || !data?.signedUrl) { toast.error("Fichier indisponible ou accès refusé."); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };
  const openOffice = () => { if (configured) window.open(officeUrl, "_blank", "noopener,noreferrer"); };

  return (
    <ProtectedRoute requiredPermission={"documents.view" as any}>
      <MainLayout>
        <div className="mx-auto w-full max-w-7xl min-w-0 space-y-5 p-3 pt-16 sm:p-4 md:p-6 md:pt-6">
          <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-bold tracking-tight md:text-3xl">AgriCapital 360 · Suite bureautique</h1><Badge variant="outline">Stockage CRM</Badge></div>
              <p className="max-w-3xl text-sm text-muted-foreground">Créez, modifiez, importez, téléchargez et enregistrez les documents dans la base AgriCapital 360. Les droits de lecture et de modification sont contrôlés par les règles de sécurité de la base.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void loadDocuments(selectedId)} disabled={loading || saving}><RefreshCw className={"mr-2 h-4 w-4 " + (loading ? "animate-spin" : "")}/>Actualiser</Button>
              <Button onClick={newDocument}><Plus className="mr-2 h-4 w-4"/>Nouveau document</Button>
            </div>
          </header>
          <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(250px,0.8fr)_minmax(0,1.7fr)]">
            <Card className="min-w-0">
              <CardHeader><CardTitle className="text-base">Documents et partages</CardTitle><CardDescription>{documents.length} document(s) accessible(s) depuis la base de données</CardDescription><div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"/><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher un document…"/></div></CardHeader>
              <CardContent className="space-y-2">
                {loading ? <p className="py-6 text-center text-sm text-muted-foreground">Chargement des documents…</p> : filteredDocuments.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Aucun document. Créez-en un ou importez un fichier.</p> : filteredDocuments.map((doc) => { const Icon = typeIcon(doc.document_type); return <button key={doc.id} type="button" onClick={() => chooseDocument(doc)} className={"flex w-full min-w-0 items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 " + (selectedId === doc.id ? "border-primary bg-primary/5" : "")}><Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary"/><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{doc.title}</span><span className="mt-1 block text-xs text-muted-foreground">{types.find((t) => t.value === doc.document_type)?.label || "Fichier"} · {new Date(doc.updated_at).toLocaleDateString("fr-FR")}</span>{doc.file_name && <span className="mt-1 block truncate text-xs text-muted-foreground">{doc.file_name}</span>}</span></button>; })}
              </CardContent>
            </Card>
            <div className="min-w-0 space-y-4">
              <Card>
                <CardHeader><CardTitle className="text-base">{selected ? "Modifier le document" : "Créer un document"}</CardTitle><CardDescription>Les modifications sont enregistrées dans Supabase lorsque vous cliquez sur Enregistrer.</CardDescription></CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
                    <div className="space-y-1"><label className="text-sm font-medium" htmlFor="office-title">Titre</label><Input id="office-title" value={title} onChange={(event) => { setTitle(event.target.value); setDirty(true); }} placeholder="Titre du document"/></div>
                    <div className="space-y-1"><label className="text-sm font-medium" htmlFor="office-type">Type</label><select id="office-type" value={documentType} onChange={(event) => { setDocumentType(event.target.value as OfficeDocumentType); setDirty(true); }} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">{types.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></div>
                  </div>
                  <div className="space-y-1"><label className="text-sm font-medium" htmlFor="office-content">Contenu</label><Textarea id="office-content" value={content} onChange={(event) => { setContent(event.target.value); setDirty(true); }} rows={16} className="min-h-[320px] resize-y font-mono text-sm" placeholder="Rédigez le contenu du document ici…"/></div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4"/>{dirty ? "Modifications non enregistrées" : "État enregistré"}</div>
                    <div className="flex flex-wrap gap-2">
                      {selected?.storage_path && <Button variant="outline" onClick={() => void downloadAttachment()}><Download className="mr-2 h-4 w-4"/>Télécharger le fichier source</Button>}
                      {selected && selected.owner_profile_id === profileId && <Button variant="destructive" onClick={() => void deleteDocument()} disabled={saving}><Trash2 className="mr-2 h-4 w-4"/>Supprimer</Button>}
                      <Button onClick={() => void saveDocument()} disabled={saving || loading || (!dirty && !!selectedId)}>{saving ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4"/>}{saving ? "Enregistrement…" : "Enregistrer"}</Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <OfficeFormatTools title={title || "Document AgriCapital"} content={content} documentType={documentType} disabled={saving} onImport={importFile}/>
            </div>
          </div>
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Modules connectés</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <Card><CardHeader><Calculator className="h-5 w-5 text-primary"/><CardTitle className="text-base">Planification budgétaire</CardTitle><CardDescription>Prévisions, scénarios, exécution et rapprochement financier.</CardDescription></CardHeader><CardContent><Button asChild variant="outline" className="w-full"><Link to="/planification-budgetaire">Ouvrir la planification</Link></Button></CardContent></Card>
              <Card><CardHeader><Files className="h-5 w-5 text-primary"/><CardTitle className="text-base">Documents administratifs CRM</CardTitle><CardDescription>Contrôle et validation des pièces associées aux dossiers.</CardDescription></CardHeader><CardContent><Button asChild variant="outline" className="w-full"><Link to="/documents">Ouvrir les documents</Link></Button></CardContent></Card>
              <Card><CardHeader><Cloud className="h-5 w-5 text-primary"/><CardTitle className="text-base">Espace de travail</CardTitle><CardDescription>Agenda, tâches, projets et collaboration interne.</CardDescription></CardHeader><CardContent><Button asChild variant="outline" className="w-full"><Link to="/espace-travail-360">Ouvrir l’espace de travail</Link></Button></CardContent></Card>
            </div>
          </section>
          <Card>
            <CardHeader><CardTitle className="text-base">Suite collaborative externe (Nextcloud + ONLYOFFICE)</CardTitle><CardDescription>Édition collaborative des fichiers DOCX, XLSX et PPTX.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              {configured ? <><p className="text-sm text-muted-foreground">L’URL du portail est renseignée. Les comptes et permissions de Nextcloud sont administrés sur le serveur documentaire.</p><Button onClick={openOffice} className="gap-2">Ouvrir la suite collaborative <ExternalLink className="h-4 w-4"/></Button></> : <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4"><p className="font-medium">Serveur bureautique non configuré</p><p className="mt-1 text-sm text-muted-foreground">Le gestionnaire CRM ci-dessus est connecté à la base et au stockage. Pour activer l’édition collaborative ONLYOFFICE et la synchronisation du même fichier, il faut déployer Nextcloud/Document Server, configurer les secrets côté serveur et ajouter une passerelle sécurisée API/WebDAV. Une URL publique seule ne suffit pas.</p></div>}
            </CardContent>
          </Card>
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}
