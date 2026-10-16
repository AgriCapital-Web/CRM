-- Lead -> Prospect -> Client relational pipeline.
-- Applied to Supabase project rfzfsmpsuempafhkqhra on 2026-10-16.
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_statut_check;
ALTER TABLE public.leads ADD CONSTRAINT leads_statut_check CHECK (statut = ANY (ARRAY['nouveau','contacte','interesse','tres_interesse','qualifie','en_discussion','preparation_dossier','pret_souscrire','converti','abandonne']::text[]));

CREATE TABLE IF NOT EXISTS public.prospects (
 id uuid primary key default gen_random_uuid(),
 lead_id uuid not null unique references public.leads(id) on delete restrict,
 client_id uuid references public.clients(id) on delete set null,
 proprietaire_id uuid references public.proprietaires_terres(id) on delete set null,
 nom text not null, prenoms text not null, civilite text, telephone text not null, whatsapp text, email text,
 district_id uuid, region_id uuid, departement_id uuid, sous_prefecture_id uuid, village_id uuid, campement_id uuid,
 region_residence text, campement_quartier text, type_lead text not null default 'client',
 offre_code text, formule_code text, dispose_terrain boolean not null default false,
 superficie_disponible_ha numeric, superficie_a_valoriser_ha numeric, superficie_souhaitee_ha numeric,
 delai_demarrage text, date_contact_souhaitee date, creneau_prefere text, mode_contact_prefere text,
 statut text not null default 'qualifie', source text not null, assigned_to uuid, created_by uuid, commentaire text,
 converted_client_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
CREATE INDEX IF NOT EXISTS prospects_assigned_created_idx ON public.prospects(assigned_to,created_at DESC);
CREATE INDEX IF NOT EXISTS prospects_client_id_idx ON public.prospects(client_id);
CREATE INDEX IF NOT EXISTS prospects_proprietaire_id_idx ON public.prospects(proprietaire_id);
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS prospect_id uuid;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='leads_prospect_id_fkey') THEN
  ALTER TABLE public.leads ADD CONSTRAINT leads_prospect_id_fkey FOREIGN KEY(prospect_id) REFERENCES public.prospects(id) ON DELETE SET NULL;
 END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS leads_prospect_id_unique_idx ON public.leads(prospect_id) WHERE prospect_id IS NOT NULL;

