import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { logActivity } from "@/utils/traceability";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Globe, Mail, DollarSign, Settings, Bell, Save, Loader2, Shield,
  FileText, AlertTriangle, Building2, Search, Info, RefreshCw,
  Sprout, Users, CreditCard, SlidersHorizontal, CheckCircle2
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Configuration {
  id: string;
  cle: string;
  valeur: string;
  description: string | null;
  categorie: string;
  type_valeur: string;
  modifiable: boolean;
  updated_at?: string | null;
}

const CATEGORY_META: Record<string, { label: string; help: string; icon: React.ElementType; order: number }> = {
  acquisition: { label: "Acquisition", help: "RÃ¨gles et valeurs par dÃ©faut du parcours de prospection, de qualification et dâ€™acquisition. VÃ©rifiez lâ€™impact sur les formulaires avant toute modif¶»§q«^