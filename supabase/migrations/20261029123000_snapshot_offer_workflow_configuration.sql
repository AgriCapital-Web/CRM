-- Freeze offer-specific form steps, required documents and contract requirements.
-- Existing dossiers keep the workflow they had at migration time; new registrations capture it
-- automatically. Profile edits never reload these live configuration tables.

create or replace function public.snapshot_offer_workflow_config()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare v_workflow jsonb;
begin
  if new.offre_id is null then return new; end if;
  if tg_op='UPDATE'
     and new.offre_id is not distinct from old.offre_id
     and new.formule_code is not distinct from old.formule_code
     and coalesce(old.offre_snapshot,'{}'::jsonb) ? 'workflow' then
    new.offre_snapshot := jsonb_set(coalesce(new.offre_snapshot,'{}'::jsonb),'{workflow}',old.offre_snapshot->'workflow',true);
    return new;
  end if;
  select jsonb_build_object(
    'steps',coalesce((select jsonb_agg(to_jsonb(s) order by s.ordre) from public.offre_formulaire_etapes s where s.offre_id=new.offre_id and s.actif=true),'[]'::jsonb),
    'documents',coalesce((select jsonb_agg(to_jsonb(d) order by d.ordre) from public.offre_formulaire_documents d where d.offre_id=new.offre_id and d.actif=true),'[]'::jsonb),
    'contracts',coalesce((select jsonb_agg(to_jsonb(c) order by c.type_contrat) from public.offre_formulaire_contrats c where c.offre_id=new.offre_id and c.actif=true),'[]'::jsonb)
  ) into v_workflow;
  new.offre_snapshot := coalesce(new.offre_snapshot,'{}'::jsonb) || jsonb_build_object('workflow',v_workflow);
  return new;
end
$function$;

drop trigger if exists trg_snapshot_workflow_client on public.clients;
create trigger trg_snapshot_workflow_client
before insert or update of offre_id, formule_code on public.clients
for each row execute function public.snapshot_offer_workflow_config();

drop trigger if exists trg_snapshot_workflow_acquisition on public.acquisitions;
create trigger trg_snapshot_workflow_acquisition
before insert on public.acquisitions
for each row execute function public.snapshot_offer_workflow_config();

update public.acquisitions a
set offre_snapshot=a.offre_snapshot || jsonb_build_object('workflow',jsonb_build_object(
  'steps',coalesce((select jsonb_agg(to_jsonb(s) order by s.ordre) from public.offre_formulaire_etapes s where s.offre_id=a.offre_id and s.actif=true),'[]'::jsonb),
  'documents',coalesce((select jsonb_agg(to_jsonb(d) order by d.ordre) from public.offre_formulaire_documents d where d.offre_id=a.offre_id and d.actif=true),'[]'::jsonb),
  'contracts',coalesce((select jsonb_agg(to_jsonb(c) order by c.type_contrat) from public.offre_formulaire_contrats c where c.offre_id=a.offre_id and c.actif=true),'[]'::jsonb)
))
where coalesce(a.offre_snapshot,'{}'::jsonb)<>'{}'::jsonb and a.offre_id is not null and not (a.offre_snapshot ? 'workflow');

update public.clients c
set offre_snapshot=c.offre_snapshot || jsonb_build_object('workflow',jsonb_build_object(
  'steps',coalesce((select jsonb_agg(to_jsonb(s) order by s.ordre) from public.offre_formulaire_etapes s where s.offre_id=c.offre_id and s.actif=true),'[]'::jsonb),
  'documents',coalesce((select jsonb_agg(to_jsonb(d) order by d.ordre) from public.offre_formulaire_documents d where d.offre_id=c.offre_id and d.actif=true),'[]'::jsonb),
  'contracts',coalesce((select jsonb_agg(to_jsonb(k) order by k.type_contrat) from public.offre_formulaire_contrats k where k.offre_id=c.offre_id and k.actif=true),'[]'::jsonb)
))
where coalesce(c.offre_snapshot,'{}'::jsonb)<>'{}'::jsonb and c.offre_id is not null and not (c.offre_snapshot ? 'workflow');
