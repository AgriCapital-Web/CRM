import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Realtime is an online accelerator only. IndexedDB/offlineFetch remains the
 * source for disconnected reads; subscriptions reconnect automatically.
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
];

export const useGlobalRealtime = () => {
  const qc = useQueryClient();

  useEffect(() => {
    let channels: ReturnType<typeof supabase.channel>[] = [];

    const subscribe = () => {
      if (!navigator.onLine || channels.length) return;
      channels = TABLES.map((table) =>
        supabase
          .channel(`global-${table}`)
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table },
            () => {
              qc.invalidateQueries({ queryKey: [table] });
              qc.invalidateQueries({ queryKey: ['dashboard'] });
              qc.invalidateQueries({ queryKey: ['synthese'] });
            }
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
    };
    const handleOffline = () => {
      unsubscribe();
    };

    subscribe();
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      unsubscribe();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [qc]);
};
