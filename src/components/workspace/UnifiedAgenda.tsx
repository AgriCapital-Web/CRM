import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Bell, CalendarDays, CheckSquare, ChevronLeft, ChevronRight, Clock3, MapPin, Plus, RefreshCw, Trash2, UserX, Video, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

type MeetingItem = { id: string; title: string; description: string | null; agenda: string | null; starts_at: string; ends_at: string; status: string; provider: string; join_url: string | null };
type Kind = "event" | "task" | "meeting" | "availability";
type Item = {
  id: string; rawId: string; kind: Kind; title: string; description: string | null; subtype: string;
  starts_at: string; ends_at: string; all_day: boolean; location: string | null; status: string;
  recurrence_rule?: string | null; owner?: string | null; join_url?: string | null;
};
type ViewMode = "day" | "week" | "month" | "quarter" | "semester" | "year";

const VIEWS: { id: ViewMode; label: string }[] = [
  { id: "day", label: "Jour" }, { id: "week", label: "Semaine" }, { id: "month", label: "Mois" },
  { id: "quarter", label: "Trimestre" }, { id: "semester", label: "Semestre" }, { id: "year", label: "Année" },
];
const EVENT_TYPES: [string, string][] = [["appointment","Rendez-vous"],["field_visit","Visite terrain"],["training","Formation"],["travel","Déplacement"],["occupation","Occupation"],["leave","Congé"],["other","Autre"]];
const AVAILABILITY_TYPES: [string, string][] = [["busy","Occupé"],["absent","Absent"],["remote","Télétravail"],["travel","En déplacement"],["unavailable","Indisponible"],["available","Disponible"]];
const REPEATS: [string, string][] = [["none","Ne se répète pas"],["daily","Tous les jours"],["weekly","Toutes les semaines"],["monthly","Tous les mois"],["yearly","Tous les ans"]];
const REMINDERS: [string, string][] = [["none","Aucun rappel"],["0","À l'heure prévue"],["5","5 minutes avant"],["15","15 minutes avant"],["30","30 minutes avant"],["60","1 heure avant"],["1440","1 jour avant"],["4320","3 jours avant"],["10080","1 semaine avant"]];
const PRIORITIES: [string, string][] = [["low","Basse"],["normal","Normale"],["high","Haute"],["urgent","Urgente"]];

const KIND_STYLE: Record<Kind, string> = {
  event: "border-primary bg-primary/10 text-foreground",
  meeting: "border-accent bg-accent/20 text-foreground",
  task: "border-secondary-foreground/60 bg-secondary text-secondary-foreground",
  availability: "border-muted-foreground bg-muted text-muted-foreground",
};
const KIND_DOT: Record<Kind, string> = { event: "bg-primary", meeting: "bg-accent", task: "bg-secondary-foreground/60", availability: "bg-muted-foreground" };
const KIND_LABEL: Record<Kind, string> = { event: "Événement", meeting: "Réunion", task: "Tâche", availability: "Disponibilité" };

const HOUR_PX = 48;
const fr = (d: Date, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("fr-FR", o).format(d);
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const startOfWeek = (d: Date) => { const x = startOfDay(d); x.setDate(x.getDate() - ((x.getDay()+6)%7)); return x; };
const plusDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };
const sameDay = (a: Date, b: Date) => dayKey(a) === dayKey(b);
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
const time = (iso: string) => fr(new Date(iso), { hour: "2-digit", minute: "2-digit" });
const monthsInView = (v: ViewMode) => v === "quarter" ? 3 : v === "semester" ? 6 : v === "year" ? 12 : 1;
const periodStartMonth = (d: Date, v: ViewMode) => v === "quarter" ? Math.floor(d.getMonth()/3)*3 : v === "semester" ? Math.floor(d.getMonth()/6)*6 : v === "year" ? 0 : d.getMonth();

