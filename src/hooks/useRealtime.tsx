import { useEffect, useState } from 'react';
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

  useEffect(() => {
    const channelName = `${table}-changes-${Date.now()}`;
    const realtimeChannel = supabase.channel(channelName);

    const config: any = {
      event: event,
      schema: 'public',
      table: table,
    };

    if (filter) {
      config.filter = filter;
    }

    realtimeChannel.on(
      'postgres_changes',
      config,
      (payload) => {
        console.log(`Realtime event on ${table}:`, payload);
        
        if (onChange) {
          onChange(payload);
        }

        if (payload.eventType === 'INSERT' && onInsert) {
          onInsert(payload.new);
        } else if (payload.eventType === 'UPDATE' && onUpdate) {
          onUpdate(payload.new);
        } else if (payload.eventType === 'DELETE' && onDelete) {
          onDelete(payload.old);
        }
      }
    );

    realtimeChannel.subscribe((status) => {
      console.log(`Realtime subscription status for ${table}:`, status);
    });

    setChannel(realtimeChannel);

    return () => {
      supabase.removeChannel(realtimeChannel);
    };
  }, [table, event, filter]);

  return { channel };
};
