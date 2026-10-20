import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MainLayout from "@/components/layout/MainLayout";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FileText, FileSpreadsheet, Presentation, FolderOpen, Plus, Save, Users, MessageSquare, History, ExternalLink, Paperclip, Send, RefreshCw, Search, Copy, Trash2, Download, Bold, Italic, Underline as UnderlineIcon, List, ListOrdered, Undo2, Redo2, Link as LinkIcon, Printer, Heading2, Eraser } from "lucide-react";
import { toast } from "sonner";
import OfficeFormatTools, { type OfficeDocumentType } from "@/components/workspace/OfficeFormatTools";

type WorkspaceDoc = {
  id: string; title: string; document_type: "document" | "spreadsheet" | "presentation" | "file";
  content_text: string | null; owner_profile_id: string; storage_path: string | null; file_name: string | null;
  updated_at: string; created_at: string;
};
type Collaborator = { id: string; nom_complet: string; email: string | null; poste: string | null };
type DocComment = { id: string; document_id: string; author_profile_id: string; body: string; created_at: string };
type DocVersion = { id: string; title: string; document_type: string; content_text: string; changed_by_profile_id: string | null; created_at: string };

const typeLabels: Record<string, string> = { document: "Document", spreadsheet: "Tableur / données", presentation: "Présentation", file: "Fichier partagé" };

function sanitizeWorkspaceHtml(value: string) {
  if (!value) return "";
  if (!/<[a-z][\s\S]*>/i.test(value)) {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\r?\n/g, "<br>");
  }
  const allowed = new Set(["P","DIV","BR","STRONG","B","EM","I","U","S","UL","OL","LI","H1","H2","H3","BLOCKQUOTE","A","TABLE","THEAD","TBODY","TR","TD","TH","HR"]);
  const parsed = new DOMParser().parseFromString(value, "text/html");
  const clean = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return (node.textContent || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    if (!(node instanceof Element)) return "";
    const children = Array.from(node.childNodes).map(clean).join("");
    if (!allowed.has(node.tagName)) return children;
    if (node.tagName === "A") {
      const href = node.getAttribute("href") || "";
      return /^(https?:|mailto:)/i.test(href) ? '<a href="' + href.replace(/&/g,"&amp;").replace(/"/g,"&quot;") + '" target="_blank" rel="noopener noreferrer">' + children + "</a>" : children;
    }
    return "<" + node.tagName.toLowerCase() + ">" + children + "</" + node.tagName.toLowerCase() + ">";
  };
  return Array.from(parsed.body.childNodes).map(clean).join("");
}
const TypeIcon = ({ type }: { type: string }) => type === "spreadsheet" ? <FileSpreadsheet className="h-4 w-4" /> : type === "presentation" ? <Presentation className="h-4 w-4" /> : type === "file" ? <Paperclip className="h-4 w-4" /> : <FileText className="h-4 w-4" />;