export default function UnifiedAgenda({ profileId, meetings, onScheduleMeeting }: { profileId?: string; meetings: MeetingItem[]; onScheduleMeeting: (draft?: { title: string; start: string; end: string; description: string }) => void }) {
  const [view, setView] = useState<ViewMode>("month");
  const [cursor, setCursor] = useState(() => new Date());
  const [rows, setRows] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  // Formulaire « Créer » tout-en-un
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [kind, setKind] = useState<Kind>("event");
  const [title, setTitle] = useState("");
  const [subtype, setSubtype] = useState("appointment");
  const [availabilityType, setAvailabilityType] = useState("busy");
  const [date, setDate] = useState(dayKey(new Date()));
  const [endDate, setEndDate] = useState(dayKey(new Date()));
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [allDay, setAllDay] = useState(false);
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [repeat, setRepeat] = useState("none");
  const [reminder, setReminder] = useState("15");
  const [priority, setPriority] = useState("normal");
  const [visibility, setVisibility] = useState("team");
  const [selected, setSelected] = useState<Item | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const range = useMemo(() => {
    const y = cursor.getFullYear();
    return { from: new Date(y - 1, 0, 1), to: new Date(y + 2, 0, 1) };
  }, [cursor.getFullYear()]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async () => {
    setLoading(true);
    const [e, t, a] = await Promise.all([
      (supabase as any).from("workspace_events")
        .select("id,title,description,event_type,starts_at,ends_at,all_day,location,status,recurrence_rule,linked_meeting_id,created_by_profile_id")
        .gte("ends_at", range.from.toISOString()).lte("starts_at", range.to.toISOString())
        .neq("status", "cancelled").order("starts_at").limit(1000),
      (supabase as any).from("workspace_tasks")
        .select("id,title,description,status,priority,due_at,created_by_profile_id,assigned_to_profile_id")
        .not("due_at", "is", null).gte("due_at", range.from.toISOString()).lte("due_at", range.to.toISOString())
        .neq("status", "cancelled").limit(1000),
      (supabase as any).from("workspace_availability")
        .select("id,profile_id,availability_type,starts_at,ends_at,note")
        .gte("ends_at", range.from.toISOString()).lte("starts_at", range.to.toISOString()).limit(1000),
    ]);
    if (e.error || t.error || a.error) {
      console.error("Agenda", e.error || t.error || a.error);
      toast.error("Une partie de l'agenda n'a pas pu être chargée. Actualisez la page.");
    }
    const meetingIds = new Set(meetings.map(m => m.id));
    const items: Item[] = [
      ...((e.data || []) as any[]).filter(x => !(x.linked_meeting_id && meetingIds.has(x.linked_meeting_id))).map(x => ({
        id: x.id, rawId: x.id, kind: (x.event_type === "meeting" ? "meeting" : "event") as Kind, title: x.title, description: x.description,
        subtype: x.event_type, starts_at: x.starts_at, ends_at: x.ends_at, all_day: !!x.all_day, location: x.location,
        status: x.status, recurrence_rule: x.recurrence_rule, owner: x.created_by_profile_id,
      })),
      ...((t.data || []) as any[]).map(x => {
        const due = new Date(x.due_at);
        return { id: "t-" + x.id, rawId: x.id, kind: "task" as Kind, title: x.title, description: x.description, subtype: x.priority,
          starts_at: due.toISOString(), ends_at: new Date(due.getTime() + 30*60000).toISOString(), all_day: false, location: null,
          status: x.status, owner: x.created_by_profile_id };
      }),
      ...((a.data || []) as any[]).map(x => ({
        id: "a-" + x.id, rawId: x.id, kind: "availability" as Kind,
        title: AVAILABILITY_TYPES.find(([v]) => v === x.availability_type)?.[1] || "Disponibilité",
        description: x.note, subtype: x.availability_type, starts_at: x.starts_at, ends_at: x.ends_at,
        all_day: (new Date(x.ends_at).getTime() - new Date(x.starts_at).getTime()) >= 86400000, location: null, status: "scheduled", owner: x.profile_id,
      })),
      ...meetings.filter(m => m.status !== "cancelled").map(m => ({
        id: "m-" + m.id, rawId: m.id, kind: "meeting" as Kind, title: m.title, description: m.agenda || m.description, subtype: "meeting",
        starts_at: m.starts_at, ends_at: m.ends_at, all_day: false, location: null, status: m.status, join_url: m.join_url,
      })),
    ];
    setRows(items);
    setLoading(false);
  }, [range, meetings]);
  useEffect(() => { void load(); }, [load]);

  // Expansion des répétitions dans la fenêtre chargée
  const items = useMemo(() => {
    const out: Item[] = [];
    for (const e of rows) {
      out.push(e);
      if (!e.recurrence_rule || e.recurrence_rule === "none") continue;
      const start = new Date(e.starts_at); const dur = new Date(e.ends_at).getTime() - start.getTime();
      let next = new Date(start);
      for (let i = 0; i < 800; i++) {
        next = new Date(next);
        if (e.recurrence_rule === "daily") next.setDate(next.getDate()+1);
        else if (e.recurrence_rule === "weekly") next.setDate(next.getDate()+7);
        else if (e.recurrence_rule === "monthly") next.setMonth(next.getMonth()+1);
        else if (e.recurrence_rule === "yearly") next.setFullYear(next.getFullYear()+1);
        else break;
        if (next >= range.to) break;
        out.push({ ...e, id: `${e.id}-${dayKey(next)}`, starts_at: next.toISOString(), ends_at: new Date(next.getTime()+dur).toISOString() });
      }
    }
    return out.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  }, [rows, range]);

  const itemsOn = useCallback((d: Date) => {
    const s = startOfDay(d).getTime(), en = s + 86400000;
    return items.filter(i => new Date(i.starts_at).getTime() < en && new Date(i.ends_at).getTime() > s);
  }, [items]);

  const openCreate = (k: Kind = "event", at?: Date, allDayDefault = false) => {
    const start = at || (() => { const n = new Date(); n.setMinutes(0,0,0); n.setHours(n.getHours()+1); return n; })();
    const end = new Date(start.getTime() + 3600000);
    setKind(k); setTitle(""); setDescription(""); setLocation(""); setRepeat("none"); setReminder("15"); setPriority("normal");
    setSubtype("appointment"); setAvailabilityType("busy"); setVisibility("team");
    setDate(dayKey(start)); setEndDate(dayKey(end)); setStartTime(hhmm(start)); setEndTime(hhmm(end)); setAllDay(allDayDefault);
    setOpen(true);
  };

  const scheduleReminders = async (eventId: string, starts: Date) => {
    if (reminder === "none" || !profileId) return;
    const count = repeat === "none" ? 1 : repeat === "daily" ? 30 : repeat === "weekly" ? 16 : repeat === "monthly" ? 12 : 3;
    const out: number[] = []; let occ = new Date(starts);
    for (let i = 0; i < count; i++) {
      if (i > 0) { occ = new Date(occ); if (repeat === "daily") occ.setDate(occ.getDate()+1); else if (repeat === "weekly") occ.setDate(occ.getDate()+7); else if (repeat === "monthly") occ.setMonth(occ.getMonth()+1); else occ.setFullYear(occ.getFullYear()+1); }
      out.push(occ.getTime() - Number(reminder)*60000);
    }
    const reminderRows = out.filter(t => t > Date.now()).map(t => ({ recipient_profile_id: profileId, event_id: eventId, remind_at: new Date(t).toISOString(), channel: "in_app", status: "pending", attempts: 0, reminder_offset_minutes: Number(reminder), created_by_profile_id: profileId }));
    if (reminderRows.length) {
      const { error } = await (supabase as any).from("workspace_reminders").insert(reminderRows);
      if (error) { console.warn("Rappels", error); toast.warning("Enregistré, mais les rappels n'ont pas pu être programmés."); }
    }
  };

  const save = async () => {
    if (!profileId) return toast.error("Votre fiche collaborateur est introuvable. Prévenez l'administrateur.");
    const name = title.trim();
    if (kind !== "availability" && !name) return toast.error("Ajoutez un titre.");
    if (name.length > 200) return toast.error("Le titre ne doit pas dépasser 200 caractères.");
    const starts = new Date(`${date}T${allDay ? "00:00" : startTime}:00`);
    const ends = allDay ? new Date(new Date(`${endDate || date}T00:00:00`).getTime() + 86400000) : new Date(`${(kind === "availability" ? endDate : date) || date}T${endTime}:00`);
    if (kind !== "task" && ends <= starts) return toast.error("La fin doit être après le début.");

    if (kind === "meeting") {
      setOpen(false);
      onScheduleMeeting({ title: name, start: `${date}T${startTime}`, end: `${date}T${endTime}`, description: description.trim() });
      return;
    }
    setSaving(true);
    try {
      if (kind === "event") {
        const { data, error } = await (supabase as any).from("workspace_events").insert({
          title: name, description: description.trim() || null, event_type: subtype, visibility,
          starts_at: starts.toISOString(), ends_at: ends.toISOString(), all_day: allDay, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          location: location.trim() || null, status: "scheduled", created_by_profile_id: profileId,
          recurrence_rule: repeat, reminder_offset_minutes: reminder === "none" ? null : Number(reminder), alarm_enabled: reminder !== "none",
        }).select("id").single();
        if (error) throw error;
        await scheduleReminders(data.id, starts);
        toast.success("Événement ajouté à l'agenda.");
      } else if (kind === "task") {
        const due = allDay ? new Date(`${date}T23:59:00`) : starts;
        const { error } = await (supabase as any).from("workspace_tasks").insert({
          title: name, description: description.trim() || null, priority, due_at: due.toISOString(),
          created_by_profile_id: profileId, assigned_to_profile_id: profileId,
        });
        if (error) throw error;
        toast.success("Tâche ajoutée à l'agenda.");
      } else {
        const { error } = await (supabase as any).from("workspace_availability").insert({
          profile_id: profileId, availability_type: availabilityType, starts_at: starts.toISOString(), ends_at: ends.toISOString(),
          note: description.trim() || null, visibility: "busy",
        });
        if (error) throw error;
        toast.success("Disponibilité enregistrée.");
      }
      setOpen(false);
      await load();
    } catch (err) {
      console.error("Agenda – enregistrement", err);
      toast.error("L'enregistrement n'a pas abouti. Vérifiez vos droits ou réessayez.");
    } finally { setSaving(false); }
  };

  const removeSelected = async () => {
    if (!selected) return;
    if (!confirm(`Supprimer « ${selected.title} » de l'agenda ?`)) return;
    const req = selected.kind === "task" ? (supabase as any).from("workspace_tasks").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", selected.rawId)
      : selected.kind === "availability" ? (supabase as any).from("workspace_availability").delete().eq("id", selected.rawId)
      : (supabase as any).from("workspace_events").update({ status: "cancelled" }).eq("id", selected.rawId);
    const { error } = await req;
    if (error) { console.error(error); return toast.error("Suppression impossible : vous n'avez pas les droits sur cet élément."); }
    toast.success("Élément retiré de l'agenda."); setSelected(null); await load();
  };
  const completeTask = async () => {
    if (!selected || selected.kind !== "task") return;
    const { error } = await (supabase as any).from("workspace_tasks").update({ status: "done", completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", selected.rawId);
    if (error) { console.error(error); return toast.error("Impossible de terminer cette tâche."); }
    toast.success("Tâche terminée."); setSelected(null); await load();
  };

  const navigate = (dir: number) => setCursor(old => {
    const d = new Date(old);
    if (view === "day") d.setDate(d.getDate()+dir);
    else if (view === "week") d.setDate(d.getDate()+7*dir);
    else d.setMonth(d.getMonth() + dir*monthsInView(view));
    return d;
  });

  const label = (() => {
    if (view === "day") return fr(cursor, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    if (view === "week") { const s = startOfWeek(cursor), e = plusDays(s, 6); return `${fr(s,{day:"numeric",month:"short"})} – ${fr(e,{day:"numeric",month:"short",year:"numeric"})}`; }
    if (view === "month") return fr(cursor, { month: "long", year: "numeric" });
    if (view === "quarter") return `T${Math.floor(cursor.getMonth()/3)+1} ${cursor.getFullYear()}`;
    if (view === "semester") return `S${Math.floor(cursor.getMonth()/6)+1} ${cursor.getFullYear()}`;
    return String(cursor.getFullYear());
  })();

  useEffect(() => {
    if ((view === "day" || view === "week") && gridRef.current) gridRef.current.scrollTop = 7 * HOUR_PX;
  }, [view, loading]);

  const Chip = ({ it, compact }: { it: Item; compact?: boolean }) => (
    <button type="button" onClick={(ev) => { ev.stopPropagation(); setSelected(it); }}
      className={`block w-full truncate rounded border-l-4 px-1.5 py-0.5 text-left text-[11px] leading-tight hover:opacity-80 ${KIND_STYLE[it.kind]} ${it.status === "done" ? "line-through opacity-60" : ""}`}>
      {!compact && !it.all_day && <span className="mr-1 font-semibold tabular-nums">{time(it.starts_at)}</span>}{it.title}
    </button>
  );

  const TimeGrid = ({ days }: { days: Date[] }) => {
    const now = new Date();
    return <div className="overflow-hidden rounded-lg border">
      <div className="grid border-b bg-muted/40" style={{ gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(0,1fr))` }}>
        <div />
        {days.map(d => <button key={dayKey(d)} type="button" onClick={() => { setCursor(d); setView("day"); }} className="flex flex-col items-center py-2 hover:bg-muted">
          <span className="text-[11px] uppercase text-muted-foreground">{fr(d,{weekday:"short"})}</span>
          <span className={`mt-0.5 flex h-8 w-8 items-center justify-center rounded-full text-base font-semibold ${sameDay(d, now) ? "bg-primary text-primary-foreground" : ""}`}>{d.getDate()}</span>
        </button>)}
      </div>
      <div className="grid border-b" style={{ gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(0,1fr))` }}>
        <div className="p-1 text-right text-[10px] text-muted-foreground">Journée</div>
        {days.map(d => <div key={dayKey(d)} className="min-h-7 space-y-0.5 border-l p-0.5" onClick={() => openCreate("event", startOfDay(d), true)}>
          {itemsOn(d).filter(i => i.all_day).map(i => <Chip key={i.id} it={i} compact />)}
        </div>)}
      </div>
      <div ref={gridRef} className="max-h-[65dvh] overflow-y-auto">
        <div className="relative grid" style={{ gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(0,1fr))` }}>
          <div>{Array.from({ length: 24 }, (_, h) => <div key={h} style={{ height: HOUR_PX }} className="pr-1 text-right text-[10px] text-muted-foreground">{h ? `${String(h).padStart(2,"0")}:00` : ""}</div>)}</div>
          {days.map(d => {
            const dayStart = startOfDay(d).getTime();
            const timed = itemsOn(d).filter(i => !i.all_day);
            return <div key={dayKey(d)} className="relative border-l">
              {Array.from({ length: 24 }, (_, h) => <div key={h} style={{ height: HOUR_PX }} className="cursor-pointer border-b border-border/50 hover:bg-muted/40"
                onClick={() => { const at = new Date(d); at.setHours(h, 0, 0, 0); openCreate("event", at); }} />)}
              {timed.map((it, idx) => {
                const s = Math.max(new Date(it.starts_at).getTime(), dayStart), e = Math.min(new Date(it.ends_at).getTime(), dayStart + 86400000);
                const top = (s - dayStart) / 3600000 * HOUR_PX, height = Math.max(20, (e - s) / 3600000 * HOUR_PX - 2);
                const overlaps = timed.filter(o => new Date(o.starts_at) < new Date(it.ends_at) && new Date(o.ends_at) > new Date(it.starts_at));
                const col = overlaps.indexOf(it), cols = overlaps.length;
                return <button key={it.id + idx} type="button" onClick={() => setSelected(it)}
                  className={`absolute overflow-hidden rounded-md border-l-4 px-1.5 py-0.5 text-left text-[11px] leading-tight shadow-sm hover:z-10 hover:opacity-90 ${KIND_STYLE[it.kind]}`}
                  style={{ top, height, left: `calc(${(col/cols)*100}% + 2px)`, width: `calc(${100/cols}% - 4px)` }}>
                  <div className="truncate font-semibold">{it.title}</div>
                  {height > 30 && <div className="truncate tabular-nums opacity-80">{time(it.starts_at)} – {time(it.ends_at)}</div>}
                </button>;
              })}
              {sameDay(d, now) && <div className="pointer-events-none absolute inset-x-0 z-20 h-0.5 bg-destructive" style={{ top: (now.getHours() + now.getMinutes()/60) * HOUR_PX }} />}
            </div>;
          })}
        </div>
      </div>
    </div>;
  };

  const MonthGrid = () => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = startOfWeek(first);
    const days = Array.from({ length: 42 }, (_, i) => plusDays(start, i));
    return <div className="overflow-hidden rounded-lg border">
      <div className="grid grid-cols-7 bg-muted/40">{["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"].map(d => <div key={d} className="border-b p-2 text-center text-[11px] font-medium uppercase text-muted-foreground">{d}</div>)}</div>
      <div className="grid grid-cols-7">{days.map(d => {
        const list = itemsOn(d); const inMonth = d.getMonth() === cursor.getMonth();
        return <div key={dayKey(d)} onClick={() => { const at = new Date(d); at.setHours(9,0,0,0); openCreate("event", at); }}
          className={`min-h-[3.65rem] cursor-pointer border-b border-r px-1 py-0.5 hover:bg-muted/30 sm:min-h-[4.6rem] sm:px-1.5 ${inMonth ? "" : "bg-muted/20 text-muted-foreground"}`}>
          <button type="button" onClick={(ev) => { ev.stopPropagation(); setCursor(d); setView("day"); }}
            className={`mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs hover:bg-muted ${sameDay(d, new Date()) ? "bg-primary font-bold text-primary-foreground hover:bg-primary" : ""}`}>{d.getDate()}</button>
          <div className="space-y-0.5">{list.slice(0, 2).map(i => <Chip key={i.id} it={i} compact />)}
            {list.length > 2 && <button type="button" className="block max-w-full truncate text-[9px] font-medium leading-tight text-primary sm:text-[10px]" onClick={(ev) => { ev.stopPropagation(); setCursor(d); setView("day"); }}>+{list.length - 2} autres</button>}</div>
        </div>;
      })}</div>
    </div>;
  };

  const MiniMonths = () => {
    const startM = periodStartMonth(cursor, view), n = monthsInView(view);
    return <div className={`grid gap-3 ${n === 3 ? "grid-cols-1 md:grid-cols-3" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"}`}>
      {Array.from({ length: n }, (_, k) => {
        const month = new Date(cursor.getFullYear(), startM + k, 1);
        const lead = (month.getDay() + 6) % 7, total = new Date(month.getFullYear(), month.getMonth()+1, 0).getDate();
        const monthCount = items.filter(i => { const d = new Date(i.starts_at); return d.getFullYear() === month.getFullYear() && d.getMonth() === month.getMonth(); }).length;
        return <div key={k} className="rounded-lg border p-3">
          <div className="mb-2 flex items-center justify-between">
            <button type="button" className="font-semibold capitalize hover:text-primary" onClick={() => { setCursor(month); setView("month"); }}>{fr(month,{month:"long"})}</button>
            <span className="text-xs text-muted-foreground">{monthCount} élément(s)</span>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center text-[11px]">
            {["L","M","M","J","V","S","D"].map((x,i) => <span key={i} className="text-muted-foreground">{x}</span>)}
            {Array.from({ length: lead }, (_, i) => <span key={"b"+i} />)}
            {Array.from({ length: total }, (_, i) => {
              const d = new Date(month.getFullYear(), month.getMonth(), i+1); const list = itemsOn(d);
              return <button key={i} type="button" title={list.map(x => x.title).join(" · ")} onClick={() => { setCursor(d); setView("day"); }}
                className={`relative flex h-7 items-center justify-center rounded-full hover:bg-muted ${sameDay(d, new Date()) ? "bg-primary font-bold text-primary-foreground" : list.length ? "font-semibold text-primary" : ""}`}>
                {i+1}{list.length > 0 && <span className="absolute bottom-0.5 flex gap-0.5">{[...new Set(list.map(x => x.kind))].slice(0,3).map(kd => <span key={kd} className={`h-1 w-1 rounded-full ${KIND_DOT[kd]}`} />)}</span>}
              </button>;
            })}
          </div>
        </div>;
      })}
    </div>;
  };

  const upcoming = items.filter(i => new Date(i.ends_at) >= new Date() && i.status !== "done").slice(0, 6);

  return <div className="min-w-0 space-y-2">
    <aside className="hidden">
      <Button size="lg" className="h-12 w-full rounded-2xl text-base shadow-md" onClick={() => openCreate("event")}><Plus className="mr-2 h-5 w-5" />Créer</Button>
      <Card><CardContent className="space-y-2 p-3 text-sm">
        <p className="font-medium">Légende</p>
        {(Object.keys(KIND_LABEL) as Kind[]).map(k => <div key={k} className="flex items-center gap-2"><span className={`h-3 w-3 rounded-sm ${KIND_DOT[k]}`} />{KIND_LABEL[k]}</div>)}
      </CardContent></Card>
      <Card className="hidden lg:block"><CardContent className="space-y-2 p-3">
        <p className="text-sm font-medium">À venir</p>
        {upcoming.length ? upcoming.map(i => <button key={i.id} type="button" onClick={() => setSelected(i)} className="block w-full rounded-md p-1.5 text-left text-xs hover:bg-muted">
          <div className="flex items-center gap-1.5"><span className={`h-2 w-2 shrink-0 rounded-full ${KIND_DOT[i.kind]}`} /><span className="truncate font-medium">{i.title}</span></div>
          <div className="pl-3.5 text-muted-foreground">{fr(new Date(i.starts_at),{day:"numeric",month:"short"})}{!i.all_day && " · " + time(i.starts_at)}</div>
        </button>) : <p className="text-xs text-muted-foreground">Rien de prévu.</p>}
      </CardContent></Card>
    </aside>

    <div className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setCursor(new Date())}>Aujourd'hui</Button>
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Période précédente"><ChevronLeft className="h-5 w-5" /></Button>
        <Button variant="ghost" size="icon" onClick={() => navigate(1)} aria-label="Période suivante"><ChevronRight className="h-5 w-5" /></Button>
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold capitalize sm:text-base">{label}</h3>
        <Button variant="ghost" size="icon" onClick={() => void load()} aria-label="Actualiser"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></Button>
        <Select value={view} onValueChange={v => setView(v as ViewMode)}>
          <SelectTrigger className="h-8 w-[7.5rem] text-xs sm:w-36"><SelectValue /></SelectTrigger>
          <SelectContent>{VIEWS.map(v => <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {loading && rows.length === 0 ? <div className="flex items-center justify-center py-16 text-sm text-muted-foreground"><RefreshCw className="mr-2 h-4 w-4 animate-spin" />Chargement de l'agenda…</div>
        : view === "day" ? <TimeGrid days={[startOfDay(cursor)]} />
        : view === "week" ? <TimeGrid days={Array.from({ length: 7 }, (_, i) => plusDays(startOfWeek(cursor), i))} />
        : view === "month" ? <MonthGrid /> : <MiniMonths />}
    </div>

    {/* Fenêtre unique de création */}
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>Créer dans l'agenda</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <Input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder={kind === "availability" ? "Note (facultatif)" : "Ajouter un titre"} className="h-11 text-base" />
          <Tabs value={kind} onValueChange={v => setKind(v as Kind)}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="event" className="gap-1 text-xs sm:text-sm"><CalendarDays className="hidden h-4 w-4 sm:block" />Événement</TabsTrigger>
              <TabsTrigger value="task" className="gap-1 text-xs sm:text-sm"><CheckSquare className="hidden h-4 w-4 sm:block" />Tâche</TabsTrigger>
              <TabsTrigger value="meeting" className="gap-1 text-xs sm:text-sm"><Video className="hidden h-4 w-4 sm:block" />Réunion</TabsTrigger>
              <TabsTrigger value="availability" className="gap-1 text-xs sm:text-sm"><UserX className="hidden h-4 w-4 sm:block" />Dispo.</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>{kind === "task" ? "Échéance" : "Début"}</Label><Input type="date" value={date} onChange={e => { setDate(e.target.value); if (e.target.value > endDate) setEndDate(e.target.value); }} /></div>
            {!allDay ? <div className="space-y-1"><Label>Heure</Label><Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} /></div> : <div />}
            {kind !== "task" && <>
              {(kind === "availability" || allDay) ? <div className="space-y-1"><Label>Fin</Label><Input type="date" value={endDate} min={date} onChange={e => setEndDate(e.target.value)} /></div> : <div />}
              {!allDay && <div className="space-y-1"><Label>Heure de fin</Label><Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} /></div>}
            </>}
          </div>
          {kind !== "meeting" && <label className="flex items-center gap-2 text-sm"><Switch checked={allDay} onCheckedChange={setAllDay} />Toute la journée</label>}

          {kind === "event" && <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Type</Label><Select value={subtype} onValueChange={setSubtype}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{EVENT_TYPES.map(([v,l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label>Visible par</Label><Select value={visibility} onValueChange={setVisibility}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="private">Moi seul</SelectItem><SelectItem value="team">Mon équipe</SelectItem></SelectContent></Select></div>
            <div className="space-y-1"><Label>Répétition</Label><Select value={repeat} onValueChange={setRepeat}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{REPEATS.map(([v,l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label className="flex items-center gap-1"><Bell className="h-3.5 w-3.5" />Rappel</Label><Select value={reminder} onValueChange={setReminder}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{REMINDERS.map(([v,l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></div>
            <div className="col-span-2 space-y-1"><Label>Lieu</Label><Input value={location} onChange={e => setLocation(e.target.value)} placeholder="Ajouter un lieu" /></div>
          </div>}
          {kind === "task" && <div className="space-y-1"><Label>Priorité</Label><Select value={priority} onValueChange={setPriority}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PRIORITIES.map(([v,l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></div>}
          {kind === "availability" && <div className="space-y-1"><Label>Statut</Label><Select value={availabilityType} onValueChange={setAvailabilityType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{AVAILABILITY_TYPES.map(([v,l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></div>}
          {kind === "meeting" && <p className="rounded-md border-l-4 border-primary bg-muted/40 p-2 text-xs text-muted-foreground">À l'étape suivante, vous ajoutez les participants, la visioconférence et les documents.</p>}
          {kind !== "availability" && <div className="space-y-1"><Label>Description</Label><Textarea rows={3} value={description} onChange={e => setDescription(e.target.value)} placeholder="Ajouter une description" /></div>}
          {kind === "availability" && <div className="space-y-1"><Label>Note</Label><Textarea rows={2} value={description} onChange={e => setDescription(e.target.value)} /></div>}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setOpen(false)}>Annuler</Button>
            <Button disabled={saving} onClick={() => void save()}>{saving ? "Enregistrement…" : kind === "meeting" ? "Continuer" : "Enregistrer"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    {/* Détail d'un élément */}
    <Dialog open={!!selected} onOpenChange={o => !o && setSelected(null)}>
      <DialogContent className="sm:max-w-md">
        {selected && <>
          <DialogHeader><DialogTitle className="flex items-center gap-2"><span className={`h-3 w-3 shrink-0 rounded-sm ${KIND_DOT[selected.kind]}`} />{selected.title}</DialogTitle></DialogHeader>
          <div className="space-y-2 text-sm">
            <p className="text-xs uppercase text-muted-foreground">{KIND_LABEL[selected.kind]}{selected.kind === "task" && " · " + (PRIORITIES.find(([v]) => v === selected.subtype)?.[1] || "")}{selected.kind === "event" && " · " + (EVENT_TYPES.find(([v]) => v === selected.subtype)?.[1] || "")}</p>
            <p className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-muted-foreground" />
              <span className="capitalize">{fr(new Date(selected.starts_at), { weekday: "long", day: "numeric", month: "long" })}</span>
              {!selected.all_day && <span className="tabular-nums">{time(selected.starts_at)}{selected.kind !== "task" && " – " + time(selected.ends_at)}</span>}
            </p>
            {selected.location && <p className="flex items-center gap-2"><MapPin className="h-4 w-4 text-muted-foreground" />{selected.location}</p>}
            {selected.join_url && <a className="flex items-center gap-2 text-primary underline" href={selected.join_url} target="_blank" rel="noreferrer"><Video className="h-4 w-4" />Rejoindre la réunion</a>}
            {selected.description && <p className="whitespace-pre-wrap rounded-md bg-muted/40 p-2">{selected.description}</p>}
            {selected.recurrence_rule && selected.recurrence_rule !== "none" && <p className="text-xs text-muted-foreground">{REPEATS.find(([v]) => v === selected.recurrence_rule)?.[1]}</p>}
          </div>
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            {selected.kind === "task" && selected.status !== "done" && <Button size="sm" onClick={() => void completeTask()}><CheckCircle2 className="mr-1 h-4 w-4" />Terminer</Button>}
            {selected.kind !== "meeting" && (!selected.owner || selected.owner === profileId) && <Button size="sm" variant="outline" onClick={() => void removeSelected()}><Trash2 className="mr-1 h-4 w-4" />Supprimer</Button>}
          </div>
        </>}
      </DialogContent>
    </Dialog>
  </div>;
}
