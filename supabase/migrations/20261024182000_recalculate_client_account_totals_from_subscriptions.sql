do $$
declare
  v_definition text;
  v_updated text;
  v_find text;
  v_replace text;
begin
  select pg_get_functiondef('public.create_client_acquisition(uuid,uuid,text,numeric,text,uuid,uuid,text)'::regprocedure)
    into v_definition;
  v_find := $find$  return jsonb_build_object(
    'acquisition_id',v_acquisition_id,'paiement_initial_id',v_payment_id,$find$;
  v_replace := $replace$  update public.clients c
     set montant_total_contrat=coalesce((select sum(a.montant_total_contrat) from public.acquisitions a
           where a.client_id=c.id and lower(coalesce(a.statut,'')) not in ('annule','annulee','annulée','cancelled','supprime','supprimee','supprimé','refuse','refusee','refusé')),0),
         paiement_initial_montant=coalesce((select sum(a.montant_pi_total) from public.acquisitions a
           where a.client_id=c.id and lower(coalesce(a.statut,'')) not in ('annule','annulee','annulée','cancelled','supprime','supprimee','supprimé','refuse','refusee','refusé')),0),
         montant_pi_total=coalesce((select sum(a.montant_pi_total) from public.acquisitions a
           where a.client_id=c.id and lower(coalesce(a.statut,'')) not in ('annule','annulee','annulée','cancelled','supprime','supprimee','supprimé','refuse','refusee','refusé')),0),
         mensualite_montant=coalesce((select sum(a.mensualite_montant) from public.acquisitions a
           where a.client_id=c.id and lower(coalesce(a.statut,'')) not in ('annule','annulee','annulée','cancelled','supprime','supprimee','supprimé','refuse','refusee','refusé')),0),
         duree_paiement_mois=coalesce((select max(a.duree_paiement_mois) from public.acquisitions a
           where a.client_id=c.id and lower(coalesce(a.statut,'')) not in ('annule','annulee','annulée','cancelled','supprime','supprimee','supprimé','refuse','refusee','refusé')),0),
         updated_at=now()
   where c.id=v_client.id;

  return jsonb_build_object(
    'acquisition_id',v_acquisition_id,'paiement_initial_id',v_payment_id,$replace$;
  v_updated:=replace(v_definition,v_find,v_replace);
  if v_updated=v_definition then raise exception 'Le point de synchronisation des totaux client a changé; migration annulée.'; end if;
  execute v_updated;
end $$;

update public.clients c
set montant_total_contrat=coalesce(x.total,0),
    paiement_initial_montant=coalesce(x.pi,0),
    montant_pi_total=coalesce(x.pi,0),
    mensualite_montant=coalesce(x.monthly,0),
    duree_paiement_mois=coalesce(x.duration,0),
    updated_at=now()
from (
  select a.client_id,sum(a.montant_total_contrat) as total,sum(a.montant_pi_total) as pi,
    sum(a.mensualite_montant) as monthly,max(a.duree_paiement_mois) as duration
  from public.acquisitions a
  where lower(coalesce(a.statut,'')) not in ('annule','annulee','annulée','cancelled','supprime','supprimee','supprimé','refuse','refusee','refusé')
  group by a.client_id
) x
where x.client_id=c.id;