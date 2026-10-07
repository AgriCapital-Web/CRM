create table if not exists public.referentiels_systeme (
  id uuid primary key default gen_random_uuid(),
  categorie text not null,
  code text not null,
  libelle text not null,
  actif boolean not null default true,
  ordre integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (categorie, code)
);
alter table public.referentiels_systeme enable row level security;
drop policy if exists "reference_select_authenticated" on public.referentiels_systeme;
create policy "reference_select_authenticated" on public.referentiels_systeme for select to authenticated using (actif = true or private.is_global_admin((select auth.uid())));
insert into public.referentiels_systeme (categorie,code,libelle,ordre) values
('civilite','M','Monsieur',10),('civilite','Mme','Madame',20),('civilite','Mlle','Mademoiselle',30),
('statut_marital','celibataire','Célibataire',10),('statut_marital','marie','Marié(e)',20),('statut_marital','divorce','Divorcé(e)',30),('statut_marital','veuf','Veuf(ve)',40),
('type_paiement','PI','Paiement initial (PI)',10),('type_paiement','MENSUALITE','Mensualité',20),
('mode_paiement','mobile_money','Mobile Money',10),('mode_paiement','virement','Virement bancaire',20),('mode_paiement','cheque','Chèque',30),('mode_paiement','id_transaction','ID Transaction (Mobile Money)',40),('mode_paiement','photo_recu','Photo Reçu',50),('mode_paiement','pdf_document','Document PDF',60),
('operateur_mobile','orange_money','Orange Money',10),('operateur_mobile','mtn_money','MTN Money',20),('operateur_mobile','moov_money','Moov Money',30),
('ticket_type','etat_plantation','État de la plantation',10),('ticket_type','ravageurs','Ravageurs / insectes',20),('ticket_type','maladie','Maladie / jaunissement',30),('ticket_type','mortalite','Plants morts / dépérissement',40),('ticket_type','entretien','Entretien',50),('ticket_type','travaux','Travaux à réaliser',60),('ticket_type','autre','Autre',70),
('ticket_priorite','basse','Basse',10),('ticket_priorite','moyenne','Moyenne',20),('ticket_priorite','haute','Haute',30),('ticket_priorite','urgente','Urgente',40),
('ticket_statut','ouvert','Ouvert',10),('ticket_statut','en_cours','En cours',20),('ticket_statut','resolu','Résolu',30),('ticket_statut','ferme','Fermé',40),
('piece_identite','cni','CNI',10),('piece_identite','carte_cedeao','Carte CEDEAO',20),('piece_identite','carte_consulaire','Carte consulaire',30),('piece_identite','permis','Permis de conduire',40),('piece_identite','passeport','Passeport',50),
('statut_personnel','Employé','Employé',10),('statut_personnel','Prestataire','Prestataire',20),('statut_personnel','PDG','PDG',30),('statut_personnel','Associé / Actionnaire','Associé / Actionnaire',40)
on conflict (categorie,code) do update set libelle=excluded.libelle,ordre=excluded.ordre,actif=true;
grant select on public.referentiels_systeme to authenticated;
create or replace view public.v_referentiels_systeme as select id,categorie,code,libelle,ordre,metadata from public.referentiels_systeme where actif=true order by categorie,ordre,libelle;
