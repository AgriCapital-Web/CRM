-- Notification safety: deterministic event identity, image-only stored attachments,
-- and a commercial reminder message for the already scheduled PalmTerroir balance.
create or replace function public.notification_emit_event(_event text, _context jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_context jsonb := coalesce(_context, '{}'::jsonb);
  v_key text;
  v_entity text;
  v_repeat_token text;
  v_once boolean;
begin
  v_once := _event = any(array[
    'compte_active','nouveau_client','acquisition_confirmee','compte_approuve',
    'compte_cree','client_account_ready','compte_approuve','compte_cree'
  ]);
  v_key := nullif(btrim(v_context->>'dedupe_key'), '');
  if v_key is null then
    v_entity := coalesce(
      nullif(v_context->>'paiement_id',''),
      nullif(v_context->>'document_id',''),
      nullif(v_context->>'document_acquisition_id',''),
      nullif(v_context->>'visite_id',''),
      nullif(v_context->>'intervention_id',''),
      nullif(v_context->>'recolte_id',''),
      nullif(v_context->>'plantation_id',''),
      nullif(v_context->>'client_id',''),
      nullif(v_context->>'proprietaire_id',''),
      nullif(v_context->>'lead_id',''),
      nullif(v_context->>'prospect_id',''),
      nullif(v_context->>'user_id',''),
      nullif(v_context->>'profile_id',''),
      nullif(v_context->>'auth_user_id',''),
      'global'
    );
    v_repeat_token := coalesce(
      nullif(v_context->>'date_echeance',''),
      nullif(v_context->>'date_visite',''),
      nullif(v_context->>'date_intervention',''),
      nullif(v_context->>'date',''),
      case when v_once then null else to_char(now() at time zone 'UTC','YYYY-MM-DD') end
    );
    v_key := _event || ':' || v_entity || case when v_repeat_token is null then '' else ':' || v_repeat_token end;
  end if;
  v_context := jsonb_set(v_context, '{dedupe_key}', to_jsonb(v_key), true);
  insert into public.notification_event_outbox(event_code, context)
  values (_event, v_context)
  on conflict do nothing;
exception when others then
  raise warning 'notification_emit_event failed: %', sqlerrm;
end
$function$;

-- Only image attachments in formats accepted by Senndo remain linked to campaigns,
-- templates and automations. New uploads are converted to WebP before storage.
update public.notification_campaigns c
set media_attachments = coalesce((
  select jsonb_agg(m.value order by m.ordinality)
  from jsonb_array_elements(coalesce(c.media_attachments,'[]'::jsonb)) with ordinality m(value, ordinality)
  where lower(coalesce(m.value->>'mimeType','')) in ('image/jpeg','image/png','image/webp')
), '[]'::jsonb)
where jsonb_typeof(coalesce(c.media_attachments,'[]'::jsonb)) = 'array';

update public.notification_automations a
set media_attachments = coalesce((
  select jsonb_agg(m.value order by m.ordinality)
  from jsonb_array_elements(coalesce(a.media_attachments,'[]'::jsonb)) with ordinality m(value, ordinality)
  where lower(coalesce(m.value->>'mimeType','')) in ('image/jpeg','image/png','image/webp')
), '[]'::jsonb)
where jsonb_typeof(coalesce(a.media_attachments,'[]'::jsonb)) = 'array';

update public.notification_templates t
set media_attachments = coalesce((
  select jsonb_agg(m.value order by m.ordinality)
  from jsonb_array_elements(coalesce(t.media_attachments,'[]'::jsonb)) with ordinality m(value, ordinality)
  where lower(coalesce(m.value->>'mimeType','')) in ('image/jpeg','image/png','image/webp')
), '[]'::jsonb)
where jsonb_typeof(coalesce(t.media_attachments,'[]'::jsonb)) = 'array';

update public.notification_campaigns
set contenu = 'Votre dossier PalmTerroir présente un solde restant de 100 000 F CFA, après votre avance de 100 000 F CFA enregistrée le 30 septembre 2026. Merci de prévoir le règlement de ce solde. Pour toute question : +225 05 64 55 17 17.',
    sujet = 'Rappel automatique de règlement — dossier PalmTerroir',
    updated_at = now()
where id = 'd2bbfbda-2780-4f68-aae1-2937eb8b86f9'
  and statut = 'programme';
