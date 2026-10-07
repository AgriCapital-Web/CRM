import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { X } from "lucide-react";
import { useSystemReferences } from "@/hooks/useSystemReferences";
import { getSafeErrorMessage } from "@/lib/safeError";

interface TicketFormProps {
  ticket?: any;
  plantationId?: string;
  onSuccess: () => void;
  onCancel: () => void;
  readOnly?: boolean;
}

const TicketForm = ({ ticket, plantationId, onSuccess, onCancel, readOnly = false }: TicketFormProps) => {
  const { register, handleSubmit, setValue, watch } = useForm({ defaultValues: ticket || {} });
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [clients, setClients] = useState<any[]>([]);
  const [plantations, setPlantations] = useState<any[]>([]);
  const [techniciens, setTechniciens] = useState<any[]>([]);
  const [regions, setRegions] = useState<any[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const { byCategory: refs } = useSystemReferences(["ticket_type","ticket_priorite","ticket_statut"]);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);

  const clientId = watch("client_id");
  const regionId = watch("region_id");
  const selectedPlantation = watch("plantation_id");

  useEffect(() => {
    const fetchData = async () => {
      const [{ data: clientsData }, { data: plantsData }, { data: regionsData }, { data: techniciansData }] = await Promise.all([
        (supabase as any).from("clients").select("id,id_unique,nom_complet,nom_famille,prenoms,region_id").not("statut","in","(archive,supprime)").order("nom_complet"),
        (supabase as any).from("plantations").select("id,id_unique,nom_plantation,client_id").order("created_at", { ascending: false }),
        (supabase as any).from("regions").select("id,nom").order("nom"),
        (supabase as any).rpc("get_technician_directory"),
      ]);
      setClients(clientsData || []);
      setPlantations(plantsData || []);
      setRegions(regionsData || []);
      // Le RPC applique le périmètre métier côté base ; l'UI ne reconstruit pas une liste globale.\n      setTechniciens((techniciansData || []).map((t:any) => ({ ...t, id: t.profile_id })));
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (clientId) {
      const client = clients.find(c => c.id === clientId);
      if (client?.region_id) setValue("region_id", client.region_id);
    }
  }, [clientId, clients, setValue]);

  const regionTechnicians = useMemo(
    () => techniciens,
    [techniciens]
  );

  const clientPlantations = useMemo(
    () => clientId ? plantations.filter(p => p.client_id === clientId) : plantations,
    [clientId, plantations]
  );

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setPhotoFiles(prev => [...prev, ...files]);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => setPhotoPreviews(prev => [...prev, reader.result as string]);
      reader.readAsDataURL(file);
    });
  };

  const removePhoto = (index: number) => {
    setPhotoPreviews(prev => prev.filter((_, i) => i !== index));
    setPhotoFiles(prev => prev.filter((_, i) => i !== index));
  };

  const onSubmit = async (data: any) => {
    if (!user) return;
    if (!data.client_id) {
      toast({ variant: "destructive", title: "Client requis" });
      return;
    }
    if (!data.region_id) {
      toast({ variant: "destructive", title: "Région requise" });
      return;
    }
    if (!data.plantation_id) {
      toast({ variant: "destructive", title: "Plantation requise" });
      return;
    }
    if (!data.assigne_a) {
      toast({ variant: "destructive", title: "Technicien requis", description: "Sélectionnez un technicien de la région du client." });
      return;
    }

    setLoading(true);
    try {
      const photosUrls: string[] = [];
      for (const file of photoFiles) {
        const fileExt = file.name.split(".").pop();
        const fileName = `support/${crypto.randomUUID()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage.from("photos-plantations").upload(fileName, file);
        if (uploadError) throw uploadError;
        const { data: publicData } = supabase.storage.from("photos-plantations").getPublicUrl(fileName);
        photosUrls.push(publicData.publicUrl);
      }

      const tech = techniciens.find(t => t.id === data.assigne_a);
      const payload = {
        ...data,
        photos_urls: photosUrls.length ? photosUrls : null,
        cree_par: ticket?.cree_par || undefined,
        statut: ticket?.statut || "ouvert",
        equipe_id: tech?.equipe_id || null,
        assigne_le: data.assigne_a !== ticket?.assigne_a ? new Date().toISOString() : ticket?.assigne_le || null,
      };

      if (ticket) {
        const { error } = await (supabase as any).from("tickets_techniques").update(payload).eq("id", ticket.id);
        if (error) throw error;
        toast({ title: "Succès", description: "Demande support mise à jour" });
      } else {
        const { data: profile } = await (supabase as any).from("profiles").select("id").eq("user_id", user.id).maybeSingle();
        const { error } = await (supabase as any).from("tickets_techniques").insert({ ...payload, cree_par: profile?.id || null });
        if (error) throw error;
        toast({ title: "Succès", description: "Demande créée et affectée au technicien" });
      }
      onSuccess();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erreur", description: getSafeErrorMessage(error) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Card><CardContent className="pt-6 space-y-4">
        <div className="space-y-2">
          <Label>Client *</Label>
          <Select defaultValue={ticket?.client_id} onValueChange={v => setValue("client_id", v)} disabled={readOnly}>
            <SelectTrigger><SelectValue placeholder="Sélectionner le client" /></SelectTrigger>
            <SelectContent>
              {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.id_unique} — {c.nom_complet || [c.prenoms,c.nom_famille].filter(Boolean).join(" ")}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Région du client *</Label>
            <Select value={regionId || ""} onValueChange={v => setValue("region_id", v)} disabled>
              <SelectTrigger><SelectValue placeholder="Région automatique" /></SelectTrigger>
              <SelectContent>{regions.map(r => <SelectItem key={r.id} value={r.id}>{r.nom}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Plantation *</Label>
            <Select value={selectedPlantation || ""} onValueChange={v => setValue("plantation_id", v)} disabled={!!plantationId || readOnly}>
              <SelectTrigger><SelectValue placeholder="Sélectionner la plantation" /></SelectTrigger>
              <SelectContent>{clientPlantations.map(p => <SelectItem key={p.id} value={p.id}>{p.id_unique} — {p.nom_plantation}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
      </CardContent></Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2"><Label>Catégorie du problème *</Label>
          <Select defaultValue={ticket?.categorie || "etat_plantation"} onValueChange={v => setValue("categorie", v)} disabled={readOnly}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="etat_plantation">État de la plantation</SelectItem>
              <SelectItem value="ravageurs">Ravageurs / insectes</SelectItem>
              <SelectItem value="maladie">Maladie / jaunissement</SelectItem>
              <SelectItem value="mortalite">Plants morts / dépérissement</SelectItem>
              <SelectItem value="entretien">Entretien</SelectItem>
              <SelectItem value="travaux">Travaux à réaliser</SelectItem>
              <SelectItem value="autre">Autre</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2"><Label>Priorité *</Label>
          <Select defaultValue={ticket?.priorite || "moyenne"} onValueChange={v => setValue("priorite", v)} disabled={readOnly}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{refs("ticket_priorite").map((r:any)=><SelectItem key={r.id} value={r.code}>{r.libelle}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2"><Label>Titre *</Label><Input {...register("titre", { required: true })} disabled={readOnly} /></div>
      <div className="space-y-2"><Label>Constat / problème signalé *</Label><Textarea {...register("description", { required: true })} rows={4} disabled={readOnly} placeholder="Ex. Le client signale que des agoutis coupent les jeunes plants..." /></div>
      <div className="space-y-2"><Label>Technicien de votre périmètre *</Label>
        <Select defaultValue={ticket?.assigne_a} onValueChange={v => setValue("assigne_a", v)} disabled={readOnly || !regionId}>
          <SelectTrigger><SelectValue placeholder={regionId ? "Sélectionner un technicien de votre périmètre" : "Sélectionnez d'abord un client"} /></SelectTrigger>
          <SelectContent>
            {regionTechnicians.map(t => <SelectItem key={t.id} value={t.id}>{t.nom_complet}{t.equipe_id ? " — équipe affectée" : ""}</SelectItem>)}
          </SelectContent>
        </Select>
        {regionId && regionTechnicians.length === 0 && <p className="text-xs text-destructive">Aucun technicien actif n'est actuellement disponible dans votre périmètre.</p>}
      </div>

      <Card><CardContent className="pt-6">
        <Label>Photos du problème (optionnel)</Label>
        <input type="file" accept="image/*" multiple onChange={handlePhotoChange} className="mt-2 w-full" disabled={readOnly} />
        {photoPreviews.length > 0 && <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-4">{photoPreviews.map((preview,index)=><div key={index} className="relative"><img src={preview} alt={`Photo ${index+1}`} className="w-full h-24 object-cover rounded border"/><Button type="button" variant="destructive" size="icon" className="absolute -top-2 -right-2 h-6 w-6 rounded-full" onClick={()=>removePhoto(index)}><X className="h-4 w-4"/></Button></div>)}</div>}
      </CardContent></Card>

      {ticket && <div className="space-y-2"><Label>Statut</Label><Select defaultValue={ticket.statut} onValueChange={v=>setValue("statut",v)} disabled={readOnly}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{refs("ticket_statut").map((r:any)=><SelectItem key={r.id} value={r.code}>{r.libelle}</SelectItem>)}</SelectContent></Select></div>}

      <div className="flex justify-end gap-4"><Button type="button" variant="secondary" onClick={onCancel}>Annuler</Button><Button type="submit" disabled={loading || readOnly}>{loading ? "Enregistrement..." : ticket ? "Enregistrer" : "Créer la demande"}</Button></div>
    </form>
  );
};

export default TicketForm;
