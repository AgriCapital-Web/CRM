import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Realtime keeps the active screen synchronized with database changes without
 * reloading the document or interrupting navigation and in-progress forms.
 */
const TABLES = [
  'paiements',
  'clients',
  'plantations',
  'commissions',
  'portefeuilles',
  'notifications',
  'documents_acquisition',
  'parcelles',
  'proprietaires_terres',
  'offres',
  'promotions',
  'leads',
  'profiles',
  'offre_formulaire_etapes',
  'offre_formulaire_documents',
  'offre_formulaire_contrats',
  'portail_messages',
  'client_enquetes',
  'client_cotitulaires_mandataires',
  'interventions_techniques',
  'rapports_visites_techniques',
  'tickets_techniques',
  'photos_plantation',
  'beneficiaire_attributions',
  'beneficiaire_documents',
];

export const useGlobalRealtime = () => {
  const qc = useQueryClient();

  useEffect(() => {
    let channels: ReturnType<typeof supabase.channel>[] = [];
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;

    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        refreshTimer = undefined;
        // Invalidate active queries irrespective of page-specific query-key
        // conventions. TanStack Query updates data in place; the page is not
        // reloaded and local component/form state remains mounted.
        void qc.invalidateQueries({ refetchType: 'active' });
      }, 180);
    };

    const subscribe = () => {
      if (!navigator.onLine || channels.length) return;
      channels = TABLES.map((table) =>
        supabase
          .channel(`global-${table}`)
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table },
            scheduleRefresh
          )
          .subscribe()
      );
    };

    const unsubscribe = () => {
      channels.forEach((channel) => {
        void supabase.removeChannel(channel);
      });
      channels = [];
    };

    const handleOnline = () => {
      unsubscribe();
      subscribe();
      scheduleRefresh();
    };
    const handleOffline = () => unsubscribe();

    subscribe();
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      unsubscribe();
      if (refreshTimer) clearTimeout(refreshTimer);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [qc]);
};
