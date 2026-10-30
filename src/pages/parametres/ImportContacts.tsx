import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { findExistingCrmContact, hasSameCrmContact } from "@/lib/leadDeduplication";
import { Contact, FileUp, Users, UserPlus, Loader2, Search } from "lucide-react";

type ImportedContact = { key: string; nom: string; prenoms: string; telephone: string; telephone_secondaire: string; email: string; whatsapp_principal: boolean; whatsapp_secondaire: boolean; selected: boolean; source: string };
// Canonicalise every phone to E.164. Any 10-digit number without an explicit
// international prefix is Ivorian by default; explicit international numbers
// retain their country code. This also works for vCard and CSV exports.
const normalizePhone = (value: string) => {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  let digits = raw.replace(/\D/g, "");
  const explicitInternational = raw.startsWith("+") || /^00/.test(raw) || digits.startsWith("225");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("225") && digits.length === 13) return `+${digits}`;
  if (!explicitInternational && digits.length === 10) return `+225${digits}`;
  if (digits.length >= 8 && digits.length <= 15 && digits[0] !== "0") return `+${digits}`;
  return digits ? `+${digits}` : "";
};
const isValidIvoryCoastPhone = (value: string) => /^\+[1-9]\d{7,14}$/.test(normalizePhone(value));
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
    const phoneEntries = phoneLines.map((line) => {
      const colon = line.indexOf(":");
      const metadata = colon >= 0 ? line.slice(0, colon) : line;
      const value = colon >= 0 ? line.slice(colon + 1).trim() : "";
      // Some address books export an explicit WhatsApp label in vCard TYPE/X-ABLABEL.
      // This is source metadata only, not a live verification of a WhatsApp account.
      const whatsappTagged = /WHATSAPP|X-ABLABEL[^:]*\bWhatsApp\b/i.test(metadata) || /WHATSAPP/i.test(value);
      return { phone: normalizePhone(value), whatsappTagged };
    }).filter((entry) => entry.phone);
    const phones = phoneEntries.map((entry) => entry.phone);
    const emailLines = lines.filter((line) => /^EMAIL(?:;|\.)/i.test(line) || /^EMAIL:/i.test(line));
    const email = emailLines.map((line) => line.slice(line.indexOf(":") + 1).trim()).find(Boolean) || "";
    const name = fn || [parts[1], parts[0]].filter(Boolean).join(" ");
    const words = name.trim().split(/\s+/);
    const phone = phones[0] || "";
    return { key: contactKey(name, phone) || String(index), nom: words.length > 1 ? words.slice(1).join(" ") : words[0] || "", prenoms: words.length > 1 ? words[0] : "", telephone: phone, telephone_secondaire: phones[1] || "", email, whatsapp_principal: Boolean(phoneEntries[0]?.whatsappTagged), whatsapp_secondaire: Boolean(phoneEntries[1]?.whatsappTagged), selected: Boolean(phone), source: "vCard" };
  }).filter((item) => item.nom || item.prenoms || item.telephone || item.email);
}
function parseCsv(text: string): ImportedContact[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const delimiter = (lines[0].match(/;/g)?.length || 0) > (lines[0].match(/,/g)?.length || 0) ? ";" : ",";
  const split = (line: string) => {
    const cells: string[] = []; let cell = ""; let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"' && quoted && line[i + 1] === '"') { cell += '"'; i++; continue; }
      if (char === '"') { quoted = !quoted; continue; }
      if (char === delimiter && !quoted) { cells.push(cell.trim()); cell = ""; continue; }
      cell += char;
    }
    cells.push(cell.trim()); return cells;
  };
  const headers = split(lines[0]).map((v) => v.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
  const col = (names: string[]) => headers.findIndex((h) => names.some((name) => h.includes(name)));
  const nameIndex = col(["nom complet", "fullname", "name", "nom"]);
  const firstIndex = col(["prenom", "first name", "given"]);
  const phoneIndex = col(["telephone principal", "telephone", "phone", "mobile", "tel"]);
  const secondIndex = col(["telephone secondaire", "second phone", "phone2"]);
  const emailIndex = col(["email", "e-mail", "courriel"]);
  const whatsappIndex = col(["whatsapp principal", "whatsapp", "wa.me", "numero whatsapp"]);
  const whatsappSecondIndex = col(["whatsapp secondaire", "second whatsapp"]);
  return lines.slice(1).map((line, index) => {
    const cells = split(line);
    const full = nameIndex >= 0 ? cells[nameIndex] || "" : "";
    const words = full.trim().split(/\s+/).filter(Boolean);
    const phone = normalizePhone(phoneIndex >= 0 ? cells[phoneIndex] || "" : "");
    return { key: contactKey(full, phone) || String(index), nom: words.length > 1 ? words.slice(1).join(" ") : full, prenoms: firstIndex >= 0 ? cells[firstIndex] || (words.length > 1 ? words[0] : "") : words.length > 1 ? words[0] : "", telephone: phone, telephone_secondaire: normalizePhone(secondIndex >= 0 ? cells[secondIndex] || "" : ""), email: emailIndex >= 0 ? cells[emailIndex] || "" : "", whatsapp_principal: whatsappIndex >= 0 && /^(oui|yes|true|1|whatsapp|wa)$/i.test(cells[whatsappIndex] || ""), whatsapp_secondaire: whatsappSecondIndex >= 0 && /^(oui|yes|true|1|whatsapp|wa)$/i.test(cells[whatsappSecondIndex] || ""), selected: Boolean(phone), source: "CSV" };
  }).filter((item) => item.nom || item.prenoms || item.telephone || item.email);
}
export default function ImportContacts() {
  const [contacts, setContacts] = useState<ImportedContact[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileDialogOpen, setFileDialogOpen] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [contactsLoaded, setContactsLoaded] = useState(false);
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await (supabase as any).from("imported_phone_contacts").select("*")
        .eq("user_id", user.id).neq("status", "created").neq("status", "duplicate").order("imported_at", { ascending: true });
      if (cancelled) return;
      if (!error && data) setContacts(data.map((row: any) => ({
        key: row.contact_key, nom: row.last_name || "", prenoms: row.first_name || "",
        telephone: row.phone || "", telephone_secondaire: row.secondary_phone || "", email: row.email || "",
        whatsapp_principal: !!row.whatsapp_primary, whatsapp_secondaire: !!row.whatsapp_secondary,
        selected: !!row.selected, source: row.source || "import"
      })));
      setContactsLoaded(true);
      if (error) toast({ variant: "destructive", title: "Chargement impossible", description: error.message });
    })();
    return () => { cancelled = true; };
  }, [user?.id]);
  const selected = contacts.filter((contact) => contact.selected && contact.telephone);
  const filtered = useMemo(() => contacts.filter((contact) => [contact.nom, contact.prenoms, contact.telephone, contact.email].join(" ").toLowerCase().includes(search.toLowerCase())), [contacts, search]);
  const selectableFiltered = filtered.filter((contact) => Boolean(contact.telephone));
  const allFilteredSelected = selectableFiltered.length > 0 && selectableFiltered.every((contact) => contact.selected);
  const selectableAll = contacts.filter((contact) => Boolean(contact.telephone));
  const allContactsSelected = selectableAll.length > 0 && selectableAll.every((contact) => contact.selected);
  const persistContact = async (contact: ImportedContact) => {
    if (!user?.id) throw new Error("Session expirée.");
    const { error } = await (supabase as any).from("imported_phone_contacts").upsert({
      user_id: user.id, contact_key: contact.key, first_name: contact.prenoms, last_name: contact.nom,
      phone: normalizePhone(contact.telephone), secondary_phone: normalizePhone(contact.telephone_secondaire) || null,
      email: contact.email || null, whatsapp_primary: contact.whatsapp_principal,
      whatsapp_secondary: contact.whatsapp_secondaire, selected: contact.selected, source: contact.source,
      status: "pending", updated_at: new Date().toISOString()
    }, { onConflict: "user_id,contact_key" });
    if (error) throw error;
  };
  const setContact = (key: string, patch: Partial<ImportedContact>) => {
    setContacts((all) => all.map((contact) => {
      if (contact.key !== key) return contact;
      const updated = { ...contact, ...patch };
      void persistContact(updated).catch((error) => toast({ variant: "destructive", title: "Sauvegarde impossible", description: error.message }));
      return updated;
    }));
  };
  const mergeContacts = (incoming: ImportedContact[]) => {
    setContacts((previous) => {
      const map = new Map(previous.map((contact) => [contact.key, contact]));
      incoming.forEach((contact) => { const old = map.get(contact.key); map.set(contact.key, old ? { ...old, ...contact, selected: old.selected || contact.selected } : contact); });
      const merged = [...map.values()];
      void (async () => {
        if (!user?.id) throw new Error("Reconnectez-vous pour sauvegarder les contacts.");
        const payload = merged.map((contact) => ({
          user_id: user.id, contact_key: contact.key, first_name: contact.prenoms, last_name: contact.nom,
          phone: normalizePhone(contact.telephone), secondary_phone: normalizePhone(contact.telephone_secondaire) || null,
          email: contact.email || null, whatsapp_primary: contact.whatsapp_principal,
          whatsapp_secondary: contact.whatsapp_secondaire, selected: contact.selected, source: contact.source,
          status: "pending", updated_at: new Date().toISOString()
        }));
        for (let i = 0; i < payload.length; i += 100) {
          const { error } = await (supabase as any).from("imported_phone_contacts").upsert(payload.slice(i, i + 100), { onConflict: "user_id,contact_key" });
          if (error) throw error;
        }
      })().catch((error) => toast({ variant: "destructive", title: "Contacts non sauvegardés", description: error.message }));
      return merged;
    });
    toast({ title: "Import en cours", description: incoming.length + " contact(s) lus. Sauvegarde dans la base de données." });
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
    let created = 0, invalid = 0, failed = 0;
    const createdKeys = new Set<string>();
    const contactByKey = new Map(selected.map((contact) => [contact.key, contact]));
    const now = new Date().toISOString();
    const updateContactStatuses = async (items: Array<{ key: string; status: string; message?: string; leadId?: string }>) => {
      for (let offset = 0; offset < items.length; offset += 50) {
        const chunk = items.slice(offset, offset + 50);
        const groups = new Map<string, typeof chunk>();
        chunk.forEach((item) => groups.set(item.status, [...(groups.get(item.status) || []), item]));
        for (const [status, group] of groups) {
          const keys = group.map((item) => item.key);
          const messages = new Set(group.map((item) => item.message || ""));
          const commonError = messages.size === 1 ? (group[0]?.message || null) : null;
          const { error } = await (supabase as any).from("imported_phone_contacts").update({ status, selected: status !== "created", last_error: commonError, updated_at: new Date().toISOString() }).eq("user_id", user.id).in("contact_key", keys);
          if (error) console.error("Mise à jour des contacts importés impossible", error);
        }
      }
      const linked = items.filter((item) => item.status === "created" && item.leadId);
      for (let offset = 0; offset < linked.length; offset += 25) {
        await Promise.all(linked.slice(offset, offset + 25).map(async (item) => {
          const { error } = await (supabase as any).from("imported_phone_contacts").update({ lead_id: item.leadId, last_error: null, updated_at: new Date().toISOString() }).eq("user_id", user.id).eq("contact_key", item.key);
          if (error) console.error("Lien du lead importé non enregistré", item.key, error);
        }));
      }
    };
    try {
      const readPhonePages = async (table: "leads" | "prospects") => {
        const all: any[] = [];
        for (let offset = 0; ; offset += 1000) {
          const result = await (supabase as any).from(table).select("id,nom,prenoms,telephone,telephone_secondaire,whatsapp,email").range(offset, offset + 999);
          if (result.error) throw result.error;
          all.push(...(result.data || []));
          if (!result.data || result.data.length < 1000) break;
        }
        return all;
      };
      const [leadRows, prospectRows] = await Promise.all([readPhonePages("leads"), readPhonePages("prospects")]);
      const existingRecords = [...leadRows, ...prospectRows];
      const statuses: Array<{ key: string; status: string; message?: string; leadId?: string }> = [];
      const candidates: Array<{ key: string; contact: ImportedContact; row: Record<string, any> }> = [];
      for (const contact of selected) {
        const phone = normalizePhone(contact.telephone);
        if (!isValidIvoryCoastPhone(phone)) { invalid++; statuses.push({ key: contact.key, status: "invalid", message: "Numéro incomplet ou format international invalide. Les numéros locaux à 10 chiffres sont automatiquement préfixés par +225." }); continue; }
        const row = { nom: contact.nom || contact.prenoms || "Contact importé", prenoms: contact.prenoms || null, telephone: phone, telephone_secondaire: normalizePhone(contact.telephone_secondaire) || null, whatsapp: contact.whatsapp_principal ? phone : contact.whatsapp_secondaire ? normalizePhone(contact.telephone_secondaire) : null, telephone_principal_whatsapp: contact.whatsapp_principal, telephone_secondaire_whatsapp: contact.whatsapp_secondaire, email: contact.email || null, statut: "nouveau", etape_pipeline: "lead", type_lead: "client", mode_contact_prefere: contact.whatsapp_principal || contact.whatsapp_secondaire ? "whatsapp" : "appel", source: "commercial_terrain", assigned_to: user.id, created_by: user.id, metadata: { source_import: "repertoire_telephone", source_contact: contact.source, source_contact_key: contact.key, imported_at: now } };
        const duplicateInDatabase = existingRecords.some((existing: any) => hasSameCrmContact(row, existing));
        const duplicateInBatch = candidates.some((existing) => hasSameCrmContact(row, existing.row));
        if (duplicateInDatabase || duplicateInBatch) { statuses.push({ key: contact.key, status: "duplicate" }); continue; }
        candidates.push({ key: contact.key, contact, row });
      }
      for (let offset = 0; offset < candidates.length; offset += 100) {
        const batch = candidates.slice(offset, offset + 100);
        const { data, error } = await (supabase as any).from("leads").insert(batch.map((item) => item.row)).select("id,telephone,metadata");
        if (!error && data) {
          const returnedKeys = new Set<string>();
          for (const lead of data as any[]) {
            const key = String(lead.metadata?.source_contact_key || "");
            const contact = contactByKey.get(key) || batch.find((item) => normalizePhone(item.contact.telephone) === normalizePhone(lead.telephone))?.contact;
            if (!contact) continue;
            returnedKeys.add(contact.key);
            created++; createdKeys.add(contact.key); statuses.push({ key: contact.key, status: "created", leadId: lead.id });
          }
          // A database trigger may silently reject a concurrent duplicate; mark it skipped too.
          for (const item of batch) {
            if (!returnedKeys.has(item.key)) {
              statuses.push({ key: item.key, status: "duplicate" });
            }
          }
          continue;
        }
        for (let retryOffset = 0; retryOffset < batch.length; retryOffset += 10) {
          await Promise.all(batch.slice(retryOffset, retryOffset + 10).map(async (item) => {
            const { data: lead, error: insertError } = await (supabase as any).from("leads").insert(item.row).select("id").maybeSingle();
            if (insertError || !lead?.id) {
              // Duplicate guards may deliberately reject an INSERT without creating a row.
              // Check all authoritative CRM registries before reporting a real failure.
              try {
                const duplicate = await findExistingCrmContact(item.row);
                if (duplicate || existingRecords.some((existing: any) => hasSameCrmContact(item.row, existing))) {
                  statuses.push({ key: item.key, status: "duplicate", message: "Contact déjà présent dans le CRM." });
                  return;
                }
              } catch (lookupError) {
                console.warn("Vérification du doublon après échec d’insertion impossible", lookupError);
              }
              failed++;
              statuses.push({ key: item.key, status: "pending", message: insertError?.message || "La base n’a retourné aucun lead créé." });
              return;
            }
            created++; createdKeys.add(item.key); statuses.push({ key: item.key, status: "created", leadId: lead.id });
          }));
        }
      }
      await updateContactStatuses(statuses);
      const skippedDuplicateKeys = new Set(statuses.filter((item) => item.status === "duplicate").map((item) => item.key));
      if (created > 0) {
        await Promise.all([queryClient.invalidateQueries({ queryKey: ["leads"] }), queryClient.invalidateQueries({ queryKey: ["prospects"] }), queryClient.invalidateQueries({ queryKey: ["lead_historique"] })]);
      }
      if (created > 0 || skippedDuplicateKeys.size > 0) {
        setContacts((all) => all.filter((item) => !createdKeys.has(item.key) && !skippedDuplicateKeys.has(item.key)));
      }
      toast({ title: "Génération terminée", description: created + " lead(s) créé(s), " + invalid + " numéro(s) invalide(s), " + failed + " échec(s)." });
      if (created > 0) navigate("/leads");
    } catch (error: any) {
      toast({ variant: "destructive", title: "Traitement interrompu", description: error?.message || "Erreur de lecture. Les contacts sauvegardés restent disponibles." });
    } finally { setLoading(false); }
  };
  return <div className="mx-auto w-full max-w-7xl min-w-0 space-y-4 overflow-x-hidden px-0 sm:space-y-5">
    <div><h1 className="text-2xl font-bold">Importer les contacts</h1></div>
    <div className="grid min-w-0 grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2">
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><Contact className="h-5 w-5"/>Répertoire du téléphone</CardTitle></CardHeader><CardContent className="space-y-3"><Button onClick={() => void pickPhoneContacts()} className="w-full"><Users className="mr-2 h-4 w-4"/>Choisir des contacts</Button></CardContent></Card>
      <Dialog open={fileDialogOpen} onOpenChange={setFileDialogOpen}><DialogTrigger asChild><Button variant="outline" className="w-full"><FileUp className="mr-2 h-4 w-4"/>Importer un fichier</Button></DialogTrigger><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"><Card><CardHeader><CardTitle className="flex items-center gap-2"><FileUp className="h-5 w-5"/>Importer un fichier</CardTitle></CardHeader><CardContent className="space-y-3"><input ref={fileRef} type="file" accept=".vcf,.csv,text/vcard,text/csv" className="block w-full text-sm" onChange={(event) => void importFile(event.target.files?.[0])}/><a className="text-xs underline" href="data:text/csv;charset=utf-8,nom%2Cprenom%2Ctelephone%2Ctelephone_secondaire%2Cemail%0AKONAN%2CJean%2BMarie%2C0700000000%2C0500000000%2Cjean%40exemple.ci" download="modele-contacts.csv">Télécharger le modèle CSV</a></CardContent></Card></DialogContent></Dialog>
    </div>
    <Card className="min-w-0"><CardHeader><div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><CardTitle>Prévisualisation des contacts</CardTitle><p className="mt-1 text-sm text-muted-foreground">{contacts.length} contact(s) · {selected.length} sélectionné(s) avec numéro principal</p></div><div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap">
