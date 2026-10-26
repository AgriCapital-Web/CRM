import { useCallback, useEffect, useMemo, useState } from "react";
import MainLayout from "@/components/layout/MainLayout";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useSignedUrl } from "@/hooks/useSignedUrl";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CalendarDays, CheckSquare, BriefcaseBusiness, Network, Bell, RefreshCw, Plus, Clock, Users } from "lucide-react";
import { toast } from "sonner";

type Tab = "agenda" | "tasks" | "projects" | "job" | "org" | "notifications";
type Row = Record<string, any>;
const tabs: {id:Tab; label:string; icon:any}[] = [
 {id:"job",label:"Fiches de poste",icon:Users},
 {id:"org",label:"Organigramme",icon:Network}
];
const fmt=(value:string|null|undefined)=>value?new Date(value).toLocaleString("fr-FR",{dateStyle:"medium",timeStyle:"short"}):"Non d¶»§q«^