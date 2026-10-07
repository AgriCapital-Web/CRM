import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { X } from "lucide-react";
import { getSafeErrorMessage } from "@/lib/safeError";
import { useAppRoles, useDepartementsEntreprise } from "@/hooks/useReferentiels";
import CountryPhoneInput from "@/components/common/CountryPhoneInput";
import FileUploadVisual from "@/components/ui/file-upload-visual";
import { ROLES as APP_ROLES, normalizeRoles } from "@/lib/roles";
import { logAdminAction } from "@/lib/audit";
import { useSystemReferences } from "@/hooks/useSystemReferences";


const userFormSchema = z.object({
  username: z.string()
    .trim()
    .min(2, "Le nom d'utilisateur est obligatoire")
    .max(64, "Le nom d'utilisateur ne peut pas dépasser 64 caractères"),
  email: z.string()
    .email("Email invalide")
    .max(255, "L'email ne peut pas dépasser 255 caractères"),
  password: z.string()
    .min(8, "Le mot de passe doit contenir au moins 8 caractères")
    .max(128, "Le mot de passe ne peut pas dépasser 128 caractères")
    .optional(),
  nom_complet: z.string()
    .min(2, "Le nom complet doit contenir au moins 2 caractères")
    .max(100, "Le nom complet ne peut pas dépasser 100 caractères"),
  telephone: z.string().optional().or(z.literal("")),
  telephone_local: z.string().optional().or(z.literal("")),
  telephone_indicatif: z.string().optional().or(z.literal("")),
  whatsapp: z.string().optional().or(z.literal("")),
  whatsapp_local: z.string().optional().or(z.literal("")),
  whatsapp_indicatif: z.string().optional().or(z.literal("")),
  type_piece_identite: z.string().optional().or(z.literal("")),
  numero_piece_identite: z.string().optional().or(z.literal("")),
});

interface UtilisateurFormProps {
  utilisateur?: any;
  onSuccess: () => void;
  onCancel: () => void;
}

