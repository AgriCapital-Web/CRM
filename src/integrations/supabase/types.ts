export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      account_requests: {
        Row: {
          auth_user_id: string | null
          created_at: string | null
          cv_url: string | null
          departement: string | null
          departement_geo_id: string | null
          district_id: string | null
          email: string
          id: string
          justification: string | null
          motif_rejet: string | null
          nom_complet: string
          photo_url: string | null
          poste_souhaite: string | null
          region_id: string | null
          role_souhaite: string
          statut: string | null
          telephone: string
          traite_le: string | null
          traite_par: string | null
          updated_at: string | null
          username: string | null
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string | null
          cv_url?: string | null
          departement?: string | null
          departement_geo_id?: string | null
          district_id?: string | null
          email: string
          id?: string
          justification?: string | null
          motif_rejet?: string | null
          nom_complet: string
          photo_url?: string | null
          poste_souhaite?: string | null
          region_id?: string | null
          role_souhaite: string
          statut?: string | null
          telephone: string
          traite_le?: string | null
          traite_par?: string | null
          updated_at?: string | null
          username?: string | null
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string | null
          cv_url?: string | null
          departement?: string | null
          departement_geo_id?: string | null
          district_id?: string | null
          email?: string
          id?: string
          justification?: string | null
          motif_rejet?: string | null
          nom_complet?: string
          photo_url?: string | null
          poste_souhaite?: string | null
          region_id?: string | null
          role_souhaite?: string
          statut?: string | null
          telephone?: string
          traite_le?: string | null
          traite_par?: string | null
          updated_at?: string | null
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "account_requests_departement_geo_id_fkey"
            columns: ["departement_geo_id"]
            isOneToOne: false
            referencedRelation: "departements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_requests_departement_geo_id_fkey"
            columns: ["departement_geo_id"]
            isOneToOne: false
            referencedRelation: "v_geo_departements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_requests_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "districts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_requests_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "v_geo_districts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_requests_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_requests_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "v_geo_regions"
            referencedColumns: ["id"]
          },
        ]
      }
      acquisition_lots: {
        Row: {
          client_id: string
          created_at: string | null
          created_by: string | null
          date_attribution: string | null
          id: string
          lot_id: string
          notes: string | null
          surface_ha: number | null
        }
        Insert: {
          client_id: string
          created_at?: string | null
          created_by?: string | null
          date_attribution?: string | null
          id?: string
          lot_id: string
          notes?: string | null
          surface_ha?: number | null
        }
        Update: {
          client_id?: string
          created_at?: string | null
          created_by?: string | null
          date_attribution?: string | null
          id?: string
          lot_id?: string
          notes?: string | null
          surface_ha?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "acquisition_lots_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "lots_hectares"
            referencedColumns: ["id"]
          },
        ]
      }
      acquisitions_brouillon: {
        Row: {
          created_at: string | null
          created_by: string
          donnees: Json | null
          etape_actuelle: number | null
          id: string
          offre_id: string | null
          parcours_code: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by: string
          donnees?: Json | null
          etape_actuelle?: number | null
          id?: string
          offre_id?: string | null
          parcours_code?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string
          donnees?: Json | null
          etape_actuelle?: number | null
          id?: string
          offre_id?: string | null
          parcours_code?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "acquisitions_brouillon_offre_id_fkey"
            columns: ["offre_id"]
            isOneToOne: false
            referencedRelation: "offres"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_notes: {
        Row: {
          action: string
          created_at: string | null
          entity_id: string
          entity_type: string
          id: string
          note: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string | null
          entity_id: string
          entity_type: string
          id?: string
          note?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          note?: string | null
          user_id?: string
        }
        Relationships: []
      }
      admin_audit_logs: {
        Row: {
          acteur_libelle: string | null
          acteur_user_id: string | null
          action: string
          ancienne_valeur: Json | null
          cible_libelle: string | null
          cible_user_id: string | null
          created_at: string
          details: string | null
          entite: string
          entite_id: string | null
          id: string
          ip_address: string | null
          nouvelle_valeur: Json | null
          source: string
          statut: string
          user_agent: string | null
        }
        Insert: {
          acteur_libelle?: string | null
          acteur_user_id?: string | null
          action: string
          ancienne_valeur?: Json | null
          cible_libelle?: string | null
          cible_user_id?: string | null
          created_at?: string
          details?: string | null
          entite: string
          entite_id?: string | null
          id?: string
          ip_address?: string | null
          nouvelle_valeur?: Json | null
          source?: string
          statut?: string
          user_agent?: string | null
        }
        Update: {
          acteur_libelle?: string | null
          acteur_user_id?: string | null
          action?: string
          ancienne_valeur?: Json | null
          cible_libelle?: string | null
          cible_user_id?: string | null
          created_at?: string
          details?: string | null
          entite?: string
          entite_id?: string | null
          id?: string
          ip_address?: string | null
          nouvelle_valeur?: Json | null
          source?: string
          statut?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      app_roles: {
        Row: {
          actif: boolean
          code: string
          court: string | null
          created_at: string
          description: string | null
          niveau: number
          niveau_label: string | null
          nom: string
          updated_at: string
        }
        Insert: {
          actif?: boolean
          code: string
          court?: string | null
          created_at?: string
          description?: string | null
          niveau?: number
          niveau_label?: string | null
          nom: string
          updated_at?: string
        }
        Update: {
          actif?: boolean
          code?: string
          court?: string | null
          created_at?: string
          description?: string | null
          niveau?: number
          niveau_label?: string | null
          nom?: string
          updated_at?: string
        }
        Relationships: []
      }
      beneficiaire_attributions: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          parcelle_id: string
          plantation_id: string | null
          reference_acte: string | null
          role_attribution: string
          statut: string
          surface_attribuee_ha: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          parcelle_id: string
          plantation_id?: string | null
          reference_acte?: string | null
          role_attribution?: string
          statut?: string
          surface_attribuee_ha: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          parcelle_id?: string
          plantation_id?: string | null
          reference_acte?: string | null
          role_attribution?: string
          statut?: string
          surface_attribuee_ha?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "beneficiaire_attributions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "beneficiaire_attributions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_synthese"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "beneficiaire_attributions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_monnaie_clients"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "beneficiaire_attributions_parcelle_id_fkey"
            columns: ["parcelle_id"]
            isOneToOne: false
            referencedRelation: "parcelles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "beneficiaire_attributions_plantation_id_fkey"
            columns: ["plantation_id"]
            isOneToOne: false
            referencedRelation: "plantations"
            referencedColumns: ["id"]
          },
        ]
      }
      beneficiaire_documents: {
        Row: {
          categorie: string
          client_id: string
          created_at: string
          created_by: string | null
          document_type: string
          fichier_url: string | null
          id: string
          libelle: string
          metadata: Json
          parcelle_id: string | null
          plantation_id: string | null
          proprietaire_id: string | null
          source_reference: string | null
          statut: string
          storage_bucket: string | null
          storage_path: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          categorie?: string
          client_id: string
          created_at?: string
          created_by?: string | null
          document_type: string
          fichier_url?: string | null
          id?: string
          libelle: string
          metadata?: Json
          parcelle_id?: string | null
          plantation_id?: string | null
          proprietaire_id?: string | null
          source_reference?: string | null
          statut?: string
          storage_bucket?: string | null
          storage_path?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          categorie?: string
          client_id?: string
          created_at?: string
          created_by?: string | null
          document_type?: string
          fichier_url?: string | null
          id?: string
          libelle?: string
          metadata?: Json
          parcelle_id?: string | null
          plantation_id?: string | null
          proprietaire_id?: string | null
          source_reference?: string | null
          statut?: string
          storage_bucket?: string | null
          storage_path?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "beneficiaire_documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "beneficiaire_documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_synthese"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "beneficiaire_documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_monnaie_clients"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "beneficiaire_documents_parcelle_id_fkey"
            columns: ["parcelle_id"]
            isOneToOne: false
            referencedRelation: "parcelles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "beneficiaire_documents_plantation_id_fkey"
            columns: ["plantation_id"]
            isOneToOne: false
            referencedRelation: "plantations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "beneficiaire_documents_proprietaire_id_fkey"
            columns: ["proprietaire_id"]
            isOneToOne: false
            referencedRelation: "proprietaires_terres"
            referencedColumns: ["id"]
          },
        ]
      }
      campements: {
        Row: {
          annee: number
          code: string | null
          created_at: string
          est_actif: boolean
          id: string
          latitude: number | null
          longitude: number | null
          nom: string
          population: number | null
          source: string
          sous_prefecture_id: string | null
          type: string
          village_noyau_id: string | null
        }
        Insert: {
          annee?: number
          code?: string | null
          created_at?: string
          est_actif?: boolean
          id?: string
          latitude?: number | null
          longitude?: number | null
          nom: string
          population?: number | null
          source?: string
          sous_prefecture_id?: string | null
          type?: string
          village_noyau_id?: string | null
        }
        Update: {
          annee?: number
          code?: string | null
          created_at?: string
          est_actif?: boolean
          id?: string
          latitude?: number | null
          longitude?: number | null
          nom?: string
          population?: number | null
          source?: string
          sous_prefecture_id?: string | null
          type?: string
          village_noyau_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campements_sous_prefecture_id_fkey"
            columns: ["sous_prefecture_id"]
            isOneToOne: false
            referencedRelation: "sous_prefectures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campements_sous_prefecture_id_fkey"
            columns: ["sous_prefecture_id"]
            isOneToOne: false
            referencedRelation: "v_geo_sous_prefectures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campements_village_noyau_id_fkey"
            columns: ["village_noyau_id"]
            isOneToOne: false
            referencedRelation: "v_geo_villages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campements_village_noyau_id_fkey"
            columns: ["village_noyau_id"]
            isOneToOne: false
            referencedRelation: "villages"
            referencedColumns: ["id"]
          },
        ]
      }
      cartes_personnel: {
        Row: {
          code_verification: string
          created_at: string
          created_by: string | null
          date_delivrance: string
          date_expiration: string
          departement: string | null
          id: string
          matricule: string
          mission: string | null
          notes: string | null
          photo_url: string | null
          poste: string | null
          profile_id: string
          role_code: string | null
          statut: string
          statut_agent: string
          type_contrat: string
          updated_at: string
          updated_by: string | null
          zone_intervention: string | null
        }
        Insert: {
          code_verification?: string
          created_at?: string
          created_by?: string | null
          date_delivrance?: string
          date_expiration?: string
          departement?: string | null
          id?: string
          matricule: string
          mission?: string | null
          notes?: string | null
          photo_url?: string | null
          poste?: string | null
          profile_id: string
          role_code?: string | null
          statut?: string
          statut_agent?: string
          type_contrat?: string
          updated_at?: string
          updated_by?: string | null
          zone_intervention?: string | null
        }
        Update: {
          code_verification?: string
          created_at?: string
          created_by?: string | null
          date_delivrance?: string
          date_expiration?: string
          departement?: string | null
          id?: string
          matricule?: string
          mission?: string | null
          notes?: string | null
          photo_url?: string | null
          poste?: string | null
          profile_id?: string
          role_code?: string | null
          statut?: string
          statut_agent?: string
          type_contrat?: string
          updated_at?: string
          updated_by?: string | null
          zone_intervention?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cartes_personnel_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_account_provision_outbox: {
        Row: {
          client_id: string
          created_at: string
          derniere_erreur: string | null
          id: string
          processed_at: string | null
          statut: string
          tentatives: number
        }
        Insert: {
          client_id: string
          created_at?: string
          derniere_erreur?: string | null
          id?: string
          processed_at?: string | null
          statut?: string
          tentatives?: number
        }
        Update: {
          client_id?: string
          created_at?: string
          derniere_erreur?: string | null
          id?: string
          processed_at?: string | null
          statut?: string
          tentatives?: number
        }
        Relationships: [
          {
            foreignKeyName: "client_account_provision_outbox_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_account_provision_outbox_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_synthese"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "client_account_provision_outbox_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_monnaie_clients"
            referencedColumns: ["client_id"]
          },
        ]
      }
      client_contracts: {
        Row: {
          client_id: string
          created_at: string
          date_signature: string | null
          fichier_url: string | null
          id: string
          metadata: Json
          observations: string | null
          reference: string | null
          statut: string
          type_contrat: string
          updated_at: string
          valide_at: string | null
          valide_par: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          date_signature?: string | null
          fichier_url?: string | null
          id?: string
          metadata?: Json
          observations?: string | null
          reference?: string | null
          statut?: string
          type_contrat: string
          updated_at?: string
          valide_at?: string | null
          valide_par?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          date_signature?: string | null
          fichier_url?: string | null
          id?: string
          metadata?: Json
          observations?: string | null
          reference?: string | null
          statut?: string
          type_contrat?: string
          updated_at?: string
          valide_at?: string | null
          valide_par?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_contracts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_contracts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_synthese"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "client_contracts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_monnaie_clients"
            referencedColumns: ["client_id"]
          },
        ]
      }
      client_cotitulaires_mandataires: {
        Row: {
          actif: boolean
          adresse: string | null
          civilite: string | null
          client_id: string
          created_at: string
          created_by: string | null
          date_delivrance_piece: string | null
          date_naissance: string | null
          departement_id: string | null
          district_id: string | null
          email: string | null
          id: string
          lien_client: string | null
          lieu_naissance: string | null
          nationalite: string | null
          nom: string
          numero_piece: string | null
          photo_profil_url: string | null
          piece_recto_url: string | null
          piece_verso_url: string | null
          prenoms: string | null
          procuration_url: string | null
          region_id: string | null
          sous_prefecture_id: string | null
          telephone: string | null
          telephone_indicatif: string | null
          telephone_local: string | null
          type_piece: string | null
          type_relation: string | null
          updated_at: string
          updated_by: string | null
          village_id: string | null
          whatsapp: string | null
          whatsapp_indicatif: string | null
          whatsapp_local: string | null
        }
        Insert: {
          actif?: boolean
          adresse?: string | null
          civilite?: string | null
          client_id: string
          created_at?: string
          created_by?: string | null
          date_delivrance_piece?: string | null
          date_naissance?: string | null
          departement_id?: string | null
          district_id?: string | null
          email?: string | null
          id?: string
          lien_client?: string | null
          lieu_naissance?: string | null
          nationalite?: string | null
          nom: string
          numero_piece?: string | null
          photo_profil_url?: string | null
          piece_recto_url?: string | null
          piece_verso_url?: string | null
          prenoms?: string | null
          procuration_url?: string | null
          region_id?: string | null
          sous_prefecture_id?: string | null
          telephone?: string | null
          telephone_indicatif?: string | null
          telephone_local?: string | null
          type_piece?: string | null
          type_relation?: string | null
          updated_at?: string
          updated_by?: string | null
          village_id?: string | null
          whatsapp?: string | null
          whatsapp_indicatif?: string | null
          whatsapp_local?: string | null
        }
        Update: {
          actif?: boolean
          adresse?: string | null
          civilite?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          date_delivrance_piece?: string | null
          date_naissance?: string | null
          departement_id?: string | null
          district_id?: string | null
          email?: string | null
          id?: string
          lien_client?: string | null
          lieu_naissance?: string | null
          nationalite?: string | null
          nom?: string
          numero_piece?: string | null
          photo_profil_url?: string | null
          piece_recto_url?: string | null
          piece_verso_url?: string | null
          prenoms?: string | null
          procuration_url?: string | null
          region_id?: string | null
          sous_prefecture_id?: string | null
          telephone?: string | null
          telephone_indicatif?: string | null
          telephone_local?: string | null
          type_piece?: string | null
          type_relation?: string | null
          updated_at?: string
          updated_by?: string | null
          village_id?: string | null
          whatsapp?: string | null
          whatsapp_indicatif?: string | null
          whatsapp_local?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_cotitulaires_mandataires_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_cotitulaires_mandataires_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_synthese"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "client_cotitulaires_mandataires_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_monnaie_clients"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "client_cotitulaires_mandataires_departement_id_fkey"
            columns: ["departement_id"]
            isOneToOne: false
            referencedRelation: "departements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_cotitulaires_mandataires_departement_id_fkey"
            columns: ["departement_id"]
            isOneToOne: false
            referencedRelation: "v_geo_departements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_cotitulaires_mandataires_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "districts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_cotitulaires_mandataires_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "v_geo_districts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_cotitulaires_mandataires_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_cotitulaires_mandataires_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "v_geo_regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_cotitulaires_mandataires_sous_prefecture_id_fkey"
            columns: ["sous_prefecture_id"]
            isOneToOne: false
            referencedRelation: "sous_prefectures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_cotitulaires_mandataires_sous_prefecture_id_fkey"
            columns: ["sous_prefecture_id"]
            isOneToOne: false
            referencedRelation: "v_geo_sous_prefectures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_cotitulaires_mandataires_village_id_fkey"
            columns: ["village_id"]
            isOneToOne: false
            referencedRelation: "v_geo_villages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_cotitulaires_mandataires_village_id_fkey"
            columns: ["village_id"]
            isOneToOne: false
            referencedRelation: "villages"
            referencedColumns: ["id"]
          },
        ]
      }
      client_enquetes: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          id: string
          niveau_detail: string
          offre_id: string
          parcours_code: string | null
          reponses: Json
          statut: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          niveau_detail?: string
          offre_id: string
          parcours_code?: string | null
          reponses?: Json
          statut?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          niveau_detail?: string
          offre_id?: string
          parcours_code?: string | null
          reponses?: Json
          statut?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_enquetes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_enquetes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_synthese"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "client_enquetes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_monnaie_clients"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "client_enquetes_offre_id_fkey"
            columns: ["offre_id"]
            isOneToOne: false
            referencedRelation: "offres"
            referencedColumns: ["id"]
          },
        ]
      }
      client_monnaie_mouvements: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          id: string
          jours_equivalents: number
          montant: number
          motif: string | null
          paiement_rachats_id: string | null
          paiement_source_id: string | null
          taux_journalier: number
          type_mouvement: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          jours_equivalents?: number
          montant: number
          motif?: string | null
          paiement_rachats_id?: string | null
          paiement_source_id?: string | null
          taux_journalier: number
          type_mouvement: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          jours_equivalents?: number
          montant?: number
          motif?: string | null
          paiement_rachats_id?: string | null
          paiement_source_id?: string | null
          taux_journalier?: number
          type_mouvement?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_monnaie_mouvements_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_monnaie_mouvements_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_synthese"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "client_monnaie_mouvements_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_monnaie_clients"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "client_monnaie_mouvements_paiement_rachats_id_fkey"
            columns: ["paiement_rachats_id"]
            isOneToOne: false
            referencedRelation: "paiements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_monnaie_mouvements_paiement_source_id_fkey"
            columns: ["paiement_source_id"]
            isOneToOne: false
            referencedRelation: "paiements"
            referencedColumns: ["id"]
          },
        ]
      }
      client_portal_access_codes: {
        Row: {
          client_id: string
          code_hash: string
          code_salt: string
          created_at: string
          failed_attempts: number
          id: string
          last_verified_at: string | null
          locked_until: string | null
          set_at: string
          updated_at: string
        }
        Insert: {
          client_id: string
          code_hash: string
          code_salt: string
          created_at?: string
          failed_attempts?: number
          id?: string
          last_verified_at?: string | null
          locked_until?: string | null
          set_at?: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          code_hash?: string
          code_salt?: string
          created_at?: string
          failed_attempts?: number
          id?: string
          last_verified_at?: string | null
          locked_until?: string | null
          set_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_portal_access_codes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_portal_access_codes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "v_client_synthese"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "client_portal_access_codes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "v_monnaie_clients"
            referencedColumns: ["client_id"]
          },
        ]
      }
      client_portal_sessions: {
        Row: {
          client_id: string
          created_at: string
          expires_at: string
          id: string
          ip_address: string | null
          last_seen_at: string
          revoked_at: string | null
          token_hash: string
          user_agent: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          expires_at: string
          id?: string
          ip_address?: string | null
          last_seen_at?: string
          revoked_at?: string | null
          token_hash: string
          user_agent?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          ip_address?: string | null
          last_seen_at?: string
          revoked_at?: string | null
          token_hash?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_portal_sessions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_portal_sessions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_synthese"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "client_portal_sessions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_monnaie_clients"
            referencedColumns: ["client_id"]
          },
        ]
      }
      clients: {
        Row: {
          annee_contrat: number | null
          banque_operateur: string | null
          civilite: string | null
          code_sp_contrat: string | null
          commercial_id: string | null
          compte_actif: boolean
          contact_urgence_nom: string | null
          contact_urgence_telephone: string | null
          contrat_accompagnement_statut: string
          contrat_acquisition_statut: string
          contrat_debut_at: string | null
          contrat_fin_at: string | null
          created_at: string | null
          created_by: string | null
          date_delivrance_piece: string | null
          date_naissance: string | null
          departement_id: string | null
          district_id: string | null
          documents_valides_at: string | null
          domicile: string | null
          domicile_residence: string | null
          email: string | null
          famille_offre: string | null
          fichier_piece_recto_url: string | null
          fichier_piece_url: string | null
          fichier_piece_verso_url: string | null
          formule_code: string | null
          formule_nom: string | null
          id: string
          id_unique: string | null
          jours_contrat_total: number
          jours_payes: number
          jours_retard: number
          lieu_delivrance_piece: string | null
          lieu_naissance: string | null
          localite: string | null
          mensualite_montant: number | null
          mode_paiement: string
          montant_promo_applique: number
          montant_total_contrat: number
          nationalite: string | null
          nom: string | null
          nom_complet: string | null
          nom_famille: string | null
          nom_mere: string | null
          nom_pere: string | null
          nom_titulaire_compte: string | null
          nombre_plantations: number | null
          numero_compte: string | null
          numero_contrat: string | null
          numero_ordre_global: number | null
          numero_piece: string | null
          offre_id: string | null
          paiement_initial_montant: number
          paiement_initial_paye_at: string | null
          paiement_personnalise: Json
          parcelle_id: string | null
          parcours_code: string | null
          phase_actuelle: string
          photo_profil_url: string | null
          pi_paye_at: string | null
          piece_validite_at: string | null
          prenoms: string | null
          prochaine_echeance: string | null
          profession: string | null
          promotion_id: string | null
          proprietaire_id: string | null
          region_id: string | null
          sous_prefecture_id: string | null
          statut: string | null
          statut_global: string | null
          statut_marital: string | null
          taux_journalier_ha: number
          telephone: string
          telephone_indicatif: string | null
          telephone_local: string | null
          total_hectares: number | null
          type_client: string | null
          type_client_foncier: string | null
          type_compte: string | null
          type_piece: string | null
          updated_at: string | null
          updated_by: string | null
          user_id: string | null
          village_id: string | null
          whatsapp: string | null
          whatsapp_indicatif: string | null
          whatsapp_local: string | null
        }
        Insert: {
          annee_contrat?: number | null
          banque_operateur?: string | null
          civilite?: string | null
          code_sp_contrat?: string | null
          commercial_id?: string | null
          compte_actif?: boolean
          contact_urgence_nom?: string | null
          contact_urgence_telephone?: string | null
          contrat_accompagnement_statut?: string
          contrat_acquisition_statut?: string
          contrat_debut_at?: string | null
          contrat_fin_at?: string | null
          created_at?: string | null
          created_by?: string | null
          date_delivrance_piece?: string | null
          date_naissance?: string | null
          departement_id?: string | null
          district_id?: string | null
          documents_valides_at?: string | null
          domicile?: string | null
          domicile_residence?: string | null
          email?: string | null
          famille_offre?: string | null
          fichier_piece_recto_url?: string | null
          fichier_piece_url?: string | null
          fichier_piece_verso_url?: string | null
          formule_code?: string | null
          formule_nom?: string | null
          id?: string
          id_unique?: string | null
          jours_contrat_total?: number
          jours_payes?: number
          jours_retard?: number
          lieu_delivrance_piece?: string | null
          lieu_naissance?: string | null
          localite?: string | null
          mensualite_montant?: number | null
          mode_paiement?: string
          montant_promo_applique?: number
          montant_total_contrat?: number
          nationalite?: string | null
          nom?: string | null
          nom_complet?: string | null
          nom_famille?: string | null
          nom_mere?: string | null
          nom_pere?: string | null
          nom_titulaire_compte?: string | null
          nombre_plantations?: number | null
          numero_compte?: string | null
          numero_contrat?: string | null
          numero_ordre_global?: number | null
          numero_piece?: string | null
          offre_id?: string | null
          paiement_initial_montant?: number
          paiement_initial_paye_at?: string | null
          paiement_personnalise?: Json
          parcelle_id?: string | null
          parcours_code?: string | null
          phase_actuelle?: string
          photo_profil_url?: string | null
          pi_paye_at?: string | null
          piece_validite_at?: string | null
          prenoms?: string | null
          prochaine_echeance?: string | null
          profession?: string | null
          promotion_id?: string | null
          proprietaire_id?: string | null
          region_id?: string | null
          sous_prefecture_id?: string | null
          statut?: string | null
          statut_global?: string | null
          statut_marital?: string | null
          taux_journalier_ha?: number
          telephone: string
          telephone_indicatif?: string | null
          telephone_local?: string | null
          total_hectares?: number | null
          type_client?: string | null
          type_client_foncier?: string | null
          type_compte?: string | null
          type_piece?: string | null
          updated_at?: string | null
          updated_by?: string | null
          user_id?: string | null
          village_id?: string | null
          whatsapp?: string | null
          whatsapp_indicatif?: string | null
          whatsapp_local?: string | null
        }
        Update: {
          annee_contrat?: number | null
          banque_operateur?: string | null
          civilite?: string | null
          code_sp_contrat?: string | null
          commercial_id?: string | null
          compte_actif?: boolean
          contact_urgence_nom?: string | null
          contact_urgence_telephone?: string | null
          contrat_accompagnement_statut?: string
          contrat_acquisition_statut?: string
          contrat_debut_at?: string | null
          contrat_fin_at?: string | null
          created_at?: string | null
          created_by?: string | null
          date_delivrance_piece?: string | null
          date_naissance?: string | null
          departement_id?: string | null
          district_id?: string | null
          documents_valides_at?: string | null
          domicile?: string | null
          domicile_residence?: string | null
          email?: string | null
          famille_offre?: string | null
          fichier_piece_recto_url?: string | null
          fichier_piece_url?: string | null
          fichier_piece_verso_url?: string | null
          formule_code?: string | null
          formule_nom?: string | null
          id?: string
          id_unique?: string | null
          jours_contrat_total?: number
          jours_payes?: number
          jours_retard?: number
          lieu_delivrance_piece?: string | null
          lieu_naissance?: string | null
          localite?: string | null
          mensualite_montant?: number | null
          mode_paiement?: string
          montant_promo_applique?: number
          montant_total_contrat?: number
          nationalite?: string | null
          nom?: string | null
          nom_complet?: string | null
          nom_famille?: string | null
          nom_mere?: string | null
          nom_pere?: string | null
          nom_titulaire_compte?: string | null
          nombre_plantations?: number | null
          numero_compte?: string | null
          numero_contrat?: string | null
          numero_ordre_global?: number | null
          numero_piece?: string | null
          offre_id?: string | null
          paiement_initial_montant?: number
          paiement_initial_paye_at?: string | null
          paiement_personnalise?: Json
          parcelle_id?: string | null
          parcours_code?: string | null
          phase_actuelle?: string
          photo_profil_url?: string | null
          pi_paye_at?: string | null
          piece_validite_at?: string | null
          prenoms?: string | null
          prochaine_echeance?: string | null
          profession?: string | null
          promotion_id?: string | null
          proprietaire_id?: string | null
          region_id?: string | null
          sous_prefecture_id?: string | null
          statut?: string | null
          statut_global?: string | null
          statut_marital?: string | null
          taux_journalier_ha?: number
          telephone?: string
          telephone_indicatif?: string | null
          telephone_local?: string | null
          total_hectares?: number | null
          type_client?: string | null
          type_client_foncier?: string | null
          type_compte?: string | null
          type_piece?: string | null
          updated_at?: string | null
          updated_by?: string | null
          user_id?: string | null
          village_id?: string | null
          whatsapp?: string | null
          whatsapp_indicatif?: string | null
          whatsapp_local?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_commercial_id_fkey"
            columns: ["commercial_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "clients_commercial_id_fkey"
            columns: ["commercial_id"]
            isOneToOne: false
            referencedRelation: "v_portefeuille_commissions"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "clients_departement_id_fkey"
            columns: ["departement_id"]
            isOneToOne: false
            referencedRelation: "departements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_departement_id_fkey"
            columns: ["departement_id"]
            isOneToOne: false
            referencedRelation: "v_geo_departements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "districts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "v_geo_districts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_offre_id_fkey"
            columns: ["offre_id"]
            isOneToOne: false
            referencedRelation: "offres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_parcelle_id_fkey"
            columns: ["parcelle_id"]
            isOneToOne: false
            referencedRelation: "parcelles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_proprietaire_id_fkey"
            columns: ["proprietaire_id"]
            isOneToOne: false
            referencedRelation: "proprietaires_terres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "v_geo_regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_sous_prefecture_id_fkey"
            columns: ["sous_prefecture_id"]
            isOneToOne: false
            referencedRelation: "sous_prefectures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_sous_prefecture_id_fkey"
            columns: ["sous_prefecture_id"]
            isOneToOne: false
            referencedRelation: "v_geo_sous_prefectures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_village_id_fkey"
            columns: ["village_id"]
            isOneToOne: false
            referencedRelation: "v_geo_villages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_village_id_fkey"
            columns: ["village_id"]
            isOneToOne: false
            referencedRelation: "villages"
            referencedColumns: ["id"]
          },
        ]
      }
      commissions: {
        Row: {
          annee_contrat: number | null
          client_id: string | null
          created_at: string | null
          date_calcul: string | null
          date_validation: string | null
          id: string
          montant_base: number | null
          montant_commission: number | null
          paiement_id: string | null
          periode: string | null
          plantation_id: string | null
          profile_id: string | null
          statut: string | null
          taux_applique: number | null
          taux_commission: number | null
          type_commission: string
          valide_par: string | null
        }
        Insert: {
          annee_contrat?: number | null
          client_id?: string | null
          created_at?: string | null
          date_calcul?: string | null
          date_validation?: string | null
          id?: string
          montant_base?: number | null
          montant_commission?: number | null
          paiement_id?: string | null
          periode?: string | null
          plantation_id?: string | null
          profile_id?: string | null
          statut?: string | null
          taux_applique?: number | null
          taux_commission?: number | null
          type_commission: string
          valide_par?: string | null
        }
        Update: {
          annee_contrat?: number | null
          client_id?: string | null
          created_at?: string | null
          date_calcul?: string | null
          date_validation?: string | null
          id?: string
          montant_base?: number | null
          montant_commission?: number | null
          paiement_id?: string | null
          periode?: string | null
          plantation_id?: string | null
          profile_id?: string | null
          statut?: string | null
          taux_applique?: number | null
          taux_commission?: number | null
          type_commission?: string
          valide_par?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commissions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_synthese"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "commissions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_monnaie_clients"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "commissions_paiement_id_fkey"
            columns: ["paiement_id"]
            isOneToOne: false
            referencedRelation: "paiements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_plantation_id_fkey"
            columns: ["plantation_id"]
            isOneToOne: false
            referencedRelation: "plantations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      configurations_systeme: {
        Row: {
          categorie: string
          cle: string
          created_at: string
          description: string | null
          id: string
          modifiable: boolean
          type_valeur: string
          updated_at: string
          valeur: string
        }
        Insert: {
          categorie?: string
          cle: string
          created_at?: string
          description?: string | null
          id?: string
          modifiable?: boolean
          type_valeur?: string
          updated_at?: string
          valeur?: string
        }
        Update: {
          categorie?: string
          cle?: string
          created_at?: string
          description?: string | null
          id?: string
          modifiable?: boolean
          type_valeur?: string
          updated_at?: string
          valeur?: string
        }
        Relationships: []
      }
      conventions_foncieres: {
        Row: {
          caution_par_ha: number | null
          caution_totale: number | null
          code_dom: string | null
          code_parc: string | null
          code_sp: string | null
          created_at: string | null
          created_by: string | null
          date_debut: string | null
          date_fin: string | null
          date_signature: string | null
          domaine_id: string | null
          duree_ans: number | null
          fichier_convention_url: string | null
          id: string
          nombre_lots_agricapital: number
          notes: string | null
          parcelle_id: string | null
          part_agricapital_ha: number | null
          part_agricapital_pct: number | null
          part_proprietaire_ha: number | null
          part_proprietaire_pct: number | null
          proprietaire_id: string
          reference: string | null
          sous_prefecture_id: string | null
          statut: string | null
          surface_totale_ha: number | null
          type_convention: string
          updated_at: string | null
        }
        Insert: {
          caution_par_ha?: number | null
          caution_totale?: number | null
          code_dom?: string | null
          code_parc?: string | null
          code_sp?: string | null
          created_at?: string | null
          created_by?: string | null
          date_debut?: string | null
          date_fin?: string | null
          date_signature?: string | null
          domaine_id?: string | null
          duree_ans?: number | null
          fichier_convention_url?: string | null
          id?: string
          nombre_lots_agricapital?: number
          notes?: string | null
          parcelle_id?: string | null
          part_agricapital_ha?: number | null
          part_agricapital_pct?: number | null
          part_proprietaire_ha?: number | null
          part_proprietaire_pct?: number | null
          proprietaire_id: string
          reference?: string | null
          sous_prefecture_id?: string | null
          statut?: string | null
          surface_totale_ha?: number | null
          type_convention?: string
          updated_at?: string | null
        }
        Update: {
          caution_par_ha?: number | null
          caution_totale?: number | null
          code_dom?: string | null
          code_parc?: string | null
          code_sp?: string | null
          created_at?: string | null
          created_by?: string | null
          date_debut?: string | null
          date_fin?: string | null
          date_signature?: string | null
          domaine_id?: string | null
          duree_ans?: number | null
          fichier_convention_url?: string | null
          id?: string
          nombre_lots_agricapital?: number
          notes?: string | null
          parcelle_id?: string | null
          part_agricapital_ha?: number | null
          part_agricapital_pct?: number | null
          part_proprietaire_ha?: number | null
          part_proprietaire_pct?: number | null
          proprietaire_id?: string
          reference?: string | null
          sous_prefecture_id?: string | null
          statut?: string | null
          surface_totale_ha?: number | null
          type_convention?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conventions_foncieres_domaine_id_fkey"
            columns: ["domaine_id"]
            isOneToOne: false
            referencedRelation: "domaines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conventions_foncieres_parcelle_id_fkey"
            columns: ["parcelle_id"]
            isOneToOne: false
            referencedRelation: "parcelles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conventions_foncieres_proprietaire_id_fkey"
            columns: ["proprietaire_id"]
            isOneToOne: false
            referencedRelation: "proprietaires_terres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conventions_foncieres_sous_prefecture_id_fkey"
            columns: ["sous_prefecture_id"]
            isOneToOne: false
            referencedRelation: "sous_prefectures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conventions_foncieres_sous_prefecture_id_fkey"
            columns: ["sous_prefecture_id"]
            isOneToOne: false
            referencedRelation: "v_geo_sous_prefectures"
            referencedColumns: ["id"]
          },
        ]
      }
      cotitulaires_mandataires: {
        Row: {
          created_at: string | null
          date_naissance: string | null
          est_mandataire: boolean | null
          id: string
          lien_proprietaire: string | null
          lieu_naissance: string | null
          nom: string
          numero_piece: string | null
          prenoms: string | null
          proprietaire_id: string
          telephone: string | null
          type_piece: string | null
          updated_at: string | null
          whatsapp: string | null
        }
        Insert: {
          created_at?: string | null
          date_naissance?: string | null
          est_mandataire?: boolean | null
          id?: string
          lien_proprietaire?: string | null
          lieu_naissance?: string | null
          nom: string
          numero_piece?: string | null
          prenoms?: string | null
          proprietaire_id: string
          telephone?: string | null
          type_piece?: string | null
          updated_at?: string | null
          whatsapp?: string | null
        }
        Update: {
          created_at?: string | null
          date_naissance?: string | null
          est_mandataire?: boolean | null
          id?: string
          lien_proprietaire?: string | null
          lieu_naissance?: string | null
          nom?: string
          numero_piece?: string | null
          prenoms?: string | null
          proprietaire_id?: string
          telephone?: string | null
          type_piece?: string | null
          updated_at?: string | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cotitulaires_mandataires_proprietaire_id_fkey"
            columns: ["proprietaire_id"]
            isOneToOne: false
            referencedRelation: "proprietaires_terres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotitulaires_proprietaire_id_fkey"
            columns: ["proprietaire_id"]
            isOneToOne: false
            referencedRelation: "proprietaires_terres"
            referencedColumns: ["id"]
          },
        ]
      }
      departements: {
        Row: {
          code: string | null
          created_at: string | null
          est_actif: boolean | null
          id: string
          nom: string
          region_id: string | null
        }
        Insert: {
          code?: string | null
          created_at?: string | null
          est_actif?: boolean | null
          id?: string
          nom: string
          region_id?: string | null
        }
        Update: {
          code?: string | null
          created_at?: string | null
          est_actif?: boolean | null
          id?: string
          nom?: string
          region_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "departements_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "departements_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "v_geo_regions"
            referencedColumns: ["id"]
          },
        ]
      }
      departements_entreprise: {
        Row: {
          actif: boolean
          code: string
          created_at: string
          id: string
          nom: string
          ordre: number
          requiert_couverture: boolean
          updated_at: string
        }
        Insert: {
          actif?: boolean
          code: string
          created_at?: string
          id: string
          nom: string
          ordre?: number
          requiert_couverture?: boolean
          updated_at?: string
        }
        Update: {
          actif?: boolean
          code?: string
          created_at?: string
          id?: string
          nom?: string
          ordre?: number
          requiert_couverture?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      districts: {
        Row: {
          code: string | null
          created_at: string | null
          est_actif: boolean | null
          id: string
          nom: string
        }
        Insert: {
          code?: string | null
          created_at?: string | null
          est_actif?: boolean | null
          id?: string
          nom: string
        }
        Update: {
          code?: string | null
          created_at?: string | null
          est_actif?: boolean | null
          id?: string
          nom?: string
        }
        Relationships: []
      }
      documents_acquisition: {
        Row: {
          categorie: string | null
          client_id: string | null
          code_document: string | null
          created_at: string | null
          fichier_url: string
          id: string
          metadata: Json
          obligatoire: boolean
          observations: string | null
          source_contractuelle: string | null
          statut: string | null
          type_document: string
          updated_at: string | null
          uploaded_by: string | null
          validated_at: string | null
          validated_by: string | null
        }
        Insert: {
          categorie?: string | null
          client_id?: string | null
          code_document?: string | null
          created_at?: string | null
          fichier_url: string
          id?: string
          metadata?: Json
          obligatoire?: boolean
          observations?: string | null
          source_contractuelle?: string | null
          statut?: string | null
          type_document: string
          updated_at?: string | null
          uploaded_by?: string | null
          validated_at?: string | null
          validated_by?: string | null
        }
        Update: {
          categorie?: string | null
          client_id?: string | null
          code_document?: string | null
          created_at?: string | null
          fichier_url?: string
          id?: string
          metadata?: Json
          obligatoire?: boolean
          observations?: string | null
          source_contractuelle?: string | null
          statut?: string | null
          type_document?: string
          updated_at?: string | null
          uploaded_by?: string | null
          validated_at?: string | null
          validated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_acquisition_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_acquisition_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_synthese"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "documents_acquisition_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_monnaie_clients"
            referencedColumns: ["client_id"]
          },
        ]
      }
      documents_convention: {
        Row: {
          created_at: string | null
          designation: string
          fichier_url: string | null
          id: string
          notes: string | null
          parcelle_id: string | null
          proprietaire_id: string | null
          statut: string | null
          type_document: string
          updated_at: string | null
          uploaded_by: string | null
          validated_at: string | null
          validated_by: string | null
        }
        Insert: {
          created_at?: string | null
          designation: string
          fichier_url?: string | null
          id?: string
          notes?: string | null
          parcelle_id?: string | null
          proprietaire_id?: string | null
          statut?: string | null
          type_document: string
          updated_at?: string | null
          uploaded_by?: string | null
          validated_at?: string | null
          validated_by?: string | null
        }
        Update: {
          created_at?: string | null
          designation?: string
          fichier_url?: string | null
          id?: string
          notes?: string | null
          parcelle_id?: string | null
          proprietaire_id?: string | null
          statut?: string | null
          type_document?: string
          updated_at?: string | null
          uploaded_by?: string | null
          validated_at?: string | null
          validated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_convention_parcelle_id_fkey"
            columns: ["parcelle_id"]
            isOneToOne: false
            referencedRelation: "parcelles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_convention_proprietaire_id_fkey"
            columns: ["proprietaire_id"]
            isOneToOne: false
            referencedRelation: "proprietaires_terres"
            referencedColumns: ["id"]
          },
        ]
      }
      domaines: {
        Row: {
          code_dom: string
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          nom: string
          sous_prefecture_id: string | null
          updated_at: string | null
          village: string | null
        }
        Insert: {
          code_dom: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          nom: string
          sous_prefecture_id?: string | null
          updated_at?: string | null
          village?: string | null
        }
        Update: {
          code_dom?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          nom?: string
          sous_prefecture_id?: string | null
          updated_at?: string | null
          village?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "domaines_sous_prefecture_id_fkey"
            columns: ["sous_prefecture_id"]
            isOneToOne: false
            referencedRelation: "sous_prefectures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "domaines_sous_prefecture_id_fkey"
            columns: ["sous_prefecture_id"]
            isOneToOne: false
            referencedRelation: "v_geo_sous_prefectures"
            referencedColumns: ["id"]
          },
        ]
      }
      equipes: {
        Row: {
          actif: boolean | null
          created_at: string | null
          id: string
          nom: string
          region_id: string | null
          responsable_id: string | null
          superviseur_id: string | null
          type_equipe: string | null
          updated_at: string | null
        }
        Insert: {
          actif?: boolean | null
          created_at?: string | null
          id?: string
          nom: string
          region_id?: string | null
          responsable_id?: string | null
          superviseur_id?: string | null
          type_equipe?: string | null
          updated_at?: string | null
        }
        Update: {
          actif?: boolean | null
          created_at?: string | null
          id?: string
          nom?: string
          region_id?: string | null
          responsable_id?: string | null
          superviseur_id?: string | null
          type_equipe?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipes_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipes_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "v_geo_regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipes_responsable_id_fkey"
            columns: ["responsable_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipes_superviseur_id_fkey"
            columns: ["superviseur_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_associate_transactions: {
        Row: {
          associate_id: string
          created_at: string
          id: string
          movement_type: string
          notes: string | null
          transaction_id: string
        }
        Insert: {
          associate_id: string
          created_at?: string
          id?: string
          movement_type: string
          notes?: string | null
          transaction_id: string
        }
        Update: {
          associate_id?: string
          created_at?: string
          id?: string
          movement_type?: string
          notes?: string | null
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_associate_transactions_associate_id_fkey"
            columns: ["associate_id"]
            isOneToOne: false
            referencedRelation: "finance_associates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_associate_transactions_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "finance_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_associates: {
        Row: {
          active: boolean
          created_at: string
          full_name: string
          id: string
          notes: string | null
          profile_id: string | null
          role_label: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          full_name: string
          id?: string
          notes?: string | null
          profile_id?: string | null
          role_label?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          full_name?: string
          id?: string
          notes?: string | null
          profile_id?: string | null
          role_label?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_associates_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_expenses: {
        Row: {
          client_id: string | null
          created_at: string
          description: string | null
          expense_category: string
          id: string
          is_direct_cost: boolean
          plantation_id: string | null
          profile_id: string | null
          supplier_name: string | null
          transaction_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          description?: string | null
          expense_category: string
          id?: string
          is_direct_cost?: boolean
          plantation_id?: string | null
          profile_id?: string | null
          supplier_name?: string | null
          transaction_id: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          description?: string | null
          expense_category?: string
          id?: string
          is_direct_cost?: boolean
          plantation_id?: string | null
          profile_id?: string | null
          supplier_name?: string | null
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_expenses_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_expenses_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_synthese"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "finance_expenses_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_monnaie_clients"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "finance_expenses_plantation_id_fkey"
            columns: ["plantation_id"]
            isOneToOne: false
            referencedRelation: "plantations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_expenses_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_expenses_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "finance_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_payroll_items: {
        Row: {
          base_salary: number
          bonuses: number
          commissions: number
          created_at: string
          deductions: number
          id: string
          net_salary: number | null
          payroll_run_id: string
          profile_id: string
          status: string
          transaction_id: string | null
        }
        Insert: {
          base_salary?: number
          bonuses?: number
          commissions?: number
          created_at?: string
          deductions?: number
          id?: string
          net_salary?: number | null
          payroll_run_id: string
          profile_id: string
          status?: string
          transaction_id?: string | null
        }
        Update: {
          base_salary?: number
          bonuses?: number
          commissions?: number
          created_at?: string
          deductions?: number
          id?: string
          net_salary?: number | null
          payroll_run_id?: string
          profile_id?: string
          status?: string
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_payroll_items_payroll_run_id_fkey"
            columns: ["payroll_run_id"]
            isOneToOne: false
            referencedRelation: "finance_payroll_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_payroll_items_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_payroll_items_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "finance_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_payroll_runs: {
        Row: {
          created_by: string | null
          generated_at: string
          id: string
          notes: string | null
          paid_at: string | null
          period_end: string
          period_start: string
          status: string
          validated_at: string | null
        }
        Insert: {
          created_by?: string | null
          generated_at?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          period_end: string
          period_start: string
          status?: string
          validated_at?: string | null
        }
        Update: {
          created_by?: string | null
          generated_at?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          period_end?: string
          period_start?: string
          status?: string
          validated_at?: string | null
        }
        Relationships: []
      }
      finance_salary_profiles: {
        Row: {
          active: boolean
          base_salary: number
          created_at: string
          effective_from: string
          id: string
          notes: string | null
          pay_day: number
          profile_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          base_salary?: number
          created_at?: string
          effective_from?: string
          id?: string
          notes?: string | null
          pay_day?: number
          profile_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          base_salary?: number
          created_at?: string
          effective_from?: string
          id?: string
          notes?: string | null
          pay_day?: number
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_salary_profiles_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_transactions: {
        Row: {
          amount: number
          category: string
          client_id: string | null
          created_at: string
          created_by: string | null
          direction: string
          id: string
          label: string
          notes: string | null
          payment_method: string | null
          plantation_id: string | null
          profile_id: string | null
          reference: string | null
          source_id: string | null
          source_type: string | null
          status: string
          transaction_date: string
          updated_at: string
        }
        Insert: {
          amount: number
          category: string
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          direction: string
          id?: string
          label: string
          notes?: string | null
          payment_method?: string | null
          plantation_id?: string | null
          profile_id?: string | null
          reference?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: string
          transaction_date?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          direction?: string
          id?: string
          label?: string
          notes?: string | null
          payment_method?: string | null
          plantation_id?: string | null
          profile_id?: string | null
          reference?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: string
          transaction_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_transactions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_transactions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_synthese"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "finance_transactions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_monnaie_clients"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "finance_transactions_plantation_id_fkey"
            columns: ["plantation_id"]
            isOneToOne: false
            referencedRelation: "plantations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_transactions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      grille_remuneration: {
        Row: {
          actif: boolean | null
          annee_application: number | null
          created_at: string | null
          description: string | null
          id: string
          montant: number | null
          role_cible: string
          taux_pourcentage: number | null
          type_remuneration: string
          updated_at: string | null
        }
        Insert: {
          actif?: boolean | null
          annee_application?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          montant?: number | null
          role_cible: string
          taux_pourcentage?: number | null
          type_remuneration: string
          updated_at?: string | null
        }
        Update: {
          actif?: boolean | null
          annee_application?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          montant?: number | null
          role_cible?: string
          taux_pourcentage?: number | null
          type_remuneration?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      historique_actions: {
        Row: {
          action: string
          client_id: string | null
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string | null
          id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          action: string
          client_id?: string | null
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          client_id?: string | null
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "historique_actions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historique_actions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_synthese"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "historique_actions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_monnaie_clients"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "historique_actions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      historique_activites: {
        Row: {
          action: string
          ancien_valeurs: Json | null
          created_at: string | null
          details: string | null
          id: string
          ip_address: string | null
          nouvelles_valeurs: Json | null
          record_id: string | null
          table_name: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          ancien_valeurs?: Json | null
          created_at?: string | null
          details?: string | null
          id?: string
          ip_address?: string | null
          nouvelles_valeurs?: Json | null
          record_id?: string | null
          table_name: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          ancien_valeurs?: Json | null
          created_at?: string | null
          details?: string | null
          id?: string
          ip_address?: string | null
          nouvelles_valeurs?: Json | null
          record_id?: string | null
          table_name?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      interventions_techniques: {
        Row: {
          agent_technique_id: string | null
          client_id: string | null
          convention_id: string | null
          cout: number | null
          created_at: string
          date_intervention: string
          densite_plants: number | null
          id: string
          lot_id: string | null
          nombre_plants_prevus: number | null
          nombre_plants_realises: number | null
          nombre_plants_remplaces: number | null
          observations: string | null
          parcelle_id: string | null
          plantation_id: string | null
          recommandations: string | null
          statut: string
          ticket_id: string | null
          type_intervention: string
          updated_at: string
        }
        Insert: {
          agent_technique_id?: string | null
          client_id?: string | null
          convention_id?: string | null
          cout?: number | null
          created_at?: string
          date_intervention?: string
          densite_plants?: number | null
          id?: string
          lot_id?: string | null
          nombre_plants_prevus?: number | null
          nombre_plants_realises?: number | null
          nombre_plants_remplaces?: number | null
          observations?: string | null
          parcelle_id?: string | null
          plantation_id?: string | null
          recommandations?: string | null
          statut?: string
          ticket_id?: string | null
          type_intervention?: string
          updated_at?: string
        }
        Update: {
          agent_technique_id?: string | null
          client_id?: string | null
          convention_id?: string | null
          cout?: number | null
          created_at?: string
          date_intervention?: string
          densite_plants?: number | null
          id?: string
          lot_id?: string | null
          nombre_plants_prevus?: number | null
          nombre_plants_realises?: number | null
          nombre_plants_remplaces?: number | null
          observations?: string | null
          parcelle_id?: string | null
          plantation_id?: string | null
          recommandations?: string | null
          statut?: string
          ticket_id?: string | null
          type_intervention?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interventions_techniques_agent_technique_id_fkey"
            columns: ["agent_technique_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interventions_techniques_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interventions_techniques_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_synthese"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "interventions_techniques_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_monnaie_clients"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "interventions_techniques_convention_id_fkey"
            columns: ["convention_id"]
            isOneToOne: false
            referencedRelation: "conventions_foncieres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interventions_techniques_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "lots_hectares"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interventions_techniques_parcelle_id_fkey"
            columns: ["parcelle_id"]
            isOneToOne: false
            referencedRelation: "parcelles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interventions_techniques_plantation_id_fkey"
            columns: ["plantation_id"]
            isOneToOne: false
            referencedRelation: "plantations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interventions_techniques_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets_techniques"
            referencedColumns: ["id"]
          },
        ]
      }
      kkiapay_events: {
        Row: {
          amount: number | null
          created_at: string | null
          fees: number | null
          id: string
          paiement_id: string | null
          processed: boolean | null
          processed_at: string | null
          raw_payload: Json | null
          reference: string | null
          signature_valid: boolean | null
          source: string | null
          status: string
          transaction_id: string
        }
        Insert: {
          amount?: number | null
          created_at?: string | null
          fees?: number | null
          id?: string
          paiement_id?: string | null
          processed?: boolean | null
          processed_at?: string | null
          raw_payload?: Json | null
          reference?: string | null
          signature_valid?: boolean | null
          source?: string | null
          status: string
          transaction_id: string
        }
        Update: {
          amount?: number | null
          created_at?: string | null
          fees?: number | null
          id?: string
          paiement_id?: string | null
          processed?: boolean | null
          processed_at?: string | null
          raw_payload?: Json | null
          reference?: string | null
          signature_valid?: boolean | null
          source?: string | null
          status?: string
          transaction_id?: string
        }
        Relationships: []
      }
      lead_historique: {
        Row: {
          acteur_id: string | null
          action: string
          ancienne_valeur: string | null
          champ: string | null
          commentaire: string | null
          created_at: string
          id: string
          lead_id: string
          nouvelle_valeur: string | null
        }
        Insert: {
          acteur_id?: string | null
          action: string
          ancienne_valeur?: string | null
          champ?: string | null
          commentaire?: string | null
          created_at?: string
          id?: string
          lead_id: string
          nouvelle_valeur?: string | null
        }
        Update: {
          acteur_id?: string | null
          action?: string
          ancienne_valeur?: string | null
          champ?: string | null
          commentaire?: string | null
          created_at?: string
          id?: string
          lead_id?: string
          nouvelle_valeur?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_historique_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_relances: {
        Row: {
          canal: string
          commentaire: string | null
          commercial_id: string | null
          created_at: string
          date_relance: string
          id: string
          lead_id: string
          prochaine_relance: string | null
          resultat: string
        }
        Insert: {
          canal: string
          commentaire?: string | null
          commercial_id?: string | null
          created_at?: string
          date_relance?: string
          id?: string
          lead_id: string
          prochaine_relance?: string | null
          resultat: string
        }
        Update: {
          canal?: string
          commentaire?: string | null
          commercial_id?: string | null
          created_at?: string
          date_relance?: string
          id?: string
          lead_id?: string
          prochaine_relance?: string | null
          resultat?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_relances_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          assigned_to: string | null
          client_id: string | null
          commentaire: string | null
          converti_at: string | null
          created_at: string
          created_by: string | null
          creneau_prefere: string | null
          date_contact_souhaitee: string | null
          delai_demarrage: string | null
          departement_id: string | null
          dispose_terrain: boolean
          district_id: string | null
          email: string | null
          est_diaspora: boolean
          id: string
          id_unique: string | null
          mode_contact_prefere: string | null
          nom: string
          pays_diaspora: string | null
          prenoms: string
          prochaine_relance_at: string | null
          region_id: string | null
          region_residence: string
          source: string
          sous_prefecture_id: string | null
          statut: string
          superficie_a_valoriser_ha: number | null
          superficie_disponible_ha: number | null
          superficie_souhaitee_ha: number | null
          telephone: string
          updated_at: string
          village_id: string | null
          whatsapp: string | null
        }
        Insert: {
          assigned_to?: string | null
          client_id?: string | null
          commentaire?: string | null
          converti_at?: string | null
          created_at?: string
          created_by?: string | null
          creneau_prefere?: string | null
          date_contact_souhaitee?: string | null
          delai_demarrage?: string | null
          departement_id?: string | null
          dispose_terrain?: boolean
          district_id?: string | null
          email?: string | null
          est_diaspora?: boolean
          id?: string
          id_unique?: string | null
          mode_contact_prefere?: string | null
          nom: string
          pays_diaspora?: string | null
          prenoms: string
          prochaine_relance_at?: string | null
          region_id?: string | null
          region_residence: string
          source?: string
          sous_prefecture_id?: string | null
          statut?: string
          superficie_a_valoriser_ha?: number | null
          superficie_disponible_ha?: number | null
          superficie_souhaitee_ha?: number | null
          telephone: string
          updated_at?: string
          village_id?: string | null
          whatsapp?: string | null
        }
        Update: {
          assigned_to?: string | null
          client_id?: string | null
          commentaire?: string | null
          converti_at?: string | null
          created_at?: string
          created_by?: string | null
          creneau_prefere?: string | null
          date_contact_souhaitee?: string | null
          delai_demarrage?: string | null
          departement_id?: string | null
          dispose_terrain?: boolean
          district_id?: string | null
          email?: string | null
          est_diaspora?: boolean
          id?: string
          id_unique?: string | null
          mode_contact_prefere?: string | null
          nom?: string
          pays_diaspora?: string | null
          prenoms?: string
          prochaine_relance_at?: string | null
          region_id?: string | null
          region_residence?: string
          source?: string
          sous_prefecture_id?: string | null
          statut?: string
          superficie_a_valoriser_ha?: number | null
          superficie_disponible_ha?: number | null
          superficie_souhaitee_ha?: number | null
          telephone?: string
          updated_at?: string
          village_id?: string | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_synthese"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "leads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_monnaie_clients"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "leads_departement_id_fkey"
            columns: ["departement_id"]
            isOneToOne: false
            referencedRelation: "departements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_departement_id_fkey"
            columns: ["departement_id"]
            isOneToOne: false
            referencedRelation: "v_geo_departements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "districts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "v_geo_districts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "v_geo_regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_sous_prefecture_id_fkey"
            columns: ["sous_prefecture_id"]
            isOneToOne: false
            referencedRelation: "sous_prefectures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_sous_prefecture_id_fkey"
            columns: ["sous_prefecture_id"]
            isOneToOne: false
            referencedRelation: "v_geo_sous_prefectures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_village_id_fkey"
            columns: ["village_id"]
            isOneToOne: false
            referencedRelation: "v_geo_villages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_village_id_fkey"
            columns: ["village_id"]
            isOneToOne: false
            referencedRelation: "villages"
            referencedColumns: ["id"]
          },
        ]
      }
      lots_hectares: {
        Row: {
          centroid_lat: number | null
          centroid_lng: number | null
          certifie_geometre: boolean | null
          client_id: string | null
          convention_id: string | null
          created_at: string | null
          created_by: string | null
          date_attribution: string | null
          date_certification: string | null
          fichier_plan_url: string | null
          geometre_nom: string | null
          id: string
          notes: string | null
          numero_h: number
          parcelle_id: string | null
          polygone_gps: Json | null
          reference: string | null
          statut: string | null
          surface_ha: number | null
          updated_at: string | null
        }
        Insert: {
          centroid_lat?: number | null
          centroid_lng?: number | null
          certifie_geometre?: boolean | null
          client_id?: string | null
          convention_id?: string | null
          created_at?: string | null
          created_by?: string | null
          date_attribution?: string | null
          date_certification?: string | null
          fichier_plan_url?: string | null
          geometre_nom?: string | null
          id?: string
          notes?: string | null
          numero_h: number
          parcelle_id?: string | null
          polygone_gps?: Json | null
          reference?: string | null
          statut?: string | null
          surface_ha?: number | null
          updated_at?: string | null
        }
        Update: {
          centroid_lat?: number | null
          centroid_lng?: number | null
          certifie_geometre?: boolean | null
          client_id?: string | null
          convention_id?: string | null
          created_at?: string | null
          created_by?: string | null
          date_attribution?: string | null
          date_certification?: string | null
          fichier_plan_url?: string | null
          geometre_nom?: string | null
          id?: string
          notes?: string | null
          numero_h?: number
          parcelle_id?: string | null
          polygone_gps?: Json | null
          reference?: string | null
          statut?: string | null
          surface_ha?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lots_hectares_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lots_hectares_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_synthese"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "lots_hectares_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_monnaie_clients"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "lots_hectares_convention_id_fkey"
            columns: ["convention_id"]
            isOneToOne: false
            referencedRelation: "conventions_foncieres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lots_hectares_parcelle_id_fkey"
            columns: ["parcelle_id"]
            isOneToOne: false
            referencedRelation: "parcelles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_automations: {
        Row: {
          actif: boolean
          canal: string
          code: string
          conditions: Json
          contenu: string
          cooldown_minutes: number
          created_at: string
          created_by: string | null
          criteres: Json
          derniere_execution_at: string | null
          description: string | null
          evenement: string
          id: string
          nom: string
          sujet: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          actif?: boolean
          canal?: string
          code: string
          conditions?: Json
          contenu: string
          cooldown_minutes?: number
          created_at?: string
          created_by?: string | null
          criteres?: Json
          derniere_execution_at?: string | null
          description?: string | null
          evenement: string
          id?: string
          nom: string
          sujet?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          actif?: boolean
          canal?: string
          code?: string
          conditions?: Json
          contenu?: string
          cooldown_minutes?: number
          created_at?: string
          created_by?: string | null
          criteres?: Json
          derniere_execution_at?: string | null
          description?: string | null
          evenement?: string
          id?: string
          nom?: string
          sujet?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_automations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_automations_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_campaigns: {
        Row: {
          canal: string
          contenu: string
          created_at: string
          created_by: string | null
          criteres: Json
          demarre_le: string | null
          description: string | null
          id: string
          nom: string
          programme_le: string | null
          segment_id: string | null
          statut: string
          sujet: string | null
          termine_le: string | null
          total_destinataires: number
          total_echecs: number
          total_envoyes: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          canal?: string
          contenu: string
          created_at?: string
          created_by?: string | null
          criteres?: Json
          demarre_le?: string | null
          description?: string | null
          id?: string
          nom: string
          programme_le?: string | null
          segment_id?: string | null
          statut?: string
          sujet?: string | null
          termine_le?: string | null
          total_destinataires?: number
          total_echecs?: number
          total_envoyes?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          canal?: string
          contenu?: string
          created_at?: string
          created_by?: string | null
          criteres?: Json
          demarre_le?: string | null
          description?: string | null
          id?: string
          nom?: string
          programme_le?: string | null
          segment_id?: string | null
          statut?: string
          sujet?: string | null
          termine_le?: string | null
          total_destinataires?: number
          total_echecs?: number
          total_envoyes?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_campaigns_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "notification_segments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_campaigns_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_cron_state: {
        Row: {
          id: boolean
          last_run_at: string | null
        }
        Insert: {
          id?: boolean
          last_run_at?: string | null
        }
        Update: {
          id?: boolean
          last_run_at?: string | null
        }
        Relationships: []
      }
      notification_deliveries: {
        Row: {
          automation_id: string | null
          campaign_id: string | null
          canal: string
          contenu: string | null
          created_at: string
          dedupe_key: string
          erreur: string | null
          fournisseur: string | null
          id: string
          metadata: Json
          provider_message_id: string | null
          recipient_email: string | null
          recipient_name: string | null
          recipient_phone: string | null
          sent_at: string | null
          source_id: string | null
          source_type: string | null
          statut: string
          user_id: string | null
        }
        Insert: {
          automation_id?: string | null
          campaign_id?: string | null
          canal: string
          contenu?: string | null
          created_at?: string
          dedupe_key: string
          erreur?: string | null
          fournisseur?: string | null
          id?: string
          metadata?: Json
          provider_message_id?: string | null
          recipient_email?: string | null
          recipient_name?: string | null
          recipient_phone?: string | null
          sent_at?: string | null
          source_id?: string | null
          source_type?: string | null
          statut?: string
          user_id?: string | null
        }
        Update: {
          automation_id?: string | null
          campaign_id?: string | null
          canal?: string
          contenu?: string | null
          created_at?: string
          dedupe_key?: string
          erreur?: string | null
          fournisseur?: string | null
          id?: string
          metadata?: Json
          provider_message_id?: string | null
          recipient_email?: string | null
          recipient_name?: string | null
          recipient_phone?: string | null
          sent_at?: string | null
          source_id?: string | null
          source_type?: string | null
          statut?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_deliveries_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "notification_automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_deliveries_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "notification_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_event_outbox: {
        Row: {
          context: Json
          created_at: string
          derniere_erreur: string | null
          event_code: string
          id: string
          processed_at: string | null
          statut: string
          tentatives: number
        }
        Insert: {
          context?: Json
          created_at?: string
          derniere_erreur?: string | null
          event_code: string
          id?: string
          processed_at?: string | null
          statut?: string
          tentatives?: number
        }
        Update: {
          context?: Json
          created_at?: string
          derniere_erreur?: string | null
          event_code?: string
          id?: string
          processed_at?: string | null
          statut?: string
          tentatives?: number
        }
        Relationships: []
      }
      notification_provider_events: {
        Row: {
          canal: string | null
          created_at: string
          event_type: string
          fournisseur: string
          id: string
          payload: Json
          processed: boolean
          provider_message_id: string | null
        }
        Insert: {
          canal?: string | null
          created_at?: string
          event_type: string
          fournisseur: string
          id?: string
          payload?: Json
          processed?: boolean
          provider_message_id?: string | null
        }
        Update: {
          canal?: string | null
          created_at?: string
          event_type?: string
          fournisseur?: string
          id?: string
          payload?: Json
          processed?: boolean
          provider_message_id?: string | null
        }
        Relationships: []
      }
      notification_segments: {
        Row: {
          actif: boolean
          code: string
          created_at: string
          created_by: string | null
          criteres: Json
          description: string | null
          id: string
          nom: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          actif?: boolean
          code: string
          created_at?: string
          created_by?: string | null
          criteres?: Json
          description?: string | null
          id?: string
          nom: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          actif?: boolean
          code?: string
          created_at?: string
          created_by?: string | null
          criteres?: Json
          description?: string | null
          id?: string
          nom?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_segments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_segments_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_templates: {
        Row: {
          actif: boolean
          canal: string
          code: string
          contenu: string
          created_at: string
          created_by: string | null
          evenement: string
          id: string
          nom: string
          parcours: string
          sujet: string | null
          updated_at: string
          updated_by: string | null
          variables: Json
        }
        Insert: {
          actif?: boolean
          canal?: string
          code: string
          contenu: string
          created_at?: string
          created_by?: string | null
          evenement: string
          id?: string
          nom: string
          parcours?: string
          sujet?: string | null
          updated_at?: string
          updated_by?: string | null
          variables?: Json
        }
        Update: {
          actif?: boolean
          canal?: string
          code?: string
          contenu?: string
          created_at?: string
          created_by?: string | null
          evenement?: string
          id?: string
          nom?: string
          parcours?: string
          sujet?: string | null
          updated_at?: string
          updated_by?: string | null
          variables?: Json
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string | null
          data: Json | null
          dedupe_key: string | null
          id: string
          message: string
          read: boolean | null
          title: string
          type: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          data?: Json | null
          dedupe_key?: string | null
          id?: string
          message: string
          read?: boolean | null
          title: string
          type: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          data?: Json | null
          dedupe_key?: string | null
          id?: string
          message?: string
          read?: boolean | null
          title?: string
          type?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      offre_formulaire_contrats: {
        Row: {
          actif: boolean
          condition: Json
          created_at: string
          id: string
          obligatoire: boolean
          offre_id: string
          source_document: string | null
          type_contrat: string
          updated_at: string
        }
        Insert: {
          actif?: boolean
          condition?: Json
          created_at?: string
          id?: string
          obligatoire?: boolean
          offre_id: string
          source_document?: string | null
          type_contrat: string
          updated_at?: string
        }
        Update: {
          actif?: boolean
          condition?: Json
          created_at?: string
          id?: string
          obligatoire?: boolean
          offre_id?: string
          source_document?: string | null
          type_contrat?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "offre_formulaire_contrats_offre_id_fkey"
            columns: ["offre_id"]
            isOneToOne: false
            referencedRelation: "offres"
            referencedColumns: ["id"]
          },
        ]
      }
      offre_formulaire_documents: {
        Row: {
          actif: boolean
          categorie: string | null
          code: string
          condition: Json
          created_at: string
          formats: string[]
          id: string
          libelle: string
          max_mb: number
          obligatoire: boolean
          offre_id: string
          ordre: number
          source_contractuelle: string | null
          updated_at: string
        }
        Insert: {
          actif?: boolean
          categorie?: string | null
          code: string
          condition?: Json
          created_at?: string
          formats?: string[]
          id?: string
          libelle: string
          max_mb?: number
          obligatoire?: boolean
          offre_id: string
          ordre?: number
          source_contractuelle?: string | null
          updated_at?: string
        }
        Update: {
          actif?: boolean
          categorie?: string | null
          code?: string
          condition?: Json
          created_at?: string
          formats?: string[]
          id?: string
          libelle?: string
          max_mb?: number
          obligatoire?: boolean
          offre_id?: string
          ordre?: number
          source_contractuelle?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "offre_formulaire_documents_offre_id_fkey"
            columns: ["offre_id"]
            isOneToOne: false
            referencedRelation: "offres"
            referencedColumns: ["id"]
          },
        ]
      }
      offre_formulaire_etapes: {
        Row: {
          actif: boolean
          code: string
          configuration: Json
          created_at: string
          description: string | null
          id: string
          obligatoire: boolean
          offre_id: string
          ordre: number
          titre: string
          updated_at: string
        }
        Insert: {
          actif?: boolean
          code: string
          configuration?: Json
          created_at?: string
          description?: string | null
          id?: string
          obligatoire?: boolean
          offre_id: string
          ordre: number
          titre: string
          updated_at?: string
        }
        Update: {
          actif?: boolean
          code?: string
          configuration?: Json
          created_at?: string
          description?: string | null
          id?: string
          obligatoire?: boolean
          offre_id?: string
          ordre?: number
          titre?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "offre_formulaire_etapes_offre_id_fkey"
            columns: ["offre_id"]
            isOneToOne: false
            referencedRelation: "offres"
            referencedColumns: ["id"]
          },
        ]
      }
      offres: {
        Row: {
          actif: boolean | null
          avantages: Json | null
          code: string
          contrat_accompagnement_requis: boolean
          contrat_acquisition_requis: boolean
          mensualite_par_ha: number
          couleur: string | null
          created_at: string | null
          description: string | null
          duree_installation_mois: number
          duree_paiement_mois: number
          duree_production_ans: number
          famille_offre: string | null
          formule_code: string | null
          formule_nom: string | null
          gestion_type: string
          id: string
          montant_cash_par_ha: number
          montant_pi_par_ha: number
          montant_total_par_ha: number
          necessite_cotitulaire: boolean
          necessite_foncier_client: boolean
          nom: string
          ordre: number | null
          paiement_apres_trouaison_par_ha: number | null
          paiement_signature_par_ha: number | null
          parcours_code: string | null
          pourcentage_revenus_reverses: number
          tranches_paiement: Json
          type_offre: string | null
          updated_at: string | null
        }
        Insert: {
          actif?: boolean | null
          avantages?: Json | null
          code: string
          contrat_accompagnement_requis?: boolean
          contrat_acquisition_requis?: boolean
          mensualite_par_ha?: number
          couleur?: string | null
          created_at?: string | null
          description?: string | null
          duree_installation_mois?: number
          duree_paiement_mois?: number
          duree_production_ans?: number
          famille_offre?: string | null
          formule_code?: string | null
          formule_nom?: string | null
          gestion_type?: string
          id?: string
          montant_cash_par_ha?: number
          montant_pi_par_ha?: number
          montant_total_par_ha?: number
          necessite_cotitulaire?: boolean
          necessite_foncier_client?: boolean
          nom: string
          ordre?: number | null
          paiement_apres_trouaison_par_ha?: number | null
          paiement_signature_par_ha?: number | null
          parcours_code?: string | null
          pourcentage_revenus_reverses?: number
          tranches_paiement?: Json
          type_offre?: string | null
          updated_at?: string | null
        }
        Update: {
          actif?: boolean | null
          avantages?: Json | null
          code?: string
          contrat_accompagnement_requis?: boolean
          contrat_acquisition_requis?: boolean
          mensualite_par_ha?: number
          couleur?: string | null
          created_at?: string | null
          description?: string | null
          duree_installation_mois?: number
          duree_paiement_mois?: number
          duree_production_ans?: number
          famille_offre?: string | null
          formule_code?: string | null
          formule_nom?: string | null
          gestion_type?: string
          id?: string
          montant_cash_par_ha?: number
          montant_pi_par_ha?: number
          montant_total_par_ha?: number
          necessite_cotitulaire?: boolean
          necessite_foncier_client?: boolean
          nom?: string
          ordre?: number | null
          paiement_apres_trouaison_par_ha?: number | null
          paiement_signature_par_ha?: number | null
          parcours_code?: string | null
          pourcentage_revenus_reverses?: number
          tranches_paiement?: Json
          type_offre?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      otp_codes: {
        Row: {
          attempts: number | null
          code: string
          created_at: string | null
          expires_at: string
          id: string
          telephone: string
          verified: boolean | null
        }
        Insert: {
          attempts?: number | null
          code: string
          created_at?: string | null
          expires_at: string
          id?: string
          telephone: string
          verified?: boolean | null
        }
        Update: {
          attempts?: number | null
          code?: string
          created_at?: string | null
          expires_at?: string
          id?: string
          telephone?: string
          verified?: boolean | null
        }
        Relationships: []
      }
      paiements: {
        Row: {
          annee: number | null
          cancelled_at: string | null
          client_id: string | null
          created_at: string | null
          created_by: string | null
          date_echeance: string | null
          date_paiement: string | null
          date_upload_preuve: string | null
          date_validation: string | null
          est_paiement_initial: boolean
          fichier_preuve_url: string | null
          id: string
          id_transaction: string | null
          jours_couverts: number
          jours_retard: number
          kkiapay_transaction_id: string | null
          metadata: Json | null
          mode_paiement: string | null
          montant: number
          montant_paye: number | null
          montant_theorique: number | null
          notes: string | null
          numero_echeance: number | null
          observations: string | null
          operateur_mobile_money: string | null
          parcours: string
          periode_debut: string | null
          periode_fin: string | null
          phase: string | null
          plantation_id: string | null
          preuve_paiement_url: string | null
          reference: string | null
          refund_reason: string | null
          refund_requested_at: string | null
          refunded_at: string | null
          statut: string | null
          type_paiement: string | null
          type_preuve: string | null
          updated_at: string | null
          valide_par: string | null
        }
        Insert: {
          annee?: number | null
          cancelled_at?: string | null
          client_id?: string | null
          created_at?: string | null
          created_by?: string | null
          date_echeance?: string | null
          date_paiement?: string | null
          date_upload_preuve?: string | null
          date_validation?: string | null
          est_paiement_initial?: boolean
          fichier_preuve_url?: string | null
          id?: string
          id_transaction?: string | null
          jours_couverts?: number
          jours_retard?: number
          kkiapay_transaction_id?: string | null
          metadata?: Json | null
          mode_paiement?: string | null
          montant?: number
          montant_paye?: number | null
          montant_theorique?: number | null
          notes?: string | null
          numero_echeance?: number | null
          observations?: string | null
          operateur_mobile_money?: string | null
          parcours?: string
          periode_debut?: string | null
          periode_fin?: string | null
          phase?: string | null
          plantation_id?: string | null
          preuve_paiement_url?: string | null
          reference?: string | null
          refund_reason?: string | null
          refund_requested_at?: string | null
          refunded_at?: string | null
          statut?: string | null
          type_paiement?: string | null
          type_preuve?: string | null
          updated_at?: string | null
          valide_par?: string | null
        }
        Update: {
          annee?: number | null
          cancelled_at?: string | null
          client_id?: string | null
          created_at?: string | null
          created_by?: string | null
          date_echeance?: string | null
          date_paiement?: string | null
          date_upload_preuve?: string | null
          date_validation?: string | null
          est_paiement_initial?: boolean
          fichier_preuve_url?: string | null
          id?: string
          id_transaction?: string | null
          jours_couverts?: number
          jours_retard?: number
          kkiapay_transaction_id?: string | null
          metadata?: Json | null
          mode_paiement?: string | null
          montant?: number
          montant_paye?: number | null
          montant_theorique?: number | null
          notes?: string | null
          numero_echeance?: number | null
          observations?: string | null
          operateur_mobile_money?: string | null
          parcours?: string
          periode_debut?: string | null
          periode_fin?: string | null
          phase?: string | null
          plantation_id?: string | null
          preuve_paiement_url?: string | null
          reference?: string | null
          refund_reason?: string | null
          refund_requested_at?: string | null
          refunded_at?: string | null
          statut?: string | null
          type_paiement?: string | null
          type_preuve?: string | null
          updated_at?: string | null
          valide_par?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "paiements_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paiements_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_synthese"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "paiements_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_monnaie_clients"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "paiements_plantation_id_fkey"
            columns: ["plantation_id"]
            isOneToOne: false
            referencedRelation: "plantations"
            referencedColumns: ["id"]
          },
        ]
      }
      parcelles: {
        Row: {
          code_parc: string | null
          convention_id: string | null
          created_at: string | null
          created_by: string | null
          date_convention: string | null
          departement_id: string | null
          district_id: string | null
          domaine_id: string | null
          duree_convention: number | null
          id: string
          id_unique: string | null
          localisation_gps_lat: number | null
          localisation_gps_lng: number | null
          mode_surface: string
          nom: string | null
          notes: string | null
          plantation_date_activation: string | null
          plantation_densite_plants: number | null
          plantation_partagee_activee: boolean
          plantation_surface_cible_ha: number | null
          plantation_type_culture: string | null
          polygone_gps: Json | null
          proprietaire_id: string | null
          reference_convention: string | null
          region_id: string | null
          sous_prefecture_id: string | null
          statut: string | null
          surface_agricapital_ha: number
          surface_attribuee_ha: number
          surface_disponible_ha: number
          surface_proprietaire_ha: number
          surface_totale_ha: number
          updated_at: string | null
          updated_by: string | null
          village: string | null
        }
        Insert: {
          code_parc?: string | null
          convention_id?: string | null
          created_at?: string | null
          created_by?: string | null
          date_convention?: string | null
          departement_id?: string | null
          district_id?: string | null
          domaine_id?: string | null
          duree_convention?: number | null
          id?: string
          id_unique?: string | null
          localisation_gps_lat?: number | null
          localisation_gps_lng?: number | null
          mode_surface?: string
          nom?: string | null
          notes?: string | null
          plantation_date_activation?: string | null
          plantation_densite_plants?: number | null
          plantation_partagee_activee?: boolean
          plantation_surface_cible_ha?: number | null
          plantation_type_culture?: string | null
          polygone_gps?: Json | null
          proprietaire_id?: string | null
          reference_convention?: string | null
          region_id?: string | null
          sous_prefecture_id?: string | null
          statut?: string | null
          surface_agricapital_ha?: number
          surface_attribuee_ha?: number
          surface_disponible_ha?: number
          surface_proprietaire_ha?: number
          surface_totale_ha?: number
          updated_at?: string | null
          updated_by?: string | null
          village?: string | null
        }
        Update: {
          code_parc?: string | null
          convention_id?: string | null
          created_at?: string | null
          created_by?: string | null
          date_convention?: string | null
          departement_id?: string | null
          district_id?: string | null
          domaine_id?: string | null
          duree_convention?: number | null
          id?: string
          id_unique?: string | null
          localisation_gps_lat?: number | null
          localisation_gps_lng?: number | null
          mode_surface?: string
          nom?: string | null
          notes?: string | null
          plantation_date_activation?: string | null
          plantation_densite_plants?: number | null
          plantation_partagee_activee?: boolean
          plantation_surface_cible_ha?: number | null
          plantation_type_culture?: string | null
          polygone_gps?: Json | null
          proprietaire_id?: string | null
          reference_convention?: string | null
          region_id?: string | null
          sous_prefecture_id?: string | null
          statut?: string | null
          surface_agricapital_ha?: number
          surface_attribuee_ha?: number
          surface_disponible_ha?: number
          surface_proprietaire_ha?: number
          surface_totale_ha?: number
          updated_at?: string | null
          updated_by?: string | null
          village?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parcelles_convention_id_fkey"
            columns: ["convention_id"]
            isOneToOne: false
            referencedRelation: "conventions_foncieres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parcelles_departement_id_fkey"
            columns: ["departement_id"]
            isOneToOne: false
            referencedRelation: "departements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parcelles_departement_id_fkey"
            columns: ["departement_id"]
            isOneToOne: false
            referencedRelation: "v_geo_departements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parcelles_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "districts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parcelles_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "v_geo_districts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parcelles_domaine_id_fkey"
            columns: ["domaine_id"]
            isOneToOne: false
            referencedRelation: "domaines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parcelles_proprietaire_id_fkey"
            columns: ["proprietaire_id"]
            isOneToOne: false
            referencedRelation: "proprietaires_terres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parcelles_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parcelles_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "v_geo_regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parcelles_sous_prefecture_id_fkey"
            columns: ["sous_prefecture_id"]
            isOneToOne: false
            referencedRelation: "sous_prefectures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parcelles_sous_prefecture_id_fkey"
            columns: ["sous_prefecture_id"]
            isOneToOne: false
            referencedRelation: "v_geo_sous_prefectures"
            referencedColumns: ["id"]
          },
        ]
      }
      photos_plantation: {
        Row: {
          created_at: string
          date_prise: string
          description: string | null
          id: string
          phase: string | null
          plantation_id: string | null
          type_photo: string
          updated_at: string
          uploaded_by: string | null
          url: string
        }
        Insert: {
          created_at?: string
          date_prise?: string
          description?: string | null
          id?: string
          phase?: string | null
          plantation_id?: string | null
          type_photo?: string
          updated_at?: string
          uploaded_by?: string | null
          url: string
        }
        Update: {
          created_at?: string
          date_prise?: string
          description?: string | null
          id?: string
          phase?: string | null
          plantation_id?: string | null
          type_photo?: string
          updated_at?: string
          uploaded_by?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "photos_plantation_plantation_id_fkey"
            columns: ["plantation_id"]
            isOneToOne: false
            referencedRelation: "plantations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photos_plantation_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      plantation_activations: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          date_activation: string
          id: string
          lot_id: string
          notes: string | null
          parcelle_id: string
          proprietaire_id: string
          statut: string
          surface_client_ha: number
          surface_proprietaire_ha: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          date_activation?: string
          id?: string
          lot_id: string
          notes?: string | null
          parcelle_id: string
          proprietaire_id: string
          statut?: string
          surface_client_ha: number
          surface_proprietaire_ha: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          date_activation?: string
          id?: string
          lot_id?: string
          notes?: string | null
          parcelle_id?: string
          proprietaire_id?: string
          statut?: string
          surface_client_ha?: number
          surface_proprietaire_ha?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plantation_activations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plantation_activations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_synthese"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "plantation_activations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_monnaie_clients"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "plantation_activations_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: true
            referencedRelation: "lots_hectares"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plantation_activations_parcelle_id_fkey"
            columns: ["parcelle_id"]
            isOneToOne: false
            referencedRelation: "parcelles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plantation_activations_proprietaire_id_fkey"
            columns: ["proprietaire_id"]
            isOneToOne: false
            referencedRelation: "proprietaires_terres"
            referencedColumns: ["id"]
          },
        ]
      }
      plantations: {
        Row: {
          activation_id: string | null
          age_plants: number | null
          alerte_non_paiement: boolean | null
          alerte_visite_retard: boolean | null
          altitude: number | null
          chef_village_nom: string | null
          chef_village_telephone: string | null
          client_id: string
          created_at: string | null
          created_by: string | null
          date_activation: string | null
          date_plantation: string | null
          date_signature_contrat: string | null
          densite_cible: number
          densite_plants: number | null
          departement_id: string | null
          derniere_visite: string | null
          district_id: string | null
          document_foncier_date_delivrance: string | null
          document_foncier_numero: string | null
          document_foncier_type: string | null
          id: string
          id_unique: string | null
          latitude: number | null
          localisation_gps_lat: number | null
          localisation_gps_lng: number | null
          localite: string | null
          longitude: number | null
          lot_id: string | null
          montant_mensualite: number | null
          montant_pi: number | null
          montant_pi_paye: number | null
          nom: string | null
          nom_plantation: string | null
          nombre_plants: number | null
          nombre_plants_mis_en_terre: number | null
          nombre_plants_prevus: number | null
          nombre_plants_remplaces: number
          notes: string | null
          notes_internes: string | null
          parcelle_id: string | null
          polygone_gps: Json | null
          prochaine_visite: string | null
          region_id: string | null
          role_attribution: string
          sous_prefecture_id: string | null
          statut: string | null
          statut_global: string | null
          superficie_activee: number | null
          superficie_ha: number | null
          surface_reellement_plantee: number | null
          taux_reussite: number | null
          type_culture: string | null
          updated_at: string | null
          updated_by: string | null
          variete: string | null
          village: string | null
          village_nom: string | null
        }
        Insert: {
          activation_id?: string | null
          age_plants?: number | null
          alerte_non_paiement?: boolean | null
          alerte_visite_retard?: boolean | null
          altitude?: number | null
          chef_village_nom?: string | null
          chef_village_telephone?: string | null
          client_id: string
          created_at?: string | null
          created_by?: string | null
          date_activation?: string | null
          date_plantation?: string | null
          date_signature_contrat?: string | null
          densite_cible?: number
          densite_plants?: number | null
          departement_id?: string | null
          derniere_visite?: string | null
          district_id?: string | null
          document_foncier_date_delivrance?: string | null
          document_foncier_numero?: string | null
          document_foncier_type?: string | null
          id?: string
          id_unique?: string | null
          latitude?: number | null
          localisation_gps_lat?: number | null
          localisation_gps_lng?: number | null
          localite?: string | null
          longitude?: number | null
          lot_id?: string | null
          montant_mensualite?: number | null
          montant_pi?: number | null
          montant_pi_paye?: number | null
          nom?: string | null
          nom_plantation?: string | null
          nombre_plants?: number | null
          nombre_plants_mis_en_terre?: number | null
          nombre_plants_prevus?: number | null
          nombre_plants_remplaces?: number
          notes?: string | null
          notes_internes?: string | null
          parcelle_id?: string | null
          polygone_gps?: Json | null
          prochaine_visite?: string | null
          region_id?: string | null
          role_attribution?: string
          sous_prefecture_id?: string | null
          statut?: string | null
          statut_global?: string | null
          superficie_activee?: number | null
          superficie_ha?: number | null
          surface_reellement_plantee?: number | null
          taux_reussite?: number | null
          type_culture?: string | null
          updated_at?: string | null
          updated_by?: string | null
          variete?: string | null
          village?: string | null
          village_nom?: string | null
        }
        Update: {
          activation_id?: string | null
          age_plants?: number | null
          alerte_non_paiement?: boolean | null
          alerte_visite_retard?: boolean | null
          altitude?: number | null
          chef_village_nom?: string | null
          chef_village_telephone?: string | null
          client_id?: string
          created_at?: string | null
          created_by?: string | null
          date_activation?: string | null
          date_plantation?: string | null
          date_signature_contrat?: string | null
          densite_cible?: number
          densite_plants?: number | null
          departement_id?: string | null
          derniere_visite?: string | null
          district_id?: string | null
          document_foncier_date_delivrance?: string | null
          document_foncier_numero?: string | null
          document_foncier_type?: string | null
          id?: string
          id_unique?: string | null
          latitude?: number | null
          localisation_gps_lat?: number | null
          localisation_gps_lng?: number | null
          localite?: string | null
          longitude?: number | null
          lot_id?: string | null
          montant_mensualite?: number | null
          montant_pi?: number | null
          montant_pi_paye?: number | null
          nom?: string | null
          nom_plantation?: string | null
          nombre_plants?: number | null
          nombre_plants_mis_en_terre?: number | null
          nombre_plants_prevus?: number | null
          nombre_plants_remplaces?: number
          notes?: string | null
          notes_internes?: string | null
          parcelle_id?: string | null
          polygone_gps?: Json | null
          prochaine_visite?: string | null
          region_id?: string | null
          role_attribution?: string
          sous_prefecture_id?: string | null
          statut?: string | null
          statut_global?: string | null
          superficie_activee?: number | null
          superficie_ha?: number | null
          surface_reellement_plantee?: number | null
          taux_reussite?: number | null
          type_culture?: string | null
          updated_at?: string | null
          updated_by?: string | null
          variete?: string | null
          village?: string | null
          village_nom?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plantations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plantations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_synthese"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "plantations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_monnaie_clients"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "plantations_departement_id_fkey"
            columns: ["departement_id"]
            isOneToOne: false
            referencedRelation: "departements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plantations_departement_id_fkey"
            columns: ["departement_id"]
            isOneToOne: false
            referencedRelation: "v_geo_departements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plantations_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "districts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plantations_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "v_geo_districts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plantations_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "lots_hectares"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plantations_parcelle_id_fkey"
            columns: ["parcelle_id"]
            isOneToOne: false
            referencedRelation: "parcelles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plantations_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plantations_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "v_geo_regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plantations_sous_prefecture_id_fkey"
            columns: ["sous_prefecture_id"]
            isOneToOne: false
            referencedRelation: "sous_prefectures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plantations_sous_prefecture_id_fkey"
            columns: ["sous_prefecture_id"]
            isOneToOne: false
            referencedRelation: "v_geo_sous_prefectures"
            referencedColumns: ["id"]
          },
        ]
      }
      portail_messages: {
        Row: {
          auteur_nom: string | null
          auteur_type: string
          auteur_user_id: string | null
          client_id: string
          created_at: string
          id: string
          lu: boolean
          message: string
          piece_jointe_bucket: string | null
          piece_jointe_nom: string | null
          piece_jointe_taille: number | null
          piece_jointe_type: string | null
          piece_jointe_url: string | null
          plantation_id: string | null
        }
        Insert: {
          auteur_nom?: string | null
          auteur_type?: string
          auteur_user_id?: string | null
          client_id: string
          created_at?: string
          id?: string
          lu?: boolean
          message: string
          piece_jointe_bucket?: string | null
          piece_jointe_nom?: string | null
          piece_jointe_taille?: number | null
          piece_jointe_type?: string | null
          piece_jointe_url?: string | null
          plantation_id?: string | null
        }
        Update: {
          auteur_nom?: string | null
          auteur_type?: string
          auteur_user_id?: string | null
          client_id?: string
          created_at?: string
          id?: string
          lu?: boolean
          message?: string
          piece_jointe_bucket?: string | null
          piece_jointe_nom?: string | null
          piece_jointe_taille?: number | null
          piece_jointe_type?: string | null
          piece_jointe_url?: string | null
          plantation_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portail_messages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portail_messages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_synthese"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "portail_messages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_monnaie_clients"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "portail_messages_plantation_id_fkey"
            columns: ["plantation_id"]
            isOneToOne: false
            referencedRelation: "plantations"
            referencedColumns: ["id"]
          },
        ]
      }
      portail_notifications: {
        Row: {
          client_id: string
          created_at: string
          data: Json
          dedupe_key: string
          id: string
          message: string
          message_id: string | null
          read: boolean
          title: string
          type: string
        }
        Insert: {
          client_id: string
          created_at?: string
          data?: Json
          dedupe_key: string
          id?: string
          message: string
          message_id?: string | null
          read?: boolean
          title: string
          type?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          data?: Json
          dedupe_key?: string
          id?: string
          message?: string
          message_id?: string | null
          read?: boolean
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "portail_notifications_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portail_notifications_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_synthese"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "portail_notifications_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_monnaie_clients"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "portail_notifications_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "portail_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      portail_support_requests: {
        Row: {
          assigne_a: string | null
          canal: string
          client_id: string
          created_at: string
          id: string
          message: string
          nom_complet: string
          objet: string
          resolved_at: string | null
          statut: string
          telephone: string
          updated_at: string
        }
        Insert: {
          assigne_a?: string | null
          canal?: string
          client_id: string
          created_at?: string
          id?: string
          message: string
          nom_complet: string
          objet?: string
          resolved_at?: string | null
          statut?: string
          telephone: string
          updated_at?: string
        }
        Update: {
          assigne_a?: string | null
          canal?: string
          client_id?: string
          created_at?: string
          id?: string
          message?: string
          nom_complet?: string
          objet?: string
          resolved_at?: string | null
          statut?: string
          telephone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portail_support_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portail_support_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_synthese"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "portail_support_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_monnaie_clients"
            referencedColumns: ["client_id"]
          },
        ]
      }
      portefeuille_versement_lignes: {
        Row: {
          commission_id: string
          created_at: string
          id: string
          montant: number
          versement_id: string
        }
        Insert: {
          commission_id: string
          created_at?: string
          id?: string
          montant?: number
          versement_id: string
        }
        Update: {
          commission_id?: string
          created_at?: string
          id?: string
          montant?: number
          versement_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "portefeuille_versement_lignes_commission_id_fkey"
            columns: ["commission_id"]
            isOneToOne: false
            referencedRelation: "commissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portefeuille_versement_lignes_commission_id_fkey"
            columns: ["commission_id"]
            isOneToOne: false
            referencedRelation: "v_portefeuille_commissions"
            referencedColumns: ["commission_id"]
          },
          {
            foreignKeyName: "portefeuille_versement_lignes_versement_id_fkey"
            columns: ["versement_id"]
            isOneToOne: false
            referencedRelation: "portefeuille_versements"
            referencedColumns: ["id"]
          },
        ]
      }
      portefeuille_versements: {
        Row: {
          created_at: string
          created_by: string | null
          date_paiement: string | null
          date_validation: string | null
          id: string
          mode_paiement: string | null
          montant_brut: number
          montant_paye: number
          notes: string | null
          paye_par: string | null
          periode_debut: string
          periode_fin: string
          profile_id: string
          reference: string | null
          statut: string
          updated_at: string
          valide_par: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          date_paiement?: string | null
          date_validation?: string | null
          id?: string
          mode_paiement?: string | null
          montant_brut?: number
          montant_paye?: number
          notes?: string | null
          paye_par?: string | null
          periode_debut: string
          periode_fin: string
          profile_id: string
          reference?: string | null
          statut?: string
          updated_at?: string
          valide_par?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          date_paiement?: string | null
          date_validation?: string | null
          id?: string
          mode_paiement?: string | null
          montant_brut?: number
          montant_paye?: number
          notes?: string | null
          paye_par?: string | null
          periode_debut?: string
          periode_fin?: string
          profile_id?: string
          reference?: string | null
          statut?: string
          updated_at?: string
          valide_par?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portefeuille_versements_paye_par_fkey"
            columns: ["paye_par"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portefeuille_versements_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portefeuille_versements_valide_par_fkey"
            columns: ["valide_par"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      portefeuilles: {
        Row: {
          created_at: string | null
          dernier_versement_date: string | null
          dernier_versement_montant: number | null
          id: string
          solde_commissions: number | null
          total_gagne: number | null
          total_retire: number | null
          total_verse: number
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          dernier_versement_date?: string | null
          dernier_versement_montant?: number | null
          id?: string
          solde_commissions?: number | null
          total_gagne?: number | null
          total_retire?: number | null
          total_verse?: number
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          dernier_versement_date?: string | null
          dernier_versement_montant?: number | null
          id?: string
          solde_commissions?: number | null
          total_gagne?: number | null
          total_retire?: number | null
          total_verse?: number
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          actif: boolean | null
          adresse_mail_secondaire: string | null
          contact_urgence_nom: string | null
          contact_urgence_photo_url: string | null
          contact_urgence_prenom: string | null
          contact_urgence_telephone1: string | null
          contact_urgence_telephone1_indicatif: string | null
          contact_urgence_telephone1_local: string | null
          contact_urgence_telephone2: string | null
          contact_urgence_telephone2_indicatif: string | null
          contact_urgence_telephone2_local: string | null
          created_at: string | null
          departement: string | null
          district_id: string | null
          email: string | null
          equipe_id: string | null
          id: string
          nom_complet: string
          numero_piece_identite: string | null
          photo_url: string | null
          piece_identite_page_principale_url: string | null
          piece_identite_recto_url: string | null
          piece_identite_url: string | null
          piece_identite_verso_url: string | null
          poste: string | null
          quartier: string | null
          region_id: string | null
          relation_rh: string | null
          taux_commission: number | null
          telephone: string | null
          telephone_indicatif: string | null
          telephone_local: string | null
          telephone_secondaire: string | null
          telephone_secondaire_indicatif: string | null
          telephone_secondaire_local: string | null
          type_piece_identite: string | null
          updated_at: string | null
          user_id: string | null
          username: string | null
          ville: string | null
          whatsapp: string | null
          whatsapp_indicatif: string | null
          whatsapp_local: string | null
        }
        Insert: {
          actif?: boolean | null
          adresse_mail_secondaire?: string | null
          contact_urgence_nom?: string | null
          contact_urgence_photo_url?: string | null
          contact_urgence_prenom?: string | null
          contact_urgence_telephone1?: string | null
          contact_urgence_telephone1_indicatif?: string | null
          contact_urgence_telephone1_local?: string | null
          contact_urgence_telephone2?: string | null
          contact_urgence_telephone2_indicatif?: string | null
          contact_urgence_telephone2_local?: string | null
          created_at?: string | null
          departement?: string | null
          district_id?: string | null
          email?: string | null
          equipe_id?: string | null
          id?: string
          nom_complet: string
          numero_piece_identite?: string | null
          photo_url?: string | null
          piece_identite_page_principale_url?: string | null
          piece_identite_recto_url?: string | null
          piece_identite_url?: string | null
          piece_identite_verso_url?: string | null
          poste?: string | null
          quartier?: string | null
          region_id?: string | null
          relation_rh?: string | null
          taux_commission?: number | null
          telephone?: string | null
          telephone_indicatif?: string | null
          telephone_local?: string | null
          telephone_secondaire?: string | null
          telephone_secondaire_indicatif?: string | null
          telephone_secondaire_local?: string | null
          type_piece_identite?: string | null
          updated_at?: string | null
          user_id?: string | null
          username?: string | null
          ville?: string | null
          whatsapp?: string | null
          whatsapp_indicatif?: string | null
          whatsapp_local?: string | null
        }
        Update: {
          actif?: boolean | null
          adresse_mail_secondaire?: string | null
          contact_urgence_nom?: string | null
          contact_urgence_photo_url?: string | null
          contact_urgence_prenom?: string | null
          contact_urgence_telephone1?: string | null
          contact_urgence_telephone1_indicatif?: string | null
          contact_urgence_telephone1_local?: string | null
          contact_urgence_telephone2?: string | null
          contact_urgence_telephone2_indicatif?: string | null
          contact_urgence_telephone2_local?: string | null
          created_at?: string | null
          departement?: string | null
          district_id?: string | null
          email?: string | null
          equipe_id?: string | null
          id?: string
          nom_complet?: string
          numero_piece_identite?: string | null
          photo_url?: string | null
          piece_identite_page_principale_url?: string | null
          piece_identite_recto_url?: string | null
          piece_identite_url?: string | null
          piece_identite_verso_url?: string | null
          poste?: string | null
          quartier?: string | null
          region_id?: string | null
          relation_rh?: string | null
          taux_commission?: number | null
          telephone?: string | null
          telephone_indicatif?: string | null
          telephone_local?: string | null
          telephone_secondaire?: string | null
          telephone_secondaire_indicatif?: string | null
          telephone_secondaire_local?: string | null
          type_piece_identite?: string | null
          updated_at?: string | null
          user_id?: string | null
          username?: string | null
          ville?: string | null
          whatsapp?: string | null
          whatsapp_indicatif?: string | null
          whatsapp_local?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_performance_equipes"
            referencedColumns: ["id"]
          },
        ]
      }
      promotions: {
        Row: {
          active: boolean | null
          applique_toutes_offres: boolean | null
          cible: string
          code: string | null
          created_at: string | null
          date_debut: string
          date_fin: string
          description: string | null
          id: string
          montant_fixe_reduction: number | null
          nom: string
          offre_ids: Json | null
          pourcentage_reduction: number | null
          type_promotion: string
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          applique_toutes_offres?: boolean | null
          cible?: string
          code?: string | null
          created_at?: string | null
          date_debut: string
          date_fin: string
          description?: string | null
          id?: string
          montant_fixe_reduction?: number | null
          nom: string
          offre_ids?: Json | null
          pourcentage_reduction?: number | null
          type_promotion?: string
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          applique_toutes_offres?: boolean | null
          cible?: string
          code?: string | null
          created_at?: string | null
          date_debut?: string
          date_fin?: string
          description?: string | null
          id?: string
          montant_fixe_reduction?: number | null
          nom?: string
          offre_ids?: Json | null
          pourcentage_reduction?: number | null
          type_promotion?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      proprietaires_terres: {
        Row: {
          caution_par_ha: number | null
          caution_totale: number | null
          civilite: string | null
          co_titulaire_lien: string | null
          co_titulaire_nom: string | null
          co_titulaire_piece: string | null
          co_titulaire_telephone: string | null
          co_titulaire_telephone_indicatif: string | null
          co_titulaire_telephone_local: string | null
          coordonnees_gps: string | null
          created_at: string | null
          created_by: string | null
          croquis_joint: boolean | null
          date_delivrance_piece: string | null
          date_naissance: string | null
          denomination_sociale: string | null
          departement_id: string | null
          district_id: string | null
          domicile: string | null
          email: string | null
          fichier_piece_recto_url: string | null
          fichier_piece_verso_url: string | null
          id: string
          id_unique: string | null
          leader_communautaire_nom: string | null
          leader_communautaire_qualite: string | null
          lieu_naissance: string | null
          limites_est: string | null
          limites_nord: string | null
          limites_ouest: string | null
          limites_sud: string | null
          nom: string
          nom_complet: string | null
          nom_mere: string | null
          nom_pere: string | null
          nom_representant: string | null
          nombre_lots_agricapital: number
          nombre_membres: number | null
          nombre_parcelles: number | null
          notes: string | null
          numero_enregistrement: string | null
          numero_piece: string | null
          part_agricapital_ha: number | null
          part_agricapital_pct: number | null
          part_proprietaire_ha: number | null
          part_proprietaire_pct: number | null
          photo_profil_url: string | null
          prenoms: string | null
          reference_cadastrale: string | null
          region_id: string | null
          representant_agricapital_nom: string | null
          representant_agricapital_qualite: string | null
          servitudes: string | null
          sous_prefecture_id: string | null
          statut: string | null
          statut_foncier: string | null
          surface_totale_declaree_ha: number | null
          surface_totale_ha: number | null
          telephone: string | null
          telephone_indicatif: string | null
          telephone_local: string | null
          temoin_proprietaire_nom: string | null
          temoin_proprietaire_qualite: string | null
          type_piece: string | null
          type_proprietaire: string | null
          updated_at: string | null
          updated_by: string | null
          village: string | null
          voisin_1_cote: string | null
          voisin_1_nom: string | null
          voisin_2_cote: string | null
          voisin_2_nom: string | null
          whatsapp: string | null
          whatsapp_indicatif: string | null
          whatsapp_local: string | null
        }
        Insert: {
          caution_par_ha?: number | null
          caution_totale?: number | null
          civilite?: string | null
          co_titulaire_lien?: string | null
          co_titulaire_nom?: string | null
          co_titulaire_piece?: string | null
          co_titulaire_telephone?: string | null
          co_titulaire_telephone_indicatif?: string | null
          co_titulaire_telephone_local?: string | null
          coordonnees_gps?: string | null
          created_at?: string | null
          created_by?: string | null
          croquis_joint?: boolean | null
          date_delivrance_piece?: string | null
          date_naissance?: string | null
          denomination_sociale?: string | null
          departement_id?: string | null
          district_id?: string | null
          domicile?: string | null
          email?: string | null
          fichier_piece_recto_url?: string | null
          fichier_piece_verso_url?: string | null
          id?: string
          id_unique?: string | null
          leader_communautaire_nom?: string | null
          leader_communautaire_qualite?: string | null
          lieu_naissance?: string | null
          limites_est?: string | null
          limites_nord?: string | null
          limites_ouest?: string | null
          limites_sud?: string | null
          nom: string
          nom_complet?: string | null
          nom_mere?: string | null
          nom_pere?: string | null
          nom_representant?: string | null
          nombre_lots_agricapital?: number
          nombre_membres?: number | null
          nombre_parcelles?: number | null
          notes?: string | null
          numero_enregistrement?: string | null
          numero_piece?: string | null
          part_agricapital_ha?: number | null
          part_agricapital_pct?: number | null
          part_proprietaire_ha?: number | null
          part_proprietaire_pct?: number | null
          photo_profil_url?: string | null
          prenoms?: string | null
          reference_cadastrale?: string | null
          region_id?: string | null
          representant_agricapital_nom?: string | null
          representant_agricapital_qualite?: string | null
          servitudes?: string | null
          sous_prefecture_id?: string | null
          statut?: string | null
          statut_foncier?: string | null
          surface_totale_declaree_ha?: number | null
          surface_totale_ha?: number | null
          telephone?: string | null
          telephone_indicatif?: string | null
          telephone_local?: string | null
          temoin_proprietaire_nom?: string | null
          temoin_proprietaire_qualite?: string | null
          type_piece?: string | null
          type_proprietaire?: string | null
          updated_at?: string | null
          updated_by?: string | null
          village?: string | null
          voisin_1_cote?: string | null
          voisin_1_nom?: string | null
          voisin_2_cote?: string | null
          voisin_2_nom?: string | null
          whatsapp?: string | null
          whatsapp_indicatif?: string | null
          whatsapp_local?: string | null
        }
        Update: {
          caution_par_ha?: number | null
          caution_totale?: number | null
          civilite?: string | null
          co_titulaire_lien?: string | null
          co_titulaire_nom?: string | null
          co_titulaire_piece?: string | null
          co_titulaire_telephone?: string | null
          co_titulaire_telephone_indicatif?: string | null
          co_titulaire_telephone_local?: string | null
          coordonnees_gps?: string | null
          created_at?: string | null
          created_by?: string | null
          croquis_joint?: boolean | null
          date_delivrance_piece?: string | null
          date_naissance?: string | null
          denomination_sociale?: string | null
          departement_id?: string | null
          district_id?: string | null
          domicile?: string | null
          email?: string | null
          fichier_piece_recto_url?: string | null
          fichier_piece_verso_url?: string | null
          id?: string
          id_unique?: string | null
          leader_communautaire_nom?: string | null
          leader_communautaire_qualite?: string | null
          lieu_naissance?: string | null
          limites_est?: string | null
          limites_nord?: string | null
          limites_ouest?: string | null
          limites_sud?: string | null
          nom?: string
          nom_complet?: string | null
          nom_mere?: string | null
          nom_pere?: string | null
          nom_representant?: string | null
          nombre_lots_agricapital?: number
          nombre_membres?: number | null
          nombre_parcelles?: number | null
          notes?: string | null
          numero_enregistrement?: string | null
          numero_piece?: string | null
          part_agricapital_ha?: number | null
          part_agricapital_pct?: number | null
          part_proprietaire_ha?: number | null
          part_proprietaire_pct?: number | null
          photo_profil_url?: string | null
          prenoms?: string | null
          reference_cadastrale?: string | null
          region_id?: string | null
          representant_agricapital_nom?: string | null
          representant_agricapital_qualite?: string | null
          servitudes?: string | null
          sous_prefecture_id?: string | null
          statut?: string | null
          statut_foncier?: string | null
          surface_totale_declaree_ha?: number | null
          surface_totale_ha?: number | null
          telephone?: string | null
          telephone_indicatif?: string | null
          telephone_local?: string | null
          temoin_proprietaire_nom?: string | null
          temoin_proprietaire_qualite?: string | null
          type_piece?: string | null
          type_proprietaire?: string | null
          updated_at?: string | null
          updated_by?: string | null
          village?: string | null
          voisin_1_cote?: string | null
          voisin_1_nom?: string | null
          voisin_2_cote?: string | null
          voisin_2_nom?: string | null
          whatsapp?: string | null
          whatsapp_indicatif?: string | null
          whatsapp_local?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proprietaires_terres_departement_id_fkey"
            columns: ["departement_id"]
            isOneToOne: false
            referencedRelation: "departements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proprietaires_terres_departement_id_fkey"
            columns: ["departement_id"]
            isOneToOne: false
            referencedRelation: "v_geo_departements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proprietaires_terres_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "districts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proprietaires_terres_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "v_geo_districts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proprietaires_terres_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proprietaires_terres_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "v_geo_regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proprietaires_terres_sous_prefecture_id_fkey"
            columns: ["sous_prefecture_id"]
            isOneToOne: false
            referencedRelation: "sous_prefectures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proprietaires_terres_sous_prefecture_id_fkey"
            columns: ["sous_prefecture_id"]
            isOneToOne: false
            referencedRelation: "v_geo_sous_prefectures"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          active: boolean
          auth: string
          client_id: string | null
          content_encoding: string
          created_at: string
          endpoint: string
          id: string
          last_seen_at: string
          p256dh: string
          updated_at: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          active?: boolean
          auth: string
          client_id?: string | null
          content_encoding?: string
          created_at?: string
          endpoint: string
          id?: string
          last_seen_at?: string
          p256dh: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          active?: boolean
          auth?: string
          client_id?: string | null
          content_encoding?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_seen_at?: string
          p256dh?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_subscriptions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_synthese"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "push_subscriptions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_monnaie_clients"
            referencedColumns: ["client_id"]
          },
        ]
      }
      rapports_visites_medias: {
        Row: {
          client_visible: boolean
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          media_type: string
          mime_type: string | null
          nom_fichier: string | null
          plantation_id: string
          rapport_id: string
          storage_path: string
          updated_at: string
        }
        Insert: {
          client_visible?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          media_type: string
          mime_type?: string | null
          nom_fichier?: string | null
          plantation_id: string
          rapport_id: string
          storage_path: string
          updated_at?: string
        }
        Update: {
          client_visible?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          media_type?: string
          mime_type?: string | null
          nom_fichier?: string | null
          plantation_id?: string
          rapport_id?: string
          storage_path?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rapports_visites_medias_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rapports_visites_medias_plantation_id_fkey"
            columns: ["plantation_id"]
            isOneToOne: false
            referencedRelation: "plantations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rapports_visites_medias_rapport_id_fkey"
            columns: ["rapport_id"]
            isOneToOne: false
            referencedRelation: "rapports_visites_techniques"
            referencedColumns: ["id"]
          },
        ]
      }
      rapports_visites_techniques: {
        Row: {
          agent_technique_id: string | null
          client_id: string | null
          client_visible: boolean
          constat: string | null
          contenu_client: string | null
          created_at: string
          created_by: string | null
          date_visite: string
          equipe_id: string | null
          etat_plantation: string | null
          id: string
          localisation_gps_lat: number | null
          localisation_gps_lng: number | null
          observations: string | null
          plantation_id: string
          prochaine_intervention: string | null
          recommandations: string | null
          statut: string
          ticket_id: string | null
          travaux_realises: string | null
          type_visite: string
          updated_at: string
        }
        Insert: {
          agent_technique_id?: string | null
          client_id?: string | null
          client_visible?: boolean
          constat?: string | null
          contenu_client?: string | null
          created_at?: string
          created_by?: string | null
          date_visite?: string
          equipe_id?: string | null
          etat_plantation?: string | null
          id?: string
          localisation_gps_lat?: number | null
          localisation_gps_lng?: number | null
          observations?: string | null
          plantation_id: string
          prochaine_intervention?: string | null
          recommandations?: string | null
          statut?: string
          ticket_id?: string | null
          travaux_realises?: string | null
          type_visite?: string
          updated_at?: string
        }
        Update: {
          agent_technique_id?: string | null
          client_id?: string | null
          client_visible?: boolean
          constat?: string | null
          contenu_client?: string | null
          created_at?: string
          created_by?: string | null
          date_visite?: string
          equipe_id?: string | null
          etat_plantation?: string | null
          id?: string
          localisation_gps_lat?: number | null
          localisation_gps_lng?: number | null
          observations?: string | null
          plantation_id?: string
          prochaine_intervention?: string | null
          recommandations?: string | null
          statut?: string
          ticket_id?: string | null
          travaux_realises?: string | null
          type_visite?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rapports_visites_techniques_agent_technique_id_fkey"
            columns: ["agent_technique_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rapports_visites_techniques_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rapports_visites_techniques_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_synthese"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "rapports_visites_techniques_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_monnaie_clients"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "rapports_visites_techniques_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rapports_visites_techniques_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rapports_visites_techniques_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_performance_equipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rapports_visites_techniques_plantation_id_fkey"
            columns: ["plantation_id"]
            isOneToOne: false
            referencedRelation: "plantations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rapports_visites_techniques_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets_techniques"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          action: string
          attempts: number
          blocked_until: string | null
          created_at: string | null
          first_attempt_at: string
          id: string
          identifier: string
        }
        Insert: {
          action?: string
          attempts?: number
          blocked_until?: string | null
          created_at?: string | null
          first_attempt_at?: string
          id?: string
          identifier: string
        }
        Update: {
          action?: string
          attempts?: number
          blocked_until?: string | null
          created_at?: string | null
          first_attempt_at?: string
          id?: string
          identifier?: string
        }
        Relationships: []
      }
      regions: {
        Row: {
          code: string | null
          created_at: string | null
          district_id: string | null
          est_active: boolean | null
          id: string
          nom: string
        }
        Insert: {
          code?: string | null
          created_at?: string | null
          district_id?: string | null
          est_active?: boolean | null
          id?: string
          nom: string
        }
        Update: {
          code?: string | null
          created_at?: string | null
          district_id?: string | null
          est_active?: boolean | null
          id?: string
          nom?: string
        }
        Relationships: [
          {
            foreignKeyName: "regions_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "districts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regions_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "v_geo_districts"
            referencedColumns: ["id"]
          },
        ]
      }
      remboursements: {
        Row: {
          client_id: string | null
          created_at: string | null
          date_traitement: string | null
          id: string
          mode_remboursement: string | null
          montant: number
          motif: string | null
          numero_compte: string | null
          paiement_id: string | null
          statut: string | null
          traite_par: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string | null
          date_traitement?: string | null
          id?: string
          mode_remboursement?: string | null
          montant: number
          motif?: string | null
          numero_compte?: string | null
          paiement_id?: string | null
          statut?: string | null
          traite_par?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string | null
          date_traitement?: string | null
          id?: string
          mode_remboursement?: string | null
          montant?: number
          motif?: string | null
          numero_compte?: string | null
          paiement_id?: string | null
          statut?: string | null
          traite_par?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "remboursements_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remboursements_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_synthese"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "remboursements_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_monnaie_clients"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "remboursements_paiement_id_fkey"
            columns: ["paiement_id"]
            isOneToOne: false
            referencedRelation: "paiements"
            referencedColumns: ["id"]
          },
        ]
      }
      retraits_portefeuille: {
        Row: {
          created_at: string | null
          date_demande: string | null
          date_traitement: string | null
          id: string
          mode_paiement: string | null
          montant: number
          numero_compte: string | null
          portefeuille_id: string | null
          statut: string | null
          traite_par: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          date_demande?: string | null
          date_traitement?: string | null
          id?: string
          mode_paiement?: string | null
          montant: number
          numero_compte?: string | null
          portefeuille_id?: string | null
          statut?: string | null
          traite_par?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          date_demande?: string | null
          date_traitement?: string | null
          id?: string
          mode_paiement?: string | null
          montant?: number
          numero_compte?: string | null
          portefeuille_id?: string | null
          statut?: string | null
          traite_par?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "retraits_portefeuille_portefeuille_id_fkey"
            columns: ["portefeuille_id"]
            isOneToOne: false
            referencedRelation: "portefeuilles"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          created_at: string
          id: string
          permission_code: string
          role_code: string
        }
        Insert: {
          created_at?: string
          id?: string
          permission_code: string
          role_code: string
        }
        Update: {
          created_at?: string
          id?: string
          permission_code?: string
          role_code?: string
        }
        Relationships: []
      }
      sous_prefectures: {
        Row: {
          code: string | null
          code_sp: string | null
          created_at: string | null
          departement_id: string | null
          est_active: boolean | null
          id: string
          nom: string
          sp_assigned_at: string | null
        }
        Insert: {
          code?: string | null
          code_sp?: string | null
          created_at?: string | null
          departement_id?: string | null
          est_active?: boolean | null
          id?: string
          nom: string
          sp_assigned_at?: string | null
        }
        Update: {
          code?: string | null
          code_sp?: string | null
          created_at?: string | null
          departement_id?: string | null
          est_active?: boolean | null
          id?: string
          nom?: string
          sp_assigned_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sous_prefectures_departement_id_fkey"
            columns: ["departement_id"]
            isOneToOne: false
            referencedRelation: "departements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sous_prefectures_departement_id_fkey"
            columns: ["departement_id"]
            isOneToOne: false
            referencedRelation: "v_geo_departements"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets_techniques: {
        Row: {
          assigne_a: string | null
          assigne_le: string | null
          categorie: string | null
          client_id: string | null
          created_at: string | null
          cree_par: string | null
          date_resolution: string | null
          description: string | null
          equipe_id: string | null
          id: string
          plantation_id: string | null
          priorite: string | null
          pris_en_charge_at: string | null
          region_id: string | null
          resolution_note: string | null
          statut: string | null
          titre: string
          updated_at: string | null
        }
        Insert: {
          assigne_a?: string | null
          assigne_le?: string | null
          categorie?: string | null
          client_id?: string | null
          created_at?: string | null
          cree_par?: string | null
          date_resolution?: string | null
          description?: string | null
          equipe_id?: string | null
          id?: string
          plantation_id?: string | null
          priorite?: string | null
          pris_en_charge_at?: string | null
          region_id?: string | null
          resolution_note?: string | null
          statut?: string | null
          titre: string
          updated_at?: string | null
        }
        Update: {
          assigne_a?: string | null
          assigne_le?: string | null
          categorie?: string | null
          client_id?: string | null
          created_at?: string | null
          cree_par?: string | null
          date_resolution?: string | null
          description?: string | null
          equipe_id?: string | null
          id?: string
          plantation_id?: string | null
          priorite?: string | null
          pris_en_charge_at?: string | null
          region_id?: string | null
          resolution_note?: string | null
          statut?: string | null
          titre?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_techniques_assigne_a_fkey"
            columns: ["assigne_a"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_techniques_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_techniques_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_synthese"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "tickets_techniques_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_monnaie_clients"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "tickets_techniques_cree_par_fkey"
            columns: ["cree_par"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_techniques_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_techniques_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "v_performance_equipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_techniques_plantation_id_fkey"
            columns: ["plantation_id"]
            isOneToOne: false
            referencedRelation: "plantations"
            referencedColumns: ["id"]
          },
        ]
      }
      transferts_paiements: {
        Row: {
          client_dest_id: string | null
          client_source_id: string | null
          created_at: string | null
          effectue_par: string | null
          id: string
          montant: number
          motif: string | null
          statut: string | null
        }
        Insert: {
          client_dest_id?: string | null
          client_source_id?: string | null
          created_at?: string | null
          effectue_par?: string | null
          id?: string
          montant: number
          motif?: string | null
          statut?: string | null
        }
        Update: {
          client_dest_id?: string | null
          client_source_id?: string | null
          created_at?: string | null
          effectue_par?: string | null
          id?: string
          montant?: number
          motif?: string | null
          statut?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transferts_dest_id_fkey"
            columns: ["client_dest_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transferts_dest_id_fkey"
            columns: ["client_dest_id"]
            isOneToOne: false
            referencedRelation: "v_client_synthese"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "transferts_dest_id_fkey"
            columns: ["client_dest_id"]
            isOneToOne: false
            referencedRelation: "v_monnaie_clients"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "transferts_paiements_client_dest_id_fkey"
            columns: ["client_dest_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transferts_paiements_client_dest_id_fkey"
            columns: ["client_dest_id"]
            isOneToOne: false
            referencedRelation: "v_client_synthese"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "transferts_paiements_client_dest_id_fkey"
            columns: ["client_dest_id"]
            isOneToOne: false
            referencedRelation: "v_monnaie_clients"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "transferts_paiements_client_source_id_fkey"
            columns: ["client_source_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transferts_paiements_client_source_id_fkey"
            columns: ["client_source_id"]
            isOneToOne: false
            referencedRelation: "v_client_synthese"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "transferts_paiements_client_source_id_fkey"
            columns: ["client_source_id"]
            isOneToOne: false
            referencedRelation: "v_monnaie_clients"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "transferts_source_id_fkey"
            columns: ["client_source_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transferts_source_id_fkey"
            columns: ["client_source_id"]
            isOneToOne: false
            referencedRelation: "v_client_synthese"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "transferts_source_id_fkey"
            columns: ["client_source_id"]
            isOneToOne: false
            referencedRelation: "v_monnaie_clients"
            referencedColumns: ["client_id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      villages: {
        Row: {
          annee: number
          code: string | null
          created_at: string | null
          est_actif: boolean | null
          id: string
          nom: string
          population: number | null
          source: string
          sous_prefecture_id: string | null
          type_localite: string
        }
        Insert: {
          annee?: number
          code?: string | null
          created_at?: string | null
          est_actif?: boolean | null
          id?: string
          nom: string
          population?: number | null
          source?: string
          sous_prefecture_id?: string | null
          type_localite?: string
        }
        Update: {
          annee?: number
          code?: string | null
          created_at?: string | null
          est_actif?: boolean | null
          id?: string
          nom?: string
          population?: number | null
          source?: string
          sous_prefecture_id?: string | null
          type_localite?: string
        }
        Relationships: [
          {
            foreignKeyName: "villages_sous_prefecture_id_fkey"
            columns: ["sous_prefecture_id"]
            isOneToOne: false
            referencedRelation: "sous_prefectures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "villages_sous_prefecture_id_fkey"
            columns: ["sous_prefecture_id"]
            isOneToOne: false
            referencedRelation: "v_geo_sous_prefectures"
            referencedColumns: ["id"]
          },
        ]
      }
      zone_assignments: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          user_id: string
          zone_id: string
          zone_type: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          user_id: string
          zone_id: string
          zone_type: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          user_id?: string
          zone_id?: string
          zone_type?: string
        }
        Relationships: []
      }
    }
    Views: {
      profils_annuaire: {
        Row: {
          actif: boolean | null
          created_at: string | null
          departement: string | null
          district_id: string | null
          email: string | null
          equipe_id: string | null
          id: string | null
          nom_complet: string | null
          photo_url: string | null
          poste: string | null
          region_id: string | null
          telephone: string | null
          user_id: string | null
          username: string | null
          whatsapp: string | null
        }
        Relationships: []
      }
      v_client_synthese: {
        Row: {
          client_id: string | null
          compte_actif: boolean | null
          contrat_debut_at: string | null
          contrat_fin_at: string | null
          duree_paiement_mois: number | null
          gestion_type: string | null
          id_unique: string | null
          jours_retard: number | null
          mois_payes: number | null
          mois_restants: number | null
          montant_total_contrat: number | null
          nom_complet: string | null
          offre_id: string | null
          offre_nom: string | null
          phase_actuelle: string | null
          pourcentage_avancement: number | null
          pourcentage_revenus_reverses: number | null
          prochaine_echeance: string | null
          reste_a_payer: number | null
          taux_journalier_ha: number | null
          total_hectares: number | null
          total_paye: number | null
          tranche_superficie: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_offre_id_fkey"
            columns: ["offre_id"]
            isOneToOne: false
            referencedRelation: "offres"
            referencedColumns: ["id"]
          },
        ]
      }
      v_clients_par_superficie: {
        Row: {
          libelle: string | null
          nombre_clients: number | null
          ordre: number | null
        }
        Relationships: []
      }
      v_cycle_installation_dashboard: {
        Row: {
          clients_concernes: number | null
          clients_realises: number | null
          type_intervention: string | null
        }
        Relationships: []
      }
      v_geo_campements: {
        Row: {
          annee: number | null
          code: string | null
          created_at: string | null
          departement_nom: string | null
          district_nom: string | null
          est_actif: boolean | null
          est_effectivement_actif: boolean | null
          id: string | null
          latitude: number | null
          longitude: number | null
          nom: string | null
          population: number | null
          region_nom: string | null
          source: string | null
          sous_prefecture_id: string | null
          sous_prefecture_nom: string | null
          type: string | null
          village_noyau_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campements_sous_prefecture_id_fkey"
            columns: ["sous_prefecture_id"]
            isOneToOne: false
            referencedRelation: "sous_prefectures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campements_sous_prefecture_id_fkey"
            columns: ["sous_prefecture_id"]
            isOneToOne: false
            referencedRelation: "v_geo_sous_prefectures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campements_village_noyau_id_fkey"
            columns: ["village_noyau_id"]
            isOneToOne: false
            referencedRelation: "v_geo_villages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campements_village_noyau_id_fkey"
            columns: ["village_noyau_id"]
            isOneToOne: false
            referencedRelation: "villages"
            referencedColumns: ["id"]
          },
        ]
      }
      v_geo_departements: {
        Row: {
          code: string | null
          created_at: string | null
          district_actif: boolean | null
          est_actif: boolean | null
          est_actif_effectif: boolean | null
          id: string | null
          nom: string | null
          region_actif: boolean | null
          region_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "departements_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "departements_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "v_geo_regions"
            referencedColumns: ["id"]
          },
        ]
      }
      v_geo_districts: {
        Row: {
          code: string | null
          created_at: string | null
          est_actif: boolean | null
          est_actif_effectif: boolean | null
          id: string | null
          nom: string | null
        }
        Insert: {
          code?: string | null
          created_at?: string | null
          est_actif?: boolean | null
          est_actif_effectif?: boolean | null
          id?: string | null
          nom?: string | null
        }
        Update: {
          code?: string | null
          created_at?: string | null
          est_actif?: boolean | null
          est_actif_effectif?: boolean | null
          id?: string | null
          nom?: string | null
        }
        Relationships: []
      }
      v_geo_regions: {
        Row: {
          code: string | null
          created_at: string | null
          district_actif: boolean | null
          district_id: string | null
          est_active: boolean | null
          est_active_effectif: boolean | null
          id: string | null
          nom: string | null
        }
        Relationships: [
          {
            foreignKeyName: "regions_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "districts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regions_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "v_geo_districts"
            referencedColumns: ["id"]
          },
        ]
      }
      v_geo_sous_prefectures: {
        Row: {
          code: string | null
          code_sp: string | null
          created_at: string | null
          departement_actif: boolean | null
          departement_id: string | null
          district_actif: boolean | null
          est_active: boolean | null
          est_active_effectif: boolean | null
          id: string | null
          nom: string | null
          region_actif: boolean | null
          sp_assigned_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sous_prefectures_departement_id_fkey"
            columns: ["departement_id"]
            isOneToOne: false
            referencedRelation: "departements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sous_prefectures_departement_id_fkey"
            columns: ["departement_id"]
            isOneToOne: false
            referencedRelation: "v_geo_departements"
            referencedColumns: ["id"]
          },
        ]
      }
      v_geo_villages: {
        Row: {
          code: string | null
          created_at: string | null
          departement_actif: boolean | null
          district_actif: boolean | null
          est_actif: boolean | null
          est_actif_effectif: boolean | null
          id: string | null
          nom: string | null
          region_actif: boolean | null
          sous_prefecture_active: boolean | null
          sous_prefecture_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "villages_sous_prefecture_id_fkey"
            columns: ["sous_prefecture_id"]
            isOneToOne: false
            referencedRelation: "sous_prefectures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "villages_sous_prefecture_id_fkey"
            columns: ["sous_prefecture_id"]
            isOneToOne: false
            referencedRelation: "v_geo_sous_prefectures"
            referencedColumns: ["id"]
          },
        ]
      }
      v_monnaie_clients: {
        Row: {
          client_id: string | null
          monnaie_client: number | null
        }
        Relationships: []
      }
      v_performance_equipes: {
        Row: {
          clients: number | null
          hectares: number | null
          id: string | null
          interventions: number | null
          nom: string | null
          region_id: string | null
          type_equipe: string | null
        }
        Insert: {
          clients?: never
          hectares?: never
          id?: string | null
          interventions?: never
          nom?: string | null
          region_id?: string | null
          type_equipe?: string | null
        }
        Update: {
          clients?: never
          hectares?: never
          id?: string | null
          interventions?: never
          nom?: string | null
          region_id?: string | null
          type_equipe?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipes_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipes_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "v_geo_regions"
            referencedColumns: ["id"]
          },
        ]
      }
      v_portefeuille_commissions: {
        Row: {
          client_id: string | null
          commission_id: string | null
          date_calcul: string | null
          montant_base: number | null
          montant_commission: number | null
          paiement_id: string | null
          periode: string | null
          profile_id: string | null
          statut: string | null
          taux_commission: number | null
          type_commission: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commissions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_client_synthese"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "commissions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_monnaie_clients"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "commissions_paiement_id_fkey"
            columns: ["paiement_id"]
            isOneToOne: false
            referencedRelation: "paiements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      v_prix_effectif_offres: {
        Row: {
          code: string | null
          nom: string | null
          offre_id: string | null
          pi_base: number | null
          pi_effectif: number | null
          total_base: number | null
          total_effectif: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      _http_wait_json: {
        Args: { max_wait?: number; req: number }
        Returns: Json
      }
      activate_client_lot_from_lot: {
        Args: {
          p_client_id: string
          p_date_activation?: string
          p_lot_id: string
        }
        Returns: Json
      }
      actualiser_statut_client: {
        Args: { p_client_id: string }
        Returns: string
      }
      annuaire_staff: {
        Args: never
        Returns: {
          actif: boolean
          created_at: string
          departement: string
          district_id: string
          email: string
          equipe_id: string
          id: string
          nom_complet: string
          photo_url: string
          poste: string
          region_id: string
          telephone: string
          user_id: string
          username: string
          whatsapp: string
        }[]
      }
      assert_agricapital_phone: {
        Args: { p_label?: string; p_value: string }
        Returns: string
      }
      assign_sp_code: { Args: { _sp_id: string }; Returns: string }
      calculer_commission_paiement: {
        Args: { p_paiement_id: string }
        Returns: undefined
      }
      can_supervise_leads: { Args: { _user_id: string }; Returns: boolean }
      cleanup_expired_otp: { Args: never; Returns: undefined }
      cleanup_rate_limits: { Args: never; Returns: undefined }
      client_should_be_active: { Args: { _id: string }; Returns: boolean }
      compute_commission_for_paiement: {
        Args: { p_paiement_id: string }
        Returns: undefined
      }
      create_paiement_initial: { Args: { _client_id: string }; Returns: string }
      current_profile_id: { Args: never; Returns: string }
      ensure_client_contracts: {
        Args: { _client_id: string }
        Returns: undefined
      }
      ensure_client_repayment_schedule: {
        Args: { _client_id: string }
        Returns: undefined
      }
      finalize_portal_payment: {
        Args: {
          _metadata?: Json
          _paiement_id: string
          _provider_amount?: number
          _transaction_id?: string
          _validated_at?: string
        }
        Returns: Json
      }
      finance_can_manage: { Args: never; Returns: boolean }
      finance_can_view: { Args: never; Returns: boolean }
      finance_can_view_payroll: { Args: never; Returns: boolean }
      generate_client_id: { Args: never; Returns: string }
      generate_parcelle_id: { Args: never; Returns: string }
      generate_plantation_id: { Args: never; Returns: string }
      generate_proprietaire_id: { Args: never; Returns: string }
      get_client_effective_pi: { Args: { _client_id: string }; Returns: number }
      get_default_commercial_for_client: {
        Args: { _current_user?: string }
        Returns: string
      }
      get_lead_commercial_for_conversion: {
        Args: { _lead_id: string }
        Returns: string
      }
      has_role: { Args: { _role: string; _user_id: string }; Returns: boolean }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_demo: { Args: { _user_id: string }; Returns: boolean }
      is_finance_staff: { Args: { _user_id: string }; Returns: boolean }
      is_rh: { Args: { _user_id: string }; Returns: boolean }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      mark_overdue_payments: { Args: never; Returns: undefined }
      normalize_agricapital_phone: {
        Args: { p_value: string }
        Returns: string
      }
      notification_emit_event: {
        Args: { _context: Json; _event: string }
        Returns: undefined
      }
      notification_get_internal_secret: { Args: never; Returns: string }
      notification_resolve_recipients: {
        Args: { _criteres?: Json }
        Returns: {
          email: string
          nom_complet: string
          offre_code: string
          offre_id: string
          offre_nom: string
          role_code: string
          source_id: string
          source_type: string
          telephone: string
          user_id: string
        }[]
      }
      notification_resolve_recipients_target: {
        Args: { _criteres?: Json }
        Returns: {
          email: string
          nom_complet: string
          source_id: string
          source_type: string
          telephone: string
          user_id: string
          whatsapp: string
        }[]
      }
      notification_vapid_config: { Args: never; Returns: Json }
      notify_hierarchy: {
        Args: {
          p_data?: Json
          p_message: string
          p_title: string
          p_type: string
        }
        Returns: undefined
      }
      offre_echeancier_effectif: {
        Args: { _offre_id: string }
        Returns: {
          annee: number
          mensualite_par_ha: number
          mois: number
          mois_debut: number
          mois_fin: number
          total_periode_par_ha: number
        }[]
      }
      offre_prix_effectif: {
        Args: never
        Returns: {
          code: string
          mensualite_base: number
          mensualite_effective: number
          montant_total_base: number
          montant_total_effectif: number
          nom: string
          offre_id: string
          pi_base: number
          pi_effectif: number
          promotion_cible: string
          promotion_id: string
          promotion_nom: string
          reduction_montant: number
          reduction_pct: number
        }[]
      }
      portal_client_daily_rate: {
        Args: { _at_date?: string; _client_id: string }
        Returns: number
      }
      portal_days_for_amount: {
        Args: { _amount: number; _client_id: string; _plantation_id: string }
        Returns: number
      }
      portal_quote_payment: {
        Args: { _client_id: string; _days: number; _plantation_id: string }
        Returns: Json
      }
      rachater_monnaie_client: {
        Args: { p_client_id: string; p_jours: number }
        Returns: number
      }
      racheter_monnaie_client: {
        Args: { p_client_id: string; p_jours: number }
        Returns: number
      }
      reassign_lead: {
        Args: { _lead_id: string; _motif?: string; _new_owner: string }
        Returns: undefined
      }
      recalculer_parametres_financiers_client: {
        Args: { _client_id: string }
        Returns: undefined
      }
      recalculer_portefeuilles_commissions: { Args: never; Returns: undefined }
      recompute_contrat_totaux: {
        Args: { _client_id: string }
        Returns: undefined
      }
      recompute_pending_pi: { Args: never; Returns: undefined }
      recompute_profile_coverage: {
        Args: { _user_id: string }
        Returns: undefined
      }
      reconcile_user_role_coverage: {
        Args: { _user_id: string }
        Returns: undefined
      }
      refresh_client_account_activation: {
        Args: { _client_id: string }
        Returns: undefined
      }
      register_beneficiaire_particulier: {
        Args: {
          p_beneficiaire: Json
          p_documents?: Json
          p_parcelle: Json
          p_plantation: Json
          p_proprietaire: Json
        }
        Returns: Json
      }
      resolve_technicien_zone: {
        Args: { p_plantation_id: string }
        Returns: string
      }
      resolve_username_email: { Args: { _username: string }; Returns: string }
      simuler_paiement_fractionne: {
        Args: { _client_id: string; _montant: number }
        Returns: {
          jours_couverts: number
          periode_debut: string
          periode_fin: string
          phase: string
          taux_journalier: number
        }[]
      }
      sync_anstat_admin_2021: { Args: never; Returns: Json }
      username_available: { Args: { _username: string }; Returns: boolean }
      verifier_carte: {
        Args: { _code: string }
        Returns: {
          date_expiration: string
          matricule: string
          nom_complet: string
          poste: string
          statut: string
          type_contrat: string
          valide: boolean
        }[]
      }
      zone_assignment_expected_type: {
        Args: { _user_id: string }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
