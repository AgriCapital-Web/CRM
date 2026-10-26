import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Save, Webhook, MessageSquare, Mail, PhoneCall, CheckCircle2, Send } from "lucide-react";
import { toast } from "sonner";

type Status = { apiKey: boolean; apiValid: boolean; webhookSecret: boolean; emailSenderId: boolean; whatsappSenderPhone: boolean; whatsappSession: "unknown" | "connected" | "disconnected"; statusErrors?: Record<string, string>; apiError?: string | null };

const webhookUrl = "https://rfzfsmpsuempafhkqhra.supabase.co/functions/v1/senndo-webhook";

export default function ConfigurationSenndo() {
  const [apiKey, setApiKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [emailSenderId, setEmailSenderId] = useState("");
  const [whatsappSenderPhone, setWhatsappSenderPhone] = useState("+22564551717");
  const [status, setStatus] = useState<Status>({ apiKey: false, apiValid: false, webhookSecret: false, emailSenderId: false, whatsappSenderPhone: false, whatsappSession: "unknown" })¶»§q«^