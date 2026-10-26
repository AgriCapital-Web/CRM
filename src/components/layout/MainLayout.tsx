import { ReactNode, useEffect, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { PERMISSIONS, ROLE_SHORT_LABELS } from "@/lib/roles";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { NotificationCenter } from "@/components/common/NotificationCenter";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import AIAssistant from "@/components/ai/AIAssistant";
import { cn, formatUserShortName } from "@/lib/utils";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { useSignedUrl } from "@/hooks/useSignedUrl";
import { useGlobalRealtime } from "@/hooks/useGlobalRealtime";
import {
  LayoutDashboard, Users, Sprout, CreditCard, LogOut, Menu, Receipt, History, CalendarDays,
  BarChart3, Ticket, Wallet, FileText, Settings, UserCircle, Wifi, WifiOff, RefreshCw, Signal,
  LandPlot, Layers, Target, CloudUpload, MessageSquare
} from "lucide-react";

interface MainLayoutProps { children: ReactNode; }

const MainLayout = ({ children }: MainLayoutProps) => {
  const { signOut, profile, userRoles } = useAuth();
  const { can } = usePermissions();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  useEffect(() => {
   ¶»§q«^