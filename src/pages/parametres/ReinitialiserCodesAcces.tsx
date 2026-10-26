import { useEffect, useMemo, useState } from "react";
import { KeyRound, Loader2, RotateCcw, Search, ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

export default function ReinitialiserCodesAcces() {
  const { toast } = useToast();
  const [clients, setClients] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data, error } = await (supabase as any)
        .from("clients")
        .select("id,nom_complet,telephone,email,compte_actif,statut_global")
        .order("nom_complet", { ascending: true });
      if (error) {
        toast({ variant: "destructive", title: "Erreur", description: error.message });
      } else {
        setClients(data || []);
      }
      setLoading(false);
    };
    void load();
  },¶»§q«^