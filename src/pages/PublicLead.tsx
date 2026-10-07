import CountryPhoneInput from "@/components/common/CountryPhoneInput";
import { useState } from "react";
import { useSystemReferences } from "@/hooks/useSystemReferences";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, Loader2 } from "lucide-react";
import logoV2 from "@/assets/logo-agricapital-v2.png";
import { getSafeErrorMessage } from "@/lib/safeError";
import GeographieCascade from "@/components/common/GeographieCascade";

const CRENEAUX = [
  { v: "08_10", l: "08h00 – 10h00" }, { v: "10_12", l: "10h00 – 12h00" },
  { v: "12_14", l: "12h00 – 14h00" }, { v: "14_16", l: "14h00 – 16h00" },
  { v: "16_18", l: "16h00 – 18h00" },
];

export default function PublicLead() {
  const { toast } = useToast();
  const { byCategory: refs } = useSystemReferences(["public_lead_delai"]);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [f, setF] = useState({
    nom: "", prenoms: "", telephone: "", telephone_indicatif: "", telephone_local: "", whatsapp: "", whatsapp_indicatif: "", whatsapp_local: "", email: "",
    district_id: "", region_id: "", departement_id: "", sous_prefecture_id: "", village_id: "", region_residence: "",
    dispose_terrain: false,
    superficie_disponible_ha: "", superficie_a_valoriser_ha: "", superficie_souhaitee_ha: "",
    delai_demarrage: "", date_contact_souhaitee: "", creneau_prefere: "",
    mode_contact_prefere: "peu_importe", commentaire: "",
  });

  const set = (k: string, v: any) => setF(p => ({ ...p, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.nom || !f.prenoms || !f.telephone || !f.district_id) {
      toast({ variant: "destructive", title: "Champs requis manquants" });
      return;
    }
    setLoading(true);
    const payload: any = {
      nom: f.nom.trim(), prenoms: f.prenoms.trim(), telephone: f.telephone.trim(),
      whatsapp: f.whatsapp || null, email: f.email || null,
      district_id: f.district_id || null, region_id: f.region_id || null, departement_id: f.departement_id || null, sous_prefecture_id: f.sous_prefecture_id || null, village_id: f.village_id || null, region_residence: f.region_residence || null,
      dispose_terrain: f.dispose_terrain,
      superficie_disponible_ha: f.dispose_terrain && f.superficie_disponible_ha ? Number(f.superficie_disponible_ha) : null,
      superficie_a_valoriser_ha: f.dispose_terrain && f.superficie_a_valoriser_ha ? Number(f.superficie_a_valoriser_ha) : null,
      superficie_souhaitee_ha: !f.dispose_terrain && f.superficie_souhaitee_ha ? Number(f.superficie_souhaitee_ha) : null,
      delai_demarrage: f.delai_demarrage || null,
      date_contact_souhaitee: f.date_contact_souhaitee || null,
      creneau_prefere: f.creneau_prefere || null,
      mode_contact_prefere: f.mode_contact_prefere,
      commentaire: f.commentaire || null,
      source: "formulaire_public",
    };
    const { offlineInsert } = await import("@/lib/offlineWrite");
    const { error, offline } = await offlineInsert("leads", payload);
    setLoading(false);
    if (error) {
      toast({ variant: "destructive", title: "Erreur", description: getSafeErrorMessage(error) });
      return;
    }
    if (offline) {
      toast({ title: "Enregistré hors ligne", description: "Votre demande sera synchronisée dès le retour d'internet." });
    }
    setDone(true);
  };

  if (done) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-accent/10 flex items-center justify-center p-4">
        <Card className="max-w-lg w-full text-center">
          <CardContent className="pt-10 pb-8 space-y-4">
            <CheckCircle2 className="h-16 w-16 text-primary mx-auto" />
            <h1 className="text-2xl font-bold">Merci pour votre intérêt !</h1>
            <p className="text-muted-foreground">
              Votre demande a bien été reçue. Un commercial AgriCapital vous contactera dans les meilleurs délais.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-6">
          <img src={logoV2} alt="AgriCapital — Investir la terre. Cultiver l'avenir." className="h-24 md:h-28 w-auto mx-auto mb-4" />
          <h1 className="text-2xl md:text-3xl font-bold">Devenir client</h1>
          <p className="text-muted-foreground mt-2 text-sm md:text-base">Un conseiller vous rappelle.</p>
        </div>

        <form onSubmit={submit} className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Informations personnelles</CardTitle></CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-4">
              <div><Label>Nom *</Label><Input value={f.nom} onChange={e=>set("nom",e.target.value)} required /></div>
              <div><Label>Prénom(s) *</Label><Input value={f.prenoms} onChange={e=>set("prenoms",e.target.value)} required /></div>
              <CountryPhoneInput label="Téléphone principal" required countryCode={f.telephone_indicatif||undefined} localValue={f.telephone_local||""} onChange={v=>setF(x=>({...x,telephone_indicatif:v.callingCode,telephone_local:v.localValue,telephone:v.internationalValue}))}/>
              <CountryPhoneInput label="WhatsApp" countryCode={f.whatsapp_indicatif||undefined} localValue={f.whatsapp_local||""} onChange={v=>setF(x=>({...x,whatsapp_indicatif:v.callingCode,whatsapp_local:v.localValue,whatsapp:v.internationalValue}))}/>
              <div className="md:col-span-2"><Label>Email</Label><Input type="email" value={f.email} onChange={e=>set("email",e.target.value)} /></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Localisation</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <GeographieCascade
                districtId={f.district_id}
                regionId={f.region_id}
                departementId={f.departement_id}
                sousPrefectureId={f.sous_prefecture_id}
                villageId={f.village_id}
                required
                onChange={(g) => setF(x => ({
                  ...x,
                  district_id:g.districtId||"",
                  region_id:g.regionId||"",
                  departement_id:g.departementId||"",
                  sous_prefecture_id:g.sousPrefectureId||"",
                  village_id:g.villageId||"",
                  region_residence:g.regionName||"",
                }))}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Situation foncière</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Disposez-vous déjà d'un terrain ?</Label>
                <RadioGroup value={f.dispose_terrain ? "oui" : "non"} onValueChange={v=>set("dispose_terrain", v==="oui")} className="flex gap-6 mt-2">
                  <div className="flex items-center gap-2"><RadioGroupItem value="oui" id="oui" /><Label htmlFor="oui" className="font-normal">Oui</Label></div>
                  <div className="flex items-center gap-2"><RadioGroupItem value="non" id="non" /><Label htmlFor="non" className="font-normal">Non</Label></div>
                </RadioGroup>
              </div>
              {f.dispose_terrain ? (
                <div className="grid md:grid-cols-2 gap-4">
                  <div><Label>Superficie disponible (ha)</Label><Input type="number" step="0.1" value={f.superficie_disponible_ha} onChange={e=>set("superficie_disponible_ha",e.target.value)} /></div>
                  <div><Label>Hectares à mettre en valeur</Label><Input type="number" step="0.1" value={f.superficie_a_valoriser_ha} onChange={e=>set("superficie_a_valoriser_ha",e.target.value)} /></div>
                </div>
              ) : (
                <div><Label>Superficie souhaitée (ha)</Label><Input type="number" step="0.1" value={f.superficie_souhaitee_ha} onChange={e=>set("superficie_souhaitee_ha",e.target.value)} /></div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Projet</CardTitle></CardHeader>
            <CardContent>
              <Label>Quand souhaitez-vous démarrer ?</Label>
              <Select value={f.delai_demarrage} onValueChange={v=>set("delai_demarrage",v)}>
                <SelectTrigger><SelectValue placeholder="Sélectionnez" /></SelectTrigger>
                <SelectContent>
                  {refs("public_lead_delai").map((r:any)=><SelectItem key={r.id} value={r.code}>{r.libelle}</SelectItem>)}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Prise de contact</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div><Label>Date souhaitée</Label><Input type="date" value={f.date_contact_souhaitee} onChange={e=>set("date_contact_souhaitee",e.target.value)} /></div>
                <div>
                  <Label>Créneau préféré</Label>
                  <Select value={f.creneau_prefere} onValueChange={v=>set("creneau_prefere",v)}>
                    <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                    <SelectContent>{CRENEAUX.map(c=><SelectItem key={c.v} value={c.v}>{c.l}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Mode de contact préféré</Label>
                <RadioGroup value={f.mode_contact_prefere} onValueChange={v=>set("mode_contact_prefere",v)} className="flex flex-wrap gap-4 mt-2">
                  <div className="flex items-center gap-2"><RadioGroupItem value="appel" id="appel" /><Label htmlFor="appel" className="font-normal">Appel</Label></div>
                  <div className="flex items-center gap-2"><RadioGroupItem value="whatsapp" id="wa" /><Label htmlFor="wa" className="font-normal">WhatsApp</Label></div>
                  <div className="flex items-center gap-2"><RadioGroupItem value="peu_importe" id="pi" /><Label htmlFor="pi" className="font-normal">Peu importe</Label></div>
                </RadioGroup>
              </div>
              <div>
                <Label>Message / Besoin spécifique</Label>
                <Textarea value={f.commentaire} onChange={e=>set("commentaire",e.target.value)} rows={4} />
              </div>
            </CardContent>
          </Card>

          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Envoyer ma demande
          </Button>
        </form>
      </div>
    </div>
  );
}