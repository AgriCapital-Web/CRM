import { useEffect, useRef, useState } from "react";
import MainLayout from "@/components/layout/MainLayout";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Shield, KeyRound, Save, Lock, Upload, UserRound, Camera } from "lucide-react";
import { useSignedUrl } from "@/hooks/useSignedUrl";
import { formatUserProfileName } from "@/lib/utils";
import { uploadFile } from "@/utils/storage";
import PieceTypeSelect from "@/components/common/PieceTypeSelect";
import CountryPhoneInput from "@/components/common/CountryPhoneInput";

const FileField = ({ label, onPick, current, bucket }: { label: string; onPick: (f: File) => Promise<void> | void; current?: string | null; bucket: string }) => {
  const currentUrl = useSignedUrl(bucket, current);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string>("");
  const [previewIsImage, setPreviewIsImage] = useState(false);
  const isPhoto = label.toLocaleLowerCase("fr-FR").includes("photo");
  const handleFile = (file?: File) => {
    if (!file) return;
    setPreviewIsImage(file.type.startsWith("image/"));
    const reader = new FileReader();
    reader.onload = () => setPreview(String(reader.result || ""));
    reader.onerror = () => setPreview("");
    reader.readAsDataURL(file);
    void Promise.resolve(onPick(file)).catch(() => setPreview(''));
  };
  const shown = preview || currentUrl || "";
  const isImage = preview ? previewIsImage : isPhoto || [".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".heic"].some((ext) => (current || "").toLowerCase().includes(ext));
  return (
    <div className="min-w-0 space-y-2">
      <Label>{label}</Label>
      <input ref={cameraRef} type="file" accept="image/*" capture={isPhoto ? "user" : "environment"} className="sr-only" onChange={(e) => { handleFile(e.currentTarget.files?.[0]); e.currentTarget.value = ""; }} />
      <input ref={fileRef} type="file" accept="image/*,application/pdf" className="sr-only" onChange={(e) => { handleFile(e.currentTarget.files?.[0]); e.currentTarget.value = ""; }} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Button type="button" variant="outline" className="w-full justify-start" onClick={() => cameraRef.current?.click()}><Camera className="mr-2 h-4 w-4" />Prendre une photo</Button>
        <Button type="button" variant="outline" className="w-full justify-start" onClick={() => fileRef.current?.click()}><Upload className="mr-2 h-4 w-4" />{current ? "Remplacer le fichier" : "Importer un fichier"}</Button>
      </div>
      {shown ? <div className="overflow-hidden rounded-md border bg-muted/20">
        {isImage ? <img src={shown} alt={"Aperçu — " + label} className="mx-auto max-h-64 w-full object-contain" /> : preview ? <object data={shown} type="application/pdf" className="h-64 w-full"><a href={shown} target="_blank" rel="noreferrer">Consulter le document</a></object> : <div className="p-3 text-sm text-muted-foreground">Document enregistré</div>}
        <div className="border-t p-2 text-xs text-muted-foreground">{preview ? "Aperçu du fichier sélectionné" : "Fichier enregistré"}</div>
      </div> : current ? <p className="text-xs text-muted-foreground">Chargement du fichier enregistré…</p> : <p className="text-xs text-muted-foreground">Utilisez la caméra ou choisissez un fichier sur votre appareil.</p>}
    </div>
  );
};

const Profil = () => {
  const { user, refreshProfile } = useAuth();
  const { isPdg, isDg } = usePermissions();
  const isAdmin = isPdg || isDg;
  const { toast } = useToast();
  const [profile, setProfile] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const { data, error } = await (supabase as any).from("profiles").select("*").eq("user_id", user.id).maybeSingle();
      if (error) toast({ variant: "destructive", title: "Profil indisponible", description: error.message });
      if (data) setProfile(data);
    })();
  }, [user?.id]);

  const set = (k: string, v: any) => setProfile((p: any) => ({ ...p, [k]: v }));

  const upload = async (field: string, bucket: string, file: File) => {
    if (!user?.id) return;
    setUploading(field);
    try {
      const res = await uploadFile(bucket, file, user.id);
      if (!res?.path) throw new Error("Le stockage n'a pas confirmé l'enregistrement du fichier.");
      set(field, res.path);
      toast({ title: "Fichier téléversé", description: "Cliquez sur Enregistrer pour associer le fichier à votre profil." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Envoi impossible", description: error?.message || "Le fichier n'a pas pu être envoyé." });
      throw error;
    } finally {
      setUploading(null);
    }
  };

  const save = async () => {
    if (!user?.id) return;
    setSaving(true);
    try {
      const fields = [
        "nom_complet", "adresse_mail_secondaire", "telephone_secondaire", "telephone_secondaire_indicatif", "telephone_secondaire_local", "whatsapp", "whatsapp_indicatif", "whatsapp_local", "ville", "quartier",
        "type_piece_identite", "numero_piece_identite", "photo_url", "piece_identite_recto_url", "piece_identite_verso_url",
        "contact_urgence_nom", "contact_urgence_telephone1", "contact_urgence_telephone1_indicatif", "contact_urgence_telephone1_local", "contact_urgence_telephone2", "contact_urgence_telephone2_indicatif", "contact_urgence_telephone2_local", "contact_urgence_email", "contact_urgence_photo_url",
      ];
      const payload: any = {};
      fields.forEach((k) => (payload[k] = profile[k] ?? null));
      if (isAdmin) {
        payload.email = profile.email || null;
        payload.telephone = profile.telephone || null;
        payload.telephone_indicatif = profile.telephone_indicatif || null;
        payload.telephone_local = profile.telephone_local || null;
        payload.whatsapp = profile.whatsapp || null;
        payload.whatsapp_indicatif = profile.whatsapp_indicatif || null;
        payload.whatsapp_local = profile.whatsapp_local || null;
        payload.username = profile.username || null;
        payload.poste = profile.poste || null;
      }
      const { data: savedProfile, error } = await (supabase as any)
        .from("profiles")
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .select("user_id")
        .maybeSingle();
      if (error) throw error;
      if (!savedProfile?.user_id) {
        throw new Error("Aucune modification n'a été confirmée par la base de données. Vérifiez vos droits d'accès puis réessayez.");
      }
      if (isAdmin && profile.email && profile.email !== user.email) {
        const { error: e } = await supabase.auth.updateUser({ email: profile.email });
        if (e) throw e;
      }
      await refreshProfile();
      toast({ title: "Profil mis à jour" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Modification impossible", description: e?.message || "Erreur inconnue" });
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async () => {
    if (!newPassword) return;
    setPasswordSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword("");
      toast({ title: "Mot de passe modifié" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Mot de passe impossible", description: e?.message || "Erreur" });
    } finally {
      setPasswordSaving(false);
    }
  };

  const photoUrl = useSignedUrl("photos-profils", profile.photo_url);
  const urgPhotoUrl = useSignedUrl("photos-profils", profile.contact_urgence_photo_url);
  const initials = formatUserProfileName(profile.nom_complet || "AgriCapital").split(/[\s,]+/).filter(Boolean).map((x: string) => x[0]).join("").slice(0, 2);
  const lockHint = isAdmin ? undefined : "Modifiable uniquement par l'administrateur";

  return (
    <ProtectedRoute>
      <MainLayout>
        <div className="mx-auto w-full max-w-5xl space-y-5">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Mon profil</h1>
            <p className="text-sm text-muted-foreground">
              <Lock className="inline h-4 w-4 mr-1" />
              {isAdmin ? "Accès total à votre profil." : "Email principal, téléphone principal, nom d'utilisateur et poste sont verrouillés : seul l'administrateur peut les modifier."}
            </p>
          </div>

          <Card>
            <CardContent className="p-5">
              <div className="flex flex-col sm:flex-row items-center gap-5">
                <Avatar className="h-24 w-24">
                  <AvatarImage src={photoUrl || ""} />
                  <AvatarFallback className="bg-primary text-primary-foreground text-xl">{initials || "AG"}</AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <h2 className="text-xl font-bold">{formatUserProfileName(profile.nom_complet || "AgriCapital")}</h2>
                  <p className="text-sm text-muted-foreground">{profile.poste || "—"}</p>
                  <p className="text-sm text-muted-foreground">{profile.email || user?.email || "—"}</p>
                </div>
                <div className="w-full sm:w-64">
                  <FileField label={uploading === "photo_url" ? "Envoi…" : "Ma photo"} current={profile.photo_url} onPick={(f) => upload("photo_url", "photos-profils", f)} bucket="photos-profils" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Informations personnelles</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><Label>Nom complet</Label><Input value={profile.nom_complet || ""} onChange={(e) => set("nom_complet", e.target.value)} /></div>
              <div><Label>Nom d'utilisateur</Label><Input value={profile.username || ""} disabled={!isAdmin} title={lockHint} onChange={(e) => set("username", e.target.value)} /></div>
              <div><Label>Email principal</Label><Input type="email" value={profile.email || user?.email || ""} disabled={!isAdmin} title={lockHint} onChange={(e) => set("email", e.target.value)} /></div>
              <div>
                <CountryPhoneInput
                  label="Téléphone principal"
                  countryCode={profile.telephone_indicatif || undefined}
                  localValue={profile.telephone_local || profile.telephone || ""}
                  disabled={!isAdmin}
                  onChange={(v) => { set("telephone_indicatif", v.callingCode); set("telephone_local", v.localValue); set("telephone", v.internationalValue); }}
                />
              </div>
              <div className="md:col-span-2"><Label>Poste (selon vos rôles)</Label><Input value={profile.poste || ""} disabled title="Mis à jour automatiquement depuis les rôles attribués par l'administrateur" /></div>
              <div><Label>Email secondaire</Label><Input type="email" value={profile.adresse_mail_secondaire || ""} onChange={(e) => set("adresse_mail_secondaire", e.target.value)} /></div>
              <CountryPhoneInput
                label="Téléphone secondaire"
                countryCode={profile.telephone_secondaire_indicatif || undefined}
                localValue={profile.telephone_secondaire_local || profile.telephone_secondaire || ""}
                onChange={(v) => { set("telephone_secondaire_indicatif", v.callingCode); set("telephone_secondaire_local", v.localValue); set("telephone_secondaire", v.internationalValue); }}
              />
              <CountryPhoneInput
                label="WhatsApp"
                countryCode={profile.whatsapp_indicatif || undefined}
                localValue={profile.whatsapp_local || profile.whatsapp || ""}
                onChange={(v) => { set("whatsapp_indicatif", v.callingCode); set("whatsapp_local", v.localValue); set("whatsapp", v.internationalValue); }}
              />
              <div><Label>Ville</Label><Input value={profile.ville || ""} onChange={(e) => set("ville", e.target.value)} /></div>
              <div><Label>Quartier</Label><Input value={profile.quartier || ""} onChange={(e) => set("quartier", e.target.value)} /></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" />Pièce d'identité</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><Label>Type de pièce</Label><PieceTypeSelect value={profile.type_piece_identite || ""} onChange={(v) => set("type_piece_identite", v)} /></div>
              <div><Label>Numéro de pièce</Label><Input value={profile.numero_piece_identite || ""} onChange={(e) => set("numero_piece_identite", e.target.value)} /></div>
              <FileField label={uploading === "piece_identite_recto_url" ? "Envoi…" : "Pièce — recto"} current={profile.piece_identite_recto_url} onPick={(f) => upload("piece_identite_recto_url", "pieces-identite", f)} bucket="pieces-identite" />
              <FileField label={uploading === "piece_identite_verso_url" ? "Envoi…" : "Pièce — verso"} current={profile.piece_identite_verso_url} onPick={(f) => upload("piece_identite_verso_url", "pieces-identite", f)} bucket="pieces-identite" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><UserRound className="h-5 w-5" />Personne à contacter en cas d'urgence</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2 flex items-center gap-4">
                <Avatar className="h-16 w-16"><AvatarImage src={urgPhotoUrl || ""} /><AvatarFallback>{(profile.contact_urgence_nom || "?").slice(0, 2)}</AvatarFallback></Avatar>
                <div className="flex-1"><FileField label={uploading === "contact_urgence_photo_url" ? "Envoi…" : "Photo de la personne"} current={profile.contact_urgence_photo_url} onPick={(f) => upload("contact_urgence_photo_url", "photos-profils", f)} bucket="photos-profils" /></div>
              </div>
              <div className="md:col-span-2"><Label>Contact urgence — Nom et Prénoms</Label><Input value={profile.contact_urgence_nom || ""} onChange={(e) => set("contact_urgence_nom", e.target.value)} /></div>
              <CountryPhoneInput
                label="Contact urgence — Téléphone 1"
                countryCode={profile.contact_urgence_telephone1_indicatif || undefined}
                localValue={profile.contact_urgence_telephone1_local || profile.contact_urgence_telephone1 || ""}
                onChange={(v) => { set("contact_urgence_telephone1_indicatif", v.callingCode); set("contact_urgence_telephone1_local", v.localValue); set("contact_urgence_telephone1", v.internationalValue); }}
              />
              <CountryPhoneInput
                label="Contact urgence — Téléphone 2"
                countryCode={profile.contact_urgence_telephone2_indicatif || undefined}
                localValue={profile.contact_urgence_telephone2_local || profile.contact_urgence_telephone2 || ""}
                onChange={(v) => { set("contact_urgence_telephone2_indicatif", v.callingCode); set("contact_urgence_telephone2_local", v.localValue); set("contact_urgence_telephone2", v.internationalValue); }}
              />
              <div className="md:col-span-2"><Label>Contact urgence — Email (facultatif)</Label><Input type="email" value={profile.contact_urgence_email || ""} onChange={(e) => set("contact_urgence_email", e.target.value)} /></div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={save} disabled={saving || !!uploading}><Save className="mr-2 h-4 w-4" />{saving ? "Enregistrement…" : "Enregistrer"}</Button>
          </div>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5" />Sécurité</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Label>Nouveau mot de passe</Label>
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Saisissez librement votre nouveau mot de passe" />
              <Button onClick={changePassword} disabled={passwordSaving || !newPassword}><KeyRound className="mr-2 h-4 w-4" />{passwordSaving ? "Modification…" : "Modifier le mot de passe"}</Button>
            </CardContent>
          </Card>
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
};

export default Profil;
