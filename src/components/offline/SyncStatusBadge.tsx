import { Badge } from "@/components/ui/badge";
import { Cloud, CloudOff, RefreshCw, AlertTriangle, Check, FileClock } from "lucide-react";

export type SyncState = "draft" | "queued" | "syncing" | "synced" | "error";

const CONFIG: Record<SyncState, { label: string; icon: any; className: string }> = {
  draft: { label: "Brouillon local", icon: FileClock, className: "bg-muted text-muted-foreground" },
  queued: { label: "En file d'attente", icon: CloudOff, className: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
  syncing: { label: "Synchronisation…", icon: RefreshCw, className: "bg-primary/15 text-primary border-primary/30" },
  synced: { label: "Synchronisé", icon: Check, className: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" },
  error: { label: "Erreur de synchro", icon: AlertTriangle, className: "bg-destructive/15 text-destructive border-destructive/30" },
};

interface Props {
  state: SyncState;
  count?: number;
  className?: string;
}

/** Indicateur d'état de synchronisation à afficher dans chaque formulaire terrain. */
export function SyncStatusBadge({ state, count, className }: Props) {
  const cfg = CONFIG[state] ?? CONFIG.synced;
  const Icon = cfg.icon;
  return (
    <Badge variant="outline" className={`gap-1.5 ${cfg.className} ${className || ""}`}>
      <Icon className={`h-3 w-3 ${state === "syncing" ? "animate-spin" : ""}`} />
      {cfg.label}
      {typeof count === "number" && count > 0 ? ` (${count})` : ""}
    </Badge>
  );
}

export function OnlineBadge({ isOnline }: { isOnline: boolean }) {
  return (
    <Badge variant="outline" className={isOnline
      ? "gap-1.5 bg-emerald-500/15 text-emerald-600 border-emerald-500/30"
      : "gap-1.5 bg-destructive/15 text-destructive border-destructive/30"}>
      {isOnline ? <Cloud className="h-3 w-3" /> : <CloudOff className="h-3 w-3" />}
      {isOnline ? "En ligne" : "Hors ligne"}
    </Badge>
  );
}