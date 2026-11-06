import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, CalendarDays, CheckSquare, Users, Video } from "lucide-react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

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
    const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(now); d.setDate(d.getDate() + i); return d; });
    const chart = days.map(d => {
      const k = d.toDateString();
      const count = [...events.map(e => e.starts_at), ...meetings.map(m => m.starts_at), ...open.map(t => t.due_at || "")]
        .filter(v => v && new Date(v).toDateString() === k).length;
      return { jour: new Intl.DateTimeFormat("fr-FR", { weekday: "short" }).format(d), total: count };
    });
    return { overdue, today, weekMeetings, weekEvents: events.length, chart };
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
    <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="grid min-w-0 grid-cols-2 gap-3 md:grid-cols-3">
        {kpis.map(k => (
          <Card key={k.label} className={`border-l-4 ${TONE[k.tone]}`}>
            <CardContent className="flex items-start justify-between gap-2 p-3">
              <div className="min-w-0">
                <p className="truncate text-xs text-muted-foreground">{k.label}</p>
                <p className="text-2xl font-bold tabular-nums">{k.value}</p>
                <p className="truncate text-[11px] text-muted-foreground">{k.hint}</p>
              </div>
              <k.icon className="h-5 w-5 shrink-0 text-muted-foreground" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="p-3">
          <p className="mb-1 text-xs font-medium text-muted-foreground">Charge des 7 prochains jours</p>
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.chart}>
                <XAxis dataKey="jour" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis allowDecimals={false} width={24} tickLine={false} axisLine={false} fontSize={11} />
                <Tooltip formatter={(v: number) => [v, "Éléments"]} />
                <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
