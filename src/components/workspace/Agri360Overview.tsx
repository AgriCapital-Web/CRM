import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, CalendarDays, CheckSquare, Users, Video } from "lucide-react";


type Meeting = { starts_at: string };
type Tone = "good" | "warn" | "bad" | "neutral";
const TONE: Record<Tone, string> = {
  good: "border-l-primary",
  warn: "border-l-accent",
  bad: "border-l-destructive",
  neutral: "border-l-muted-foreground/40",
};

export default function Agri360Overview({ profileId, meetings }: { profileId?: string; meetings: Meeting[] }) {
  const { can } = usePermissions();
  const [tasks, setTasks] = useState<{ due_at: string | null; status: string }[]>([]);
  const [events, setEvents] = useState<{ starts_at: string }[]>([]);
  const [leads, setLeads] = useState<number | null>(null);
  const [clients, setClients] = useState<number | null>(null);

  useEffect(() => {
    if (!profileId) return;
    const now = new Date();
    const in7 = new Date(now.getTime() + 7 * 86400000);
    void (async () => {
      const [t, e] = await Promise.all([
        (supabase as any).from("workspace_tasks").select("due_at,status").eq("assigned_to_profile_id", profileId).neq("status", "cancelled").limit(500),
        (supabase as any).from("workspace_events").select("starts_at").gte("starts_at", now.toISOString()).lte("starts_at", in7.toISOString()).neq("status", "cancelled").limit(500),
      ]);
      setTasks(t.data || []);
      setEvents(e.data || []);
      if (can("leads.view")) {
        const { count } = await (supabase as any).from("leads").select("id", { count: "exact", head: true });
        setLeads(count ?? null);
      }
      if (can("clients.view")) {
        const { count } = await (supabase as any).from("clients").select("id", { count: "exact", head: true });
        setClients(count ?? null);
      }
    })();
  }, [profileId]); // eslint-disable-line react-hooks/exhaustive-deps

  const stats = useMemo(() => {
    const now = new Date();
    const todayKey = now.toDateString();
    const open = tasks.filter(t => t.status !== "done");
    const overdue = open.filter(t => t.due_at && new Date(t.due_at) < now).length;
    const today = open.filter(t => t.due_at && new Date(t.due_at).toDateString() === todayKey).length;
    const in7 = now.getTime() + 7 * 86400000;
    const weekMeetings = meetings.filter(m => { const d = new Date(m.starts_at).getTime(); return d >= now.getTime() && d <= in7; }).length;
      return { overdue, today, weekMeetings, weekEvents: events.length };
  }, [tasks, events, meetings]);

  const kpis: { label: string; value: number; icon: any; tone: Tone; hint: string }[] = [
    { label: "Tâches en retard", value: stats.overdue, icon: AlertTriangle, tone: stats.overdue ? "bad" : "good", hint: stats.overdue ? "À traiter en priorité" : "Rien en retard" },
    { label: "À faire aujourd'hui", value: stats.today, icon: CheckSquare, tone: stats.today > 5 ? "warn" : "neutral", hint: "Tâches prévues ce jour" },
    { label: "Réunions (7 jours)", value: stats.weekMeetings, icon: Video, tone: "neutral", hint: "Prochaine semaine" },
    { label: "Rendez-vous (7 jours)", value: stats.weekEvents, icon: CalendarDays, tone: "neutral", hint: "Prochaine semaine" },
  ];
  if (leads !== null) kpis.push({ label: "Prospects", value: leads, icon: Users, tone: "neutral", hint: "Dans votre secteur" });
  if (clients !== null) kpis.push({ label: "Clients", value: clients, icon: Users, tone: "good", hint: "Dans votre secteur" });

  return (
    <div className="grid min-w-0 grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-6">
      {kpis.map(k => (
        <Card key={k.label} className={k.tone === "bad" ? "border-destructive/40 bg-destructive/[0.03]" : "border-border/70"}>
          <CardContent className="flex min-w-0 items-center gap-2 px-2.5 py-2 sm:px-3">
            <k.icon className={`h-4 w-4 shrink-0 ${k.tone === "bad" ? "text-destructive" : "text-muted-foreground"}`} />
            <div className="min-w-0">
              <p className="truncate text-[10px] leading-tight text-muted-foreground sm:text-[11px]">{k.label}</p>
              <p className="text-base font-semibold leading-tight tabular-nums sm:text-lg">{k.value}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