const UtilisateurFormNew = ({ utilisateur, onSuccess, onCancel }: UtilisateurFormProps) => {
  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm({
    resolver: zodResolver(userFormSchema),
    defaultValues: utilisateur || {},
  });
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [selectedRoles, setSelectedRoles] = useState<string[]>(
    utilisateur?.user_roles?.map((r: any) => r.role).filter(Boolean) || [],
  );
  const [districts, setDistricts] = useState<any[]>([]);
  const [regions, setRegions] = useState<any[]>([]);
  const [equipes, setEquipes] = useState<any[]>([]);
  const [photoPreview, setPhotoPreview] = useState<string>(utilisateur?.photo_url || "");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [pieceRectoFile, setPieceRectoFile] = useState<File | null>(null);
  const [pieceVersoFile, setPieceVersoFile] = useState<File | null>(null);
  const [piecePassportFile, setPiecePassportFile] = useState<File | null>(null);
  const relationRH = watch("relation_rh");
  const departementSelectionne = watch("departement") ?? utilisateur?.departement;

  // Référentiels dynamiques : la base de données est la seule source de vérité.
  const { departements: departementsEntreprise, requiresCoverage } = useDepartementsEntreprise();
  const { roles: rolesDisponibles } = useAppRoles();
  const { byCategory: refs } = useSystemReferences(["piece_identite","relation_rh"]);

  useEffect(() => {
    if (!rolesDisponibles.length) return;
    const officialCodes = new Set<string>(rolesDisponibles.map((r) => String(r.code)));
    setSelectedRoles((current) => current.filter((role) => officialCodes.has(role)));
  }, [rolesDisponibles]);

  // Affichage conditionnel : couverture territoriale pour Commercial / Technique
  // ou pour tout rôle disposant d'une couverture terrain.
  const governanceOnly = relationRH === "PDG" || relationRH === "Associé / Actionnaire";
  const needsCoverage = useMemo(
    () => !governanceOnly && (departementSelectionne === "Commercial" || departementSelectionne === "Technique"),
    [departementSelectionne, governanceOnly],
  );

  const isCommercialProfile = departementSelectionne === "Commercial";

  const isTechniqueProfile = departementSelectionne === "Technique";
  const showEquipe = isCommercialProfile || isTechniqueProfile;

  const equipesFiltrees = useMemo(() => {
    if (isCommercialProfile) return equipes.filter((e) => !e.type_equipe || e.type_equipe === "commerciale");
    if (isTechniqueProfile) return equipes.filter((e) => !e.type_equipe || e.type_equipe === "technique");
    return equipes;
  }, [equipes, isCommercialProfile, isTechniqueProfile]);

  useEffect(() => {
    fetchDistricts();
    fetchEquipes();
    if (utilisateur?.district_id) fetchRegions(utilisateur.district_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchDistricts = async () => {
    const { data } = await (supabase as any).from("v_geo_districts").select("*").eq("est_actif_effectif", true).order("nom");
    setDistricts(data || []);
  };

  const fetchRegions = async (districtId: string) => {
    const { data } = await (supabase as any)
      .from("v_geo_regions")
      .select("*")
      .eq("district_id", districtId)
      .eq("est_active_effectif", true)
      .order("nom");
    setRegions(data || []);
  };

  const fetchEquipes = async () => {
    const { data } = await (supabase as any).from("equipes").select("*").eq("actif", true).order("nom");
    if (data) setEquipes(data);
  };



  const onSubmit = async (data: any) => {
    const validatePhone = (local: string, callingCode: string, label: string) => {
      const digits = String(local || "").replace(/\D/g, "");
      if (!digits) return true;
      if (callingCode === "+225" && digits.length !== 10) {
        toast({ variant: "destructive", title: "Numéro invalide", description: label + " doit contenir exactement 10 chiffres en Côte d’Ivoire." });
        return false;
      }
      if (callingCode !== "+225" && (digits.length < 7 || digits.length > 15)) {
        toast({ variant: "destructive", title: "Numéro invalide", description: label + " doit contenir entre 7 et 15 chiffres pour ce pays." });
        return false;
      }
      return true;
    };
    if (!validatePhone(data.telephone_local, data.telephone_indicatif || undefined, "Le téléphone")) return;
    if (!validatePhone(data.whatsapp_local, data.whatsapp_indicatif || undefined, "Le WhatsApp")) return;
    if (selectedRoles.length === 0) {
      toast({ variant: "destructive", title: "Rôle requis", description: "Sélectionnez au moins un rôle officiel." });
      return;
    }
    if (needsCoverage && !data.region_id && !utilisateur?.region_id) {
      toast({
        variant: "destructive",
        title: "Couverture requise",
        description: "Les profils Commercial et Technique doivent avoir un district et une région de couverture.",
      });
      return;
    }
    setLoading(true);
    try {

      let photoUrl = utilisateur?.photo_url;
      let pieceRectoUrl = utilisateur?.piece_identite_recto_url || utilisateur?.piece_identite_url || null;
      let pieceVersoUrl = utilisateur?.piece_identite_verso_url || null;
      let piecePassportUrl = utilisateur?.piece_identite_page_principale_url || null;

      // Les photos administrées sont rangées dans le dossier du compte cible.
      const file = photoFile;
      if (file && utilisateur) {
        const fileExt = file.name.split('.').pop();
        const targetUserId = utilisateur?.user_id || utilisateur?.id;
        if (!targetUserId) throw new Error("Compte utilisateur introuvable");
        const fileName = `profiles/${targetUserId}/photo-${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('photos-profils')
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        // Stocke uniquement le chemin; l'URL signée courte est générée à l'affichage
        photoUrl = fileName;
      }

      if (utilisateur) {
        const targetUserId = utilisateur?.user_id || utilisateur?.id;
        if (!targetUserId) throw new Error("Compte utilisateur introuvable");
        const uploadIdentity = async (file: File | null, side: string) => {
          if (!file) return null;
          const ext = file.name.split('.').pop();
          const path = `profiles/${targetUserId}/identity-${side}-${Date.now()}.${ext}`;
          const { error } = await supabase.storage.from("pieces-identite").upload(path, file);
          if (error) throw error;
          return path;
        };
        if (data.type_piece_identite === "passeport") {
          piecePassportUrl = (await uploadIdentity(piecePassportFile, "passport")) || piecePassportUrl;
          pieceRectoUrl = null;
          pieceVersoUrl = null;
        } else {
          pieceRectoUrl = (await uploadIdentity(pieceRectoFile, "recto")) || pieceRectoUrl;
          pieceVersoUrl = (await uploadIdentity(pieceVersoFile, "verso")) || pieceVersoUrl;
          piecePassportUrl = null;
        }

        // Update existing user
        const { error: profileError } = await (supabase as any)
          .from("profiles")
          .update({
            nom_complet: String(data.nom_complet || "").trim().toUpperCase(),
            username: String(data.username || "").trim().toLowerCase(),
            email: String(data.email || "").trim(),
            telephone: data.telephone || null,
            telephone_indicatif: data.telephone_indicatif || null,
            telephone_local: data.telephone_local || null,
            whatsapp: data.whatsapp || null,
            whatsapp_indicatif: data.whatsapp_indicatif || null,
            whatsapp_local: data.whatsapp_local || null,
            departement: data.departement || null,
            relation_rh: data.relation_rh || null,
            taux_commission: data.taux_commission ? Number(data.taux_commission) : null,
            district_id: data.district_id || null,
            region_id: data.region_id || null,
            equipe_id: showEquipe ? (data.equipe_id || null) : null,
            photo_url: photoUrl || null,
            type_piece_identite: data.type_piece_identite || null,
            numero_piece_identite: data.numero_piece_identite || null,
            piece_identite_url: pieceRectoUrl || null,
            piece_identite_recto_url: pieceRectoUrl || null,
            piece_identite_verso_url: pieceVersoUrl || null,
            piece_identite_page_principale_url: piecePassportUrl || null,
          })
          .eq("id", utilisateur.id);

        if (profileError) throw profileError;

        // Les rôles sont liés au compte Auth. Un ancien profil sans compte de connexion
        // ne doit jamais provoquer une erreur de clé étrangère.
        const uid = utilisateur.user_id;
        const anciensRoles = (utilisateur?.user_roles?.map((r: any) => String(r.role)).filter(Boolean) || []).filter((role: string) => rolesDisponibles.some((r) => String(r.code) === role));
        if (uid) {
          const { error: deleteRolesError } = await (supabase as any).from("user_roles").delete().eq("user_id", uid);
          if (deleteRolesError) throw deleteRolesError;
          const { error: insertRolesError } = await (supabase as any).from("user_roles").insert(
            selectedRoles.map((role) => ({ user_id: uid, role }))
          );
          if (insertRolesError) throw insertRolesError;

          await logAdminAction({
            action: "MODIFICATION_UTILISATEUR",
            entite: "profiles",
            entite_id: utilisateur.id,
            cible_user_id: uid,
            cible_libelle: data.nom_complet,
            ancienne_valeur: { roles: anciensRoles, departement: utilisateur?.departement },
            nouvelle_valeur: { roles: selectedRoles, departement: data.departement },
          });
          toast({ title: "Succès", description: "Utilisateur modifié" });
        } else {
          toast({ title: "Profil modifié", description: "Le profil est enregistré. Aucun rôle n'a été modifié car ce personnel ne possède pas encore de compte de connexion." });
        }

      } else {
        const tempPassword = data.password || (
          crypto.randomUUID().replace(/-/g, '').slice(0, 16) + 'A1!'
        );
        const { data: result, error } = await supabase.functions.invoke('create-user', {
          body: {
            username: data.username,
            email: data.email,
            password: tempPassword,
            nom_complet: data.nom_complet,
            telephone: data.telephone || null,
            telephone_indicatif: data.telephone_indicatif || null,
            telephone_local: data.telephone_local || null,
            whatsapp: data.whatsapp || null,
            whatsapp_indicatif: data.whatsapp_indicatif || null,
            whatsapp_local: data.whatsapp_local || null,
            departement: data.departement || null,
            equipe_id: data.equipe_id || null,
            relation_rh: data.relation_rh || 'Employé',
            taux_commission: data.taux_commission || null,
            region_id: data.region_id || null,
            photo_url: photoUrl,
            type_piece_identite: data.type_piece_identite || null,
            numero_piece_identite: data.numero_piece_identite || null,
            roles: selectedRoles,
          }
        });

        if (error) throw error;
        if (!result.success) throw new Error(result.error);

        if (file && result.user_id) {
          const fileExt = file.name.split('.').pop();
          const fileName = `profiles/${result.user_id}/photo-${Date.now()}.${fileExt}`;
          const { error: photoUploadError } = await supabase.storage
            .from('photos-profils')
            .upload(fileName, file);
          if (photoUploadError) throw photoUploadError;

          const { error: photoProfileError } = await (supabase as any)
            .from("profiles")
            .update({ photo_url: fileName })
            .eq("user_id", result.user_id);
          if (photoProfileError) throw photoProfileError;
        }

        if (result.user_id && (pieceRectoFile || pieceVersoFile || piecePassportFile)) {
          const uploadIdentity = async (file: File | null, side: string) => {
            if (!file) return null;
            const ext = file.name.split('.').pop();
            const path = `profiles/${result.user_id}/identity-${side}-${Date.now()}.${ext}`;
            const { error } = await supabase.storage.from("pieces-identite").upload(path, file);
            if (error) throw error;
            return path;
          };
          let recto = null, verso = null, passport = null;
          if (data.type_piece_identite === "passeport") {
            passport = await uploadIdentity(piecePassportFile, "passport");
          } else {
            recto = await uploadIdentity(pieceRectoFile, "recto");
            verso = await uploadIdentity(pieceVersoFile, "verso");
          }
          const { error: identityError } = await (supabase as any).from("profiles").update({
            piece_identite_url: recto,
            piece_identite_recto_url: recto,
            piece_identite_verso_url: verso,
            piece_identite_page_principale_url: passport,
            type_piece_identite: data.type_piece_identite || null,
            numero_piece_identite: data.numero_piece_identite || null,
          }).eq("user_id", result.user_id);
          if (identityError) throw identityError;
        }

        toast({
          title: "Utilisateur créé",
          description: `Mot de passe temporaire (à communiquer en privé): ${tempPassword}`,
          duration: 20000,
        });
      }
      onSuccess();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erreur", description: getSafeErrorMessage(error) });
    } finally {
      setLoading(false);
    }
  };

  const toggleRole = (role: string) => {
    setSelectedRoles(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    );
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 sm:space-y-6 min-w-0">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg sm:text-xl leading-tight">Informations Personnelles</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4 min-w-0">
          <div className="space-y-2">
            <Label>Nom Complet *</Label>
            <Input {...register("nom_complet", { required: true })} />
            {errors.nom_complet?.message && <p className="text-sm text-destructive">{String(errors.nom_complet.message)}</p>}
          </div>

          <div className="space-y-2">
            <Label>Username *</Label>
            <Input {...register("username", { required: true })} />
            {errors.username?.message && <p className="text-sm text-destructive">{String(errors.username.message)}</p>}
          </div>

          {!utilisateur && (
            <div className="space-y-2">
              <Label>Mot de passe *</Label>
              <Input 
                type="password" 
                {...register("password", { required: !utilisateur })} 
                placeholder="@AgriCapital2025"
              />
              {errors.password?.message && <p className="text-sm text-destructive">{String(errors.password.message)}</p>}
            </div>
          )}

          <div className="space-y-2">
            <Label>Email *</Label>
            <Input type="email" {...register("email", { required: true })} />
            {errors.email?.message && <p className="text-sm text-destructive">{String(errors.email.message)}</p>}
          </div>

          <div className="space-y-2">
            <Label>Téléphone</Label>
            <CountryPhoneInput label="" countryCode={watch("telephone_indicatif")||"+225"} localValue={watch("telephone_local") || (() => { const raw=String(watch("telephone") || ""); const cc=String(watch("telephone_indicatif") || "+225"); return raw.startsWith(cc) ? raw.slice(cc.length) : raw; })()} onChange={v=>{setValue("telephone_indicatif",v.callingCode);setValue("telephone_local",v.localValue);setValue("telephone",v.internationalValue)}}/>
            {errors.telephone?.message && <p className="text-sm text-destructive">{String(errors.telephone.message)}</p>}
          </div>

          <div className="space-y-2">
            <Label>WhatsApp</Label>
            <CountryPhoneInput label="" countryCode={watch("whatsapp_indicatif")||"+225"} localValue={watch("whatsapp_local") || (() => { const raw=String(watch("whatsapp") || ""); const cc=String(watch("whatsapp_indicatif") || "+225"); return raw.startsWith(cc) ? raw.slice(cc.length) : raw; })()} onChange={v=>{setValue("whatsapp_indicatif",v.callingCode);setValue("whatsapp_local",v.localValue);setValue("whatsapp",v.internationalValue)}}/>
            {errors.whatsapp?.message && <p className="text-sm text-destructive">{String(errors.whatsapp.message)}</p>}
          </div>

          <div className="space-y-2 col-span-2 min-w-0">
            <Label>Photo de Profil</Label>
            <FileUploadVisual label="Photo de Profil" field="photo" accept="image/*" currentPreview={photoPreview} onFileChange={(_,f,p)=>{setPhotoPreview(p);setPhotoFile(f)}}/>
            {photoPreview && (
              <div className="mt-2 relative inline-block">
                <img
                  src={photoPreview}
                  alt="Aperçu"
                  className="w-24 h-24 object-cover rounded-full border-2 border-primary"
                />
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
                  onClick={() => setPhotoPreview("")}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Pièce d'identité</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Type de pièce</Label>
            <Select value={watch("type_piece_identite") || utilisateur?.type_piece_identite || ""} onValueChange={(value) => setValue("type_piece_identite", value)}>
              <SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
              <SelectContent>
                {refs("piece_identite").map((r:any)=><SelectItem key={r.id} value={r.code}>{r.libelle}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Numéro de pièce</Label>
            <Input {...register("numero_piece_identite")} />
          </div>
          {(watch("type_piece_identite") || utilisateur?.type_piece_identite) === "passeport" ? (
            <div className="space-y-2 sm:col-span-2">
              <Label>Page principale du passeport</Label>
              <FileUploadVisual
                label="Page principale du passeport"
                field="piecePassport"
                accept="image/*,application/pdf"
                currentPreview={utilisateur?.piece_identite_page_principale_url || ""}
                onFileChange={(_, f) => setPiecePassportFile(f)}
              />
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label>Recto</Label>
                <FileUploadVisual
                  label="Recto de la pièce"
                  field="pieceRecto"
                  accept="image/*,application/pdf"
                  currentPreview={utilisateur?.piece_identite_recto_url || utilisateur?.piece_identite_url || ""}
                  onFileChange={(_, f) => setPieceRectoFile(f)}
                />
              </div>
              <div className="space-y-2">
                <Label>Verso</Label>
                <FileUploadVisual
                  label="Verso de la pièce"
                  field="pieceVerso"
                  accept="image/*,application/pdf"
                  currentPreview={utilisateur?.piece_identite_verso_url || ""}
                  onFileChange={(_, f) => setPieceVersoFile(f)}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Relation RH et Département</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Relation RH *</Label>
            <Select
              defaultValue={utilisateur?.relation_rh}
              onValueChange={(value) => {
                setValue("relation_rh", value);
                if (value === "PDG") setSelectedRoles((current) => current.includes(APP_ROLES.PDG) ? current : [...current, APP_ROLES.PDG]);
                else if (value === "Associé / Actionnaire") setSelectedRoles((current) => current.includes(APP_ROLES.ASSOCIE_ACTIONNAIRE) ? current : [...current, APP_ROLES.ASSOCIE_ACTIONNAIRE]);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner" />
              </SelectTrigger>
              <SelectContent>
                {refs("relation_rh").map((r:any)=><SelectItem key={r.id} value={r.code}>{r.libelle}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {!governanceOnly && <div className="space-y-2">
            <Label>Département *</Label>
            <Select
              defaultValue={utilisateur?.departement}
              onValueChange={(value) => {
                setValue("departement", value);
                if (value !== "Commercial" && value !== "Technique") {
                  setValue("equipe_id", null);
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner" />
              </SelectTrigger>
              <SelectContent>
                {departementsEntreprise.map((d) => (
                  <SelectItem key={d.id} value={d.nom}>
                    {d.nom}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>}

          {!governanceOnly && showEquipe && <div className="space-y-2">
            <Label>Équipe</Label>
            <Select
              defaultValue={utilisateur?.equipe_id}
              onValueChange={(value) => setValue("equipe_id", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner une équipe" />
              </SelectTrigger>
              <SelectContent>
                {equipesFiltrees.map((eq) => (
                  <SelectItem key={eq.id} value={eq.id}>
                    {eq.nom}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>}

          {relationRH === "Prestataire" && !governanceOnly && (
            <div className="space-y-2">
              <Label>Taux Commission (FCFA par ha)</Label>
              <Input 
                type="number" 
                step="1" 
                {...register("taux_commission")}
                placeholder="Ex: 2500"
              />
            </div>
          )}

          {needsCoverage && (
            <>
              <div className="space-y-2">
                <Label>District de Couverture *</Label>
                <Select
                  defaultValue={utilisateur?.district_id}
                  onValueChange={(value) => {
                    setValue("district_id", value);
                    fetchRegions(value);
                    setValue("region_id", undefined);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner un district" />
                  </SelectTrigger>
                  <SelectContent>
                    {districts.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.nom}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Région de Couverture *</Label>
                <Select
                  defaultValue={utilisateur?.region_id}
                  onValueChange={(value) => setValue("region_id", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={regions.length ? "Sélectionner une région" : "Choisir d'abord un district"} />
                  </SelectTrigger>
                  <SelectContent>
                    {regions.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.nom}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rôles officiels</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4 border rounded-lg">
            {rolesDisponibles.map((role) => (
              <div key={role.code} className="flex items-start space-x-2">
                <Checkbox
                  id={role.code}
                  checked={selectedRoles.includes(role.code)}
                  onCheckedChange={() => !governanceOnly && toggleRole(role.code)}
                  disabled={governanceOnly}
                />
                <label htmlFor={role.code} className="text-sm cursor-pointer leading-tight">
                  <span className="font-medium">{role.nom}</span>
                  <Badge variant="outline" className="ml-2 text-[10px]">
                    Niveau {role.niveau}
                  </Badge>
                  <span className="block text-xs text-muted-foreground">{role.description}</span>
                </label>
              </div>
            ))}
          </div>
          {selectedRoles.length === 0 && (
            <p className="text-sm text-destructive">Au moins un rôle officiel doit être attribué.</p>
          )}
        </CardContent>
      </Card>


      <div className="flex justify-end gap-4">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Annuler
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? "Enregistrement..." : utilisateur ? "Modifier" : "Créer"}
        </Button>
      </div>
    </form>
  );
};

export default UtilisateurFormNew;
