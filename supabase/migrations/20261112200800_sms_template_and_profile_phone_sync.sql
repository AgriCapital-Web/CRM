
select set_config('app.internal_account_link','true',true);

update public.profiles p
set
  nom = regexp_replace(fa.full_name, '^.* ', ''),
  prenoms = regexp_replace(fa.full_name, ' [^ ]+$', ''),
  nom_complet = fa.full_name,
  telephone = fa.telephone,
  telephone_indicatif = fa.telephone_indicatif,
  telephone_local = fa.telephone_local,
  whatsapp = case when p.whatsapp is not null then fa.telephone else p.whatsapp end,
  whatsapp_indicatif = case when p.whatsapp is not null then fa.telephone_indicatif else p.whatsapp_indicatif end,
  whatsapp_local = case when p.whatsapp is not null then fa.telephone_local else p.whatsapp_local end,
  updated_at = now()
from public.finance_associates fa
where p.id = fa.profile_id
  and fa.full_name in ('Inocent KOFFI','Jacques Kouakou KOUAME','Kouadio Julien KOUAME')
  and fa.telephone is not null;

create or replace function public.enforce_notification_campaign_sms_content_limit()
returns trigger language plpgsql set search_path = public as $$
declare body_without_name text; content_limit integer;
begin
  if lower(coalesce(new.canal,'')) in ('sms','whatsapp','auto','email_sms') then
    select sms_content_max_characters into content_limit from public.notification_channel_policy where id=true;
    content_limit := coalesce(content_limit,130);
    body_without_name := regexp_replace(coalesce(new.contenu,''),
      '[{][[:space:]]*(dernier_prenom_nom|dernierprenom_nom)[[:space:]]*[}]','','gi');
    body_without_name := regexp_replace(body_without_name,'[[:space:]]+',' ','g');
    if char_length(btrim(body_without_name)) > content_limit then
      raise exception 'Le contenu SMS de campagne dépasse % caractères hors prénom/nom.',content_limit using errcode='23514';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.enforce_notification_template_sms_content_limit()
returns trigger language plpgsql set search_path = public as $$
declare body_without_name text; content_limit integer;
begin
  if lower(coalesce(new.canal,''))='sms' then
    select sms_content_max_characters into content_limit from public.notification_channel_policy where id=true;
    content_limit := coalesce(content_limit,130);
    body_without_name := regexp_replace(coalesce(new.contenu,''),
      '[{][[:space:]]*(dernier_prenom_nom|dernierprenom_nom)[[:space:]]*[}]','','gi');
    body_without_name := regexp_replace(body_without_name,'[[:space:]]+',' ','g');
    if char_length(btrim(body_without_name)) > content_limit then
      raise exception 'Le modèle SMS dépasse % caractères hors prénom/nom.',content_limit using errcode='23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists notification_templates_sms_content_limit on public.notification_templates;
create trigger notification_templates_sms_content_limit
before insert or update of canal,contenu on public.notification_templates
for each row execute function public.enforce_notification_template_sms_content_limit();

insert into public.notification_templates(code,nom,canal,evenement,sujet,contenu,variables,parcours,actif)
values(
 'restructuration_associes_sms','Restructuration AgriCapital · SMS','sms','campagne_speciale',null,
 'Bonjour {dernierprenom_nom}, AgriCapital se restructure. Appelez le fondateur au 0759566087 pour confirmer votre statut. Direction',
 '["dernierprenom_nom"]'::jsonb,'commun',true
)
on conflict(code) do update set
 nom=excluded.nom,canal=excluded.canal,evenement=excluded.evenement,sujet=excluded.sujet,
 contenu=excluded.contenu,variables=excluded.variables,parcours=excluded.parcours,actif=true,updated_at=now();
