import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { RealtimeChannel } from '@supabase/supabase-js';

interface UseRealtimeOptions {
  table: string;
  event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  filter?: string;
  onInsert?: (payload: any) => void;
  onUpdate?: (payload: any) => void;
  onDelete?: (payload: any) => void;
  onChange?: (payload: any) => void;
}

/** Subscribe once per table/filter while always invoking the latest callbacks. */
export const useRealtime = ({
  table,
  event = '*',
  filter,
  onInsert,
  onUpdate,
  onDelete,
  onChange,
}: UseRealtimeOptions) => {
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);
  const callbacks = useRef({ onInsert, onUpdate, onDelete, onChange });
  callbacks.current = { onInsert, onUpdate, onDelete, onChange };

  useEffect(() => {
    const config: any = { event, schema: 'public', table };
    if (filter) config.filter = filter;

    const realtimeChannel = supabase
      .channel(`crm-${table}-${filter || 'all'}`)
      .on('postgres_changes', config, (payload) => {
        callbacks.current.onChange?.(payload);
        if (payload.eventType === 'INSERT') callbacks.current.onInsert?.(payload.new);
        else if (payload.eventType === 'UPDATE') callbacks.current.onUpdate?.(payload.new);
        else if (payload.eventType === 'DELETE') callbacks.current.onDelete?.(payload.old);
      })
      .subscribe();

    setChannel(realtimeChannel);
    return () => {
      void supabase.removeChannel(realtimeChannel);
      setChannel((current) => current === realtimeChannel ? null : current);
    };
  }, [table, event, filter]);

  return { channel };
};