function parseWorkspaceCsv(input: string): string[][] {
  if (!input.trim()) return [[""]];
  const firstLine = input.split(/\r?\n/, 1)[0];
  const delimiter = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === '"' && quoted && input[i + 1] === '"') { cell += '"'; i++; }
    else if (ch === '"') quoted = !quoted;
    else if (ch === delimiter && !quoted) { row.push(cell); cell = ""; }
    else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  row.push(cell); rows.push(row);
  return rows;
}
function encodeWorkspaceCsv(rows: string[][]): string {
  const trimmed = rows.map((row) => [...row]);
  while (trimmed.length > 1 && trimmed[trimmed.length - 1].every((cell) => !cell.trim())) trimmed.pop();
  return trimmed.map((row) => {
    const last = row.reduce((found, cell, index) => cell.trim() ? index : found, -1);
    return row.slice(0, Math.max(1, last + 1)).map((cell) => /[;"\r\n]/.test(cell) ? '"' + cell.replace(/"/g, '""') + '"' : cell).join(";");
  }).join("\n");
}
const WORKSPACE_WORKBOOK_PREFIX = "__AGRICAPITAL_WORKBOOK_V1__\n";
type WorkspaceSheet = { name: string; rows: string[][] };
function parseWorkspaceWorkbook(input: string): WorkspaceSheet[] {
  if (input.startsWith(WORKSPACE_WORKBOOK_PREFIX)) {
    try {
      const parsed = JSON.parse(input.slice(WORKSPACE_WORKBOOK_PREFIX.length));
      if (Array.isArray(parsed.sheets) && parsed.sheets.length) {
        return parsed.sheets.map((sheet: any, index: number) => ({
          name: typeof sheet.name === "string" && sheet.name.trim() ? sheet.name : "Feuille " + (index + 1),
          rows: Array.isArray(sheet.rows) ? sheet.rows.map((row: any) => Array.isArray(row) ? row.map((cell: any) => String(cell ?? "")) : []) : [[""]],
        }));
      }
    } catch { /* Fallback to legacy CSV if workbook metadata is damaged. */ }
  }
  return [{ name: "Feuille 1", rows: parseWorkspaceCsv(input) }];
}
function encodeWorkspaceWorkbook(sheets: WorkspaceSheet[]): string {
  const clean = sheets.map((sheet) => ({ name: sheet.name, rows: parseWorkspaceCsv(encodeWorkspaceCsv(sheet.rows)) }));
  if (clean.length <= 1) return encodeWorkspaceCsv(clean[0]?.rows || [[""]]);
  return WORKSPACE_WORKBOOK_PREFIX + JSON.stringify({ sheets: clean });
}
function spreadsheetColumn(index: number): string {
  let value = index + 1, result = "";
  while (value > 0) { const remainder = (value - 1) % 26; result = String.fromCharCode(65 + remainder) + result; value = Math.floor((value - 1) / 26); }
  return result;
}
function evaluateWorkspaceCell(raw: string, rows: string[][], visited = new Set<string>()): string {
  const value = raw.trim();
  const refValue = (ref: string): number => {
    const match = /^([A-Z]+)([1-9]\d*)$/i.exec(ref);
    if (!match) return 0;
    let col = 0;
    for (const ch of match[1].toUpperCase()) col = col * 26 + ch.charCodeAt(0) - 64;
    const key = match[1].toUpperCase() + match[2];
    if (visited.has(key)) return 0;
    const nextVisited = new Set(visited); nextVisited.add(key);
    const source = rows[Number(match[2]) - 1]?.[col - 1] || "";
    const number = Number(evaluateWorkspaceCell(source, rows, nextVisited));
    return Number.isFinite(number) ? number : 0;
  };
  if (!value.startsWith("=")) return value;
  const formula = value.slice(1).trim();
  const aggregate = /^(SUM|AVERAGE|MIN|MAX|COUNT)\(([A-Z]+\d+):([A-Z]+\d+)\)$/i.exec(formula);
  if (aggregate) {
    const start = /^([A-Z]+)(\d+)$/i.exec(aggregate[2])!;
    const end = /^([A-Z]+)(\d+)$/i.exec(aggregate[3])!;
    const colIndex = (letters: string) => [...letters.toUpperCase()].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
    const c1 = colIndex(start[1]), c2 = colIndex(end[1]), r1 = Number(start[2]), r2 = Number(end[2]);
    const values: number[] = [];
    for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) {
      const cell = rows[r - 1]?.[c - 1] || "";
      if (cell.trim() !== "") {
        const evaluated = evaluateWorkspaceCell(cell, rows, new Set(visited));
        const number = Number(evaluated);
        if (Number.isFinite(number)) values.push(number);
      }
    }
    if (aggregate[1].toUpperCase() === "COUNT") return String(values.length);
    if (aggregate[1].toUpperCase() === "MIN") return values.length ? String(Math.min(...values)) : "0";
    if (aggregate[1].toUpperCase() === "MAX") return values.length ? String(Math.max(...values)) : "0";
    const sum = values.reduce((a, b) => a + b, 0);
    return String(aggregate[1].toUpperCase() === "AVERAGE" ? (values.length ? sum / values.length : 0) : sum);
  }
  const direct = /^([A-Z]+\d+)$/i.exec(formula);
  if (direct) return String(refValue(direct[1]));
  const arithmetic = /^([+-]?\d+(?:\.\d+)?)\s*([+\-*/])\s*([+-]?\d+(?:\.\d+)?)$/.exec(formula);
  if (arithmetic) {
    const a = Number(arithmetic[1]), b = Number(arithmetic[3]);
    const result = arithmetic[2] === "+" ? a + b : arithmetic[2] === "-" ? a - b : arithmetic[2] === "*" ? a * b : b === 0 ? NaN : a / b;
    return Number.isFinite(result) ? String(result) : "#ERREUR";
  }
  return "#FORMULE?";
}
function WorkspaceSpreadsheet({ value, onChange, disabled }: { value: string; onChange: (next: string) => void; disabled: boolean }) {
  const [activeSheet, setActiveSheet] = useState(0);
  const workbook = parseWorkspaceWorkbook(value);
  const activeIndex = Math.min(activeSheet, workbook.length - 1);
  const active = workbook[activeIndex] || { name: "Feuille 1", rows: [[""]] };
  const parsed = active.rows;
  const rowCount = Math.min(100, Math.max(12, parsed.length));
  const colCount = Math.min(26, Math.max(8, ...parsed.map((row) => row.length)));
  const rows = Array.from({ length: rowCount }, (_, r) => Array.from({ length: colCount }, (_, c) => parsed[r]?.[c] || ""));
  const chartData = parsed.slice(1).map((row) => ({ label: (row[0] || "").trim(), value: Number((row[1] || "").replace(",", ".")) }))
    .filter((item) => item.label && Number.isFinite(item.value)).slice(0, 10);
  const chartMax = Math.max(1, ...chartData.map((item) => Math.abs(item.value)));
  const updateCell = (r: number, c: number, next: string) => {
    const updatedRows = rows.map((row) => [...row]);
    updatedRows[r][c] = next;
    const updatedWorkbook = workbook.map((sheet, index) => index === activeIndex ? { ...sheet, rows: updatedRows } : sheet);
    onChange(encodeWorkspaceWorkbook(updatedWorkbook));
  };
  const addSheet = () => {
    const nextName = "Feuille " + (workbook.length + 1);
    onChange(encodeWorkspaceWorkbook([...workbook, { name: nextName, rows: [[""]] }]));
    setActiveSheet(workbook.length);
  };
  const removeSheet = () => {
    if (workbook.length <= 1 || !window.confirm("Supprimer la feuille « " + active.name + " » ?")) return;
    const next = workbook.filter((_, index) => index !== activeIndex);
    onChange(encodeWorkspaceWorkbook(next));
    setActiveSheet(Math.max(0, activeIndex - 1));
  };
  const exportCsv = () => {
    const blob = new Blob(["\uFEFF" + encodeWorkspaceCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = "tableur-agricapital.csv"; link.click();
    URL.revokeObjectURL(url);
  };
  const importCsv = async (file?: File) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { window.alert("Le fichier CSV ne doit pas dépasser 2 Mo."); return; }
    onChange(await file.text());
  };
  return <div className="space-y-2">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs text-muted-foreground">Tableur intégré · CSV · formules simples : =SUM(A1:A5), =AVERAGE(A1:A5), =MIN(A1:A5), =MAX(A1:A5), =COUNT(A1:A5), =A1 ou =2+3</p>
      <div className="flex gap-2">
        <label className="cursor-pointer rounded-md border px-3 py-2 text-xs hover:bg-muted">Importer CSV<input type="file" accept=".csv,text/csv" className="hidden" disabled={disabled} onChange={(e) => { void importCsv(e.target.files?.[0]); e.currentTarget.value = ""; }} /></label>
        <button type="button" onClick={exportCsv} className="rounded-md border px-3 py-2 text-xs hover:bg-muted">Exporter CSV</button>
      </div>
    </div>
    <div className="flex flex-wrap items-center gap-1">
      {workbook.map((sheet, index) => <button type="button" key={sheet.name + index} onClick={() => setActiveSheet(index)} className={"rounded-md border px-3 py-1.5 text-xs " + (index === activeIndex ? "border-primary bg-primary/10 font-semibold" : "bg-background hover:bg-muted")}>{sheet.name}</button>)}
      <button type="button" disabled={disabled} onClick={addSheet} className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted">+ Feuille</button>
      <button type="button" disabled={disabled || workbook.length <= 1} onClick={removeSheet} className="rounded-md border px-3 py-1.5 text-xs text-destructive hover:bg-muted">Supprimer la feuille</button>
    </div>
    <div className="max-h-[440px] overflow-auto rounded-lg border">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-muted"><tr><th className="w-10 border p-2 text-xs text-muted-foreground">#</th>{Array.from({ length: colCount }, (_, c) => <th key={c} className="min-w-32 border p-2 text-xs font-semibold">{spreadsheetColumn(c)}</th>)}</tr></thead>
        <tbody>{rows.map((row, r) => <tr key={r}><th className="border bg-muted/40 p-1 text-xs text-muted-foreground">{r + 1}</th>{row.map((cell, c) => <td key={c} className="border p-0"><div className="flex min-w-32 flex-col"><input aria-label={spreadsheetColumn(c) + (r + 1)} value={cell} onChange={(e) => updateCell(r, c, e.target.value)} disabled={disabled} className="w-full min-w-32 bg-transparent px-2 py-1.5 outline-none focus:bg-primary/5 focus:ring-1 focus:ring-inset focus:ring-primary" /><span className="min-h-4 px-2 pb-1 text-[11px] text-muted-foreground">{cell.trim().startsWith("=") ? evaluateWorkspaceCell(cell, rows) : ""}</span></div></td>)}</tr>)}</tbody>
      </table>
    </div>
    {chartData.length > 0 && <div className="space-y-3 rounded-lg border bg-background p-3">
      <div><p className="text-sm font-semibold">Aperçu du graphique</p><p className="text-xs text-muted-foreground">Libellés : première colonne · Indicateurs : deuxième colonne</p></div>
      <div className="space-y-2">{chartData.map((item, index) => <div key={item.label + index} className="grid grid-cols-[minmax(70px,1fr)_minmax(90px,3fr)_70px] items-center gap-2 text-xs">
        <span className="truncate" title={item.label}>{item.label}</span>
        <div className="h-5 overflow-hidden rounded bg-muted"><div className="h-full rounded bg-primary/80" style={{ width: Math.max(1, Math.abs(item.value) / chartMax * 100) + "%" }} /></div>
        <span className="text-right tabular-nums">{item.value.toLocaleString("fr-FR")}</span>
      </div>)}</div>
    </div>}
    <p className="text-xs text-muted-foreground">Les formules sont calculées dans l’interface. Les données et les formules restent enregistrées dans le CRM. Pour les modèles Excel complexes et la coédition de type Excel, un éditeur spécialisé reste nécessaire.</p>
  </div>;
}

export default function EspaceTravail() {
  const { profile, user } = useAuth();
  const [documents, setDocuments] = useState<WorkspaceDoc[]>([]);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [selected, setSelected] = useState<WorkspaceDoc | null>(null);
  const [title, setTitle] = useState("");
  const [documentType, setDocumentType] = useState<WorkspaceDoc["document_type"]>("document");
  const [content, setContent] = useState("");
  const [comments, setComments] = useState<DocComment[]>([]);
  const [versions, setVersions] = useState<DocVersion[]>([]);
  const [commentDraft, setCommentDraft] = useState("");
  const [shareProfileId, setShareProfileId] = useState("");
  const [sharePermission, setSharePermission] = useState<"view" | "edit">("edit");
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [officeUrl] = useState((import.meta as any).env?.VITE_OFFICE_SUITE_URL || "");
  const [searchQuery, setSearchQuery] = useState("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const [docsResult, collaboratorsResult] = await Promise.all([
        (supabase as any).from("workspace_documents").select("*").order("updated_at", { ascending: false }),
        (supabase as any).rpc("workspace_list_collaborators"),
      ]);
      if (docsResult.error) throw docsResult.error;
      if (collaboratorsResult.error) throw collaboratorsResult.error;
      const list = (docsResult.data || []) as WorkspaceDoc[];
      setDocuments(list);
      setCollaborators((collaboratorsResult.data || []) as Collaborator[]);
      const next = list.find((d) => d.id === selectedId) || list[0] || null;
      if (next) {
        setSelectedId(next.id);
        setSelected(next);
        setTitle(next.title);
        setDocumentType(next.document_type);
        setContent(next.content_text || "");
      } else {
        setSelectedId("");
        setSelected(null);
        setTitle("");
        setContent("");
      }
    } catch (error: any) {
      toast.error("Impossible de charger l’espace de travail : " + (error?.message || "erreur inconnue"));
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  const loadDetails = useCallback(async (documentId: string) => {
    if (!documentId) { setComments([]); setMembers([]); return; }
    const [commentResult, memberResult, versionResult] = await Promise.all([
      (supabase as any).from("workspace_document_comments").select("*").eq("document_id", documentId).order("created_at", { ascending: true }),
      (supabase as any).from("workspace_document_members").select("id,document_id,profile_id,permission,created_at").eq("document_id", documentId),
      (supabase as any).from("workspace_document_versions").select("*").eq("document_id", documentId).order("created_at", { ascending: false }).limit(20),
    ]);
    if (commentResult.error) toast.error("Commentaires indisponibles : " + commentResult.error.message);
    else setComments(commentResult.data || []);
    if (memberResult.error) toast.error("Partages indisponibles : " + memberResult.error.message);
    else setMembers(memberResult.data || []);
    if (versionResult.error) toast.error("Historique indisponible : " + versionResult.error.message);
    else setVersions(versionResult.data || []);
  }, []);

  useEffect(() => { void loadDocuments(); }, [loadDocuments]);
  useEffect(() => { void loadDetails(selectedId); }, [selectedId, loadDetails]);
  useEffect(() => {
    const channel = supabase.channel("workspace-live-updates")
      .on("postgres_changes", { event: "*", schema: "public", table: "workspace_documents" }, () => { void loadDocuments(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "workspace_document_comments" }, (payload: any) => {
        if (payload.new?.document_id === selectedId || payload.old?.document_id === selectedId) void loadDetails(selectedId);
      }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [loadDocuments, loadDetails, selectedId]);

  const collaboratorNames = useMemo(() => new Map(collaborators.map((c) => [c.id, c.nom_complet])), [collaborators]);
  const isOwner = !!selected && selected.owner_profile_id === profile?.id;
  const canEditSelected = !!selected && (isOwner || members.some((m: any) => m.profile_id === profile?.id && m.permission === "edit"));

  const chooseDocument = (doc: WorkspaceDoc) => {
    if (hasUnsavedChanges && !window.confirm("Des modifications ne sont pas enregistrées. Changer de document sans enregistrer ?")) return;
    setSelectedId(doc.id); setSelected(doc); setTitle(doc.title); setDocumentType(doc.document_type); setContent(doc.content_text || "");
    setHasUnsavedChanges(false);
  };

  const formatEditor = (command: string, value?: string) => {
    editorRef.current?.focus();
    if (command === "createLink") {
      const url = window.prompt("Adresse du lien (https://…)");
      if (!url || !/^(https?:|mailto:)/i.test(url)) return;
      document.execCommand(command, false, url);
    } else document.execCommand(command, false, value);
    setHasUnsavedChanges(true);
  };

  const downloadDocument = () => {
    if (!selected) return;
    const body = editorRef.current?.innerHTML || content;
    const safeTitle = title.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const html = '<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>' + safeTitle + '</title><style>body{font:16px Arial,sans-serif;max-width:850px;margin:40px auto;line-height:1.6}table{border-collapse:collapse}td,th{border:1px solid #bbb;padding:8px}</style></head><body>' + sanitizeWorkspaceHtml(body) + '</body></html>';
    const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = (title.trim() || "document") + ".html"; link.click(); URL.revokeObjectURL(url);
  };

  const duplicateDocument = async () => {
    if (!selected || !profile?.id) return;
    setSaving(true);
    try {
      const { data, error } = await (supabase as any).from("workspace_documents").insert({
        title: title.trim() + " — copie", document_type: documentType,
        content_text: editorRef.current?.innerHTML || content, owner_profile_id: profile.id,
      }).select("*").single();
      if (error) throw error;
      if (!data?.id) throw new Error("La copie n’a pas été confirmée par la base.");
      setDocuments((old) => [data, ...old]); setSelectedId(data.id); setSelected(data); setTitle(data.title); setContent(data.content_text || "");
      setHasUnsavedChanges(false); toast.success("Copie créée dans l’espace de travail.");
    } catch (error: any) { toast.error("Copie impossible : " + (error?.message || "erreur inconnue")); }
    finally { setSaving(false); }
  };

  const deleteDocument = async () => {
    if (!selected || !isOwner || !window.confirm("Supprimer définitivement « " + selected.title + " » et son historique ?")) return;
    setSaving(true);
    try {
      const { error } = await (supabase as any).from("workspace_documents").delete().eq("id", selected.id);
      if (error) throw error;
      setDocuments((old) => old.filter((doc) => doc.id !== selected.id)); setSelectedId(""); setSelected(null); setTitle(""); setContent(""); setHasUnsavedChanges(false);
      toast.success("Document supprimé."); await loadDocuments();
    } catch (error: any) { toast.error("Suppression impossible : " + (error?.message || "erreur inconnue")); }
    finally { setSaving(false); }
  };

  const importOfficeDocument = async (file: File, importedType: OfficeDocumentType, importedContent: string) => {
    if (!profile?.id || !user?.id) throw new Error("Votre compte CRM doit être actif pour importer un document.");
    const importedTitle = file.name.replace(/\.[^.]+$/, "").trim() || "Document importé";
    const { data, error } = await (supabase as any).from("workspace_documents").insert({
      title: importedTitle, document_type: importedType, content_text: importedContent, owner_profile_id: profile.id,
    }).select("*").single();
    if (error) throw error;
    if (!data?.id) throw new Error("La base n’a pas confirmé la création du document importé.");
    let saved = data;
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = "workspace/" + data.id + "/" + Date.now() + "-" + safeName;
    const { error: uploadError } = await supabase.storage.from("documents").upload(path, file, {
      upsert: false, contentType: file.type || "application/octet-stream",
    });
    if (uploadError) {
      toast.warning("Le contenu a été importé, mais le fichier d’origine n’a pas pu être joint : " + uploadError.message);
    } else {
      const { data: updated, error: updateError } = await (supabase as any).from("workspace_documents").update({
        storage_path: path, file_name: file.name, mime_type: file.type || null, updated_at: new Date().toISOString(),
      }).eq("id", data.id).select("*").single();
      if (updateError) toast.warning("Le document est enregistré, mais son lien vers le fichier source n’a pas été confirmé.");
      else if (updated?.id) saved = updated;
    }
    setDocuments((old) => [saved, ...old.filter((doc) => doc.id !== saved.id)]);
    setSelectedId(saved.id); setSelected(saved); setTitle(saved.title); setDocumentType(saved.document_type);
    setContent(saved.content_text || ""); setHasUnsavedChanges(false);
    await loadDetails(saved.id);
  };

  const createDocument = async () => {
    if (!profile?.id || !user?.id) { toast.error("Votre compte CRM doit être actif pour créer un document."); return; }
    setSaving(true);
    try {
      const { data, error } = await (supabase as any).from("workspace_documents").insert({
        title: "Nouveau document", document_type: "document", content_text: "", owner_profile_id: profile.id,
      }).select("*").single();
      if (error) throw error;
      if (!data?.id) throw new Error("La base n’a pas confirmé la création du document.");
      setDocuments((old) => [data, ...old.filter((d) => d.id !== data.id)]);
      chooseDocument(data);
      toast.success("Document créé et enregistré.");
    } catch (error: any) { toast.error("Création impossible : " + (error?.message || "erreur inconnue")); }
    finally { setSaving(false); }
  };

  const saveDocument = async () => {
    if (!selected?.id || saving || !canEditSelected) return;
    if (!title.trim()) { toast.error("Le titre du document est obligatoire."); return; }
    setSaving(true);
    try {
      const nextContent = editorRef.current?.innerHTML ?? content;
      const { data, error } = await (supabase as any).from("workspace_documents")
        .update({ title: title.trim(), document_type: documentType, content_text: nextContent, updated_at: new Date().toISOString() })
        .eq("id", selected.id).select("*").single();
      if (error) throw error;
      if (!data?.id) throw new Error("La modification n’a pas été confirmée par la base de données.");
      setSelected(data); setContent(nextContent); setDocuments((old) => old.map((d) => d.id === data.id ? data : d));
      setHasUnsavedChanges(false);
      toast.success("Modifications enregistrées.");
    } catch (error: any) { toast.error("Enregistrement impossible. Votre texte reste affiché : " + (error?.message || "erreur inconnue")); }
    finally { setSaving(false); }
  };

  const addComment = async () => {
    if (!selected?.id || !profile?.id || !commentDraft.trim()) return;
    setSaving(true);
    try {
      const { error } = await (supabase as any).from("workspace_document_comments").insert({
        document_id: selected.id, author_profile_id: profile.id, body: commentDraft.trim(),
      });
      if (error) throw error;
      setCommentDraft("");
      await loadDetails(selected.id);
      toast.success("Commentaire publié.");
    } catch (error: any) { toast.error("Commentaire non enregistré : " + (error?.message || "erreur inconnue")); }
    finally { setSaving(false); }
  };

  const shareDocument = async () => {
    if (!selected?.id || !shareProfileId || !isOwner) return;
    setSaving(true);
    try {
      const { error } = await (supabase as any).from("workspace_document_members").upsert({
        document_id: selected.id, profile_id: shareProfileId, permission: sharePermission,
        created_by_profile_id: profile?.id,
      }, { onConflict: "document_id,profile_id" });
      if (error) throw error;
      setShareProfileId("");
      await loadDetails(selected.id);
      toast.success("Partage enregistré.");
    } catch (error: any) { toast.error("Partage impossible : " + (error?.message || "erreur inconnue")); }
    finally { setSaving(false); }
  };

  const openAttachment = async () => {
    if (!selected?.storage_path) return;
    const { data, error } = await supabase.storage.from("documents").createSignedUrl(selected.storage_path, 60);
    if (error || !data?.signedUrl) { toast.error("Le fichier ne peut pas être ouvert : " + (error?.message || "lien indisponible")); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const removeAttachment = async () => {
    if (!selected?.id || !selected.storage_path || !canEditSelected) return;
    if (!window.confirm("Retirer le fichier source « " + (selected.file_name || "fichier joint") + " » ? Le document éditable restera dans l’espace de travail.")) return;
    setSaving(true);
    try {
      const oldPath = selected.storage_path;
      const { data, error } = await (supabase as any).from("workspace_documents").update({
        storage_path: null, file_name: null, mime_type: null, updated_at: new Date().toISOString(),
      }).eq("id", selected.id).select("*").single();
      if (error) throw error;
      if (!data?.id) throw new Error("La suppression du lien n’a pas été confirmée par la base.");
      setSelected(data); setDocuments((old) => old.map((doc) => doc.id === data.id ? data : doc));
      const { error: removeError } = await supabase.storage.from("documents").remove([oldPath]);
      if (removeError) toast.warning("Le fichier a été détaché du document, mais le nettoyage du stockage a échoué.");
      else toast.success("Fichier source retiré. Le contenu éditable est conservé.");
    } catch (error: any) {
      toast.error("Retrait du fichier impossible : " + (error?.message || "erreur inconnue"));
    } finally { setSaving(false); }
  };

  const uploadAttachment = async (file?: File) => {
    if (!selected?.id || !file || !canEditSelected) return;
    setSaving(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `workspace/${selected.id}/${Date.now()}-${safeName}`;
      const { error: uploadError } = await supabase.storage.from("documents").upload(path, file, { upsert: false, contentType: file.type || "application/octet-stream" });
      if (uploadError) throw uploadError;
      const { data, error } = await (supabase as any).from("workspace_documents").update({
        storage_path: path, file_name: file.name, mime_type: file.type || null, updated_at: new Date().toISOString(),
      }).eq("id", selected.id).select("*").single();
      if (error) throw error;
      setSelected(data); setDocuments((old) => old.map((d) => d.id === data.id ? data : d));
      toast.success("Fichier joint et enregistré.");
    } catch (error: any) { toast.error("Fichier non enregistré : " + (error?.message || "erreur inconnue")); }
    finally { setSaving(false); }
  };

  return <ProtectedRoute><MainLayout>
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div><h1 className="text-2xl font-bold">Espace de travail</h1><p className="text-sm text-muted-foreground">Documents partagés, commentaires et collaboration des équipes.</p></div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void loadDocuments()} disabled={loading}><RefreshCw className="mr-2 h-4 w-4" />Actualiser</Button>
          <Button onClick={() => void createDocument()} disabled={saving}><Plus className="mr-2 h-4 w-4" />Nouveau document</Button>
        </div>
      </div>
      {!officeUrl && <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm"><b>Suite bureautique avancée à connecter.</b><p className="mt-1 text-muted-foreground">L’espace interne et le partage sont disponibles. La coédition native de fichiers Word/Excel/PowerPoint nécessite de connecter un serveur ONLYOFFICE ou Nextcloud à l’hébergement AgriCapital. Aucun serveur bureautique n’est configuré actuellement.</p></div>}
      {officeUrl && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"><div><b>Suite bureautique connectée</b><p className="text-sm text-muted-foreground">Ouvrir la suite pour créer ou modifier des fichiers compatibles.</p></div><Button variant="outline" onClick={() => window.open(officeUrl, "_blank", "noopener,noreferrer")}><ExternalLink className="mr-2 h-4 w-4" />Ouvrir la suite</Button></div>}
      <div className="grid gap-4 lg:grid-cols-[minmax(240px,0.8fr)_minmax(0,1.8fr)]">
        <Card className="min-w-0">
          <CardHeader><CardTitle className="flex items-center gap-2"><FolderOpen className="h-5 w-5" />Mes documents et partages</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Rechercher un document…" /></div>
            {loading ? <p className="text-sm text-muted-foreground">Chargement…</p> : documents.filter((doc) => (doc.title + " " + (doc.content_text || "")).toLocaleLowerCase().includes(searchQuery.toLocaleLowerCase())).length === 0 ? <p className="text-sm text-muted-foreground">{searchQuery ? "Aucun résultat pour cette recherche." : "Aucun document pour le moment. Créez-en un pour commencer."}</p> : documents.filter((doc) => (doc.title + " " + (doc.content_text || "")).toLocaleLowerCase().includes(searchQuery.toLocaleLowerCase())).map((doc) =>
              <button key={doc.id} onClick={() => chooseDocument(doc)} className={`w-full rounded-lg border p-3 text-left transition-colors ${selectedId === doc.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}>
                <div className="flex items-start gap-2"><TypeIcon type={doc.document_type} /><span className="min-w-0 flex-1 truncate font-medium">{doc.title}</span></div>
                <div className="mt-2 flex flex-wrap gap-1"><Badge variant="outline">{typeLabels[doc.document_type] || "Document"}</Badge>{doc.owner_profile_id === profile?.id && <Badge>Propriétaire</Badge>}</div>
                <p className="mt-1 text-xs text-muted-foreground">Modifié le {new Date(doc.updated_at).toLocaleString("fr-FR")}</p>
              </button>
            )}
          </CardContent>
        </Card>
        <div className="min-w-0 space-y-4">
          {selected ? <>
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><TypeIcon type={documentType} />Éditeur collaboratif</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <OfficeFormatTools title={title} content={content} documentType={documentType} disabled={saving || !canEditSelected} onImport={importOfficeDocument} />
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
                  <div className="space-y-1"><Label>Titre</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} disabled={saving} /></div>
                  <div className="space-y-1"><Label>Type de contenu</Label><Select value={documentType} onValueChange={(v: any) => setDocumentType(v)} disabled={saving}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="document">Document texte</SelectItem><SelectItem value="spreadsheet">Tableur / données CSV</SelectItem><SelectItem value="presentation">Présentation / notes de réunion</SelectItem><SelectItem value="file">Fichier partagé</SelectItem></SelectContent></Select></div>
                </div>
                <>{documentType === "document" || documentType === "presentation" ? <>
                  <div className="flex flex-wrap items-center gap-1 rounded-lg border bg-muted/30 p-2">
                    <Button type="button" size="sm" variant="outline" title="Gras" onClick={() => formatEditor("bold")} disabled={!canEditSelected}><Bold className="h-4 w-4" /></Button>
                    <Button type="button" size="sm" variant="outline" title="Italique" onClick={() => formatEditor("italic")} disabled={!canEditSelected}><Italic className="h-4 w-4" /></Button>
                    <Button type="button" size="sm" variant="outline" title="Souligné" onClick={() => formatEditor("underline")} disabled={!canEditSelected}><UnderlineIcon className="h-4 w-4" /></Button>
                    <Button type="button" size="sm" variant="outline" title="Titre" onClick={() => formatEditor("formatBlock", "h2")} disabled={!canEditSelected}><Heading2 className="h-4 w-4" /></Button>
                    <Button type="button" size="sm" variant="outline" title="Liste à puces" onClick={() => formatEditor("insertUnorderedList")} disabled={!canEditSelected}><List className="h-4 w-4" /></Button>
                    <Button type="button" size="sm" variant="outline" title="Liste numérotée" onClick={() => formatEditor("insertOrderedList")} disabled={!canEditSelected}><ListOrdered className="h-4 w-4" /></Button>
                    <Button type="button" size="sm" variant="outline" title="Insérer un lien" onClick={() => formatEditor("createLink")} disabled={!canEditSelected}><LinkIcon className="h-4 w-4" /></Button>
                    <Button type="button" size="sm" variant="outline" title="Annuler" onClick={() => formatEditor("undo")} disabled={!canEditSelected}><Undo2 className="h-4 w-4" /></Button>
                    <Button type="button" size="sm" variant="outline" title="Rétablir" onClick={() => formatEditor("redo")} disabled={!canEditSelected}><Redo2 className="h-4 w-4" /></Button>
                    <Button type="button" size="sm" variant="outline" title="Effacer le formatage" onClick={() => formatEditor("removeFormat")} disabled={!canEditSelected}><Eraser className="h-4 w-4" /></Button>
                  </div>
                  <div className="space-y-1"><Label>{documentType === "presentation" ? "Plan de présentation et notes" : "Contenu du document"}</Label><div ref={editorRef} contentEditable={!saving && canEditSelected} suppressContentEditableWarning dangerouslySetInnerHTML={{ __html: sanitizeWorkspaceHtml(content) }} onInput={() => setHasUnsavedChanges(true)} onBlur={() => { if (editorRef.current) setContent(editorRef.current.innerHTML); }} role="textbox" aria-multiline="true" className="min-h-[320px] rounded-lg border bg-background p-4 text-sm leading-7 outline-none focus-visible:ring-2 focus-visible:ring-ring [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-xl [&_h2]:font-semibold [&_li]:ml-6 [&_li]:list-disc [&_ol_li]:list-decimal [&_p]:my-2 [&_table]:w-full [&_td]:border [&_td]:p-2 [&_th]:border [&_th]:p-2" /></div>
                </> : <div className="space-y-1"><Label>{documentType === "spreadsheet" ? "Tableur" : "Contenu du fichier"}</Label>{documentType === "spreadsheet" ? <WorkspaceSpreadsheet value={content} onChange={(next) => { setContent(next); setHasUnsavedChanges(true); }} disabled={saving || !canEditSelected} key={selectedId} /> : <Textarea className="min-h-[260px] font-mono text-sm" value={content} onChange={(e) => { setContent(e.target.value); setHasUnsavedChanges(true); }} placeholder="Contenu du fichier…" disabled={saving || !canEditSelected} />}</div>}</>
                <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-muted-foreground">{hasUnsavedChanges ? <span className="font-medium text-amber-600">Modifications non enregistrées</span> : <>Dernière sauvegarde : {new Date(selected.updated_at).toLocaleString("fr-FR")}</>}</p><div className="flex flex-wrap gap-2">{documentType !== "spreadsheet" && <><Button variant="outline" onClick={downloadDocument} disabled={saving}><Download className="mr-2 h-4 w-4" />Exporter HTML</Button><Button variant="outline" onClick={() => window.print()} disabled={saving}><Printer className="mr-2 h-4 w-4" />Imprimer / PDF</Button></>}<Button onClick={() => void saveDocument()} disabled={saving || !title.trim() || !canEditSelected}><Save className="mr-2 h-4 w-4" />{saving ? "Enregistrement…" : "Enregistrer"}</Button></div></div>
                <div className="flex flex-wrap gap-2 border-t pt-3"><Button variant="outline" size="sm" onClick={() => void duplicateDocument()} disabled={saving}><Copy className="mr-2 h-4 w-4" />Créer une copie</Button>{isOwner && <Button variant="destructive" size="sm" onClick={() => void deleteDocument()} disabled={saving}><Trash2 className="mr-2 h-4 w-4" />Supprimer</Button>}</div>
                <div className="flex flex-wrap items-center gap-2 border-t pt-3"><label className="inline-flex cursor-pointer items-center rounded-md border px-3 py-2 text-sm hover:bg-muted"><Paperclip className="mr-2 h-4 w-4" />Joindre un fichier<input type="file" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; void uploadAttachment(file); e.currentTarget.value = ""; }} disabled={saving || !canEditSelected} /></label>{selected.file_name && <><span className="max-w-[240px] truncate text-sm">{selected.file_name}</span><Button size="sm" variant="outline" onClick={() => void openAttachment()}>Ouvrir le fichier</Button><Button size="sm" variant="outline" disabled={saving || !canEditSelected} onClick={() => void removeAttachment()}><Trash2 className="mr-1 h-4 w-4" />Retirer</Button></>}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" />Partage et accès</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {isOwner ? <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_140px_auto]">
                  <Select value={shareProfileId} onValueChange={setShareProfileId}><SelectTrigger><SelectValue placeholder="Choisir un collaborateur" /></SelectTrigger><SelectContent>{collaborators.filter((c) => c.id !== profile?.id).map((c) => <SelectItem key={c.id} value={c.id}>{c.nom_complet}{c.email ? ` — ${c.email}` : ""}</SelectItem>)}</SelectContent></Select>
                  <Select value={sharePermission} onValueChange={(v: any) => setSharePermission(v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="view">Lecture seule</SelectItem><SelectItem value="edit">Peut modifier</SelectItem></SelectContent></Select>
                  <Button onClick={() => void shareDocument()} disabled={!shareProfileId || saving}><Users className="mr-2 h-4 w-4" />Partager</Button>
                </div> : <p className="text-sm text-muted-foreground">Seul le propriétaire du document peut gérer les accès.</p>}
                {members.length === 0 ? <p className="text-sm text-muted-foreground">Aucun collaborateur ajouté explicitement.</p> : members.map((member) => <div key={member.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm"><span>{collaboratorNames.get(member.profile_id) || "Collaborateur"}</span><Badge variant="outline">{member.permission === "edit" ? "Modification" : "Lecture seule"}</Badge></div>)}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><History className="h-5 w-5" />Historique des versions</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {versions.length === 0 ? <p className="text-sm text-muted-foreground">L’historique se remplira à chaque modification enregistrée.</p> : versions.map((version) => <div key={version.id} className="rounded-md border p-2 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><b>{version.title}</b><span className="text-xs text-muted-foreground">{new Date(version.created_at).toLocaleString("fr-FR")}</span></div><p className="mt-1 line-clamp-2 whitespace-pre-wrap text-xs text-muted-foreground">{version.content_text || "Version sans texte"}</p><p className="mt-1 text-xs text-muted-foreground">Par {collaboratorNames.get(version.changed_by_profile_id || "") || "Collaborateur"}</p></div>)}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><MessageSquare className="h-5 w-5" />Commentaires et échanges</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {comments.length === 0 ? <p className="text-sm text-muted-foreground">Aucun commentaire. Utilisez cet espace pour échanger sur le document.</p> : comments.map((comment) => <div key={comment.id} className="rounded-lg border p-3"><div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><b>{collaboratorNames.get(comment.author_profile_id) || "Collaborateur"}</b><span>{new Date(comment.created_at).toLocaleString("fr-FR")}</span></div><p className="mt-2 whitespace-pre-wrap text-sm">{comment.body}</p></div>)}
                <div className="flex flex-col gap-2 sm:flex-row"><Textarea value={commentDraft} onChange={(e) => setCommentDraft(e.target.value)} placeholder="Écrire un commentaire…" rows={2} /><Button onClick={() => void addComment()} disabled={saving || !commentDraft.trim()}><Send className="mr-2 h-4 w-4" />Envoyer</Button></div>
              </CardContent>
            </Card>
          </> : <Card><CardContent className="flex min-h-[260px] flex-col items-center justify-center gap-3 text-center"><History className="h-10 w-10 text-muted-foreground" /><h2 className="font-semibold">Votre espace de travail</h2><p className="max-w-md text-sm text-muted-foreground">Créez un document, partagez-le avec vos collègues, ajoutez des commentaires et conservez un historique des versions.</p><Button onClick={() => void createDocument()} disabled={saving}><Plus className="mr-2 h-4 w-4" />Créer le premier document</Button></CardContent></Card>}
        </div>
      </div>
    </div>
  </MainLayout></ProtectedRoute>;
}
