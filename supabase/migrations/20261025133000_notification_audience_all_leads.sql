create or replace function public.notification_resolve_recipients(_criteres jsonb default '{}'::jsonb)
returns table(source_type text,source_id uuid,user_id uuid,nom_complet text,email text,telephone text,role_code text,offre_id uuid,offre_code text,offre_nom text)
language sql stable security definer set search_path=public as $function$
with contacts(source_type,source_id,user_id,nom_complet,email,telephone,role_code,offre_id,offre_code,offre_nom) as (
 select 'equipe',p.id,p.user_id,p.nom_complet,p.email,coalesce(p.telephone,p.whatsapp),ur.role,null::uuid,null::text,null::text
 from public.profiles p
 left join lateral (select r.role from public.user_roles r where r.user_id=p.user_id order by r.created_at limit 1) ur on true
 where coalesce(p.actif,true) and public.is_staff(p.user_id)
 union all
 select case when c.proprietaire_id is not null and c.type_client='beneficiaire_particulier' then 'proprietaire_foncier+beneficiaire_particulier'
 when c.proprietaire_id is not null then 'proprietaire_foncier' when c.type_client='beneficiaire_particulier' then 'beneficiaire_particulier' else 'client' end,
 c.id,c.user_id,coalesce(nullif(c.nom_complet,''),concat_ws(' ',c.prenoms,c.nom_famille)),c.email,coalesce(c.telephone,c.whatsapp),null::text,c.offre_id,o.code,o.nom
 from public.clients c left join public.offres o on o.id=c.offre_id
 where coalesce(c.statut_global,'actif') not in ('archive','supprime') and coalesce(c.compte_actif,true)
 union all
 select 'prospect',l.id,null::uuid,concat_ws(' ',nullif(l.prenoms,''),nullif(l.nom,'')),l.email,coalesce(nullif(l.whatsapp,''),l.telephone),null::text,o.id,l.offre_code,o.nom
 from public.leads l left join public.offres o on lower(o.code)=lower(l.offre_code)
 where l.etape_pipeline='prospect' and coalesce(l.statut,'') not in ('converti','converti_client','archive','supprime') and l.client_id is null
 union all
 select 'lead',l.id,null::uuid,concat_ws(' ',nullif(l.prenoms,''),nullif(l.nom,'')),l.email,coalesce(nullif(l.whatsapp,''),l.telephone),null::text,o.id,l.offre_code,o.nom
 from public.leads l left join public.offres o on lower(o.code)=lower(l.offre_code)
 where coalesce(l.etape_pipeline,'lead') <> 'prospect'
 and coalesce(l.statut,'') not in ('converti','converti_client','archive','supprime')
 and l.client_id is null
)
select c.* from contacts c
where (
 coalesce(_criteres->>'audience','tous') in ('tous','all')
 or (coalesce(_criteres->>'audience','') in ('clients','client') and c.source_type='client')
 or (coalesce(_criteres->>'audience','') in ('leads','lead') and c.source_type='lead')
 or (coalesce(_criteres->>'audience','') in ('prospects','prospect') and c.source_type='prospect')
 or (coalesce(_criteres->>'audience','') in ('proprietaires_fonciers','proprietaire_foncier','owners') and c.source_type like 'proprietaire_foncier%')
 or (coalesce(_criteres->>'audience','') in ('beneficiaires_particuliers','beneficiaire_particulier','beneficiaries') and c.source_type like '%beneficiaire_particulier%')
 or (coalesce(_criteres->>'audience','') in ('equipe','equipe_interne','staff','team') and c.source_type='equipe')
 or (coalesce(_criteres->>'audience','')='commerciaux' and c.role_code in ('commercial','responsable_commercial','chef_equipe_commercial'))
 or (coalesce(_criteres->>'audience','')='palminvest' and lower(coalesce(c.offre_code,''))='palm-invest')
 or (coalesce(_criteres->>'audience','')='terrapalm' and lower(coalesce(c.offre_code,''))='terra-palm')
 or (coalesce(_criteres->>'audience','')='palmterroir' and lower(coalesce(c.offre_code,''))='palmterroir')
)
and (nullif(_criteres->>'offer_code','') is null or lower(coalesce(c.offre_code,''))=lower(_criteres->>'offer_code'))
and (nullif(_criteres->>'role_code','') is null or c.role_code=_criteres->>'role_code')
and (nullif(_criteres->>'has_email','') is null or case when (_criteres->>'has_email')::boolean then nullif(trim(c.email),'') is not null else nullif(trim(c.email),'') is null end)
and (nullif(_criteres->>'has_phone','') is null or case when (_criteres->>'has_phone')::boolean then nullif(trim(c.telephone),'') is not null else nullif(trim(c.telephone),'') is null end);
$function$;