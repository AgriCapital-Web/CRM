import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Plus, RefreshCw, Video, Bell, MapPin } from "lucide-react";
import { toast } from "sonner";

type MeetingItem = { id: string; title: string; description: string | null; agenda: string | null; starts_at: string; ends_at: string; status: string; provider: string; join_url: string | null };
type CalendarEvent = { id: string; title: string; description: string | null; event_type: string; starts_at: string; ends_at: string; all_day: boolean; location: string | null; status: string; recurrence_rule?: string | null; reminder_offset_minutes?: number | null; linked_meeting_id?: string | null; source: "event" | "meeting" };
type ViewMode = "year" | "month" | "week" | "day";
const fr = (d: Date, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("fr-FR", options).format(d);
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const startOfWeek = (d: Date) => { const x = startOfDay(d); x.setDate(x.getDate() - ((x.getDay()+6)%7)); return x; };
const plusDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };
const sameDay = (a: Date, b: Date) => dayKey(a) === dayKey(b);
const eventColor = (type: string) => type === "meeting" ? "border-violet-400 bg-violet-50 text-violet-900 dark:bg-violet-950/40 dark:text-violet-100" : type === "deadline" || type === "task" ? "border-amber-400 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100" : "border-sky-400 bg-sky-50 text-sky-900 dark:bg-sky-950/40 dark:text-sky-100";

