-- Offre promotionnelle WhatsApp de fin octobre 2026.
-- Les marqueurs WhatsApp (*gras* et _italique_) sont conservés tels quels dans le texte.
create or replace function public.enforce_notification_message_limits()
returns trigger language plpgsql set search_path=public as $$
begin
  if lower(coalesce(new.canal,'')) in ('sms','email_sms')
     and char_length(regexp_replace(btrim(coalesce(new.contenu,'')), '\\s+', ' ', 'g')) > 155 then
    raise exception 'Le SMS ne peut pas dépasser 155 caractères, espaces et signes compris.';
  end if;
  if lower(coalesce(new.canal,'')) = 'whatsapp' and char_length(coalesce(new.contenu,'')) > 4096 then
    raise exception 'Le message WhatsApp ne peut pas dépasser 4096 caractères.';
  end if;
  return new;
end $$;

insert into public.notification_templates
  (code, nom, canal, evenement, sujet, contenu, variables, parcours, actif)
values
  (
    'promotion_fin_octobre_2026_whatsapp',
    'Promotion fin octobre 2026 · WhatsApp · -10 %',
    'whatsapp',
    'campagne_speciale',
    'Offre spéciale de fin octobre — 10 % de réduction',
    $body$Bonjour {{nom_complet}} 👋,
🌱 *Et si votre prochain actif était agricole ?*
AgriCapital vous propose une offre spéciale de fin octobre pour devenir propriétaire d’une plantation de palmiers à huile, *avec ou sans terre*.
🎉 Profitez de *10 % de réduction sur le tarif total de l’offre choisie*.
📅 *Offre valable du 27 au 31 octobre 2026.*
Vous souhaitez en savoir plus ou découvrir l’offre adaptée à votre situation ? Répondez simplement à ce message. Notre équipe se fera un plaisir de vous renseigner.
📞 +225 05 64 55 17 17
🌐 www.agricapital.ci
_AgriCapital. Investir la terre. Cultiver l’avenir._$body$,
    '["nom_complet"]'::jsonb,
    'commun',
    true
  )
on conflict (code) do update set
  nom = excluded.nom,
  canal = excluded.canal,
  evenement = excluded.evenement,
  sujet = excluded.sujet,
  contenu = excluded.contenu,
  variables = excluded.variables,
  parcours = excluded.parcours,
  actif = true;
