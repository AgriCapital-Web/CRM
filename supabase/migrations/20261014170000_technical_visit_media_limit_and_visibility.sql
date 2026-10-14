-- Limite métier stricte : 10 photos/vidéos maximum par rapport de visite.
-- Le verrou transactionnel empêche deux imports simultanés de dépasser le plafond.
create or replace function public.enforce_technical_visit_media_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_count integer;
begin
  if new.media_type not in ('photo', 'video') then
    raise exception 'Type de média non autorisé pour une visite.'
      using errcode = '23514';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.rapport_id::text, 0));

  select count(*) into current_count
  from public.rapports_visites_medias m
  where m.rapport_id = new.rapport_id
    and m.media_type in ('photo', 'video')
    and (tg_op <> 'UPDATE' or m.id <> new.id);

  if current_count >= 10 then
    raise exception 'Une visite ne peut contenir que 10 photos et vidéos au maximum.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_technical_visit_media_limit on public.rapports_visites_medias;
create trigger trg_technical_visit_media_limit
before insert or update of rapport_id, media_type
on public.rapports_visites_medias
for each row execute function public.enforce_technical_visit_media_limit();

comment on function public.enforce_technical_visit_media_limit() is
'Empêche plus de dix photos/vidéos par rapport de visite, même lors d’imports concurrents.';
