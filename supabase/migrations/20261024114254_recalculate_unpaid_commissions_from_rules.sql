create or replace function public.recalculer_commissions_depuis_grille()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  acquisition_count integer := 0;
  recovery_count integer := 0;
  technique_count integer := 0;
begin
  if not (
    private.is_global_admin(auth.uid())
    or private.has_role(auth.uid(),'pdg')
    or private.has_role(auth.uid(),'dg')
  ) then
    raise exception 'Accès réservé à la direction pour recalculer la rémunération.';
  end if;

  -- Recalculer uniquement les commissions entièrement impayées.
  -- Les commissions payées, partiellement payées ou annulées restent des historiques immuables.
  update public.commissions c
  set montant_commission = coalesce((
        select g.montant
        from public.clients cl
        join public.grille_remuneration g
          on g.code_regle = case
            when upper(concat_ws(' ',cl.formule_code,cl.famille_offre,cl.formule_nom)) like '%FLEXIBLE%'
              then 'COMMERCIAL_ACQUISITION_FLEXIBLE'
            when upper(concat_ws(' ',cl.formule_code,cl.famille_offre,cl.formule_nom)) like '%ESSENTIEL%'
              or upper(concat_ws(' ',cl.formule_code,cl.famille_offre,cl.formule_nom)) like '%PALMTERROIR%'
              then 'COMMERCIAL_ACQUISITION_ESSENTIEL'
            when upper(concat_ws(' ',cl.formule_code,cl.famille_offre,cl.formule_nom)) like '%PALMINVEST%'
              or upper(concat_ws(' ',cl.formule_code,cl.famille_offre,cl.formule_nom)) like '%TERRAPALM%'
              or upper(concat_ws(' ',cl.formule_code,cl.famille_offre,cl.formule_nom)) like '%TERRA PALM%'
              then 'COMMERCIAL_ACQUISITION_PARTENAIRE'
            else null
          end
        where cl.id = c.client_id and g.actif
        order by g.updated_at desc
        limit 1
      ),0),
      date_calcul = now()
  where lower(coalesce(c.type_commission,'')) = 'acquisition'
    and lower(coalesce(c.statut,'')) in ('calculee','validee')
    and c.client_id is not null;
  get diagnostics acquisition_count = row_count;

  update public.commissions c
  set taux_commission = coalesce((
        select g.taux_pourcentage
        from public.paiements p
        join public.clients cl on cl.id = p.client_id
        join public.grille_remuneration g
          on g.code_regle = case
            when upper(concat_ws(' ',cl.formule_code,cl.famille_offre,cl.formule_nom)) like '%FLEXIBLE%'
              then 'COMMERCIAL_REC_FLEXIBLE'
            when upper(concat_ws(' ',cl.formule_code,cl.famille_offre,cl.formule_nom)) like '%ESSENTIEL%'
              or upper(concat_ws(' ',cl.formule_code,cl.famille_offre,cl.formule_nom)) like '%PALMTERROIR%'
              then 'COMMERCIAL_REC_ESSENTIEL'
            when upper(concat_ws(' ',cl.formule_code,cl.famille_offre,cl.formule_nom)) like '%PALMINVEST%'
              or upper(concat_ws(' ',cl.formule_code,cl.famille_offre,cl.formule_nom)) like '%TERRAPALM%'
              or upper(concat_ws(' ',cl.formule_code,cl.famille_offre,cl.formule_nom)) like '%TERRA PALM%'
              then 'COMMERCIAL_REC_PARTENAIRE_AN' ||
                least(3,greatest(1,ceil(coalesce(p.numero_echeance,1)::numeric / 12.0)::integer))::text
            else null
          end
        where p.id = c.paiement_id and g.actif
        order by g.updated_at desc
        limit 1
      ),0),
      taux_applique = coalesce((
        select g.taux_pourcentage
        from public.paiements p
        join public.clients cl on cl.id = p.client_id
        join public.grille_remuneration g
          on g.code_regle = case
            when upper(concat_ws(' ',cl.formule_code,cl.famille_offre,cl.formule_nom)) like '%FLEXIBLE%'
              then 'COMMERCIAL_REC_FLEXIBLE'
            when upper(concat_ws(' ',cl.formule_code,cl.famille_offre,cl.formule_nom)) like '%ESSENTIEL%'
              or upper(concat_ws(' ',cl.formule_code,cl.famille_offre,cl.formule_nom)) like '%PALMTERROIR%'
              then 'COMMERCIAL_REC_ESSENTIEL'
            when upper(concat_ws(' ',cl.formule_code,cl.famille_offre,cl.formule_nom)) like '%PALMINVEST%'
              or upper(concat_ws(' ',cl.formule_code,cl.famille_offre,cl.formule_nom)) like '%TERRAPALM%'
              or upper(concat_ws(' ',cl.formule_code,cl.famille_offre,cl.formule_nom)) like '%TERRA PALM%'
              then 'COMMERCIAL_REC_PARTENAIRE_AN' ||
                least(3,greatest(1,ceil(coalesce(p.numero_echeance,1)::numeric / 12.0)::integer))::text
            else null
          end
        where p.id = c.paiement_id and g.actif
        order by g.updated_at desc
        limit 1
      ),0),
      montant_commission = round(coalesce(c.montant_base,0) * coalesce((
        select g.taux_pourcentage
        from public.paiements p
        join public.clients cl on cl.id = p.client_id
        join public.grille_remuneration g
          on g.code_regle = case
            when upper(concat_ws(' ',cl.formule_code,cl.famille_offre,cl.formule_nom)) like '%FLEXIBLE%'
              then 'COMMERCIAL_REC_FLEXIBLE'
            when upper(concat_ws(' ',cl.formule_code,cl.famille_offre,cl.formule_nom)) like '%ESSENTIEL%'
              or upper(concat_ws(' ',cl.formule_code,cl.famille_offre,cl.formule_nom)) like '%PALMTERROIR%'
              then 'COMMERCIAL_REC_ESSENTIEL'
            when upper(concat_ws(' ',cl.formule_code,cl.famille_offre,cl.formule_nom)) like '%PALMINVEST%'
              or upper(concat_ws(' ',cl.formule_code,cl.famille_offre,cl.formule_nom)) like '%TERRAPALM%'
              or upper(concat_ws(' ',cl.formule_code,cl.famille_offre,cl.formule_nom)) like '%TERRA PALM%'
              then 'COMMERCIAL_REC_PARTENAIRE_AN' ||
                least(3,greatest(1,ceil(coalesce(p.numero_echeance,1)::numeric / 12.0)::integer))::text
            else null
          end
        where p.id = c.paiement_id and g.actif
        order by g.updated_at desc
        limit 1
      ),0) / 100.0,2),
      date_calcul = now()
  where lower(coalesce(c.type_commission,'')) = 'recouvrement_mensuel'
    and lower(coalesce(c.statut,'')) in ('calculee','validee')
    and c.paiement_id is not null;
  get diagnostics recovery_count = row_count;

  update public.commissions c
  set montant_base = coalesce((
        select g.montant from public.grille_remuneration g
        where g.code_regle = 'TECHNIQUE_MISE_EN_TERRE' and g.actif
        order by g.updated_at desc limit 1
      ),0),
      montant_commission = coalesce((
        select g.montant from public.grille_remuneration g
        where g.code_regle = 'TECHNIQUE_MISE_EN_TERRE' and g.actif
        order by g.updated_at desc limit 1
      ),0),
      taux_commission = 0,
      taux_applique = 0,
      date_calcul = now()
  where lower(coalesce(c.type_commission,'')) = 'technique'
    and lower(coalesce(c.statut,'')) in ('calculee','validee');
  get diagnostics technique_count = row_count;

  perform public.recalculer_portefeuilles_commissions();

  return jsonb_build_object(
    'ok',true,
    'acquisition_recalculee',acquisition_count,
    'recouvrement_recalcule',recovery_count,
    'technique_recalculee',technique_count,
    'commissions_payees_preservees',true
  );
end;
$function$;
