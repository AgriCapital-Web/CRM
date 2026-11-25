create or replace function public.notification_resolve_recipients(_criteres jsonb default '{}'::jsonb)
returns table(source_type text, source_id uuid, user_id uuid, nom_complet text, email text, telephone text, role_code text, offre_id uuid, offre_code text, offre_nom text)
language sql
stable
security definer
set search_path to ''
as $function$
with criteria as (
  select lower(trim(coalesce(_criteres->>'audience','tous'))) audience
),
contacts(source_type,source_id,user_id,nom_complet,email,telephone,role_code,offre_id,offre_code,offre_nom) as (
  select
    case when ur.role is not null and lower(ur.role) not in ('client','customer','utilisateur','user','beneficiaire') then 'equipe' else 'utilisateur' end,
    p.id,p.user_id,
    coalesce(nullif(trim(p.nom_complet),''),concat_ws(' ',p.prenoms,p.nom)),
    p.email,
    coalesce(nullif(trim(p.telephone),''),nullif(trim(p.whatsapp),''),nullif(trim(p.telephone_secondaire),'')),
    ur.role,null::uuid,null::text,null::text
  from public.profiles p
  left join lateral (
    select r.role from public.user_roles r
    where r.user_id=p.user_id order by r.created_at limit 1
  ) ur on true
  where coalesce(p.actif,true) and p.type_compte = 'interne'

  union all

  select
    case when c.proprietaire_id is not null and c.type_client='beneficiaire_particulier' then 'proprietaire_foncier+beneficiaire_particulier'
      when c.proprietaire_id is not null then 'proprietaire_foncier'
      when c.type_client='beneficiaire_particulier' then 'beneficiaire_particulier' else 'client' end,
    c.id,c.user_id,
    coalesce(nullif(trim(c.nom_complet),''),concat_ws(' ',c.prenoms,c.nom)),
    c.email,
    coalesce(nullif(trim(c.telephone),''),nullif(trim(c.whatsapp),''),nullif(trim(c.telephone_secondaire),'')),
    null::text,c.offre_id,o.code,o.nom
  from public.clients c
  left join public.offres o on o.id=c.offre_id
  where coalesce(c.statut_global,'actif') not in ('archive','supprime')
    and coalesce(c.statut,'actif') not in ('archive','supprime')

  union all

  select 'prospect',p.id,null::uuid,
    coalesce(nullif(trim(p.nom_complet),''),concat_ws(' ',p.prenoms,p.nom)),
    p.email,
    coalesce(nullif(trim(p.telephone),''),nullif(trim(p.whatsapp),''),nullif(trim(p.telephone_secondaire),'')),
    null::text,null::uuid,p.offre_code,o.nom
  from public.prospects p
  left join public.offres o on lower(o.code)=lower(p.offre_code)
  where coalesce(p.statut,'') not in ('converti','converti_client','archive','supprime')
    and p.client_id is null

  union all

  select 'lead',l.id,null::uuid,
    coalesce(nullif(trim(l.nom_complet),''),concat_ws(' ',l.prenoms,l.nom)),
    l.email,
    coalesce(nullif(trim(l.telephone),''),nullif(trim(l.whatsapp),''),nullif(trim(l.telephone_secondaire),'')),
    null::text,o.id,l.offre_code,o.nom
  from public.leads l
  left join public.offres o on lower(o.code)=lower(l.offre_code)
  where coalesce(l.etape_pipeline,'lead')<>'prospect'
    and coalesce(l.statut,'') not in ('converti','converti_client','archive','supprime')
    and l.client_id is null

  union all

  select 'proprietaire_foncier',p.id,null::uuid,
    coalesce(nullif(trim(p.nom_complet),''),nullif(trim(p.denomination_sociale),''),concat_ws(' ',p.prenoms,p.nom)),
    p.email,
    coalesce(nullif(trim(p.telephone),''),nullif(trim(p.whatsapp),''),nullif(trim(p.telephone_secondaire),'')),
    null::text,null::uuid,null::text,null::text
  from public.proprietaires_terres p
  where coalesce(p.statut,'actif') not in ('archive','supprime','inactif')

  union all

  select 'cotitulaire_proprietaire',m.id,null::uuid,concat_ws(' ',m.prenoms,m.nom),null::text,
    coalesce(nullif(trim(m.telephone),''),nullif(trim(m.whatsapp),'')),null::text,null::uuid,null::text,null::text
  from public.cotitulaires_mandataires m

  union all

  select 'cotitulaire_client',m.id,null::uuid,concat_ws(' ',m.prenoms,m.nom),m.email,
    coalesce(nullif(trim(m.telephone),''),nullif(trim(m.whatsapp),'')),null::text,null::uuid,null::text,null::text
  from public.client_cotitulaires_mandataires m
  where coalesce(m.actif,true)

  union all

  select 'autre',p.id,null::uuid,
    coalesce(nullif(trim(p.nom_complet),''),nullif(trim(p.denomination_sociale),''),concat_ws(' ',p.prenoms,p.nom)),
    p.email,
    coalesce(nullif(trim(p.telephone),''),nullif(trim(p.whatsapp),''),nullif(trim(p.telephone_secondaire),'')),
    null::text,null::uuid,null::text,null::text
  from public.crm_parties p

  union all

  select 'contact_importe',i.id,i.user_id,concat_ws(' ',i.prenoms,i.nom),i.email,
    coalesce(nullif(trim(i.phone),''),nullif(trim(i.secondary_phone),'')),
    null::text,null::uuid,null::text,null::text
  from public.imported_phone_contacts i
  where i.selected is true and i.status='pending'
)
select c.*
from contacts c
cross join criteria f
where (
  f.audience in ('tous','all','all_contacts','everyone')
  or (f.audience in ('clients','client','customers') and c.source_type='client')
  or (f.audience in ('leads','lead') and c.source_type='lead')
  or (f.audience in ('prospects','prospect') and c.source_type='prospect')
  or (f.audience in ('proprietaires_fonciers','proprietaire_foncier','owners') and c.source_type like 'proprietaire_foncier%')
  or (f.audience in ('beneficiaires_particuliers','beneficiaire_particulier','beneficiaries') and c.source_type like '%beneficiaire_particulier%')
  or (f.audience in ('equipe','equipe_interne','staff','team','personnel') and c.source_type='equipe')
  or (f.audience in ('utilisateurs','utilisateur','users') and c.source_type in ('utilisateur','equipe'))
  or (f.audience in ('autres','autre','others') and c.source_type in ('autre','cotitulaire_proprietaire','cotitulaire_client','contact_importe'))
  or (f.audience in ('commerciaux','sales_team') and c.role_code in ('commercial','responsable_commercial','chef_equipe_commercial'))
  or (f.audience in ('palminvest','palm-invest') and lower(coalesce(c.offre_code,'')) in ('palm-invest','palminvest'))
  or (f.audience in ('terrapalm','terra-palm') and lower(coalesce(c.offre_code,'')) in ('terra-palm','terrapalm'))
  or (f.audience='palmterroir' and lower(coalesce(c.offre_code,''))='palmterroir')
)
and (nullif(_criteres->>'offer_code','') is null or lower(coalesce(c.offre_code,''))=lower(_criteres->>'offer_code'))
and (nullif(_criteres->>'role_code','') is null or c.role_code=_criteres->>'role_code')
and (nullif(_criteres->>'has_email','') is null or case when (_criteres->>'has_email')::boolean then nullif(trim(c.email),'') is not null else nullif(trim(c.email),'') is null end)
and (nullif(_criteres->>'has_phone','') is null or case when (_criteres->>'has_phone')::boolean then nullif(trim(c.telephone),'') is not null else nullif(trim(c.telephone),'') is null end);
$function$;

revoke all on function public.notification_resolve_recipients(jsonb) from public, anon, authenticated;
grant execute on function public.notification_resolve_recipients(jsonb) to service_role;
