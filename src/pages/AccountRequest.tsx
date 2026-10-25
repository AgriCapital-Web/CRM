import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

import { User, Mail, Phone, Briefcase, MapPin, FileText, KeyRound, AtSign, Camera, Loader2, CheckCircle2, Image as ImageIcon } from "lucide-react";
import CountryPhoneInput from "@/components/common/CountryPhoneInput";
import { getSafeErrorMessage } from "@/lib/safeError";
import RoleGeographyFields from "@/components/common/RoleGeographyFields";

type AccountRole = { code: string; nom: string; niveau_couverture: string | null; actif: boolean };
const PUBLIC_SIGNUP_ROLE_CODES = new Set([
  "commercial", "technicien", "mobilisateur_foncier", "superviseur_mobilisation_fonciere",
  "chef_equipe_commercial", "chef_equipe_technique", "responsable_commercial",
  "responsable_operations", "responsable_district", "comptable", "service_client",
]);



const compressPhoto = async (file: File): Promise<{ data: string; mime: string }> => {
  if (!file.type.startsWith("image/")) throw new Error("Sélectionnez une image.");
  if (file.size > 10 * 1024 * 1024) throw new Error("La photo originale ne doit pas dépasser 10 Mo.");

  const source = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Impossible de lire la photo."));
      img.src = source;
    });

    const maxW = 1200;
    const maxH = 1500;
    const scale = Math.min(1, maxW / image.naturalWidth, maxH / image.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Préparation de la photo impossible.");
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    // Certains navigateurs ignorent image/webp et retournent du PNG.
    // On utilise donc le MIME réellement présent dans la data URL.
    const encode = (target: "image/webp" | "image/jpeg", q: number) => canvas.toDataURL(target, q);
    let data = encode("image/webp", 0.84);
    if (!data.startsWith("data:image/webp;base64,")) data = encode("image/jpeg", 0.84);
    if (data.length > 2_400_000) {
      const mime = data.startsWith("data:image/webp;base64,") ? "image/webp" : "image/jpeg";
      data = canvas.toDataURL(mime, 0.68);
    }
    if (data.length > 2_700_000) {
      const small = document.createElement("canvas");
      small.width = Math.min(900, canvas.width);
      small.height = Math.round((small.width / canvas.width) * canvas.height);
      small.getContext("2d")?.drawImage(canvas, 0, 0, small.width, small.height);
      const mime = data.startsWith("data:image/webp;base64,") ? "image/webp" : "image/jpeg";
      data = small.toDataURL(mime, 0.65);
    }
    const mime = data.match(/^data:(image\/[^;]+);base64,/)?.[1] || "image/jpeg";
    return { data, mime };
  } finally {
    URL.revokeObjectURL(source);
  }
};

