import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, Save, Users, Wrench } from "lucide-react";

type Rule = {
  id: string;
  role_cible: string;
  type_remuneration: string;
  montant: number | string | null;
  taux_pourcentage: number | string | null;
  annee_application: number | null;
  description: string | null;
  actif: boolean | null;
  code_regle: string | null;
};

const money = (value: unknown) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Number(value || 0));
const RULES = {
  partnerSale: "COMMERCIAL_ACQUISITION_PARTENAIRE",
  partnerRecovery: "COMMERCIAL_REC_PARTENAIRE_AN1",
  essentialSale: "COMMERCIAL_ACQUISITION_ESSENTIEL",
  essentialRecovery: "COMMERCIAL_REC_ESSENTIEL",
  flexibleSale: "COMMERCIAL_ACQUISITION_FLEXIBLE",
  flexibleRecovery: "COMMERCIAL_REC_FLEXIBLE",
  technical: "TECHNIQUE_MISE_EN_TERRE",
} as const;

export default function GestionRemuneration() {
  const { toast } = ¶»§q«^