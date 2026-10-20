import { useRef, useState } from "react";
import { FileUp, FileText, FileSpreadsheet, Presentation, File as FileIcon, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import mammoth from "mammoth";
import PptxGenJS from "pptxgenjs";
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import { jsPDF } from "jspdf";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export type OfficeDocumentType = "document" | "spreadsheet" | "presentation" | "file";
type Props = {
  title: string;
  content: string;
  documentType: OfficeDocumentType;
  disabled?: boolean;
  onImport: (file: File, type: OfficeDocumentType, content: string) => Promise<void>;
};

const htmlToPlainText = (html: string) => {
  const doc = new DOMParser().parseFromString(html || "", "text/html");
  return (doc.body.textContent || "").replace(/\u00a0/g, " ").trim();
};
const safeFilename = (title: string, extension: string) =>
  (title.trim().replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-").slice(0, 100) || "document") + "." + extension;
const downloadBlob = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = name; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};
const readDocx = async (file: File) => {
  const buffer = await file.arrayBuffer();
  const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
  return result.value || "<p></p>";
};
const WORKBOOK_PREFIX = "__AGRICAPITAL_WORKBOOK_V1__\n";
const sheetToRows = (sheet: XLSX.WorkSheet): string[][] => {
  if (!sheet["!ref"]) return [[""]];
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  const rows: string[][] = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    const row: string[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })] as any;
      row.push(cell?.f ? "=" + cell.f : cell?.w ?? (cell?.v == null ? "" : String(cell.v)));
    }
    rows.push(row);
  }
  return rows;
};
const encodeCsvRows = (rows: string[][]) => rows.map((row) => row.map((cell) => /[;"\r\n]/.test(cell) ? '"' + cell.replace(/"/g, '""') + '"' : cell).join(";")).join("\n");
const readXlsx = async (file: File) => {
  const book = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  if (!book.SheetNames.length) throw new Error("Le classeur ne contient aucune feuille.");
  const sheets = book.SheetNames.map((name) => ({ name, rows: sheetToRows(book.Sheets[name]) }));
  return sheets.length === 1 ? encodeCsvRows(sheets[0].rows) : WORKBOOK_PREFIX + JSON.stringify({ sheets });
};
const buildWorksheet = (rows: any[][]): XLSX.WorkSheet => {
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  Object.keys(worksheet).filter((key) => !key.startsWith("!")).forEach((key) => {
    const cell = worksheet[key] as any;
    if (typeof cell.v === "string" && cell.v.startsWith("=") && cell.v.length > 1) {
      cell.f = cell.v.slice(1);
      delete cell.v;
      cell.t = "n";
    }
  });
  return worksheet;
};
const parseSpreadsheetContent = (content: string): { name: string; rows: any[][] }[] => {
  if (content.startsWith(WORKBOOK_PREFIX)) {
    try {
      const value = JSON.parse(content.slice(WORKBOOK_PREFIX.length));
      if (Array.isArray(value.sheets) && value.sheets.length) return value.sheets.map((sheet: any) => ({ name: String(sheet.name || "Feuille"), rows: Array.isArray(sheet.rows) ? sheet.rows : [[""]] }));
    } catch { /* fallback to CSV */ }
  }
  const book = XLSX.read(content, { type: "string", FS: ";" });
  const sheet = book.Sheets[book.SheetNames[0]];
  return [{ name: "Données", rows: sheet ? XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, raw: true }) : [] }];
};
const readPptx = async (file: File) => {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const names = Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => Number(a.match(/slide(\d+)/)?.[1] || 0) - Number(b.match(/slide(\d+)/)?.[1] || 0));
  if (!names.length) throw new Error("Aucune diapositive lisible n’a été trouvée dans ce fichier PowerPoint.");
  const slides: string[] = [];
  for (let i = 0; i < names.length; i++) {
    const xml = await zip.files[names[i]].async("text");
    const parsed = new DOMParser().parseFromString(xml, "application/xml");
    const paragraphs = Array.from(parsed.getElementsByTagName("a:p")).map((p) =>
      Array.from(p.getElementsByTagName("a:t")).map((t) => t.textContent || "").join("")
    ).filter((line) => line.trim());
    slides.push("DIAPOSITIVE " + (i + 1) + "\n" + paragraphs.join("\n"));
  }
  return slides.join("\n\n---\n\n");
};
const readPdf = async (file: File) => {
  const pdf = await getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const text = await page.getTextContent();
    const line = text.items.map((item: any) => typeof item.str === "string" ? item.str : "").join(" ");
    pages.push("Page " + i + "\n" + line);
  }
  return pages.join("\n\n");
};
const importFile = async (file: File): Promise<{ type: OfficeDocumentType; content: string }> => {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (["docx", "doc"].includes(ext || "")) {
    if (ext === "doc") throw new Error("Le format Word ancien (.doc) doit d’abord être converti en .docx ou PDF.");
    return { type: "document", content: await readDocx(file) };
  }
  if (["xlsx", "xls", "xlsm", "ods"].includes(ext || "")) {
    if (ext === "xlsm") throw new Error("Les macros Excel ne sont pas exécutées. Exportez une copie sans macros (.xlsx) avant l’import.");
    return { type: "spreadsheet", content: await readXlsx(file) };
  }
  if (["pptx"].includes(ext || "")) return { type: "presentation", content: await readPptx(file) };
  if (ext === "pdf") return { type: "document", content: "<h1>" + file.name.replace(/[<>]/g, "") + "</h1><p>Texte extrait du PDF. La mise en page, les images, les signatures et les annotations du PDF original ne sont pas converties en éléments éditables.</p><pre>" + (await readPdf(file)).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") + "</pre>" };
  if (["csv", "tsv", "txt"].includes(ext || "")) return { type: ext === "txt" ? "document" : "spreadsheet", content: await file.text() };
  throw new Error("Format non pris en charge pour la conversion directe. Formats reconnus : DOCX, XLSX, XLS, ODS, PPTX, PDF, CSV, TSV et TXT.");
};

function htmlToDocxParagraphs(html: string): Paragraph[] {
  const parsed = new DOMParser().parseFromString(html || "", "text/html");
  const blocks = Array.from(parsed.body.querySelectorAll("h1,h2,h3,p,li,blockquote,pre,div"));
  const roots = blocks.filter((el) => !blocks.some((other) => other !== el && other.contains(el)));
  const source = roots.length ? roots : [parsed.body];
  return source.flatMap((el) => {
    const text = (el.textContent || "").trim();
    if (!text) return [];
    const runs: TextRun[] = [];
    const walk = (node: Node, style: { bold?: boolean; italics?: boolean; underline?: object } = {}) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const t = node.textContent || "";
        if (t) runs.push(new TextRun({ text: t, ...style }));
      } else if (node instanceof Element) {
        const tag = node.tagName.toLowerCase();
        const next = { ...style, ...(tag === "b" || tag === "strong" ? { bold: true } : {}), ...(tag === "i" || tag === "em" ? { italics: true } : {}), ...(tag === "u" ? { underline: {} } : {}) };
        Array.from(node.childNodes).forEach((child) => walk(child, next));
      }
    };
    Array.from(el.childNodes).forEach((child) => walk(child));
    const heading = el.tagName.toLowerCase();
    return [new Paragraph({
      children: runs.length ? runs : [new TextRun(text)],
      heading: heading === "h1" ? HeadingLevel.HEADING_1 : heading === "h2" ? HeadingLevel.HEADING_2 : heading === "h3" ? HeadingLevel.HEADING_3 : undefined,
      bullet: heading === "li" ? { indent: 360 } : undefined,
      spacing: { after: 120 },
    })];
  });
}
async function exportDocx(title: string, content: string) {
  const paragraphs = htmlToDocxParagraphs(content);
  const doc = new Document({ sections: [{ properties: {}, children: paragraphs.length ? paragraphs : [new Paragraph("")] }] });
  downloadBlob(await Packer.toBlob(doc), safeFilename(title, "docx"));
}
async function exportXlsx(title: string, content: string) {
  const book = XLSX.utils.book_new();
  const sheets = parseSpreadsheetContent(content);
  sheets.forEach((sheet, index) => {
    const worksheet = buildWorksheet(sheet.rows);
    XLSX.utils.book_append_sheet(book, worksheet, (sheet.name || "Feuille " + (index + 1)).slice(0, 31) || "Feuille" + index);
  });
  const output = XLSX.write(book, { bookType: "xlsx", type: "array" });
  downloadBlob(new Blob([output], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), safeFilename(title, "xlsx"));
}
async function exportPdf(title: string, content: string) {
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const text = htmlToPlainText(content) || content;
  const lines = pdf.splitTextToSize(text, 515);
  let y = 48;
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(16);
  pdf.text(pdf.splitTextToSize(title || "Document AgriCapital", 515), 40, y);
  y += 28; pdf.setFont("helvetica", "normal"); pdf.setFontSize(10);
  for (const line of lines) {
    if (y > 790) { pdf.addPage(); y = 48; }
    pdf.text(String(line), 40, y); y += 14;
  }
  pdf.save(safeFilename(title, "pdf"));
}
async function exportPptx(title: string, content: string, documentType: OfficeDocumentType) {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "AgriCapital";
  pptx.subject = "Présentation exportée depuis l’Espace de travail AgriCapital";
  pptx.title = title || "Présentation AgriCapital";
  if (documentType === "spreadsheet") {
    const values = parseSpreadsheetContent(content)[0]?.rows || [];
    const slide = pptx.addSlide();
    slide.addText(title || "Analyse des données", { x: 0.55, y: 0.35, w: 12.2, h: 0.65, fontSize: 26, bold: true, color: "17365D" });
    const headers = (values[0] || []).map((v: any, i: number) => String(v ?? "Colonne " + (i + 1)));
    const body = values.slice(1).filter((row: any[]) => row.some((v) => v !== null && v !== undefined && String(v).trim() !== ""));
    if (headers.length && body.length) {
      const tableRows = [headers.map((text: string) => ({ text, options: { bold: true, color: "FFFFFF", fill: "17365D" } })), ...body.slice(0, 16).map((row: any[]) => headers.map((_: string, i: number) => String(row[i] ?? "")))];
      slide.addTable(tableRows as any, { x: 0.55, y: 1.15, w: 6.1, h: 5.2, border: { type: "solid", color: "D1D5DB", pt: 0.5 }, fontSize: 9, color: "263238", rowH: 0.28, margin: 0.05 });
      const labels = body.map((row: any[], i: number) => String(row[0] ?? "Ligne " + (i + 1))).slice(0, 12);
      const nums = body.map((row: any[]) => Number(row[1])).slice(0, 12);
      if (nums.length && nums.every((n) => Number.isFinite(n))) {
        slide.addChart(pptx.ChartType.bar, [{ name: headers[1] || "Valeur", labels, values: nums }], {
          x: 6.9, y: 1.35, w: 5.7, h: 4.6, catAxisLabelFontSize: 9, valAxisLabelFontSize: 9,
          showTitle: true, title: headers[1] || "Indicateurs", showLegend: false, showValue: true,
          showCatName: false, showValAxisTitle: false, showCatAxisTitle: false,
        });
      } else {
        slide.addText("Pour générer un graphique, placez des libellés en première colonne et des valeurs numériques en deuxième colonne.", { x: 6.9, y: 1.5, w: 5.6, h: 1.2, fontSize: 14, color: "6B7280", valign: "mid" });
      }
    } else {
      slide.addText("Ajoutez des en-têtes et des lignes de données au tableur pour créer un rapport.", { x: 0.8, y: 1.5, w: 11.5, h: 1.2, fontSize: 16 });
    }
    await pptx.writeFile({ fileName: safeFilename(title, "pptx") });
    return;
  }
  const slides = content.split(/\n\s*---+\s*\n/).filter((s) => s.trim());
  (slides.length ? slides : [""]).forEach((text, index) => {
    const slide = pptx.addSlide();
    const lines = text.replace(/<[^>]*>/g, "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const heading = (lines[0] || (title + " — " + (index + 1))).replace(/^DIAPOSITIVE\s*\d+/i, "").trim() || title || "Diapositive " + (index + 1);
    slide.addText(heading, { x: 0.55, y: 0.35, w: 12.2, h: 0.65, fontFace: "Aptos Display", fontSize: 26, bold: true, color: "17365D", breakLine: false });
    const body = lines.slice(1).join("\n");
    if (body) slide.addText(body, { x: 0.7, y: 1.25, w: 11.8, h: 5.4, fontFace: "Aptos", fontSize: 17, color: "263238", breakLine: false, valign: "top", bullet: false, paraSpaceAfterPt: 10 });
    slide.addText("AgriCapital  •  " + (index + 1), { x: 10.4, y: 7.05, w: 2.2, h: 0.2, fontSize: 9, color: "6B7280", align: "right" });
  });
  await pptx.writeFile({ fileName: safeFilename(title, "pptx") });
}

export default function OfficeFormatTools({ title, content, documentType, disabled = false, onImport }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const handleImport = async (file?: File) => {
    if (!file) return;
    setBusy(true); setStatus("Lecture du fichier…");
    try {
      const imported = await importFile(file);
      await onImport(file, imported.type, imported.content);
      setStatus("Import terminé : " + file.name);
      toast.success("Document importé dans l’Espace de travail.");
    } catch (error: any) {
      setStatus("");
      toast.error("Import impossible : " + (error?.message || "fichier invalide"));
    } finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  };
  const handleExport = async (kind: "docx" | "xlsx" | "pptx" | "pdf") => {
    setBusy(true);
    try {
      if (kind === "docx") await exportDocx(title, content);
      if (kind === "xlsx") await exportXlsx(title, content);
      if (kind === "pptx") await exportPptx(title, content, documentType);
      if (kind === "pdf") await exportPdf(title, content);
      toast.success("Export " + kind.toUpperCase() + " préparé.");
    } catch (error: any) { toast.error("Export impossible : " + (error?.message || "erreur inconnue")); }
    finally { setBusy(false); }
  };
  return <section className="space-y-2 rounded-lg border bg-muted/20 p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><p className="text-sm font-semibold">Formats bureautiques</p><p className="text-xs text-muted-foreground">Importer, convertir et réutiliser les contenus avec d’autres logiciels.</p></div>
      <Button type="button" variant="outline" size="sm" disabled={disabled || busy} onClick={() => fileRef.current?.click()}><FileUp className="mr-2 h-4 w-4" />Importer un fichier</Button>
      <input ref={fileRef} type="file" className="hidden" accept=".docx,.doc,.xlsx,.xls,.xlsm,.ods,.pptx,.pdf,.csv,.tsv,.txt" disabled={disabled || busy} onChange={(e) => void handleImport(e.target.files?.[0])} />
    </div>
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void handleExport("docx")}><FileText className="mr-2 h-4 w-4" />Word (.docx)</Button>
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void handleExport("xlsx")}><FileSpreadsheet className="mr-2 h-4 w-4" />Excel (.xlsx)</Button>
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void handleExport("pptx")}><Presentation className="mr-2 h-4 w-4" />PowerPoint (.pptx)</Button>
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void handleExport("pdf")}><FileIcon className="mr-2 h-4 w-4" />PDF</Button>
      {busy && <span className="inline-flex items-center text-xs text-muted-foreground"><LoaderCircle className="mr-1 h-4 w-4 animate-spin" />Traitement…</span>}
    </div>
    {status && <p className="text-xs text-muted-foreground">{status}</p>}
    <p className="text-xs text-muted-foreground">La conversion conserve le contenu textuel principal. Les mises en page complexes, macros, graphiques incorporés et certains objets Office peuvent nécessiter une vérification après conversion. Les fichiers d’origine peuvent rester joints au document pour référence.</p>
  </section>;
}