ALTER TABLE public.prospects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS prospects_staff_select ON public.prospects;
CREATE POLICY prospects_staff_select ON public.prospects FOR SELECT TO authenticated USING (
 private.is_global_admin(auth.uid()) OR (private.has_role_permission('leads.view') AND (created_by=auth.uid() OR assigned_to=auth.uid() OR private.can_access_lead(auth.uid(),lead_id))
);
DROP POLICY IF EXISTS prospects_staff_insert ON public.prospects;
CREATE POLICY prospects_staff_insert ON public.prospects FOR INSERT TO authenticated WITH CHECK (
 private.is_global_admin(auth.uid()) OR (private.has_role_permission('leads.create') AND created_by=auth.uid() AND (assigned_to IS NULL OR assigned_to=auth.uid() OR private.can_supervise_leads(auth.uid()) OR private.can_service_assign_lead(auth.uid(),assigned_to))
);
DROP POLICY IF EXISTS prospects_staff_update ON public.prospects;
CREATE POLICY prospects_staff_update ON public.prospects FOR UPDATE TO authenticated USING (
 private.is_global_admin(auth.uid()) OR (private.has_role_permission('leads.update') AND (created_by=auth.uid() OR assigned_to=auth.uid()))
) WITH CHECK (
 private.is_global_admin(auth.uid()) OR (private.has_role_permission('leads.update') AND (created_by=auth.uid() OR assigned_to=auth.uid()))
);
DROP POLICY IF EXISTS prospects_global_delete ON public.prospects;
CREATE POLICY prospects_global_delete ON public.prospects FOR DELETE TO authenticated USING (private.is_global_admin(auth.uid()) OR private.has_role_permission('leads.delete'));
GRANT SELECT,INSERT,UPDATE,DELETE ON public.prospects TO authenticated;

CREATE OR REPLACE FUNCTION public.convert_lead_to_prospect(_lead_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,private AS $$
DECLARE l public.leads%rowtype; p_id uuid;
BEGIN
 SELECT * INTO l FROM public.leads WHERE id=_lead_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Lead introuvable'; END IF;
 IF NOT (private.is_global_admin(auth.uid()) OR ((private.has_role_permission('leads.update') OR private.has_role_permission('leads.create')) AND (l.created_by=auth.uid() OR l.assigned_to=auth.uid() OR private.can_access_lead(auth.uid(),l.id)))) THEN RAISE EXCEPTION 'Permission insuffisante pour convertir ce lead'; END IF;
 IF l.prospect_id IS NOT NULL THEN RETURN l.prospect_id; END IF;
 SELECT id INTO p_id FROM public.prospects WHERE lead_id=l.id;
 IF p_id IS NULL THEN
  INSERT INTO public.prospects(lead_id,proprietaire_id,nom,prenoms,civilite,telephone,whatsapp,email,district_id,region_id,departement_id,sous_prefecture_id,village_id,campement_id,region_residence,campement_quartier,type_lead,offre_code,formule_code,dispose_terrain,superficie_disponible_ha,superficie_a_valoriser_ha,superficie_souhaitee_ha,delai_demarrage,date_contact_souhaitee,creneau_prefere,mode_contact_prefere,statut,source,assigned_to,created_by,commentaire)
  VALUES(l.id,l.proprietaire_id,l.nom,l.prenoms,l.civilite,l.telephone,l.whatsapp,l.email,l.district_id,l.region_id,l.departement_id,l.sous_prefecture_id,l.village_id,l.campement_id,l.region_residence,l.campement_quartier,l.type_lead,l.offre_code,l.formule_code,l.dispose_terrain,l.superficie_disponible_ha,l.superficie_a_valoriser_ha,l.superficie_souhaitee_ha,l.delai_demarrage,l.date_contact_souhaitee,l.creneau_prefere,l.mode_contact_prefere,'qualifie',l.source,l.assigned_to,auth.uid(),l.commentaire)
  RETURNING id INTO p_id;
 END IF;
 UPDATE public.leads SET prospect_id=p_id,etape_pipeline='prospect',etape_conversion='prospect',statut='qualifie',updated_at=now() WHERE id=l.id;
 RETURN p_id;
END $$;
GRANT EXECUTE ON FUNCTION public.convert_lead_to_prospect(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.convert_prospect_to_client(_prospect_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,private AS $$
DECLARE p public.prospects%rowtype; v_client_id uuid;
BEGIN
 SELECT * INTO p FROM public.prospects WHERE id=_prospect_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Prospect introuvable'; END IF;
 IF NOT (private.is_global_admin(auth.uid()) OR ((private.has_role_permission('leads.update') OR private.has_role_permission('clients.create')) AND (p.created_by=auth.uid() OR p.assigned_to=auth.uid() OR private.can_access_lead(auth.uid(),p.lead_id)))) THEN RAISE EXCEPTION 'Permission insuffisante pour convertir ce prospect'; END IF;
 IF p.client_id IS NOT NULL THEN RETURN p.client_id; END IF;
 SELECT id INTO v_client_id FROM public.clients WHERE telephone=p.telephone LIMIT 1;
 IF v_client_id IS NULL THEN
  INSERT INTO public.clients(nom_famille,prenoms,nom_complet,nom,telephone,whatsapp,email,type_client,type_client_foncier,statut,statut_global,created_by,commercial_id,proprietaire_id,district_id,region_id,departement_id,sous_prefecture_id,village_id,campement_id,domicile,offre_id,famille_offre,formule_code,formule_nom,compte_actif,phase_actuelle)
  VALUES(p.nom,p.prenoms,trim(concat_ws(' ',p.prenoms,p.nom)),trim(concat_ws(' ',p.prenoms,p.nom)),p.telephone,p.whatsapp,p.email,
    CASE WHEN p.type_lead='proprietaire_foncier' THEN 'avec_terre' ELSE 'sans_terre' END,'EXT','actif','actif',auth.uid(),p.assigned_to,p.proprietaire_id,p.district_id,p.region_id,p.departement_id,p.sous_prefecture_id,p.village_id,p.campement_id,p.campement_quartier,
    (SELECT o.id FROM public.offres o WHERE o.code=p.offre_code LIMIT 1),nullif(p.offre_code,''),nullif(p.formule_code,''),nullif(p.formule_code,''),false,'pre_activation')
  RETURNING id INTO v_client_id;
 END IF;
 UPDATE public.prospects SET client_id=v_client_id,converted_client_at=now(),statut='converti',updated_at=now() WHERE id=p.id;
 UPDATE public.leads SET client_id=v_client_id,etape_pipeline='converti',etape_conversion='prospect',statut='converti',converti_at=coalesce(converti_at,now()),updated_at=now() WHERE id=p.lead_id;
 RETURN v_client_id;
END $$;
GRANT EXECUTE ON FUNCTION public.convert_prospect_to_client(uuid) TO authenticated;
