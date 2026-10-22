create or replace function public.normalize_leads_phone_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_phone text;
  v_whatsapp text;
begin
  if TG_OP='INSERT' or NEW.telephone is distinct from OLD.telephone then
    v_phone := nullif(regexp_replace(btrim(coalesce(NEW.telephone,'')), '[[:space:]().-]', '', 'g'), '');
    if v_phone is not null then
      if v_phone ~ '^225[0-9]{10}$' then
        v_phone := '+' || v_phone;
      elsif v_phone ~ '^0[0-9]{9}$' then
        v_phone := '+225' || substring(v_phone from 2);
      elsif v_phone ~ '^[0-9]{10}$' then
        v_phone := '+225' || v_phone;
      end if;
    end if;
    NEW.telephone := public.assert_agricapital_phone(v_phone, 'Téléphone');
  end if;

  if TG_OP='INSERT' or NEW.whatsapp is distinct from OLD.whatsapp then
    v_whatsapp := nullif(regexp_replace(btrim(coalesce(NEW.whatsapp,'')), '[[:space:]().-]', '', 'g'), '');
    if v_whatsapp is not null then
      if v_whatsapp ~ '^225[0-9]{10}$' then
        v_whatsapp := '+' || v_whatsapp;
      elsif v_whatsapp ~ '^0[0-9]{9}$' then
        v_whatsapp := '+225' || substring(v_whatsapp from 2);
      elsif v_whatsapp ~ '^[0-9]{10}$' then
        v_whatsapp := '+225' || v_whatsapp;
      end if;
    end if;
    NEW.whatsapp := public.assert_agricapital_phone(v_whatsapp, 'WhatsApp');
  end if;
  return NEW;
end;
$function$;

-- Apply the same canonical phone handling to prospects, whose form shares the same phone input.
create or replace function public.normalize_prospects_phone_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_phone text;
  v_whatsapp text;
begin
  if TG_OP='INSERT' or NEW.telephone is distinct from OLD.telephone then
    v_phone := nullif(regexp_replace(btrim(coalesce(NEW.telephone,'')), '[[:space:]().-]', '', 'g'), '');
    if v_phone is not null then
      if v_phone ~ '^225[0-9]{10}$' then v_phone := '+' || v_phone;
      elsif v_phone ~ '^0[0-9]{9}$' then v_phone := '+225' || substring(v_phone from 2);
      elsif v_phone ~ '^[0-9]{10}$' then v_phone := '+225' || v_phone;
      end if;
    end if;
    NEW.telephone := public.assert_agricapital_phone(v_phone, 'Téléphone');
  end if;
  if TG_OP='INSERT' or NEW.whatsapp is distinct from OLD.whatsapp then
    v_whatsapp := nullif(regexp_replace(btrim(coalesce(NEW.whatsapp,'')), '[[:space:]().-]', '', 'g'), '');
    if v_whatsapp is not null then
      if v_whatsapp ~ '^225[0-9]{10}$' then v_whatsapp := '+' || v_whatsapp;
      elsif v_whatsapp ~ '^0[0-9]{9}$' then v_whatsapp := '+225' || substring(v_whatsapp from 2);
      elsif v_whatsapp ~ '^[0-9]{10}$' then v_whatsapp := '+225' || v_whatsapp;
      end if;
    end if;
    NEW.whatsapp := public.assert_agricapital_phone(v_whatsapp, 'WhatsApp');
  end if;
  return NEW;
end;
$function$;

drop trigger if exists trg_normalize_prospects_phone_fields on public.prospects;
create trigger trg_normalize_prospects_phone_fields
before insert or update of telephone, whatsapp on public.prospects
for each row execute function public.normalize_prospects_phone_fields();