export default function UnifiedAgenda({ profileId, meetings, onScheduleMeeting }: { profileId?: string; meetings: MeetingItem[]; onScheduleMeeting: (draft?: { title: string; start: string; end: string; description: string }) => void }) {
  const [view, setView] = useState<ViewMode>("month");
  const [cursor, setCursor] = useState(() => new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("appointment");
  const [date, setDate] = useState(dayKey(new Date()));
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [allDay, setAllDay] = useState(false);
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [repeat, setRepeat] = useState("none");
  const [reminder, setReminder] = useState("15");
  const [alarm, setAlarm] = useState(true);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase as any).from("workspace_events")
      .select("id,title,description,event_type,starts_at,ends_at,all_day,location,status,recurrence_rule,reminder_offset_minutes,linked_meeting_id")
      .gte("ends_at", new Date(cursor.getFullYear()-1, 0, 1).toISOString())
      .lte("starts_at", new Date(cursor.getFullYear()+2, 0, 1).toISOString())
      .neq("status", "cancelled")
      .order("starts_at", { ascending: true }).limit(1000);
    if (error) { console.error("Chargement agenda", error); toast.error("Impossible de charger les événements de l'agenda."); setEvents([]); }
    else setEvents((data || []).map((e: any) => ({ ...e, source: "event" as const })));
    setLoading(false);
  }, [cursor]);
  useEffect(() => { void loadEvents(); }, [loadEvents]);

  const combined = useMemo<CalendarEvent[]>(() => {
    const meetingItems: CalendarEvent[] = meetings.filter(m => m.status !== "cancelled").map(m => ({
      id: m.id, title: m.title, description: m.agenda || m.description, event_type: "meeting",
      starts_at: m.starts_at, ends_at: m.ends_at, all_day: false, location: null,
      status: m.status, linked_meeting_id: m.id, source: "meeting"
    }));
    const seenMeetings = new Set(meetingItems.map(m => m.id));
    const eventItems = events.filter(e => !(e.linked_meeting_id && seenMeetings.has(e.linked_meeting_id)));
    const base = [...eventItems, ...meetingItems];
    const expanded: CalendarEvent[] = [];
    const windowStart = new Date(cursor.getFullYear()-1,0,1);
    const windowEnd = new Date(cursor.getFullYear()+2,0,1);
    for (const e of base) {
      const start = new Date(e.starts_at);
      const end = new Date(e.ends_at);
      expanded.push(e);
      if (!e.recurrence_rule || e.recurrence_rule === "none" || e.source !== "event") continue;
      let next = new Date(start);
      for (let i=0;i<400;i++) {
        if (e.recurrence_rule === "daily") next = plusDays(next,1);
        else if (e.recurrence_rule === "weekly") next = plusDays(next,7);
        else if (e.recurrence_rule === "monthly") { next = new Date(next); next.setMonth(next.getMonth()+1); }
        else if (e.recurrence_rule === "yearly") { next = new Date(next); next.setFullYear(next.getFullYear()+1); }
        else break;
        if (next >= windowEnd) break;
        if (next >= windowStart) {
          const shiftedEnd = new Date(next.getTime() + (end.getTime()-start.getTime()));
          expanded.push({ ...e, id: `${e.id}-${dayKey(next)}`, starts_at: next.toISOString(), ends_at: shiftedEnd.toISOString() });
        }
      }
    }
    return expanded.sort((a,b) => a.starts_at.localeCompare(b.starts_at));
  }, [events, meetings, cursor]);

  const saveEvent = async () => {
    if (!profileId) { toast.error("Votre profil interne est introuvable."); return; }
    if (kind === "meeting") { if (!title.trim()) { toast.error("Donnez un titre à la réunion."); return; } if (new Date(`${date}T${endTime}:00`) <= new Date(`${date}T${startTime}:00`)) { toast.error("L’heure de fin doit être après l’heure de début."); return; } onScheduleMeeting({ title: title.trim(), start: `${date}T${startTime}`, end: `${date}T${endTime}`, description: description.trim() }); setDialogOpen(false); return; }
    if (!title.trim()) { toast.error("Donnez un titre à l'événement."); return; }
    const starts = new Date(`${date}T${allDay ? "00:00" : startTime}:00`);
    const ends = allDay ? new Date(starts.getTime()+86400000) : new Date(`${date}T${endTime}:00`);
    if (ends <= starts) { toast.error("L'heure de fin doit être après l'heure de début."); return; }
    setSaving(true);
    const payload = {
      title: title.trim(), description: description.trim() || null, event_type: kind,
      visibility: "team", starts_at: starts.toISOString(), ends_at: ends.toISOString(),
      all_day: allDay, timezone: "Africa/Abidjan", location: location.trim() || null,
      status: "scheduled", created_by_profile_id: profileId,
      recurrence_rule: repeat, reminder_offset_minutes: reminder === "none" ? null : Number(reminder),
      alarm_enabled: alarm
    };
    const { data, error } = await (supabase as any).from("workspace_events").insert(payload).select("id").single();
    if (error || !data?.id) { console.error(error); toast.error("Événement non enregistré. Vérifiez vos droits d'accès."); setSaving(false); return; }
    if (reminder !== "none" && alarm) {
      const offsets: number[] = [];
      let occurrence = new Date(starts);
      for (let i=0;i<repeatOccurrences(repeat);i++) {
        if (i > 0) {
          if (repeat === "daily") occurrence = plusDays(occurrence,1);
          else if (repeat === "weekly") occurrence = plusDays(occurrence,7);
          else if (repeat === "monthly") { occurrence = new Date(occurrence); occurrence.setMonth(occurrence.getMonth()+1); }
          else if (repeat === "yearly") { occurrence = new Date(occurrence); occurrence.setFullYear(occurrence.getFullYear()+1); }
        }
        offsets.push(occurrence.getTime() - Number(reminder)*60000);
      }
      const rows = offsets.filter(t => t > Date.now()).map(t => ({ recipient_profile_id: profileId, event_id: data.id, remind_at: new Date(t).toISOString(), channel: "in_app", status: "pending", attempts: 0, reminder_offset_minutes: Number(reminder), created_by_profile_id: profileId }));
      if (rows.length) {
        const { error: reminderError } = await (supabase as any).from("workspace_reminders").insert(rows);
        if (reminderError) console.warn("Rappels non programmés", reminderError);
      }
    }
    toast.success("Événement ajouté à l'agenda.");
    setSaving(false); setDialogOpen(false); setTitle(""); setDescription(""); setLocation(""); setKind("appointment"); setRepeat("none"); setReminder("15"); setAlarm(true);
    await loadEvents();
  };

  const visibleDays = useMemo(() => {
    if (view === "day") return [startOfDay(cursor)];
    if (view === "week") return Array.from({length:7},(_,i)=>plusDays(startOfWeek(cursor),i));
    if (view === "month") {
      const first = new Date(cursor.getFullYear(),cursor.getMonth(),1);
      const start = startOfWeek(first);
      return Array.from({length:42},(_,i)=>plusDays(start,i));
    }
    return [];
  }, [view,cursor]);

  const eventsFor = (d: Date) => combined.filter(e => sameDay(new Date(e.starts_at),d));
  const navigate = (direction: number) => setCursor(old => {
    const d = new Date(old);
    if (view === "year") d.setFullYear(d.getFullYear()+direction);
    else if (view === "month") d.setMonth(d.getMonth()+direction);
    else if (view === "week") d.setDate(d.getDate()+7*direction);
    else d.setDate(d.getDate()+direction);
    return d;
  });
  const goToday = () => setCursor(new Date());
  const dateLabel = view === "year" ? String(cursor.getFullYear()) : view === "month" ? fr(cursor,{month:"long",year:"numeric"}) : view === "week" ? `Semaine du ${fr(startOfWeek(cursor),{day:"numeric",month:"short"})}` : fr(cursor,{weekday:"long",day:"numeric",month:"long",year:"numeric"});

  return <div className="space-y-4">
    <Card>
      <CardHeader className="flex flex-col gap-3 space-y-0 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <div className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-primary"/><div><CardTitle className="text-base capitalize">Agenda unifié</CardTitle><p className="text-xs text-muted-foreground">Réunions, rendez-vous, échéances et rappels au même endroit</p></div></div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={goToday}>Aujourd'hui</Button>
          <Button variant="outline" size="icon" onClick={() => navigate(-1)} aria-label="Période précédente"><ChevronLeft className="h-4 w-4"/></Button>
          <Button variant="outline" size="icon" onClick={() => navigate(1)} aria-label="Période suivante"><ChevronRight className="h-4 w-4"/></Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus className="mr-1 h-4 w-4"/>Ajouter</Button></DialogTrigger>
            <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
              <DialogHeader><DialogTitle>Ajouter à l'agenda</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1"><Label>Type</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={kind} onChange={e=>setKind(e.target.value)}><option value="appointment">Rendez-vous</option><option value="meeting">Réunion (formulaire de réunion)</option><option value="field_visit">Visite terrain</option><option value="training">Formation</option><option value="travel">Déplacement</option><option value="task">Échéance / tâche</option><option value="other">Autre événement</option></select></div>
                  <div className="space-y-1"><Label>Date</Label><Input type="date" value={date} onChange={e=>setDate(e.target.value)}/></div>
                </div>
                <div className="space-y-1"><Label>Titre *</Label><Input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Ex. Réunion de coordination"/></div>
                <div className="grid grid-cols-2 gap-2"><div className="space-y-1"><Label>Début</Label><Input type="time" value={startTime} disabled={allDay} onChange={e=>setStartTime(e.target.value)}/></div><div className="space-y-1"><Label>Fin</Label><Input type="time" value={endTime} disabled={allDay} onChange={e=>setEndTime(e.target.value)}/></div></div>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={allDay} onChange={e=>setAllDay(e.target.checked)}/>Toute la journée</label>
                <div className="space-y-1"><Label>Lieu</Label><Input value={location} onChange={e=>setLocation(e.target.value)} placeholder="Lieu ou lien de réunion"/></div>
                <div className="space-y-1"><Label>Description / notes</Label><Textarea value={description} onChange={e=>setDescription(e.target.value)} rows={3}/></div>
                <div className="grid grid-cols-2 gap-2"><div className="space-y-1"><Label>Répétition</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={repeat} onChange={e=>setRepeat(e.target.value)}><option value="none">Jamais</option><option value="daily">Chaque jour</option><option value="weekly">Chaque semaine</option><option value="monthly">Chaque mois</option><option value="yearly">Chaque année</option></select></div><div className="space-y-1"><Label>Rappel avant</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={reminder} onChange={e=>setReminder(e.target.value)}><option value="none">Aucun</option><option value="0">À l'heure prévue</option><option value="5">5 minutes</option><option value="15">15 minutes</option><option value="30">30 minutes</option><option value="60">1 heure</option><option value="1440">1 jour</option><option value="4320">3 jours</option></select></div></div>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={alarm} onChange={e=>setAlarm(e.target.checked)}/><Bell className="h-4 w-4"/>Activer le rappel dans le CRM</label>
                <Button className="w-full" disabled={saving} onClick={()=>void saveEvent()}>{saving ? "Enregistrement…" : "Enregistrer l'événement"}</Button>
              </div>
            </DialogContent>
          </Dialog>
          <Button variant="outline" size="sm" onClick={()=>void loadEvents()} aria-label="Actualiser"><RefreshCw className="mr-1 h-4 w-4"/>Actualiser</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold capitalize">{dateLabel}</h3><div className="flex flex-wrap gap-1">{(["year","month","week","day"] as ViewMode[]).map(v=><Button key={v} size="sm" variant={view===v?"default":"outline"} onClick={()=>setView(v)}>{({year:"Année",month:"Mois",week:"Semaine",day:"Jour"} as Record<ViewMode,string>)[v]}</Button>)}</div></div>
        {loading ? <div className="flex items-center justify-center py-12 text-sm text-muted-foreground"><RefreshCw className="mr-2 h-4 w-4 animate-spin"/>Chargement du calendrier…</div> : view === "year" ? <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{Array.from({length:12},(_,m)=>{const month=new Date(cursor.getFullYear(),m,1);const monthEvents=combined.filter(e=>{const d=new Date(e.starts_at);return d.getFullYear()===month.getFullYear()&&d.getMonth()===m});return <button type="button" key={m} onClick={()=>{setCursor(month);setView("month")}} className="rounded-lg border p-3 text-left hover:bg-muted/50"><div className="mb-2 font-semibold capitalize">{fr(month,{month:"long"})}</div><div className="grid grid-cols-7 gap-1 text-center text-[10px] text-muted-foreground">{["L","M","M","J","V","S","D"].map((x,i)=><span key={i}>{x}</span>)}{Array.from({length:new Date(month.getFullYear(),m,1).getDay()===0?6:new Date(month.getFullYear(),m,1).getDay()-1},(_,i)=><span key={"b"+i}/>)}{Array.from({length:new Date(month.getFullYear(),m+1,0).getDate()},(_,i)=>{const d=new Date(month.getFullYear(),m,i+1);return <span key={i} className={monthEvents.some(e=>sameDay(new Date(e.starts_at),d))?"rounded bg-primary/15 font-bold text-primary":""}>{i+1}</span>})}</div></button>})}</div> : view === "month" ? <div className="grid grid-cols-7 overflow-hidden rounded-lg border"><div className="col-span-7 grid grid-cols-7 bg-muted/50">{["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"].map(d=><div key={d} className="border-b p-1 text-center text-[10px] font-medium sm:p-2 sm:text-xs">{d}</div>)}</div>{visibleDays.map(d=>{const items=eventsFor(d);const inMonth=d.getMonth()===cursor.getMonth();return <button key={dayKey(d)} type="button" onClick={()=>{setCursor(d);setView("day")}} className={`min-h-20 border-b border-r p-1 text-left hover:bg-muted/40 sm:min-h-28 sm:p-2 ${inMonth?"":"bg-muted/20 text-muted-foreground"} ${sameDay(d,new Date())?"ring-1 ring-inset ring-primary":""}`}><span className={`text-xs ${sameDay(d,cursor)?"inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold":""}`}>{d.getDate()}</span><div className="mt-1 space-y-1">{items.slice(0,3).map(e=><div key={e.id} className={`truncate rounded border-l-2 px-1 py-0.5 text-[9px] sm:text-[11px] ${eventColor(e.event_type)}`}>{e.source==="meeting"?"Réunion · ":""}{e.title}</div>)}{items.length>3&&<div className="text-[9px] text-muted-foreground">+{items.length-3} autres</div>}</div></button>})}</div> : <div className={view==="week"?"grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-7":"space-y-2"}>{visibleDays.map(d=>{const items=eventsFor(d);return <div key={dayKey(d)} className="min-w-0 rounded-lg border"><button className="flex w-full items-center justify-between rounded-t-lg bg-muted/40 px-3 py-2 text-left" onClick={()=>{setCursor(d);setView("day")}}><span className="font-medium capitalize">{fr(d,{weekday:"short",day:"numeric",month:"short"})}</span><span className="text-xs text-muted-foreground">{items.length} élément(s)</span></button><div className="space-y-2 p-2">{items.length?items.map(e=><div key={e.id} className={`rounded-md border-l-4 p-2 text-sm ${eventColor(e.event_type)}`}><div className="flex items-start gap-2"><div className="min-w-0 flex-1"><div className="font-medium">{e.title}</div><div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs opacity-80"><span><Clock3 className="mr-1 inline h-3 w-3"/>{e.all_day?"Toute la journée":fr(new Date(e.starts_at),{hour:"2-digit",minute:"2-digit"})+" – "+fr(new Date(e.ends_at),{hour:"2-digit",minute:"2-digit"})}</span>{e.location&&<span><MapPin className="mr-1 inline h-3 w-3"/>{e.location}</span>}{e.source==="meeting"&&<span><Video className="mr-1 inline h-3 w-3"/>Réunion</span>}</div>{e.description&&<p className="mt-1 line-clamp-2 text-xs opacity-80">{e.description}</p>}</div></div></div>):<p className="py-3 text-center text-xs text-muted-foreground">Aucun événement</p>}</div></div>})}</div>}
        <div className="flex flex-wrap gap-3 border-t pt-3 text-xs text-muted-foreground"><span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-sky-500"/>Événements</span><span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-violet-500"/>Réunions</span><span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-500"/>Tâches et échéances</span></div>
        {combined.length===0&&<p className="text-center text-sm text-muted-foreground">Votre agenda est vide pour le moment. Ajoutez un événement ou planifiez une réunion.</p>}
      </CardContent>
    </Card>
  </div>;
}

function repeatOccurrences(rule: string) { return rule === "none" ? 1 : rule === "daily" ? 30 : rule === "weekly" ? 16 : rule === "monthly" ? 12 : rule === "yearly" ? 3 : 1; }
