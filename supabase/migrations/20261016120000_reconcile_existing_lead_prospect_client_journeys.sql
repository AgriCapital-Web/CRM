-- Reconcile existing lead/prospect/client journeys using unique phone/email matches.
-- Ambiguous matches are intentionally skipped. Function can be safely rerun.
create or replace function public.reconcile_lead_prospect_client_links()
returns jsonb language plpgsql security definer set search_path=public,private as $$
declare v_lc int:=0; v_pc int:=0; v_lp int:=0;
begin
  with candidates as (
    select l.id lead_id,c.id client_id from public.leads l join public.clients c
    on (regexp_replace(coalesce(l.telephone,''),'\D','','g')<>'' and regexp_replace(coalesce(l.telephone,''),'\D','','g')=regexp_replace(coalesce(c.telephone,''),'\D','','g'))
    or (lower(trim(coalesce(l.email,'')))<>'' and lower(trim(coalesce(l.email,'')))=lower(trim(coalesce(c.email,''))))
  ), lc as (select lead_id,min(client_id::text)::uuid client_id from candidates group by lead_id having count(distinct client_id)=1),
  cc as (select client_id,count(distinct lead_id) n from candidates group by client_id),
  safe as (select lc.* from lc join cc using(client_id) where cc.n=1),
  upd as (update public.leads l set client_id=s.client_id,etape_pipeline='converti',statut='converti',converti_at=coalesce(l.converti_at,now()),updated_at=now()
    from safe s where l.id=s.lead_id and (l.client_id is null or l.client_id=s.client_id) returning l.id)
  select count(*) into v_lc from upd;

  with candidates as (
    select p.id prospect_id,c.id client_id from public.prospects p join public.clients c
    on (regexp_replace(coalesce(p.telephone,''),'\D','','g')<>'' and regexp_replace(coalesce(p.telephone,''),'\D','','g')=regexp_replace(coalesce(c.telephone,''),'\D','','g'))
    or (lower(trim(coalesce(p.email,'')))<>'' and lower(trim(coalesce(p.email,'')))=lower(trim(coalesce(c.email,''))))
  ), pc as (select prospect_id,min(client_id::text)::uuid client_id from candidates group by prospect_id having count(distinct client_id)=1),
  cc as (select client_id,count(distinct prospect_id) n from candidates group by client_id),
  safe as (select pc.* from pc join cc using(client_id) where cc.n=1),
  upd as (update public.prospects p set client_id=s.client_id,statut='converti',converted_client_at=coalesce(p.converted_client_at,now()),updated_at=now()
    from safe s where p.id=s.prospect_id and (p.client_id is null or p.client_id=s.client_id) returning p.id)
  select count(*) into v_pc from upd;

  update public.leads l set prospect_id=p.id, etape_pipeline=case when l.client_id is not null then 'converti' else 'prospect' end,
    etape_conversion='prospect',updated_at=now()
  from public.prospects p where p.lead_id=l.id and l.prospect_id is distinct from p.id;
  get diagnostics v_lp=row_count;

  with candidates as (
    select l.id lead_id,p.id prospect_id from public.leads l join public.prospects p
    on (regexp_replace(coalesce(l.telephone,''),'\D','','g')<>'' and regexp_replace(coalesce(l.telephone,''),'\D','','g')=regexp_replace(coalesce(p.telephone,''),'\D','','g'))
    or (lower(trim(coalesce(l.email,'')))<>'' and lower(trim(coalesce(l.email,'')))=lower(trim(coalesce(p.email,''))))
    where l.prospect_id is null
  ), lp as (select lead_id,min(prospect_id::text)::uuid prospect_id from candidates group by lead_id having count(distinct prospect_id)=1),
  pp as (select prospect_id,count(distinct lead_id) n from candidates group by prospect_id),
  safe as (select lp.* from lp join pp using(prospect_id) where pp.n=1)
  update public.leads l set prospect_id=s.prospect_id,etape_pipeline=case when l.client_id is not null then 'converti' else 'prospect' end,
    etape_conversion='prospect',updated_at=now() from safe s where l.id=s.lead_id;

  update public.leads l set client_id=p.client_id,etape_pipeline='converti',statut='converti',
    converti_at=coalesce(l.converti_at,p.converted_client_at,now()),updated_at=now()
  from public.prospects p where p.lead_id=l.id and p.client_id is not null and (l.client_id is null or l.client_id=p.client_id);

  return jsonb_build_object('lead_client_links',v_lc,'prospect_client_links',v_pc,'lead_prospect_links',v_lp);
end; $$;

select public.reconcile_lead_prospect_client_links();
