import { useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Bell, Mail, MessageSquare, Send, Users, Zap, RefreshCw, Plus, Eye, Smartphone, CheckCircle2, AlertTriangle, PhoneCall, Paperclip, FileText, Image as ImageIcon, Video, X } from "lucide-react";
import { toast } from "sonner";
import ConfigurationSenndo from "@/pages/parametres/ConfigurationSenndo";

type Segment = { id: string; code: string; nom: string; description: string | null; criteres: Record<string, unknown>; actif: boolean };
type Campaign = {
  id: string; nom: string; description: string | null; canal: string; sujet: string | null; contenu: string;
  segment_id: string | null; criteres: Record<string, unknown>; statut: string; programme_le: string | null;
  total_destinataires: number; total_envoyes: number;¶»§q«^