<Button variant="outline" className="w-full whitespace-normal sm:w-auto" onClick={() => setContacts((all) => all.map((contact) => contact.telephone ? { ...contact, selected: !allContactsSelected } : contact))} disabled={!selectableAll.length}>{allContactsSelected ? "Désélectionner tous les contacts" : "Sélectionner tous les contacts"}</Button>
<Button variant="outline" className="w-full whitespace-normal sm:w-auto" onClick={() => { const keys = new Set(selectableFiltered.map((contact) => contact.key)); setContacts((all) => all.map((contact) => keys.has(contact.key) ? { ...contact, selected: !allFilteredSelected } : contact)); }} disabled={!selectableFiltered.length}>{allFilteredSelected ? "Désélectionner la sélection filtrée" : "Tout sélectionner (filtre)"}</Button><Button variant="outline" onClick={() => setContacts((all) => all.map((contact) => ({ ...contact, selected: false })))} disabled={!contacts.length}>Tout désélectionner</Button><Button className="w-full whitespace-normal sm:w-auto" onClick={() => void generateLeads()} disabled={loading || !selected.length || !contactsLoaded}>{loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <UserPlus className="mr-2 h-4 w-4"/>}Générer les leads</Button></div></div><div className="relative mt-3"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"/><Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder="Rechercher un nom ou un numéro"/></div></CardHeader><CardContent className="min-w-0 px-3 sm:px-6"><div className="space-y-3 sm:hidden">{filtered.map((contact) => <div key={contact.key} className="min-w-0 space-y-3 rounded-lg border p-3"><div className="flex min-w-0 items-start gap-3"><Checkbox className="mt-1 shrink-0" checked={contact.selected} onCheckedChange={(value) => setContact(contact.key,{selected:value===true})}/><div className="min-w-0 flex-1"><p className="break-words font-medium">{contact.prenoms} {contact.nom}</p><p className="break-all text-xs text-muted-foreground">{contact.email || "Aucun email"}</p></div><Badge className="shrink-0" variant={contact.whatsapp_principal||contact.whatsapp_secondaire?"default":"outline"}>{contact.whatsapp_principal||contact.whatsapp_secondaire?"WhatsApp":"À vérifier"}</Badge></div><div className="grid min-w-0 grid-cols-1 gap-3"><div className="min-w-0 space-y-1"><Label>Téléphone principal</Label><Input className="w-full min-w-0" value={contact.telephone} onChange={(event) => setContact(contact.key,{telephone:normalizePhone(event.target.value)})}/><label className="flex items-center gap-2 text-xs"><Checkbox checked={contact.whatsapp_principal} onCheckedChange={(value) => setContact(contact.key,{whatsapp_principal:value===true,whatsapp_secondaire:value===true?false:contact.whatsapp_secondaire})}/>Numéro principal WhatsApp</label></div><div className="min-w-0 space-y-1"><Label>Téléphone secondaire</Label><Input className="w-full min-w-0" value={contact.telephone_secondaire} onChange={(event) => setContact(contact.key,{telephone_secondaire:normalizePhone(event.target.value)})}/><label className="flex items-center gap-2 text-xs"><Checkbox checked={contact.whatsapp_secondaire} onCheckedChange={(value) => setContact(contact.key,{whatsapp_secondaire:value===true,whatsapp_principal:value===true?false:contact.whatsapp_principal})}/>Numéro secondaire WhatsApp</label></div><div className="min-w-0 space-y-1"><Label>Email</Label><Input className="w-full min-w-0" value={contact.email} onChange={(event) => setContact(contact.key,{email:event.target.value})}/></div></div></div>)}</div><div className="hidden w-full overflow-x-auto sm:block"><Table><TableHeader><TableRow><TableHead>Sélection</TableHead><TableHead>Nom complet</TableHead><TableHead>Téléphone principal</TableHead><TableHead>Téléphone secondaire</TableHead><TableHead>WhatsApp</TableHead><TableHead>Email</TableHead></TableRow></TableHeader><TableBody>{filtered.map((contact) => <TableRow key={contact.key}><TableCell><Checkbox checked={contact.selected} onCheckedChange={(value) => setContact(contact.key,{selected:value===true})}/></TableCell><TableCell className="min-w-[180px]">{contact.prenoms} {contact.nom}</TableCell><TableCell><Input className="min-w-[135px]" value={contact.telephone} onChange={(event) => setContact(contact.key,{telephone:normalizePhone(event.target.value)})}/><label className="mt-1 flex items-center gap-2 text-xs"><Checkbox checked={contact.whatsapp_principal} onCheckedChange={(value) => setContact(contact.key,{whatsapp_principal:value===true,whatsapp_secondaire:value===true?false:contact.whatsapp_secondaire})}/>WhatsApp</label></TableCell><TableCell><Input className="min-w-[135px]" value={contact.telephone_secondaire} onChange={(event) => setContact(contact.key,{telephone_secondaire:normalizePhone(event.target.value)})}/><label className="mt-1 flex items-center gap-2 text-xs"><Checkbox checked={contact.whatsapp_secondaire} onCheckedChange={(value) => setContact(contact.key,{whatsapp_secondaire:value===true,whatsapp_principal:value===true?false:contact.whatsapp_principal})}/>WhatsApp</label></TableCell><TableCell><Badge variant={contact.whatsapp_principal||contact.whatsapp_secondaire?"default":"outline"}>{contact.whatsapp_principal||contact.whatsapp_secondaire?"Numéro marqué":"À vérifier"}</Badge></TableCell><TableCell><Input className="min-w-[180px]" value={contact.email} onChange={(event) => setContact(contact.key,{email:event.target.value})}/></TableCell></TableRow>)}</TableBody></Table></div><p className="mt-3 text-xs text-muted-foreground">Les numéros locaux à 10 chiffres prennent l’indicatif +225. Les indicatifs existants sont conservés. L’inscription WhatsApp n’est pas vérifiée.</p></CardContent></Card>
  </div>;
}