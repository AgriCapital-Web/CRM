// AgriCapital SARL — Développeur : Inocent KOFFI.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { sessionStorageAdapter } from './sessionStorage';
import { installOfflineFetch } from '@/lib/offlineHttp';

const SUPABASE_URL = "https://rfzfsmpsuempafhkqhra.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmemZzbXBzdWVtcGFmaGtxaHJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExNDE5NjcsImV4cCI6MjA4NjcxNzk2N30.v3sQGr7QHdDqkg4EVHf8l702KKbcOZ8XiP9ALisJFl4";

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: sessionStorageAdapter(),
    persistSession: true,
    autoRefreshToken: true,
  },
  global: {
    fetch: installOfflineFetch(),
  },
});