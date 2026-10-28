import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/integrations/supabase/client";
import { uploadFile } from "@/utils/storage";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSafeErrorMessage } from "@/lib/safeError";
import { useAppRoles, useDepartementsEntreprise } from "@/hooks/useReferentiels";
import CountryPhoneInput from "@/components/common/CountryPhoneInput";
import FileUploadVisual from "@/components/ui/file-upload-visual";
import { ROLES as APP_ROLES, normalizeRoles } from "@/lib/roles";
import { logAdminAction } from "@/lib/audit";
import { useSystemReferences } from "@/hooks/useSystemReferences";
import RoleGeographyFields from "@/components/common/RoleGeographyFields";


const userFormSchema = z.object({
  username: z.string()
    .trim()
    .min(2, "Le nom d'utilisateur est obligatoire")
    .max(64, "Le nom d'utilisateur ne peut pas dépasser 64 caractères"),
  email: z.string()
    .email("Email invalide")
    .max(255, "L'email ne peut pas dépasser 255 caractères"),
  nom: z.string().trim().min(1, "Le nom est obligatoire").max(100, "Le nom ne peut pas dépasser 100 caractères"),
  prenoms: z.string().trim().min(1, "Le prénom est obligatoire").max(100, "Le prénom ne peut pas dépasser 100 caractères"),
  telephone: z.string().nullish(),
  telephone_local: z.string().nullish(),
  telephone_secondaire: z.string().nullish(),
  telephone_secondaire_local: z.string().nullish(),
  telephone_secondaire_indicatif: z.string().nullish(),
  telephone_whatsapp: z.boolean().optional(),
  telephone_secondaire_whatsapp: z.boolean().optional(),
  telephone_indicatif: z.string().nullish(),
  district_id: z.string().uuid().optional().or(z.literal("")),
  region_id: z.string().uuid().optional().or(z.literal("")),
  departement_geo_id: z.string().uuid().optional().or(z.literal("")),
  sous_prefecture_id: z.string().uuid().optional().or(z.literal("")),
  whatsapp: z.string().nullish(),
  whatsapp_local: z.string().nullish(),
  whatsapp_indicatif: z.string().nullish(),
  type_piece_identite: z.string().optional().or(z.literal("")),
  numero_piece_identite: z.string().optional().or(z.literal("")),
  salaire_base: z.string().optional().or(z.literal("")),
});

interface UtilisateurFormProps {
  utilisateur?: any;
  onSuccess: () => void;
  onCancel: () => void;
}

