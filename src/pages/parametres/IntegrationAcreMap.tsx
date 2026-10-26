import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Save, RefreshCw, Cable, ShieldCheck, Copy } from "lucide-react";

type Settings = { id: string; api_base_url: string; enabled: boolean; updated_at?: string; has_api_key: boolean; has_webhook_secret: boolean };
const DEFAULTS: Settings = { id: "default", api_base_url: "", enabled: false, has_api_key: false, has_webhook_secret: false };

export default function IntegrationAcreMap() {
 const { toast } = useToast(); const qc = useQueryClient();
 const [draft, setDraft] = useState<Settings>(DEFAULTS);
 const [settingsOpen, setSettingsOpen] = useState(false);
 const [apiKey, setApiKey] = useState("");
 const [webhookSecret, setWebhookSecret] = useState("");
 const { data, isLoading, error } = useQuery({
  queryKey: ["acremap-integration-settings"],
  queryFn: async () => { const { data, error } = await supabase.functions.invoke("acremap-settings", { body: { action: "get" } }); if(error) throw error;¶»§q«^