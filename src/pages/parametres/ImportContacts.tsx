import { useMemo, useRef, useState } from "react";
import MainLayout from "@/components/layout/MainLayout";
import { PERMISSIONS } from "@/lib/roles";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Contact, FileUp, Users, UserPlus, Loader2, Search } from "lucide-react";

type ImportedContact = { key: string; nom: string; prenoms: string; telephone: string; telephone_secondaire: string; email: string; whatsapp_principal: boolean; whatsapp_secondaire: boolean; selected: boolean; source: string };
const normalizePhone = (value: string) => value.replace(/[^0-9+]/g, "").replace(/^00/, "+");
const contactKey = (name: string, phone: string) => (normalizePhone(phone) || name.trim().toLowerCase());
function parseVCard(text: string): ImportedContact[] {
  const cards = text.replace(/\r/g, "").split(/BEGIN:VCARD/i).slice(1);
  return cards.map((raw, index) => {
    const block = raw.split(/END:VCARD/i)[0];
    const lines = block.replace(/\n[ \t]/g, "").split("\n");
    const get = (prefix: string) => lines.find((line) => line.toUpperCase().startsWith(prefix))?.split(":").slice(1).join(":").trim() || "";
    const fn = get("FN");
    const n = get("N");
    const parts = n.split(";").map((part) => part.trim());
    const phoneLines = lines.filter((line) => /^TEL(?:;|:)/i.test(line));
    const phones = phoneLines.map((line) => line.split(":").slice(1).join(":").trim()).filter(Boolean);
    const email = lines.find((line) => /^EMAIL(?:;|:)/i.test(line))?.split(":").slice(1).join(":").trim() || "";
    const name = fn || [parts[1], parts[0]].filter(Boolean).join(" ");
    const words = name.trim().split(/\s+/);
    const phone = normalizePhone(phones[0] || "");
    return { key: contactKey(name, phone) || String(index), nom: words.length > 1 ? words.slice(1).join(" ") : words[0] || "", prenoms: words.length > 1 ? words[0] : "", telephone: phone, telephone_secondaire: normalizePhone(phones[1] || ""), email, whatsapp_principal: false, whatsapp_secondaire: false, selected: Boolean(phone), source: "vCard" };
  }).filter((item) => item.nom || item.prenoms || item.telephone || item.email);
}
function parseCsv(text: string): ImportedContact[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const split = (line: string) => line.match(/(?:^|,)(?:"((?:[^"]|"")*)"|([^,]*))/g)?.map((v) => v.replace(/^,/, "").replace(/^"|"$/g, "").replace(/""/g, '"').trim()) || [];
  const headers = split(lines[0]).map((v) => v.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
  const col = (names: string[]) => headers.findIndex((h) => names.some((name) => h.includes(name)));
  const nameIndex = col(["nom complet", "fullname", "name", "nom"]);
  const firstIndex = col(["prenom", "first name", "given"]);
  const phoneIndex = col(["telephone principal", "telephone", "phone", "mobile", "tel"]);
  const secondIndex = col(["telephone secondaire", "second phone", "phone2"]);
  const emailIndex = col(["email", "e-mail", "courriel"]);
  return lines.slice(1).map((line, index) => {
    const cells = split(line);
    const full = nameIndex >= 0 ? cells[nameIndex] || "" : "";
    const words = full.trim().split(/\s+/).filter(Boolean);
    const phone = normalizePhone(phoneIndex >= 0 ? cells[phoneIndex] || "" : "");
    return { key: contactKey(full, phone) || String(index), nom: words.length > 1 ? words.slice(1).join(" ") : full, prenoms: firstIndex >= 0 ? cells[firstIndex] || (words.length > 1 ? words[0] : "") : words.length > 1 ? words[0] : "", telephone: phone, telephone_secondaire: normalizePhone(secondIndex >= 0 ? cells[secondIndex] || "" : ""), email: emailIndex >= 0 ? cells[emailIndex] || "" : "", whatsapp_principal: false, whatsapp_secondaire: false, selected: Boolean(phone), source: "CSV" };
  }).filter((item) => item.nom || item.prenoms || item.telephone || item.email);
}
export default function ImportContacts() {
  const [contacts, setContacts] = useState<ImportedContact[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const selected = contacts.filter((contact) => contact.selected && contact.telephone);
  const filtered = useMemo(() => contacts.filter((contact) => [contact.nom, contact.prenoms, contact.telephone, contact.email].join(" ").toLowerCase().includes(search.toLowerCase())), [contacts, search]);
  const setContact = (key: string, patch: Partial<ImportedContact>) => setContacts((all) => all.map((contact) => contact.key === key ? { ...contact, ...patch } : contact));
  const mergeContacts = (incoming: ImportedContact[]) => {
    setContacts((previous) => {
      const map = new Map(previous.map((contact) => [contact.key, contact]));
      incoming.forEach((contact) => { const old = map.get(contact.key); map.set(contact.key, old ? { ...old, ...contact, selected: old.selected || contact.selected } : contact); });
      return [...map.values()];
    });
    toast({ title: "Contacts importés", description: incoming.length + " contact(s) lus. Vérifiez les numéros et cochez ceux à convertir en leads." });
  };
  const pickPhoneContacts = async () => {
    const picker = (navigator as any).contacts;
    if (!picker?.select) {
      toast({ variant: "destructive", title: "Répertoire direct non pris en charge", description: "Ce navigateur ne permet pas l'accès au répertoire. Exportez les contacts en .vcf ou .csv puis importez le fichier." });
      return;
    }
    try {
      const picked = await picker.select(["name", "tel", "email"], { multiple: true });
      const incoming: ImportedContact[] = (picked || []).map((item: any, index: number) => {
        const full = String(item.name?.[0] || "").trim();
        const words = full.split(/\s+/).filter(Boolean);
        const phones = (item.tel || []).map(normalizePhone).filter(Boolean);
        const phone = phones[0] || "";
        return { key: contactKey(full, phone) || String(index), nom: words.length > 1 ? words.slice(1).join(" ") : full, prenoms: words.length > 1 ? words[0] : "", telephone: phone, telephone_secondaire: phones[1] || "", email: item.email?.[0] || "", whatsapp_principal: false, whatsapp_secondaire: false, selected: Boolean(phone), source: "Téléphone" };
      });
      mergeContacts(incoming);
    } catch (error: any) {
      if (error?.name !== "AbortError") toast({ variant: "destructive", title: "Import impossible", description: "Autorisez l'accès au répertoire puis réessayez, ou importez un fichier vCard/CSV." });
    }
  };
  const importFile = async (file?: File) => {
    if (!file) return;
    try {
      const text = await file.text();
      const incoming = /\.vcf$/i.test(file.name) || /BEGIN:VCARD/i.test(text) ? parseVCard(text) : parseCsv(text);
      if (!incoming.length) throw new Error("Aucun contact exploitable. Utilisez un fichier .vcf ou un CSV avec les colonnes nom, téléphone et éventuellement email.");
      mergeContacts(incoming);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Fichier non exploitable", description: error?.message || "Vérifiez le format du fichier." });
    } finally { if (fileRef.current) fileRef.current.value = ""; }
  };
  const generateLeads = async () => {
    if (!user?.id) { toast({ variant: "destructive", title: "Session expirée", description: "Reconnectez-vous avant de créer des leads." }); return; }
    if (!selected.length) { toast({ variant: "destructive", title: "Aucun contact sélectionné", description: "Cochez au moins un contact avec un téléphone principal." }); return; }
    setLoading(true);
    try {
      const readPhonePages = async (table: "leads" | "prospects") => {
        const all: any[] = [];
        for (let offset = 0; ; offset += 1000) {
          const result = await (supabase as any).from(table).select("telephone,telephone_secondaire").range(offset, offset + 999);
          if (result.error) throw result.error;
          all.push(...(result.data || []));
          if (!result.data || result.data.length < 1000) break;
        }
        return all;
      };
      const [leadRows, prospectRows] = await Promise.all([readPhonePages("leads"), readPhonePages("prospects")]);
      const existingPhones = new Set([...leadRows, ...prospectRows].flatMap((row: any) =>
        [row.telephone, row.telephone_secondaire].map((value) => normalizePhone(String(value || ""))).filter(Boolean)
      ));
      const rows = selected.filter((contact) => !existingPhones.has(normalizePhone(contact.telephone))).map((contact) => ({
        nom: contact.nom || contact.prenoms || "Contact importé",
        prenoms: contact.prenoms || null,
        telephone: normalizePhone(contact.telephone),
        telephone_secondaire: normalizePhone(contact.telephone_secondaire) || null,
        whatsapp: contact.whatsapp_principal ? normalizePhone(contact.telephone) : contact.whatsapp_secondaire ? normalizePhone(contact.telephone_secondaire) : null,
        telephone_principal_whatsapp: contact.whatsapp_principal,
        telephone_secondaire_whatsapp: contact.whatsapp_secondaire,
        email: contact.email || null,
        statut: "nouveau",
        etape_pipeline: "lead",
        type_lead: "client",
        mode_contact_prefere: contact.whatsapp_principal || contact.whatsapp_secondaire ? "whatsapp" : "appel",
        assigned_to: user.id,
        created_by: user.id,
        metadata: { source_import: "repertoire_telephone", source_contact: contact.source, imported_at: new Date().toISOString() }
      }));
      if (!rows.length) {
        toast({ title: "Aucun doublon créé", description: "Tous les numéros sélectionnés existent déjà dans les leads." });
        return;
      }
      const { error } = await (supabase as any).from("leads").insert(rows);
      if (error) throw error;
      const added = new Set(rows.map((row: any) => normalizePhone(row.telephone)));
      setContacts((all) => all.map((contact) => added.has(normalizePhone(contact.telephone)) ? { ...contact, selected: false } : contact));
      toast({ title: "Leads créés", description: rows.length + " lead(s) ajouté(s). Les numéros déjà présents ont été ignorés." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Création interrompue", description: error?.message || "Impossible de créer les leads. Aucun succès ne sera annoncé sans confirmation de la base." });
    } finally { setLoading(false); }
  };
  return <ProtectedRoute requiredPermission={PERMISSIONS.VIEW_PARAMETRES}><MainLayout><div className="mx-auto max-w-7xl space-y-5">
    <div><h1 className="text-2xl font-bold">Importer les contacts</h1><p className="text-sm text-muted-foreground">Sélectionnez des contacts depuis le téléphone ou importez un fichier. Aucun message n'est envoyé pendant l'import.</p></div>
    <div className="grid gap-4 md:grid-cols-2">
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><Contact className="h-5 w-5"/>Répertoire du téléphone</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-sm text-muted-foreground">Selon le navigateur et l'appareil, vous pourrez sélectionner plusieurs contacts. L'accès automatique à tout le répertoire n'est pas autorisé par les navigateurs.</p><Button onClick={() => void pickPhoneContacts()} className="w-full"><Users className="mr-2 h-4 w-4"/>Choisir des contacts</Button></CardContent></Card>
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><FileUp className="h-5 w-5"/>Importer un fichier</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-sm text-muted-foreground">Formats acceptés : vCard (.vcf) ou CSV. Les contacts sont d'abord prévisualisés ici.</p><input ref={fileRef} type="file" accept=".vcf,.csv,text/vcard,text/csv" className="block w-full text-sm" onChange={(event) => void importFile(event.target.files?.[0])}/><a className="text-xs underline" href="data:text/csv;charset=utf-8,nom%2Cprenom%2Ctelephone%2Ctelephone_secondaire%2Cemail%0AKONAN%2CJean%2BMarie%2C0700000000%2C0500000000%2Cjean%40exemple.ci" download="modele-contacts.csv">Télécharger le modèle CSV</a></CardContent></Card>
    </div>
    <Card><CardHeader><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><CardTitle>Prévisualisation des contacts</CardTitle><p className="mt-1 text-sm text-muted-foreground">{contacts.length} contact(s) · {selected.length} sélectionné(s) avec numéro principal</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setContacts((all) => all.map((contact) => ({ ...contact, selected: Boolean(contact.telephone) })))} disabled={!contacts.length}>Tout sélectionner</Button><Button variant="outline" onClick={() => setContacts((all) => all.map((contact) => ({ ...contact, selected: false })))} disabled={!contacts.length}>Tout désélectionner</Button><Button onClick={() => void generateLeads()} disabled={loading || !selected.length}>{loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <UserPlus className="mr-2 h-4 w-4"/>}Générer les leads</Button></div></div><div className="relative mt-3"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"/><Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder="Rechercher un nom ou un numéro"/></div></CardHeader><CardContent><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Sélection</TableHead><TableHead>Nom complet</TableHead><TableHead>Téléphone principal</TableHead><TableHead>Téléphone secondaire</TableHead><TableHead>WhatsApp</TableHead><TableHead>Email</TableHead></TableRow></TableHeader><TableBody>{filtered.map((contact) => <TableRow key={contact.key}><TableCell><Checkbox checked={contact.selected} onCheckedChange={(value) => setContact(contact.key,{selected:value===true})}/></TableCell><TableCell className="min-w-[180px]">{contact.prenoms} {contact.nom}</TableCell><TableCell><Input className="min-w-[135px]" value={contact.telephone} onChange={(event) => setContact(contact.key,{telephone:normalizePhone(event.target.value)})}/><label className="mt-1 flex items-center gap-2 text-xs"><Checkbox checked={contact.whatsapp_principal} onCheckedChange={(value) => setContact(contact.key,{whatsapp_principal:value===true,whatsapp_secondaire:value===true?false:contact.whatsapp_secondaire})}/>WhatsApp</label></TableCell><TableCell><Input className="min-w-[135px]" value={contact.telephone_secondaire} onChange={(event) => setContact(contact.key,{telephone_secondaire:normalizePhone(event.target.value)})}/><label className="mt-1 flex items-center gap-2 text-xs"><Checkbox checked={contact.whatsapp_secondaire} onCheckedChange={(value) => setContact(contact.key,{whatsapp_secondaire:value===true,whatsapp_principal:value===true?false:contact.whatsapp_principal})}/>WhatsApp</label></TableCell><TableCell><Badge variant={contact.whatsapp_principal||contact.whatsapp_secondaire?"default":"outline"}>{contact.whatsapp_principal||contact.whatsapp_secondaire?"Numéro marqué":"À vérifier"}</Badge></TableCell><TableCell><Input className="min-w-[180px]" value={contact.email} onChange={(event) => setContact(contact.key,{email:event.target.value})}/></TableCell></TableRow>)}</TableBody></Table></div><p className="mt-3 text-xs text-muted-foreground">Le navigateur ne permet pas de vérifier seul si un numéro est inscrit à WhatsApp. Cochez le numéro WhatsApp connu ; cette information sera enregistrée avec le lead.</p></CardContent></Card>
  </div></MainLayout></ProtectedRoute>;
}