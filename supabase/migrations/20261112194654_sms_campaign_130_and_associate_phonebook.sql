
alter table public.notification_channel_policy
  add column if not exists sms_content_max_characters integer not null default 130;

alter table public.notification_channel_policy
  drop constraint if exists notification_channel_policy_sms_content_limit_check;

alter table public.notification_channel_policy
  add constraint notification_channel_policy_sms_content_limit_check
  check (sms_content_max_characters between 1 and sms_max_characters);

alter table public.finance_associates
  add column if not exists telephone text,
  add column if not exists telephone_indicatif text,
  add column if not exists telephone_local text;

comment on column public.finance_associates.telephone is 'Téléphone de contact au format E.164, par exemple +2250759566087.';
comment on column public.finance_associates.telephone_indicatif is 'Indicatif téléphonique international.';
comment on column public.finance_associates.telephone_local is 'Numéro local sans indicatif pays.';

update public.finance_associates set full_name='Inocent KOFFI',telephone='+2250759566087',telephone_indicatif='+225',telephone_local='0759566087',updated_at=now()
where id='c9e5e84d-c44e-4cbd-b61d-f56237705eae';
update public.finance_associates set full_name='Jacques Kouakou KOUAME',telephone='+2250152824598',telephone_indicatif='+225',telephone_local='0152824598',updated_at=now()
where id='2e5ba9e8-9450-4cbf-9cce-1d8f96fe086c';
update public.finance_associates set full_name='Jules Kouakou KOUAME',telephone='+2250141105401',telephone_indicatif='+225',telephone_local='0141105401',updated_at=now()
where id='12fb8a7a-18ab-4fe4-a123-e7442d84ccee';
update public.finance_associates set full_name='Kouadio Julien KOUAME',telephone='+2250748426323',telephone_indicatif='+225',telephone_local='0748426323',updated_at=now()
where id='4bb368dc-dd66-4342-a55a-6a184740e0f6';
update public.finance_associates set full_name='Samuel Yao KOUAME',telephone='+2250749596182',telephone_indicatif='+225',telephone_local='0749596182',updated_at=now()
where id='5a13329c-c15b-4b90-9cfa-0e86da8919a9';
update public.finance_associates set full_name='César Yoboue AMANI',telephone='+2250153441638',telephone_indicatif='+225',telephone_local='0153441638',updated_at=now()
where id='43f108f9-3e9b-48db-9fa8-ace6960c7517';
update public.finance_associates set full_name='Ernest Koffi KONAN',telephone='+2250173194363',telephone_indicatif='+225',telephone_local='0173194363',updated_at=now()
where id='39a9aee5-4687-474a-8389-ea378d3ff3ca';
update public.finance_associates set full_name='Ferdinand Kouakou KOUAME',telephone='+2250152831924',telephone_indicatif='+225',telephone_local='0152831924',updated_at=now()
where id='5f4b3589-64de-413e-9f89-c7a19fe1db9f';
update public.finance_associates set full_name='Raymond Konsa KOFFI',telephone='+2250747156614',telephone_indicatif='+225',telephone_local='0747156614',updated_at=now()
where id='3cd26201-7974-4916-aae8-4e34073c5294';

insert into public.finance_associates(full_name,role_label,active,notes,telephone,telephone_indicatif,telephone_local)
select 'Gallo Philomène AKA','ASSOCIÉ',true,'Apport initial : 0 FCFA, conformément à la demande de la direction. Aucun apport financier enregistré.','+2250708156440','+225','0708156440'
where not exists(select 1 from public.finance_associates where lower(full_name) in ('gallo philomène aka','aka gallo philomène'));

insert into public.crm_parties(type_personne,nom,prenoms,nom_complet,telephone,metadata)
select 'personne_physique',v.nom,v.prenoms,v.prenoms||' '||v.nom,v.telephone,
       jsonb_build_object('source_module','associate_contacts','category',v.category,'source_key',v.source_key)
from (values
 ('KOFFI','Inocent','+2250759566087','associe','associate-inocent-koffi'),
 ('KOUAME','Jacques Kouakou','+2250152824598','associe','associate-jacques-kouakou-kouame'),
 ('KOUAME','Jules Kouakou','+2250141105401','associe','associate-jules-kouakou-kouame'),
 ('KOUAME','Kouadio Julien','+2250748426323','associe','associate-kouadio-julien-kouame'),
 ('KOUAME','Samuel Yao','+2250749596182','associe','associate-samuel-yao-kouame'),
 ('AMANI','César Yoboue','+2250153441638','associe','associate-cesar-yoboue-amani'),
 ('KONAN','Ernest Koffi','+2250173194363','associe','associate-ernest-koffi-konan'),
 ('KOUAME','Ferdinand Kouakou','+2250152831924','associe','associate-ferdinand-kouakou-kouame'),
 ('KOFFI','Raymond Konsa','+2250747156614','associe','associate-raymond-konsa-koffi'),
 ('AKA','Gallo Philomène','+2250708156440','associe','associate-gallo-philomene-aka'),
 ('KRA','Ypou','+2250565100882','contact_campagne','campaign-ypou-kra')
) as v(nom,prenoms,telephone,category,source_key)
where not exists(select 1 from public.crm_parties p where p.metadata->>'source_key'=v.source_key);

update public.notification_channel_policy
set sms_content_max_characters=130,sms_max_characters=155,sms_sender_id='AgriCapital',updated_at=now()
where id=true;
