create or replace function public.trg_paiement_notification()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_total numeric:=0; v_paid numeric:=0; v_paid_before numeric:=0; v_contract text; v_amount numeric:=0;
begin
 v_amount := case when coalesce(new.montant_paye,0)>0 then new.montant_paye else coalesce(new.montant,0) end;
 if tg_op='INSERT' and lower(coalesce(new.statut,'')) in ('valide','paye','paid','success','successful','completed') then
  perform public.notification_emit_event('paiement_recu',jsonb_build_object('paiement_id',new.id,'client_id',new.client_id,'montant',v_amount,'reference',new.reference,'date_paiement',new.date_paiement));
 elsif tg_op='UPDATE' and lower(coalesce(new.statut,'')) in ('valide','paye','paid','success','successful','completed') and lower(coalesce(old.statut,'')) is distinct from lower(coalesce(new.statut,'')) then
  perform public.notification_emit_event('paiement_recu',jsonb_build_object('paiement_id',new.id,'client_id',new.client_id,'montant',v_amount,'reference',new.reference,'date_paiement',new.date_paiement));
 else return new; end if;
 select coalesce(c.montant_total_contrat,0),coalesce(c.numero_contrat,'') into v_total,v_contract from public.clients c where c.id=new.client_id;
 if coalesce(v_total,0)>0 then
  select coalesce(sum(case when coalesce(p.montant_paye,0)>0 then p.montant_paye else p.montant end),0) into v_paid from public.paiements p where p.client_id=new.client_id and lower(coalesce(p.statut,'')) in ('valide','paye','paid','success','successful','completed');
  select coalesce(sum(case when coalesce(p.montant_paye,0)>0 then p.montant_paye else p.montant end),0) into v_paid_before from public.paiements p where p.client_id=new.client_id and p.id<>new.id and lower(coalesce(p.statut,'')) in ('valide','paye','paid','success','successful','completed');
  if v_paid>=v_total and v_paid_before<v_total then
   perform public.notification_emit_event('solde_regle',jsonb_build_object('paiement_id',new.id,'client_id',new.client_id,'numero_contrat',v_contract,'total_paye',v_paid,'montant_total',v_total,'solde',greatest(v_total-v_paid,0)));
  end if;
 end if;
 return new;
end $$;