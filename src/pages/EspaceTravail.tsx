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
import * as XLSX from "xlsx";

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
type WorkspaceCellStyle = { background?: string; color?: string; bold?: boolean; align?: "left" | "center" | "right"; format?: "general" | "number" | "currency" | "percent" | "date" };
type WorkspaceSheet = { name: string; rows: string[][]; styles?: Record<string, WorkspaceCellStyle>; conditionalFormatting?: boolean };
function parseWorkspaceWorkbook(input: string): WorkspaceSheet[] {
  if (input.startsWith(WORKSPACE_WORKBOOK_PREFIX)) {
    try {
      const parsed = JSON.parse(input.slice(WORKSPACE_WORKBOOK_PREFIX.length));
      if (Array.isArray(parsed.sheets) && parsed.sheets.length) {
        return parsed.sheets.map((sheet: any, index: number) => ({
          name: typeof sheet.name === "string" && sheet.name.trim() ? sheet.name : "Feuille " + (index + 1),
          rows: Array.isArray(sheet.rows) ? sheet.rows.map((row: any) => Array.isArray(row) ? row.map((cell: any) => String(cell ?? "")) : []) : [[""]],
          styles: sheet.styles && typeof sheet.styles === "object" ? sheet.styles : {},
          conditionalFormatting: Boolean(sheet.conditionalFormatting),
        }));
      }
    } catch { /* Fallback to legacy CSV if workbook metadata is damaged. */ }
  }
  return [{ name: "Feuille 1", rows: parseWorkspaceCsv(input) }];
}
function encodeWorkspaceWorkbook(sheets: WorkspaceSheet[]): string {
  const clean = sheets.map((sheet) => ({ name: sheet.name, rows: sheet.rows, styles: sheet.styles || {}, conditionalFormatting: Boolean(sheet.conditionalFormatting) }));
  if (clean.length <= 1 && !Object.keys(clean[0]?.styles || {}).length && !clean[0]?.conditionalFormatting) return encodeWorkspaceCsv(clean[0]?.rows || [[""]]);
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
  const [activeCell, setActiveCell] = useState({ r: 0, c: 0 });
  const [formulaInput, setFormulaInput] = useState("");
  const workbook = parseWorkspaceWorkbook(value);
  const activeIndex = Math.min(activeSheet, workbook.length - 1);
  const active = workbook[activeIndex] || { name: "Feuille 1", rows: [[""]], styles: {}, conditionalFormatting: false };
  const parsed = active.rows;
  const rowCount = Math.min(200, Math.max(20, parsed.length));
  const colCount = Math.min(40, Math.max(12, ...parsed.map((row) => row.length)));
  const rows = Array.from({ length: rowCount }, (_, r) => Array.from({ length: colCount }, (_, c) => parsed[r]?.[c] || ""));
  const cellKey = (r: number, c: number) => r + ":" + c;
  const currentValue = parsed[activeCell.r]?.[activeCell.c] || "";
  const currentStyle = active.styles?.[cellKey(activeCell.r, activeCell.c)] || {};
  useEffect(() => setFormulaInput(currentValue), [activeIndex, activeCell.r, activeCell.c, currentValue]);
  const chartData = parsed.slice(1).map((row) => ({ label: (row[0] || "").trim(), value: Number(evaluateWorkspaceCell(row[1] || "", parsed).replace(",", ".")) }))
    .filter((item) => item.label && Number.isFinite(item.value)).slice(0, 12);
  const chartMax = Math.max(1, ...chartData.map((item) => Math.abs(item.value)));
  const updateSheet = (patch: Partial<WorkspaceSheet>) => {
    const next = workbook.map((sheet, index) => index === activeIndex ? { ...sheet, ...patch } : sheet);
    onChange(encodeWorkspaceWorkbook(next));
  };
  const updateCell = (r: number, c: number, next: string) => {
    const updatedRows = parsed.map((row) => [...row]);
    while (updatedRows.length <= r) updatedRows.push([]);
    while (updatedRows[r].length <= c) updatedRows[r].push("");
    updatedRows[r][c] = next;
    updateSheet({ rows: updatedRows });
  };
  const updateStyle = (patch: Partial<WorkspaceCellStyle>) => {
    const styles = { ...(active.styles || {}), [cellKey(activeCell.r, activeCell.c)]: { ...currentStyle, ...patch } };
    updateSheet({ styles });
  };
  const addSheet = () => {
    const nextName = "Feuille " + (workbook.length + 1);
    onChange(encodeWorkspaceWorkbook([...workbook, { name: nextName, rows: [[""]], styles: {}, conditionalFormatting: false }]));
    setActiveSheet(workbook.length); setActiveCell({ r: 0, c: 0 });
  };
  const removeSheet = () => {
    if (workbook.length <= 1 || !window.confirm("Supprimer la feuille « " + active.name + " » ?")) return;
    const next = workbook.filter((_, index) => index !== activeIndex);
    onChange(encodeWorkspaceWorkbook(next)); setActiveSheet(Math.max(0, activeIndex - 1));
  };
  const exportCsv = () => {
    const blob = new Blob(["\uFEFF" + encodeWorkspaceCsv(parsed)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a");
    link.href = url; link.download = (titleSafe(active.name) || "tableur") + ".csv"; link.click(); URL.revokeObjectURL(url);
  };
  const importFile = async (file?: File) => {
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) { window.alert("Le fichier ne doit pas dépasser 15 Mo."); return; }
    try {
      const lower = file.name.toLowerCase();
      if (lower.endsWith(".csv") || lower.endsWith(".txt")) {
        const imported = parseWorkspaceCsv(await file.text());
        onChange(encodeWorkspaceWorkbook([{ name: file.name.replace(/\.[^.]+$/, "").slice(0, 31) || "Feuille 1", rows: imported, styles: {}, conditionalFormatting: false }]));
      } else {
        const bytes = await file.arrayBuffer();
        const book = XLSX.read(bytes, { type: "array", cellDates: true, cellStyles: true, bookVBA: true });
        const sheets: WorkspaceSheet[] = book.SheetNames.map((name) => {
          const sheet = book.Sheets[name];
          const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
          const matrix: string[][] = [];
          for (let r = range.s.r; r <= Math.min(range.e.r, 199); r++) {
            const row: string[] = [];
            for (let c = range.s.c; c <= Math.min(range.e.c, 39); c++) {
              const cell = sheet[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined;
              row[c] = cell ? (cell.f ? "=" + cell.f : cell.w ?? (cell.v instanceof Date ? cell.v.toISOString().slice(0, 10) : String(cell.v ?? ""))) : "";
            }
            matrix[r] = row;
          }
          return { name: name.slice(0, 31), rows: matrix.length ? matrix : [[""]], styles: {}, conditionalFormatting: false };
        });
        onChange(encodeWorkspaceWorkbook(sheets.length ? sheets : [{ name: "Feuille 1", rows: [[""]], styles: {}, conditionalFormatting: false }]));
        toast.success("Classeur importé. Les valeurs et formules reconnues sont chargées ; les fonctions Excel avancées peuvent nécessiter Excel ou un moteur spécialisé.");
      }
    } catch (error: any) { toast.error("Import impossible : " + (error?.message || "format non reconnu")); }
  };
  const exportXlsx = () => {
    try {
      const book = XLSX.utils.book_new();
      workbook.forEach((sheet) => {
        const data = sheet.rows.map((row) => row.map((raw) => raw.trim().startsWith("=") ? { f: raw.trim().slice(1) } : raw));
        const ws = XLSX.utils.aoa_to_sheet(data);
        XLSX.utils.book_append_sheet(book, ws, (sheet.name || "Feuille").slice(0, 31));
      });
      XLSX.writeFile(book, "agricapital-" + (titleSafe(active.name) || "classeur") + ".xlsx", { bookType: "xlsx", cellStyles: true });
      toast.success("Classeur XLSX exporté.");
    } catch (error: any) { toast.error("Export XLSX impossible : " + (error?.message || "erreur inconnue")); }
  };
  const formatted = (raw: string, style: WorkspaceCellStyle) => {
    const result = raw.trim().startsWith("=") ? evaluateWorkspaceCell(raw, parsed) : raw;
    const n = Number(result.replace(",", "."));
    if (result.trim() !== "" && Number.isFinite(n) && style.format && style.format !== "general") {
      if (style.format === "percent") return new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 2 }).format(n);
      if (style.format === "currency") return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "XOF", maximumFractionDigits: 0 }).format(n);
      if (style.format === "number") return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 4 }).format(n);
    }
    return result;
  };
  return <div className="workspace-spreadsheet min-w-0 max-w-full space-y-3">
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0"><p className="text-sm font-semibold">Tableur AgriCapital</p><p className="text-xs text-muted-foreground">Formules, feuilles multiples, styles, import/export Excel et CSV.</p></div>
        <div className="flex max-w-full flex-wrap gap-2">
          <label className="cursor-pointer rounded-md border px-3 py-2 text-xs hover:bg-muted">Importer Excel / CSV<input type="file" accept=".xlsx,.xls,.xlsm,.csv,.txt" className="hidden" disabled={disabled} onChange={(e) => { void importFile(e.target.files?.[0]); e.currentTarget.value = ""; }} /></label>
          <button type="button" onClick={exportXlsx} disabled={disabled} className="rounded-md border px-3 py-2 text-xs hover:bg-muted">Exporter XLSX</button>
          <button type="button" onClick={exportCsv} disabled={disabled} className="rounded-md border px-3 py-2 text-xs hover:bg-muted">Exporter CSV</button>
        </div>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-1 rounded-lg border bg-muted/20 p-2">
        <span className="rounded border bg-background px-2 py-1.5 text-xs font-semibold">{spreadsheetColumn(activeCell.c)}{activeCell.r + 1}</span>
        <input aria-label="Contenu ou formule de la cellule sélectionnée" value={formulaInput} onChange={(e) => setFormulaInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") updateCell(activeCell.r, activeCell.c, formulaInput); }} disabled={disabled} className="min-w-[120px] flex-1 rounded border bg-background px-2 py-1.5 text-sm" placeholder="Valeur ou formule, ex. =SUM(A1:A5)" />
        <button type="button" disabled={disabled} onClick={() => updateCell(activeCell.r, activeCell.c, formulaInput)} className="rounded border bg-background px-3 py-1.5 text-xs">Appliquer</button>
        <button type="button" title="Gras" disabled={disabled} onClick={() => updateStyle({ bold: !currentStyle.bold })} className={"rounded border px-3 py-1.5 text-xs " + (currentStyle.bold ? "bg-primary/10" : "bg-background")}>B</button>
        <select aria-label="Couleur de fond" disabled={disabled} value={currentStyle.background || ""} onChange={(e) => updateStyle({ background: e.target.value || undefined })} className="max-w-full rounded border bg-background px-2 py-1.5 text-xs"><option value="">Fond</option><option value="#fff2cc">Jaune</option><option value="#d9ead3">Vert</option><option value="#cfe2f3">Bleu</option><option value="#f4cccc">Rouge</option><option value="#eadcf8">Violet</option><option value="#ffffff">Blanc</option></select>
        <select aria-label="Couleur du texte" disabled={disabled} value={currentStyle.color || ""} onChange={(e) => updateStyle({ color: e.target.value || undefined })} className="max-w-full rounded border bg-background px-2 py-1.5 text-xs"><option value="">Texte</option><option value="#111827">Noir</option><option value="#166534">Vert</option><option value="#1d4ed8">Bleu</option><option value="#b91c1c">Rouge</option><option value="#ffffff">Blanc</option></select>
        <select aria-label="Alignement de cellule" disabled={disabled} value={currentStyle.align || "left"} onChange={(e) => updateStyle({ align: e.target.value as WorkspaceCellStyle["align"] })} className="max-w-full rounded border bg-background px-2 py-1.5 text-xs"><option value="left">Gauche</option><option value="center">Centrer</option><option value="right">Droite</option></select>
        <select aria-label="Format numérique" disabled={disabled} value={currentStyle.format || "general"} onChange={(e) => updateStyle({ format: e.target.value as WorkspaceCellStyle["format"] })} className="max-w-full rounded border bg-background px-2 py-1.5 text-xs"><option value="general">Général</option><option value="number">Nombre</option><option value="currency">FCFA</option><option value="percent">Pourcentage</option></select>
        <label className="flex items-center gap-1 rounded border bg-background px-2 py-1.5 text-xs"><input type="checkbox" checked={Boolean(active.conditionalFormatting)} disabled={disabled} onChange={(e) => updateSheet({ conditionalFormatting: e.target.checked })} />Couleurs automatiques</label>
      </div>
    </div>
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      {workbook.map((sheet, index) => <button type="button" key={sheet.name + index} onClick={() => setActiveSheet(index)} className={"max-w-full truncate rounded-md border px-3 py-1.5 text-xs " + (index === activeIndex ? "border-primary bg-primary/10 font-semibold" : "bg-background hover:bg-muted")}>{sheet.name}</button>)}
      <button type="button" disabled={disabled} onClick={addSheet} className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted">+ Feuille</button>
      <button type="button" disabled={disabled || workbook.length <= 1} onClick={removeSheet} className="rounded-md border px-3 py-1.5 text-xs text-destructive hover:bg-muted">Supprimer la feuille</button>
    </div>
    <div className="w-full max-w-full overflow-x-auto overflow-y-auto rounded-lg border overscroll-x-contain" style={{ maxHeight: "min(62vh, 560px)" }}>
      <table className="w-max min-w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-muted"><tr><th className="sticky left-0 z-20 min-w-10 border bg-muted p-2 text-xs text-muted-foreground">#</th>{Array.from({ length: colCount }, (_, c) => <th key={c} className="min-w-28 border p-2 text-xs font-semibold">{spreadsheetColumn(c)}</th>)}</tr></thead>
        <tbody>{rows.map((row, r) => <tr key={r}><th className="sticky left-0 z-[1] border bg-muted/80 p-1 text-xs text-muted-foreground">{r + 1}</th>{row.map((cell, c) => {
          const style = active.styles?.[cellKey(r, c)] || {};
          const numeric = Number(formatted(cell, style).replace(/[^\d,.-]/g, "").replace(",", "."));
          const autoColor = active.conditionalFormatting && cell.trim() !== "" && Number.isFinite(numeric) ? (numeric < 0 ? "#fee2e2" : numeric > 0 ? "#dcfce7" : "#fef3c7") : undefined;
          const selectedCell = activeCell.r === r && activeCell.c === c;
          return <td key={c} className={"border p-0 " + (selectedCell ? "outline outline-2 outline-primary outline-offset-[-2px]" : "")}><div className="flex min-w-28 flex-col"><input aria-label={spreadsheetColumn(c) + (r + 1)} value={cell} onFocus={() => { setActiveCell({ r, c }); setFormulaInput(cell); }} onChange={(e) => updateCell(r, c, e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { setActiveCell({ r: Math.min(rowCount - 1, r + 1), c }); } if (e.key === "Tab") { e.preventDefault(); setActiveCell({ r, c: Math.min(colCount - 1, c + 1) }); } }} disabled={disabled} className="w-full min-w-28 bg-transparent px-2 py-1.5 outline-none focus:bg-primary/5" style={{ backgroundColor: autoColor || style.background, color: style.color, fontWeight: style.bold ? 700 : undefined, textAlign: style.align || "left" }} /><span className="min-h-4 truncate px-2 pb-1 text-[11px] text-muted-foreground" title={cell.trim().startsWith("=") ? formatted(cell, style) : ""}>{cell.trim().startsWith("=") ? formatted(cell, style) : ""}</span></div></td>;
        })}</tr>)}</tbody>
      </table>
    </div>
    {chartData.length > 0 && <div className="min-w-0 space-y-3 rounded-lg border bg-background p-3">
      <div><p className="text-sm font-semibold">Aperçu du graphique</p><p className="text-xs text-muted-foreground">Libellés : première colonne · Indicateurs : deuxième colonne</p></div>
      <div className="space-y-2">{chartData.map((item, index) => <div key={item.label + index} className="grid grid-cols-[minmax(70px,1fr)_minmax(60px,3fr)_70px] items-center gap-2 text-xs">
        <span className="truncate" title={item.label}>{item.label}</span><div className="h-5 overflow-hidden rounded bg-muted"><div className="h-full rounded bg-primary/80" style={{ width: Math.max(1, Math.abs(item.value) / chartMax * 100) + "%" }} /></div><span className="text-right tabular-nums">{item.value.toLocaleString("fr-FR")}</span>
      </div>)}</div>
    </div>}
    <p className="text-xs text-muted-foreground">Les formules sont calculées dans l’interface. Les styles et les feuilles sont conservés dans le CRM. Les classeurs complexes, macros, coédition native et calculs Excel complets nécessitent un moteur spécialisé ; l’export XLSX standard conserve les données et formules simples mais pas nécessairement tous les styles Excel avancés.</p>
  </div>;
}
function titleSafe(value: string) { return value.replace(/[\\/:*?"<>|]+/g, "-").trim().slice(0, 60); }


type WorkspaceSlide = { title: string; body: string };
function parseWorkspaceSlides(content: string): WorkspaceSlide[] {
  const parts = content.split(/\n\s*---+\s*\n/).filter((part) => part.trim());
  if (!parts.length) return [{ title: "Nouvelle diapositive", body: "" }];
  return parts.map((part, index) => {
    const lines = part.split(/\r?\n/);
    if (/^DIAPOSITIVE\s+\d+/i.test((lines[0] || "").trim())) lines.shift();
    const title = (lines.shift() || "").trim() || "Diapositive " + (index + 1);
    return { title, body: lines.join("\n").trim() };
  });
}
function encodeWorkspaceSlides(slides: WorkspaceSlide[]) {
  return slides.map((slide) => [slide.title.trim() || "Diapositive", slide.body].join("\n")).join("\n\n---\n\n");
}
function WorkspaceSlidesEditor({ value, onChange, disabled }: { value: string; onChange: (next: string) => void; disabled: boolean }) {
  const slides = parseWorkspaceSlides(value);
  const [active, setActive] = useState(0);
  const index = Math.min(active, slides.length - 1);
  const slide = slides[index];
  const update = (patch: Partial<WorkspaceSlide>) => onChange(encodeWorkspaceSlides(slides.map((item, i) => i === index ? { ...item, ...patch } : item)));
  const add = () => {
    const next = [...slides, { title: "Nouvelle diapositive", body: "" }];
    onChange(encodeWorkspaceSlides(next)); setActive(next.length - 1);
  };
  const remove = () => {
    if (slides.length <= 1 || !window.confirm("Supprimer cette diapositive ?")) return;
    const next = slides.filter((_, i) => i !== index);
    onChange(encodeWorkspaceSlides(next)); setActive(Math.max(0, index - 1));
  };
  const move = (offset: number) => {
    const target = index + offset;
    if (target < 0 || target >= slides.length) return;
    const next = [...slides];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(encodeWorkspaceSlides(next)); setActive(target);
  };
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><Label>Présentation</Label><p className="text-xs text-muted-foreground">{slides.length} diapositive(s) · modifiez le titre et le contenu, puis enregistrez le document.</p></div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={disabled || index === 0} onClick={() => move(-1)}>Monter</Button>
        <Button type="button" variant="outline" size="sm" disabled={disabled || index === slides.length - 1} onClick={() => move(1)}>Descendre</Button>
        <Button type="button" variant="outline" size="sm" disabled={disabled || slides.length <= 1} onClick={remove}><Trash2 className="mr-1 h-4 w-4" />Supprimer</Button>
        <Button type="button" size="sm" disabled={disabled} onClick={add}><Plus className="mr-1 h-4 w-4" />Ajouter une diapositive</Button>
      </div>
    </div>
    <div className="grid gap-3 lg:grid-cols-[190px_minmax(0,1fr)]">
      <div className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-y-auto">
        {slides.map((item, i) => <button type="button" key={i} onClick={() => setActive(i)} className={"min-w-[150px] rounded-lg border p-2 text-left lg:min-w-0 " + (i === index ? "border-primary bg-primary/5" : "hover:bg-muted/50")}>
          <div className="mb-2 flex aspect-video items-center justify-center rounded border bg-background p-2 text-center text-xs font-semibold">{item.title || "Diapositive " + (i + 1)}</div>
          <p className="truncate text-xs font-medium">{i + 1}. {item.title || "Sans titre"}</p>
          <p className="line-clamp-2 text-[11px] text-muted-foreground">{item.body || "Contenu vide"}</p>
        </button>)}
      </div>
      <div className="space-y-3">
        <div className="flex aspect-video flex-col justify-center overflow-hidden rounded-xl border bg-background p-5 shadow-sm sm:p-8">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-primary">AgriCapital · {index + 1}/{slides.length}</p>
          <h3 className="mb-4 text-xl font-bold sm:text-3xl">{slide.title || "Titre de la diapositive"}</h3>
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground sm:text-base">{slide.body || "Le contenu de cette diapositive apparaîtra ici."}</p>
        </div>
        <div className="space-y-1"><Label>Titre de la diapositive</Label><Input value={slide.title} disabled={disabled} onChange={(e) => update({ title: e.target.value })} placeholder="Titre clair et concis" /></div>
        <div className="space-y-1"><Label>Texte et notes</Label><Textarea value={slide.body} disabled={disabled} onChange={(e) => update({ body: e.target.value })} className="min-h-[180px]" placeholder="Contenu, chiffres clés, indicateurs et notes…" /></div>
      </div>
    </div>
    <p className="text-xs text-muted-foreground">L’export PPTX crée des diapositives éditables à partir de ce contenu. Les thèmes complexes, animations, transitions et objets du fichier PowerPoint original ne sont pas reproduits intégralement lors d’une conversion.</p>
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
    <div className="workspace-root min-w-0 max-w-full space-y-5 overflow-x-clip">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div><h1 className="text-2xl font-bold">Espace de travail</h1><p className="text-sm text-muted-foreground">Documents partagés, commentaires et collaboration des équipes.</p></div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void loadDocuments()} disabled={loading}><RefreshCw className="mr-2 h-4 w-4" />Actualiser</Button>
          <Button onClick={() => void createDocument()} disabled={saving}><Plus className="mr-2 h-4 w-4" />Nouveau document</Button>
        </div>
      </div>
      <div className="rounded-xl border p-3 text-sm"><b>Documents et formats ouverts</b><p className="mt-1 text-muted-foreground">Importez un fichier pour en extraire le contenu éditable, conservez l’original en pièce jointe et exportez vos travaux vers les formats bureautiques courants. Aucune installation de serveur bureautique n’est requise pour ces fonctions intégrées.</p></div>
      {officeUrl && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"><div><b>Suite bureautique connectée</b><p className="text-sm text-muted-foreground">Ouvrir la suite pour créer ou modifier des fichiers compatibles.</p></div><Button variant="outline" onClick={() => window.open(officeUrl, "_blank", "noopener,noreferrer")}><ExternalLink className="mr-2 h-4 w-4" />Ouvrir la suite</Button></div>}
      <OfficeFormatTools title={title || "Document AgriCapital"} content={content} documentType={documentType} disabled={saving} onImport={importOfficeDocument} />
      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(240px,0.8fr)_minmax(0,1.8fr)]">
        <Card className="min-w-0">
          <CardHeader><CardTitle className="flex items-center gap-2"><FolderOpen className="h-5 w-5" />Mes documents et partages</CardTitle></CardHeader>
          <CardContent className="min-w-0 space-y-2">
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
              <CardContent className="min-w-0 space-y-4">
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
                  <div className="space-y-1"><Label>Titre</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} disabled={saving} /></div>
                  <div className="space-y-1"><Label>Type de contenu</Label><Select value={documentType} onValueChange={(v: any) => setDocumentType(v)} disabled={saving}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="document">Document texte</SelectItem><SelectItem value="spreadsheet">Tableur / données CSV</SelectItem><SelectItem value="presentation">Présentation / notes de réunion</SelectItem><SelectItem value="file">Fichier partagé</SelectItem></SelectContent></Select></div>
                </div>
                <>{documentType === "document" ? <>
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
                  <div className="space-y-1"><Label>Contenu du document</Label><div ref={editorRef} contentEditable={!saving && canEditSelected} suppressContentEditableWarning dangerouslySetInnerHTML={{ __html: sanitizeWorkspaceHtml(content) }} onInput={() => setHasUnsavedChanges(true)} onBlur={() => { if (editorRef.current) setContent(editorRef.current.innerHTML); }} role="textbox" aria-multiline="true" className="min-h-[320px] rounded-lg border bg-background p-4 text-sm leading-7 outline-none focus-visible:ring-2 focus-visible:ring-ring [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-xl [&_h2]:font-semibold [&_li]:ml-6 [&_li]:list-disc [&_ol_li]:list-decimal [&_p]:my-2 [&_table]:w-full [&_td]:border [&_td]:p-2 [&_th]:border [&_th]:p-2" /></div>
                </> : documentType === "presentation" ? <WorkspaceSlidesEditor value={content} onChange={(next) => { setContent(next); setHasUnsavedChanges(true); }} disabled={saving || !canEditSelected} key={selectedId} /> : <div className="space-y-1"><Label>{documentType === "spreadsheet" ? "Tableur" : "Contenu du fichier"}</Label>{documentType === "spreadsheet" ? <WorkspaceSpreadsheet value={content} onChange={(next) => { setContent(next); setHasUnsavedChanges(true); }} disabled={saving || !canEditSelected} key={selectedId} /> : <Textarea className="min-h-[260px] font-mono text-sm" value={content} onChange={(e) => { setContent(e.target.value); setHasUnsavedChanges(true); }} placeholder="Contenu du fichier…" disabled={saving || !canEditSelected} />}</div>}</>
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
