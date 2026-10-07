import { supabase } from "@/integrations/supabase/client";

/**
 * Log an activity with IP and user agent information
 */
export const logActivity = async ({
  tableName,
  recordId,
  action,
  details,
  ancienValeurs,
  nouvellesValeurs,
}: {
  tableName: string;
  recordId: string;
  action: string;
  details?: string;
  ancienValeurs?: any;
  nouvellesValeurs?: any;
}) => {
  try {
    const userAgent = navigator.userAgent;
    
    // Get IP from a lightweight service
    let ipAddress = 'unknown';
    try {
      const res = await fetch('https://api.ipify.org?format=json');
      const data = await res.json();
      ipAddress = data.ip;
    } catch {
      // Silently fail - IP is optional
    }

    await (supabase as any)
      .from('historique_activites')
      .insert({
        table_name: tableName,
        record_id: recordId,
        action,
        details,
        ip_address: ipAddress,
        user_agent: userAgent,
        ancien_valeurs: ancienValeurs ? JSON.parse(JSON.stringify(ancienValeurs)) : null,
        nouvelles_valeurs: nouvellesValeurs ? JSON.parse(JSON.stringify(nouvellesValeurs)) : null,
      });
  } catch (error) {
    console.error('Traceability log error:', error);
  }
};