const AccountRequest = () => {
  const [roles, setRoles] = useState<AccountRole[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [formData, setFormData] = useState({
    nom_complet: "", email: "", telephone: "", telephone_indicatif: "", telephone_local: "", poste: "",
    region: "", departement: "", district: "", sous_prefecture: "", message: "",
    username: "", password: "", password_confirm: "",
  });
  const [photoPreview, setPhotoPreview] = useState("");
  const [photoPath, setPhotoPath] = useState("");
  const [photoUploading, setPhotoUploading] = useState(false);
  const [errorDetail, setErrorDetail] = useState<any>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    void (async () => {
      setRolesLoading(true);
      try {
        const { data, error } = await (supabase as any)
          .from("v_public_signup_roles")
          .select("code,nom,niveau_couverture,actif")
          .eq("actif", true)
          .order("niveau", { ascending: true })
          .order("nom", { ascending: true });
        if (error) throw error;
        if (active) setRoles((data || []).filter((role: AccountRole) => PUBLIC_SIGNUP_ROLE_CODES.has(role.code)));
      } catch (error) {
        console.error("Impossible de charger les rôles actifs depuis la base", error);
        if (active) setRoles([]);
      } finally {
        if (active) setRolesLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const deletePendingPhoto = async (pathToDelete: string) => {
    if (!pathToDelete) return;
    await supabase.functions.invoke("upload-account-request-photo", {
      body: { mode: "delete", path: pathToDelete },
    }).catch(() => undefined);
  };

  const handlePhoto = async (file?: File) => {
    if (!file) return;
    setPhotoUploading(true);
    try {
      if (photoPath) await deletePendingPhoto(photoPath);
      if (photoPreview) URL.revokeObjectURL(photoPreview);
      setPhotoPreview(URL.createObjectURL(file));
      setPhotoPath("");

      const compressed = await compressPhoto(file);
      const { data, error } = await supabase.functions.invoke("upload-account-request-photo", {
        body: compressed,
      });
      if (error || data?.error) throw new Error(data?.error || error?.message || "Upload impossible");
      setPhotoPath(String(data.path));
      toast({ title: "Photo prête", description: "La photo a été enregistrée avant la validation du formulaire." });
    } catch (error: any) {
      setPhotoPreview("");
      setPhotoPath("");
      toast({ variant: "destructive", title: "Photo non enregistrée", description: getSafeErrorMessage(error) });
    } finally {
      setPhotoUploading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorDetail(null);
    if (!photoPath) {
      toast({ variant: "destructive", title: "Photo obligatoire", description: "Ajoutez une photo et attendez la fin de son enregistrement avant de valider." });
      return;
    }
    if (formData.password !== formData.password_confirm) {
      toast({ variant: "destructive", title: "Erreur", description: "Les mots de passe ne correspondent pas." });
      return;
    }
    setIsSubmitting(true);
    try {
      const [regionLookup, departmentLookup] = await Promise.all([
        formData.region ? (supabase as any).from("v_geo_regions").select("nom").eq("id", formData.region).maybeSingle() : Promise.resolve({ data: null, error: null }),
        formData.departement ? (supabase as any).from("v_geo_departements").select("nom").eq("id", formData.departement).maybeSingle() : Promise.resolve({ data: null, error: null }),
      ]);
      if (regionLookup.error || departmentLookup.error) throw regionLookup.error || departmentLookup.error;
      const regionName = regionLookup.data?.nom || "";
      const deptName = departmentLookup.data?.nom || "";
      const { data, error } = await supabase.functions.invoke("submit-account-request", {
        body: {
          nom_complet: formData.nom_complet.trim(),
          email: formData.email.trim(),
          telephone: formData.telephone.trim(),
          telephone_indicatif: formData.telephone_indicatif,
          telephone_local: formData.telephone_local,
          username: formData.username,
          password: formData.password,
          poste_souhaite: roles.find((role) => role.code === formData.poste)?.nom || formData.poste,
          role_souhaite: formData.poste,
          region_id: formData.region || null,
          departement_geo_id: formData.departement || null,
          sous_prefecture_id: formData.sous_prefecture || null,
          district_id: formData.district || null,
          departement: deptName || null,
          region: regionName || null,
          justification: formData.message || null,
          photo_url: photoPath,
        },
      });
      const payload: any = data;
      if (error || payload?.error) {
        let functionMessage = error?.message;
        let contextPayload: any = null;
        if (error && typeof (error as any).context?.json === "function") {
          try {
            contextPayload = await (error as any).context.json();
            functionMessage = contextPayload?.message || contextPayload?.error || functionMessage;
          } catch { /* non JSON */ }
        }
        const detail = contextPayload || payload || {};
        setErrorDetail({
          etape: detail?.step || "inconnue",
          raison: detail?.message || detail?.error || functionMessage || "Erreur inconnue",
          statut_http: (error as any)?.context?.status ?? null,
          horodatage: new Date().toISOString(),
        });
        throw new Error(payload?.message || payload?.error || functionMessage || "Envoi impossible");
      }

      toast({
        title: "Demande envoyée",
        description: "Votre photo et vos informations ont bien été enregistrées. L'adresse email doit être confirmée avant le traitement de la demande.",
      });
      navigate("/login");
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erreur", description: getSafeErrorMessage(error) || "Impossible d'envoyer la demande" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary via-primary to-primary-hover p-3 sm:p-4">
      <Card className="w-full max-w-[95%] sm:max-w-2xl shadow-strong my-4 min-w-0">
        <CardHeader className="text-center px-4 sm:px-6 pb-4">
          <div className="flex justify-center mb-2 sm:mb-4">
            <img src="/images/Logo%20%20AgriCapital%20-360%C2%B0.png?v=20261023-official" alt="AgriCapital Logo" className="h-16 sm:h-24 w-auto max-w-full" />
          </div>
          <CardTitle className="text-xl sm:text-2xl">Demande de Création de Compte</CardTitle>
        </CardHeader>

        <CardContent className="px-4 sm:px-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
              <Field label="Nom complet *" icon={<User />}><Input required value={formData.nom_complet} onChange={(e) => setFormData({ ...formData, nom_complet: e.target.value.toLocaleUpperCase("fr-FR") })} placeholder="Ex: KOUASSI Jean" /></Field>
              <Field label="Email *" icon={<Mail />}><Input required type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="votre@email.com" /></Field>
              <Field label="Téléphone *" icon={<Phone />}><CountryPhoneInput label="" required countryCode={formData.telephone_indicatif||undefined} localValue={formData.telephone_local||formData.telephone||""} onChange={v=>setFormData(x=>({...x,telephone_indicatif:v.callingCode,telephone_local:v.localValue,telephone:v.internationalValue}))}/></Field>
              <Field label="Poste souhaité *" icon={<Briefcase />}><Select value={formData.poste} disabled={rolesLoading || roles.length === 0} onValueChange={(value) => setFormData((prev) => ({ ...prev, poste: value, district: "", region: "", departement: "", sous_prefecture: "" }))}><SelectTrigger><SelectValue placeholder={rolesLoading ? "Chargement des postes…" : "Sélectionner un poste"} /></SelectTrigger><SelectContent>{roles.map((role) => <SelectItem key={role.code} value={role.code}>{role.nom}</SelectItem>)}</SelectContent></Select></Field>
            </div>

            <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Camera className="h-5 w-5 text-primary" />
                <div className="min-w-0">
                  <Label className="text-sm font-semibold">Photo de profil *</Label>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-[150px_1fr] sm:items-center">
                <div className="mx-auto flex h-36 w-28 items-center justify-center overflow-hidden rounded-xl border bg-background sm:mx-0">
                  {photoPreview ? <img src={photoPreview} alt="Aperçu de la photo" className="h-full w-full object-cover" /> : <ImageIcon className="h-10 w-10 text-muted-foreground" />}
                </div>
                <div className="min-w-0 space-y-3">
                  <input ref={photoInputRef} type="file" accept="image/*" className="sr-only" onChange={(e) => { void handlePhoto(e.target.files?.[0]); e.currentTarget.value = ""; }} />
                  <Button type="button" onClick={() => photoInputRef.current?.click()} disabled={photoUploading} className="min-h-11">
                    <Camera className="mr-2 h-4 w-4" />Prendre une photo ou importer une image
                  </Button>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {photoUploading ? <span className="inline-flex items-center gap-1 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Enregistrement...</span> : photoPath ? <span className="inline-flex items-center gap-1 text-primary"><CheckCircle2 className="h-4 w-4" />Photo enregistrée</span> : <span className="text-muted-foreground">JPG, PNG ou WebP · 10 Mo maximum avant compression</span>}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-sm font-medium flex items-center gap-2"><MapPin className="h-4 w-4" /> Couverture géographique</Label>
              <RoleGeographyFields required role={formData.poste} value={{ districtId: formData.district, regionId: formData.region, departementId: formData.departement, sousPrefectureId: formData.sous_prefecture }} className="grid grid-cols-1 gap-3 sm:grid-cols-2" onChange={(g) => setFormData((prev) => ({ ...prev, district: g.districtId || "", region: g.regionId || "", departement: g.departementId || "", sous_prefecture: g.sousPrefectureId || "" }))} />
            </div>

            <div className="space-y-3 rounded-lg border-2 border-primary/30 bg-primary/5 p-4">
              <Label className="text-sm font-semibold flex items-center gap-2"><KeyRound className="h-4 w-4" /> Identifiants de connexion *</Label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field label="Nom d'utilisateur *" icon={<AtSign />}><Input required autoComplete="username" value={formData.username} onChange={(e) => setFormData({ ...formData, username: e.target.value })} placeholder="ex: kouassi.jean" /></Field>
                <Field label="Mot de passe *"><Input required type="password" autoComplete="new-password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} placeholder="Saisir librement votre mot de passe" /></Field>
                <Field label="Confirmer *"><Input required type="password" autoComplete="new-password" value={formData.password_confirm} onChange={(e) => setFormData({ ...formData, password_confirm: e.target.value })} placeholder="Répéter le mot de passe" /></Field>
              </div>
            </div>

            {errorDetail && (
              <div className="rounded-lg border-2 border-destructive/40 bg-destructive/5 p-4 space-y-2">
                <p className="text-sm font-semibold text-destructive">Votre demande n’a pas pu être envoyée.</p>
                
                <p className="text-sm text-muted-foreground">Vérifiez les informations saisies et réessayez. Si le problème persiste, contactez le service client AgriCapital.</p>
                
                
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="message" className="text-sm flex items-center gap-2"><FileText className="h-3.5 w-3.5" /> Message / Justification</Label>
              <Textarea id="message" rows={3} value={formData.message} onChange={(e) => setFormData({ ...formData, message: e.target.value })} placeholder="Expliquez pourquoi vous souhaitez rejoindre AgriCapital..." />
            </div>

            <div className="flex flex-col gap-3 pt-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={() => navigate("/login")} className="w-full sm:flex-1">Annuler</Button>
              <Button type="submit" disabled={isSubmitting || photoUploading} className="w-full sm:flex-1">{isSubmitting ? "Envoi en cours..." : photoUploading ? "Photo en cours..." : "Envoyer la demande"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

const Field = ({ label, icon, children }: { label: string; icon?: ReactNode; children: ReactNode }) => (
  <div className="min-w-0 space-y-1.5">
    <Label className="flex items-center gap-2 text-sm">{icon && <span className="shrink-0">{icon}</span>}{label}</Label>
    {children}
  </div>
);

export default AccountRequest;
