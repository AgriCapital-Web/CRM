
create or replace function public.enforce_notification_campaign_sms_content_limit()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  body_without_name text;
  content_limit integer;
begin
  if lower(coalesce(new.canal,'')) in ('sms','whatsapp','auto','email_sms') then
    select sms_content_max_characters into content_limit
    from public.notification_channel_policy where id = true;
    content_limit := coalesce(content_limit,130);
    body_without_name := regexp_replace(
      coalesce(new.contenu,''),
      '[{][[:space:]]*(dernier_prenom_nom|dernierprenom_nom)[[:space:]]*[}]',
      '',
      'gi'
    );
    body_without_name := regexp_replace(body_without_name,'[[:space:]]+',' ','g');
    if char_length(btrim(body_without_name)) > content_limit then
      raise exception 'Le contenu SMS de campagne dépasse % caractères hors prénom/nom.', content_limit
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.enforce_notification_template_sms_content_limit()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  body_without_name text;
  content_limit integer;
begin
  if lower(coalesce(new.canal,'')) = 'sms' then
    select sms_content_max_characters into content_limit
    from public.notification_channel_policy where id = true;
    content_limit := coalesce(content_limit,130);
    body_without_name := regexp_replace(
      coalesce(new.contenu,''),
      '[{][[:space:]]*(dernier_prenom_nom|dernierprenom_nom)[[:space:]]*[}]',
      '',
      'gi'
    );
    body_without_name := regexp_replace(body_without_name,'[[:space:]]+',' ','g');
    if char_length(btrim(body_without_name)) > content_limit then
      raise exception 'Le modèle SMS dépasse % caractères hors prénom/nom.', content_limit
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists notification_templates_sms_content_limit on public.notification_templates;
create trigger notification_templates_sms_content_limit
before insert or update of canal, contenu on public.notification_templates
for each row execute function public.enforce_notification_template_sms_content_limit();
