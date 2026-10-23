-- Correct financial synthesis: the acquisition contract is the source of truth when present.
-- Do not add the same contract snapshot from clients to its acquisition row a second time.
-- Remaining months are derived from offer duration less validated monthly payments.
CREATE OR REPLACE VIEW public.v_client_synthese AS
WITH client_totals AS (
         SELECT c_1.id,
            c_1.id_unique,
            c_1.user_id,
            c_1.civilite,
            c_1.nom_famille,
            c_1.prenoms,
            c_1.nom_complet,
            c_1.nom,
            c_1.date_naissance,
            c_1.lieu_naissance,
            c_1.statut_marital,
            c_1.type_piece,
            c_1.numero_piece,
            c_1.date_delivrance_piece,
            c_1.telephone,
            c_1.whatsapp,
            c_1.email,
            c_1.domicile,
            c_1.domicile_residence,
            c_1.district_id,
            c_1.region_id,
            c_1.departement_id,
            c_1.sous_prefecture_id,
            c_1.offre_id,
            c_1.type_compte,
            c_1.banque_operateur,
            c_1.numero_compte,
            c_1.nom_titulaire_compte,
            c_1.photo_profil_url,
            c_1.fichier_piece_url,
            c_1.fichier_piece_recto_url,
            c_1.fichier_piece_verso_url,
            c_1.nombre_plantations,
            c_1.total_hectares,
            c_1.statut,
            c_1.statut_global,
            c_1.created_by,
            c_1.updated_by,
            c_1.created_at,
            c_1.updated_at,
            c_1.type_client,
            c_1.parcelle_id,
            c_1.localite,
            c_1.nationalite,
            c_1.numero_contrat,
            c_1.annee_contrat,
            c_1.code_sp_contrat,
            c_1.numero_ordre_global,
            c_1.type_client_foncier,
            c_1.documents_valides_at,
            c_1.compte_actif,
            c_1.pi_paye_at,
            c_1.contrat_debut_at,
            c_1.contrat_fin_at,
            c_1.mensualite_montant,
            c_1.prochaine_echeance,
            c_1.phase_actuelle,
            c_1.jours_contrat_total,
            c_1.jours_payes,
            c_1.jours_retard,
            c_1.taux_journalier_ha,
            c_1.montant_total_contrat,
            c_1.promotion_id,
            c_1.montant_promo_applique,
            c_1.famille_offre,
            c_1.formule_code,
            c_1.formule_nom,
            c_1.contrat_acquisition_statut,
            c_1.contrat_accompagnement_statut,
            c_1.paiement_initial_montant,
            c_1.paiement_initial_paye_at,
            c_1.parcours_code,
            c_1.village_id,
            c_1.mode_paiement,
            c_1.telephone_indicatif,
            c_1.telephone_local,
            c_1.whatsapp_indicatif,
            c_1.whatsapp_local,
            c_1.proprietaire_id,
            c_1.paiement_personnalise,
            c_1.profession,
            c_1.nom_pere,
            c_1.nom_mere,
            c_1.contact_urgence_nom,
            c_1.contact_urgence_telephone,
            c_1.lieu_delivrance_piece,
            c_1.piece_validite_at,
            c_1.commercial_id,
            c_1.campement_id,
            c_1.is_internal,
            c_1.contrat_solde_at,
            COALESCE(sum(s.montant_total_contrat), 0::numeric) AS additional_contract_total
           FROM clients c_1
             LEFT JOIN acquisitions s ON s.client_id = c_1.id
          GROUP BY c_1.id
        )
 SELECT c.id AS client_id,
    c.id_unique,
    c.nom_complet,
    c.offre_id,
    o.nom AS offre_nom,
    o.gestion_type,
    o.pourcentage_revenus_reverses,
    c.total_hectares,
        CASE
            WHEN c.total_hectares = 1::numeric THEN '1 ha'::text
            WHEN c.total_hectares = 2::numeric THEN '2 ha'::text
            WHEN c.total_hectares = 3::numeric THEN '3 ha'::text
            WHEN c.total_hectares >= 5::numeric AND c.total_hectares < 10::numeric THEN '5–10 ha'::text
            WHEN c.total_hectares >= 10::numeric AND c.total_hectares < 50::numeric THEN '10–50 ha'::text
            WHEN c.total_hectares >= 50::numeric AND c.total_hectares < 100::numeric THEN '50–100 ha'::text
            WHEN c.total_hectares >= 100::numeric THEN '100+ ha'::text
            ELSE NULL::text
        END AS tranche_superficie,
    c.compte_actif,
    c.phase_actuelle,
    c.contrat_debut_at,
    c.contrat_fin_at,
    COALESCE(NULLIF(c.additional_contract_total, 0::numeric), COALESCE(c.montant_total_contrat, 0::numeric)) AS montant_total_contrat,
    c.taux_journalier_ha,
    c.prochaine_echeance,
    c.jours_retard,
    COALESCE(o.duree_paiement_mois, 34) AS duree_paiement_mois,
    ( SELECT count(*) AS count
           FROM paiements p
          WHERE p.client_id = c.id AND upper(p.type_paiement) = 'MENSUALITE'::text AND p.statut = 'valide'::text) AS mois_payes,
    GREATEST(COALESCE(o.duree_paiement_mois, 34) - (( SELECT count(*) AS count
           FROM paiements p
          WHERE p.client_id = c.id AND upper(p.type_paiement) = 'MENSUALITE'::text AND p.statut = 'valide'::text)), 0::bigint) AS mois_restants,
    COALESCE(( SELECT sum(COALESCE(p.montant_paye, p.montant)) AS sum
           FROM paiements p
          WHERE p.client_id = c.id AND p.statut = 'valide'::text), 0::numeric) AS total_paye,
    GREATEST(0::numeric, COALESCE(NULLIF(c.additional_contract_total, 0::numeric), COALESCE(c.montant_total_contrat, 0::numeric)) - COALESCE(( SELECT sum(COALESCE(p.montant_paye, p.montant)) AS sum
           FROM paiements p
          WHERE p.client_id = c.id AND p.statut = 'valide'::text), 0::numeric)) AS reste_a_payer,
        CASE
            WHEN COALESCE(NULLIF(c.additional_contract_total, 0::numeric), COALESCE(c.montant_total_contrat, 0::numeric)) > 0::numeric THEN round(COALESCE(( SELECT sum(COALESCE(p.montant_paye, p.montant)) AS sum
               FROM paiements p
              WHERE p.client_id = c.id AND p.statut = 'valide'::text), 0::numeric) * 100.0 / COALESCE(NULLIF(c.additional_contract_total, 0::numeric), COALESCE(c.montant_total_contrat, 0::numeric)), 2)
            ELSE 0::numeric
        END AS pourcentage_avancement
   FROM client_totals c
     LEFT JOIN offres o ON o.id = c.offre_id;
