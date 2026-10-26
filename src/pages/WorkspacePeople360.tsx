import { useCallback, useEffect, useState } from "react";
import MainLayout from "@/components/layout/MainLayout";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { CalendarCheck, Target, ClipboardList, RefreshCw, Plus, Check, X } from "lucide-react";

type Row = Record<string, any>;
type Tab = "leave" | "objectives" | "reviews" | "audit";
const hrRoles = ["rh","responsable_rh","ressources_humaines","admin","administrateur","pdg","dg","directeur_general","directeur gÃ©nÃ©ral"];
const fmt = (v?: string|null) => v ? new Date(v).toLocaleDateString("fr-FR") : "â€”";

export default function WorkspacePeople360({ embedded = false }: { embedded?: boolean } = {}) {
 const { user, profile, userRoles } = useAuth();
 const roles = userRoles.map(r => r.toLowerCase());
 const canHR = roles.some(r => hrRoles.includes(r));
 const [tab,setTa¶»§q«^