const UtilisateurFormNew = ({ utilisateur, onSuccess, onCancel }: UtilisateurFormProps) => {
  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm({
    resolver: zodResolver(userFormSchema),
    defaultValues: utilisateur ? { ...utilisateur, nom: utilisateur.nom || String(utilisateur.nom_complet || "").trim().split(/\\s+/).slice(-1)[0] || "", prenoms: utilisateur.prenoms || String(utilisateur.nom_complet || "").trim().split(/\\s+/).slice(0,-1).join(" ") || "" } : {},
  });
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [createdAccount, setCreatedAccount] = useState<{ user_id: string; tempPassword: string } | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<string[]>(
    utilisateur?.user_roles?.map((r: any) => r.role).filter(Boolean) || [],
  );
  const [primaryRole, setPrimaryRole] = useState<string>(
    utilisateur?.user_roles?.find((r: any) => r.is_primary === true)?.role || "",
  );
  const [equipes, setEquipes] = useState<any[]>([]);
  const [photoPreview, setPhotoPreview] = useState<string>(utilisateur?.photo_url || "");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [pieceRectoFile, setPieceRectoFile] = useState<File | null>(null);
  const [pieceVersoFile, setPieceVersoFile] = useState<File | null>(null);
  const [piecePassportFile, setPiecePassportFile] = useState<File | null>(null);
  const relationRH = watch("relation_rh");
  const [primaryIsWhatsapp, setPrimaryIsWhatsapp] = useState(Boolean(utilisateur?.telephone_principal_whatsapp ?? utilisateur?.telephone_whatsapp));
  const [secondaryIsWhatsapp, setSecondaryIsWhatsapp] = useState(Boolean(utilisateur?.telephone_secondaire_whatsapp));
  const departementSelectionne = watch("departement") ?? utilisateur?.departement;

  // Référentiels dynamiques : la base de données est la seule source de vérité.
  const { departements: departementsEntreprise, requiresCoverage } = useDepartementsEntreprise();
  const { roles: rolesDisponibles } = useAppRoles();
  const { byCategory: refs } = useSystemReferences(["piece_identite","relation_rh"]);

  useEffect(() => {
    if (!rolesDisponibles.length) return;
    const officialCodes = new Set<string>(rolesDisponibles.map((r) => String(r.code)));
    setSelectedRoles((current) => {
      const next = current.filter((role) => officialCodes.has(role));
      if (next.length === current.length && next.every((role, index) => role === current[index])) return current;
      return next;
    });
    setPrimaryRole((current) => current && officialCodes.has(current) ? current : "");
  }, [rolesDisponibles]);

  // La couverture territoriale dépend du rôle principal, pas seulement du département RH.
  const governanceOnly = relationRH === "PDG" || relationRH === "Associé / Actionnaire";
  const GEO_ROLES = ["responsable_district","responsable_zone","responsable_commercial","chef_equipe_commercial","commercial","technicien","mobilisateur_foncier","chef_equipe_technique","superviseur_mobilisation_fonciere","responsable_technique_agronomique"];
  const effectivePrimaryRole = primaryRole || selectedRoles[0] || "";
  const needsCoverage = useMemo(() => !governanceOnly && GEO_ROLES.includes(effectivePrimaryRole), [effectivePrimaryRole, governanceOnly]);
  const isCommercialProfile = departementSelectionne === "Commercial";
  const isTechniqueProfile = departementSelectionne === "Technique";
  const showEquipe = isCommercialProfile || isTechniqueProfile;
  const equipesFiltrees = useMemo(() => {
    if (isCommercialProfile) return equipes.filter((e) => !e.type_equipe || e.type_equipe === "commercial");
    if (isTechniqueProfile) return equipes.filter((e) => !e.type_equipe || e.type_equipe === "technique");
    return equipes;
  }, [equipes, isCommercialProfile, isTechniqueProfile]);

  useEffect(() => { fetchEquipes(); }, []);

  const fetchEquipes = async () => {
    const { data } = await (supabase as any).from("equipes").select("*").eq("actif", true).order("nom");
    if (data) setEquipes(data);
  };

  const requiredGeoLevel = (role: string): "district_id" | "region_id" | "departement_geo_id" | "sous_prefecture_id" | null => {
    const code = role === "responsable_zone" ? "responsable_district" : role;
    if (code === "responsable_district") return "district_id";
    if (code === "responsable_commercial" || code === "superviseur_mobilisation_fonciere" || code === "responsable_technique_agronomique") return "region_id";
    if (code === "chef_equipe_commercial" || code === "chef_equipe_technique" || code === "technicien" || code === "commercial" || code === "mobilisateur_foncier") return "departement_geo_id";
    return null;
  };

  const savePrimaryZoneAssignment = async (userId: string, data: any) => {
    const field = needsCoverage ? requiredGeoLevel(effectivePrimaryRole) : null;
    const zoneId = field ? (data[field] || utilisateur?.[field] || null) : null;
    const zoneType = field === "district_id" ? "district" : field === "region_id" ? "region" : field === "departement_geo_id" ? "departement" : field === "sous_prefecture_id" ? "sous_prefecture" : null;
    const { error } = await (supabase as any).rpc("set_user_primary_zone_assignment", {
      p_user_id: userId,
      p_zone_type: zoneId ? zoneType : null,
      p_zone_id: zoneId,
    });
    if (error) throw error;
  };

  useEffect(() => {
    if (!utilisateur?.user_id || !needsCoverage) return;
    const field = requiredGeoLevel(effectivePrimaryRole);
    const zoneType = field === "district_id" ? "district" : field === "region_id" ? "region" : field === "departement_geo_id" ? "departement" : field === "sous_prefecture_id" ? "sous_prefecture" : null;
    if (!field || !zoneType) return;
    void (async () => {
      const { data, error } = await (supabase as any).from("zone_assignments").select("zone_id").eq("user_id", utilisateur.user_id).eq("zone_type", zoneType).limit(1).maybeSingle();
      if (!error && data?.zone_id) setValue(field, data.zone_id);
    })();
  }, [utilisateur?.user_id, primaryRole, needsCoverage, setValue]);



  const onSubmit = async (data: any) => {
    if (selectedRoles.length === 0) {
      toast({ variant: "destructive", title: "Rôle requis", description: "Sélectionnez au moins un rôle officiel." });
      return;
    }
    if (!primaryRole || !selectedRoles.includes(primaryRole)) {
      toast({ variant: "destructive", title: "Rôle principal requis", description: "Choisissez un rôle principal parmi les rôles attribués." });
      return;
    }
    const requiredGeo = needsCoverage ? requiredGeoLevel(primaryRole) : null;
    const existingGeoValue = requiredGeo ? (utilisateur?.[requiredGeo] || (requiredGeo === "departement_geo_id" ? utilisateur?.departement_geo_id : null)) : null;
    if (requiredGeo && !data[requiredGeo] && !existingGeoValue) {
      toast({ variant: "destructive", title: "Couverture requise", description: "Sélectionnez la zone géographique exigée par le rôle principal." });
      return;
    }
    const normalizedNom = String(data.nom || "").trim().toLocaleUpperCase("fr-FR");
    const normalizedPrenoms = String(data.prenoms || "").trim().toLocaleUpperCase("fr-FR");
    const fullName = [normalizedPrenoms, normalizedNom].filter(Boolean).join(" ");
    setLoading(true);
    try {

      let photoUrl = utilisateur?.photo_url;
      let pieceRectoUrl = utilisateur?.piece_identite_recto_url || utilisateur?.piece_identite_url || null;
      let pieceVersoUrl = utilisateur?.piece_identite_verso_url || null;
      let piecePassportUrl = utilisateur?.piece_identite_page_principale_url || null;

      // Les photos administrées sont rangées dans le dossier du compte cible.
      const file = photoFile;
      if (file && utilisateur) {
        const targetUserId = utilisateur?.user_id || utilisateur?.id;
        if (!targetUserId) throw new Error("Compte utilisateur introuvable");
        const uploadedPhoto = await uploadFile("photos-profils", file, `profiles/${targetUserId}`);
        if (!uploadedPhoto?.path) throw new Error("Téléversement de la photo impossible.");
        // Stocke uniquement le chemin; l'URL signée courte est générée à l'affichage.
        photoUrl = uploadedPhoto.path;
      }

      if (utilisateur) {
        const targetUserId = utilisateur?.user_id || utilisateur?.id;
        if (!targetUserId) throw new Error("Compte utilisateur introuvable");
        const uploadIdentity = async (file: File | null, side: string) => {
          if (!file) return null;
          const uploaded = await uploadFile("pieces-identite", file, `profiles/${targetUserId}`);
          if (!uploaded?.path) throw new Error(`Téléversement de la pièce d'identité impossible : ${side}`);
          return uploaded.path;
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
            nom: normalizedNom,
            prenoms: normalizedPrenoms,
            nom_complet: fullName,
            username: String(data.username || "").trim(),
            email: String(data.email || "").trim(),
            nom: normalizedNom,
            prenoms: normalizedPrenoms,
            telephone: data.telephone || null,
            telephone_indicatif: data.telephone_indicatif || null,
            telephone_local: data.telephone_local || null,
            telephone_principal_whatsapp: primaryIsWhatsapp,
            telephone_secondaire: data.telephone_secondaire || null,
            telephone_secondaire_local: data.telephone_secondaire_local || null,
            telephone_secondaire_indicatif: data.telephone_secondaire_indicatif || null,
            telephone_secondaire_whatsapp: secondaryIsWhatsapp,
            whatsapp: data.whatsapp || null,
            whatsapp_indicatif: data.whatsapp_indicatif || null,
            whatsapp_local: data.whatsapp_local || null,
            departement: data.departement || null,
            relation_rh: data.relation_rh || null,
            salaire_base: data.salaire_base === "" || data.salaire_base == null ? null : Number(data.salaire_base),
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

        const baseSalary = data.salaire_base === "" || data.salaire_base == null ? null : Number(data.salaire_base);
        if (baseSalary !== null && Number.isFinite(baseSalary) && baseSalary > 0) {
          const { error: salaryError } = await (supabase as any).from("finance_salary_profiles")
            .upsert({ profile_id: utilisateur.id, base_salary: baseSalary, pay_day: 28, active: true }, { onConflict: "profile_id" });
          if (salaryError) throw salaryError;
        } else {
          const { error: salaryError } = await (supabase as any).from("finance_salary_profiles")
            .update({ active: false }).eq("profile_id", utilisateur.id);
          if (salaryError) throw salaryError;
        }

        // Les rôles sont liés au compte Auth. Un ancien profil sans compte de connexion
        // ne doit jamais provoquer une erreur de clé étrangère.
        const uid = utilisateur.user_id;
        const anciensRoles = (utilisateur?.user_roles?.map((r: any) => String(r.role)).filter(Boolean) || []).filter((role: string) => rolesDisponibles.some((r) => String(r.code) === role));
        if (uid) {
          const { error: deleteRolesError } = await (supabase as any).from("user_roles").delete().eq("user_id", uid);
          if (deleteRolesError) throw deleteRolesError;
          const { error: insertRolesError } = await (supabase as any).from("user_roles").insert(
            selectedRoles.map((role) => ({ user_id: uid, role, is_primary: role === primaryRole }))
          );
          if (insertRolesError) throw insertRolesError;

          await savePrimaryZoneAssignment(uid, data);

          await logAdminAction({
            action: "MODIFICATION_UTILISATEUR",
            entite: "profiles",
            entite_id: utilisateur.id,
            cible_user_id: uid,
            cible_libelle: fullName,
            ancienne_valeur: { roles: anciensRoles, departement: utilisateur?.departement },
            nouvelle_valeur: { roles: selectedRoles, departement: data.departement },
          });
          toast({ title: "Succès", description: "Utilisateur modifié" });
        } else {
          toast({ title: "Profil modifié", description: "Le profil est enregistré. Aucun rôle n'a été modifié car ce personnel ne possède pas encore de compte de connexion." });
        }

      } else {
        const tempPassword = createdAccount?.tempPassword || "Ac0000";
        let result: any;
        if (createdAccount) {
          // Reprendre les opérations secondaires sans recréer un compte déjà créé.
          result = { success: true, user_id: createdAccount.user_id };
        } else {
          const { data: createdResult, error } = await supabase.functions.invoke("admin-manage-user", {
            body: {
            action: "create_user",
            username: data.username,
            email: data.email,
            nom_complet: fullName,
            telephone: data.telephone || null,
            telephone_indicatif: data.telephone_indicatif || null,
            telephone_local: data.telephone_local || null,
            telephone_principal_whatsapp: primaryIsWhatsapp,
            telephone_secondaire: data.telephone_secondaire || null,
            telephone_secondaire_local: data.telephone_secondaire_local || null,
            telephone_secondaire_indicatif: data.telephone_secondaire_indicatif || null,
            telephone_secondaire_whatsapp: secondaryIsWhatsapp,
            whatsapp: data.whatsapp || null,
            whatsapp_indicatif: data.whatsapp_indicatif || null,
            whatsapp_local: data.whatsapp_local || null,
            departement: data.departement || null,
            equipe_id: data.equipe_id || null,
            relation_rh: data.relation_rh || 'Employé',
            taux_commission: data.taux_commission || null,
            district_id: data.district_id || null,
            region_id: data.region_id || null,
            departement_geo_id: data.departement_geo_id || null,
            sous_prefecture_id: data.sous_prefecture_id || null,
            photo_url: photoUrl,
            type_piece_identite: data.type_piece_identite || null,
            numero_piece_identite: data.numero_piece_identite || null,
            roles: selectedRoles,
            primary_role: primaryRole,
            }
          });

          if (error) throw error;
          if (!createdResult?.success || !createdResult?.user_id) throw new Error(createdResult?.error || "Le compte utilisateur n’a pas été confirmé.");
          result = createdResult;
          // Mémoriser le compte dès sa création : une erreur de salaire ou de média
          // ne doit pas obliger à recréer le même compte à la prochaine tentative.
          setCreatedAccount({ user_id: result.user_id, tempPassword: createdResult.temp_password || tempPassword });
        }

        // La création initiale attribue déjà les rôles de manière transactionnelle.
        // En cas de reprise après une étape secondaire échouée, resynchroniser les rôles du compte existant.
        if (createdAccount) {
          const { data: savedRoles, error: savedRolesError } = await supabase.functions.invoke("admin-manage-user", {
            body: { action: "set_roles", user_id: result.user_id, roles: selectedRoles, primary_role: primaryRole },
          });
          if (savedRolesError || savedRoles?.error || savedRoles?.success !== true) {
            throw new Error(savedRoles?.error || savedRolesError?.message || "L'enregistrement du rôle principal n'a pas été confirmé.");
          }
        }

        const baseSalary = data.salaire_base === "" || data.salaire_base == null ? null : Number(data.salaire_base);
        const { data: newProfile, error: newProfileError } = await (supabase as any).from("profiles")
          .select("id").eq("user_id", result.user_id).single();
        if (newProfileError) throw newProfileError;
        if (baseSalary !== null && Number.isFinite(baseSalary) && baseSalary > 0) {
          const { error: salaryError } = await (supabase as any).from("profiles").update({ salaire_base: baseSalary }).eq("id", newProfile.id);
          if (salaryError) throw salaryError;
          const { error: salaryConfigError } = await (supabase as any).from("finance_salary_profiles")
            .upsert({ profile_id: newProfile.id, base_salary: baseSalary, pay_day: 28, active: true }, { onConflict: "profile_id" });
          if (salaryConfigError) throw salaryConfigError;
        }

        if (file && result.user_id) {
          const uploadedPhoto = await uploadFile("photos-profils", file, `profiles/${result.user_id}`);
          if (!uploadedPhoto?.path) throw new Error("Téléversement de la photo impossible.");
          const { error: photoProfileError } = await (supabase as any)
            .from("profiles")
            .update({ photo_url: uploadedPhoto.path })
            .eq("user_id", result.user_id);
          if (photoProfileError) throw photoProfileError;
        }

        if (result.user_id && (pieceRectoFile || pieceVersoFile || piecePassportFile)) {
          const uploadIdentity = async (file: File | null, side: string) => {
            if (!file) return null;
            const uploaded = await uploadFile("pieces-identite", file, `profiles/${result.user_id}`);
            if (!uploaded?.path) throw new Error(`Téléversement de la pièce d'identité impossible : ${side}`);
            return uploaded.path;
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

        await savePrimaryZoneAssignment(result.user_id, data);

        toast({
          title: createdAccount ? "Enregistrement du compte terminé" : "Utilisateur créé",
          description: `Mot de passe temporaire (à communiquer en privé): ${tempPassword}`,
          duration: 20000,
        });
        setCreatedAccount(null);
      }
      onSuccess();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erreur", description: getSafeErrorMessage(error) });
    } finally {
      setLoading(false);
    }
  };

  const toggleRole = (role: string) => {
    setSelectedRoles(prev => {
      const next = prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role];
      setPrimaryRole(current => {
        if (next.includes(current)) return current;
        // À la création, le premier rôle choisi devient le candidat principal.
        return prev.length === 0 && next.length > 0 ? next[0] : "";
      });
      return next;
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className={`user-form min-w-0 ${utilisateur ? "user-edit-compact" : "space-y-4 sm:space-y-6"}`}>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg sm:text-xl leading-tight">Informations Personnelles</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4 min-w-0">
          <div className="space-y-2">
            <Label>Nom *</Label>
            <Input {...register("nom", { required: true, onChange: e => setValue("nom", e.target.value.toLocaleUpperCase("fr-FR")) })} defaultValue={utilisateur?.nom || String(utilisateur?.nom_complet || "").trim().split(/\\s+/).slice(-1)[0] || ""} />
            {errors.nom?.message && <p className="text-sm text-destructive">{String(errors.nom.message)}</p>}
          </div>
          <div className="space-y-2">
            <Label>Prénom *</Label>
            <Input {...register("prenoms", { required: true, onChange: e => setValue("prenoms", e.target.value.toLocaleUpperCase("fr-FR")) })} defaultValue={utilisateur?.prenoms || String(utilisateur?.nom_complet || "").trim().split(/\\s+/).slice(0,-1).join(" ") || ""} />
            {errors.prenoms?.message && <p className="text-sm text-destructive">{String(errors.prenoms.message)}</p>}
          </div>

          <div className="space-y-2">
            <Label>Username *</Label>
            <Input {...register("username", { required: true })} />
            {errors.username?.message && <p className="text-sm text-destructive">{String(errors.username.message)}</p>}
          </div>

          {!utilisateur && <div className="sm:col-span-2 rounded-md border border-primary/20 bg-primary/5 p-3 text-sm"><span className="font-medium">Mot de passe initial automatique : Ac0000.</span> Le changement sera obligatoire à la première connexion.</div>}

          <div className="space-y-2">
            <Label>Email *</Label>
            <Input type="email" {...register("email", { required: true })} />
            {errors.email?.message && <p className="text-sm text-destructive">{String(errors.email.message)}</p>}
          </div>

          <div className="space-y-2">
            <Label>Numéro de téléphone principal</Label>
            <CountryPhoneInput label="" countryCode={watch("telephone_indicatif")||undefined} localValue={watch("telephone_local") || (() => { const raw=String(watch("telephone") || ""); const cc=String(watch("telephone_indicatif") || ""); return raw.startsWith(cc) ? raw.slice(cc.length) : raw; })()} onChange={v=>{setValue("telephone_indicatif",v.callingCode);setValue("telephone_local",v.localValue);setValue("telephone",v.internationalValue)}}/>
            {errors.telephone?.message && <p className="text-sm text-destructive">{String(errors.telephone.message)}</p>}
          </div>

          <div className="space-y-2">
            <Label>Numéro de téléphone secondaire</Label>
            <CountryPhoneInput label="" countryCode={watch("telephone_secondaire_indicatif")||undefined} localValue={watch("telephone_secondaire_local") || String(watch("telephone_secondaire") || "").replace(/^\\+?\\d{1,4}/, "")} onChange={v=>{setValue("telephone_secondaire_indicatif",v.callingCode);setValue("telephone_secondaire_local",v.localValue);setValue("telephone_secondaire",v.internationalValue)}}/>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox checked={primaryIsWhatsapp} onCheckedChange={v=>setPrimaryIsWhatsapp(v===true)} />
            <Label>Le numéro principal est WhatsApp</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox checked={secondaryIsWhatsapp} onCheckedChange={v=>setSecondaryIsWhatsapp(v===true)} />
            <Label>Le numéro secondaire est WhatsApp</Label>
          </div>

          {utilisateur && (<div className="col-span-2 min-w-0 flex items-center gap-3">
            <div className="shrink-0">
              <FileUploadVisual label="Photo de profil" field="photo" accept="image/*" compact currentPreview={photoPreview} onFileChange={(_,f,p)=>{setPhotoPreview(p);setPhotoFile(f)}} />
            </div>
          </div>)}
        </CardContent>
      </Card>

      {utilisateur && (
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
                compact={!!utilisateur}
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
                  compact={!!utilisateur}
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
                  compact={!!utilisateur}
                  onFileChange={(_, f) => setPieceVersoFile(f)}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>


      )}      <Card>
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
          <div className="space-y-2">
            <Label>Rôle principal *</Label>
            <Select value={primaryRole} onValueChange={setPrimaryRole}>
              <SelectTrigger>
                <SelectValue placeholder="Choisir le rôle principal" />
              </SelectTrigger>
              <SelectContent>
                {rolesDisponibles.filter((role) => selectedRoles.includes(role.code)).map((role) => (
                  <SelectItem key={role.code} value={role.code}>{role.nom}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Le rôle principal détermine le périmètre hiérarchique principal. Les autres rôles peuvent ajouter des permissions complémentaires.</p>
          </div>
          {selectedRoles.length === 0 && (
            <p className="text-sm text-destructive">Au moins un rôle officiel doit être attribué.</p>
          )}
        </CardContent>
      </Card>

<Card>
        <CardHeader>
          <CardTitle>{utilisateur ? "Relation RH et Département" : "Couverture géographique"}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {utilisateur && <div className="space-y-2">
            <Label>Relation RH *</Label>
            <Select
              defaultValue={utilisateur?.relation_rh}
              onValueChange={(value) => {
                setValue("relation_rh", value);
                if (value === "PDG") setSelectedRoles((current) => current.includes(APP_ROLES.PDG) ? current : [...current, APP_ROLES.PDG]);
                else if (value === "Associé / Actionnaire") setSelectedRoles((current) => current.includes(APP_ROLES.ASSOCIE_ACTIONNAIRE) ? current : [...current, APP_ROLES.ASSOCIE_ACTIONNAIRE]);
              }}
            >
              <SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
              <SelectContent>{refs("relation_rh").map((r:any)=><SelectItem key={r.id} value={r.code}>{r.libelle}</SelectItem>)}</SelectContent>
            </Select>
          </div>}
          {utilisateur && !governanceOnly && <div className="space-y-2">
            <Label>Département *</Label>
            <Select defaultValue={utilisateur?.departement} onValueChange={(value) => {
              setValue("departement", value);
              if (value !== "Commercial" && value !== "Technique") setValue("equipe_id", null);
            }}>
              <SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
              <SelectContent>{departementsEntreprise.map((d) => <SelectItem key={d.id} value={d.nom}>{d.nom}</SelectItem>)}</SelectContent>
            </Select>
          </div>}
          {utilisateur && <div className="space-y-2">
            <Label>Salaire de base mensuel (FCFA)</Label>
            <Input type="number" min="0" step="1" {...register("salaire_base")} defaultValue={utilisateur?.salaire_base ?? ""} placeholder="Laisser vide si non salarié" />
          </div>}
          {utilisateur && !governanceOnly && showEquipe && <div className="space-y-2">
            <Label>Équipe</Label>
            <Select defaultValue={utilisateur?.equipe_id} onValueChange={(value) => setValue("equipe_id", value)}>
              <SelectTrigger><SelectValue placeholder="Sélectionner une équipe" /></SelectTrigger>
              <SelectContent>{equipesFiltrees.map((eq) => <SelectItem key={eq.id} value={eq.id}>{eq.nom}</SelectItem>)}</SelectContent>
            </Select>
          </div>}
          {utilisateur && relationRH === "Prestataire" && !governanceOnly && <div className="space-y-2">
            <Label>Taux Commission (FCFA par ha)</Label>
            <Input type="number" step="1" {...register("taux_commission")} placeholder="Ex: 2500" />
          </div>}
          {needsCoverage && <div className="sm:col-span-2 space-y-2">
            <Label>Couverture géographique *</Label>
            <RoleGeographyFields
              role={effectivePrimaryRole}
              required
              value={{ districtId: watch("district_id") || utilisateur?.district_id, regionId: watch("region_id") || utilisateur?.region_id, departementId: watch("departement_geo_id") || utilisateur?.departement_geo_id, sousPrefectureId: watch("sous_prefecture_id") || utilisateur?.sous_prefecture_id }}
              className="grid grid-cols-1 gap-3 sm:grid-cols-2"
              onChange={(g) => {
                setValue("district_id", g.districtId || "");
                setValue("region_id", g.regionId || "");
                setValue("departement_geo_id", g.departementId || "");
                setValue("sous_prefecture_id", g.sousPrefectureId || "");
              }}
            />
          </div>}
        </CardContent>
      </Card>

{createdAccount && <div role="status" className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
        Le compte de connexion est déjà créé. Une étape secondaire a échoué ; cliquez de nouveau sur « Finaliser » pour reprendre sans créer un second compte.
      </div>}
      <div className="flex justify-end gap-4">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={loading}>
          Annuler
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? "Enregistrement..." : createdAccount ? "Finaliser" : utilisateur ? "Modifier" : "Créer"}
        </Button>
      </div>
    </form>
  );
};

export default UtilisateurFormNew;
