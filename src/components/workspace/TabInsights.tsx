import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/**
 * Bandeau d'indicateurs d'un onglet AgriCapital 360.
 * Les données sont lues avec les droits de l'utilisateur connecté :
 * chacun ne voit donc que les chiffres de son rôle et de son périmètre.
 */
export type InsightMode = "messages" | "organisation" | "rh" | "budgets" | "decisions";
type Tone = "good" | "warn" | "bad" | "neutral";
type Kpi = { label: string; value: string | number; tone: Tone; hint?: string };
type Point = { label: string; value: number; tone?: Tone };

const BORDER: Record<Tone, string> = { good: "border-l-primary", warn: "border-l-accent", bad: "border-l-destructive", neutral: "border-l-muted-foreground/40" };
const FILL: Record<Tone, string> = { good: "hsl(var(--primary))", warn: "hsl(var(--accent))", bad: "hsl(var(--destructive))", neutral: "hsl(var(--muted-foreground))" };
const money = (n: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n) + " F";
const rows = async (q: any) => { const { data, error } = await q; return error ? [] : (data || []) as any[]; };
const sum = (list: any[], k: string) => list.reduce((s, r) => s + Number(r[k] || 0), 0);
const countBy = (list: any[], k: string) => list.reduce<Record<string, number>>((m, r) => { m[r[k]] = (m[r[k]] || 0) + 1; return m; }, {});

async function compute(mode: InsightMode): Promise<{ kpis: Kpi[]; chartTitle: string; chart: Point[] }> {
  const sb = supabase as any;
  if (mode === "messages") {
    const since = new Date(Date.now() - 6 * 86400000); since.setHours(0, 0, 0, 0);
    const [conv, msgs] = await Promise.all([
      rows(sb.from("internal_conversations").select("id,conversation_type").limit(1000)),
      rows(sb.from("internal_messages").select("created_at").gte("created_at", since.toISOString()).limit(5000)),
    ]);
    const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(since); d.setDate(d.getDate() + i); return d; });
    const chart = days.map(d => ({ label: new Intl.DateTimeFormat("fr-FR", { weekday: "short" }).format(d), value: msgs.filter(m => new Date(m.created_at).toDateString() === d.toDateString()).length }));
    const today = chart[6].value;
    return {
      kpis: [
        { label: "Conversations", value: conv.length, tone: "neutral" },
        { label: "Groupes et canaux", value: conv.filter(c => c.conversation_type !== "direct").length, tone: "neutral" },
        { label: "Messages (7 jours)", value: msgs.length, tone: msgs.length ? "good" : "warn", hint: msgs.length ? undefined : "Aucun échange récent" },
        { label: "Messages aujourd'hui", value: today, tone: "neutral" },
      ],
      chartTitle: "Messages échangés sur 7 jours", chart,
    };
  }
  if (mode === "organisation") {
    const [people, jobs, assign] = await Promise.all([
      rows(sb.from("profiles").select("id,poste").eq("actif", true).limit(2000)),
      rows(sb.from("workspace_job_descriptions").select("id,status,department").limit(1000)),
      rows(sb.from("workspace_job_assignments").select("profile_id").limit(2000)),
    ]);
    const assigned = new Set(assign.map(a => a.profile_id)).size;
    const missing = Math.max(people.length - assigned, 0);
    const byDept = countBy(jobs.filter(j => j.department), "department");
    return {
      kpis: [
        { label: "Collaborateurs actifs", value: people.length, tone: "neutral" },
        { label: "Fiches de poste publiées", value: jobs.filter(j => j.status === "published").length, tone: "good" },
        { label: "Fiches en brouillon", value: jobs.filter(j => j.status === "draft").length, tone: jobs.some(j => j.status === "draft") ? "warn" : "good" },
        { label: "Sans fiche de poste", value: missing, tone: missing ? "bad" : "good", hint: missing ? "À affecter" : "Tous affectés" },
      ],
      chartTitle: "Fiches de poste par département",
      chart: Object.entries(byDept).map(([label, value]) => ({ label, value })),
    };
  }
  if (mode === "rh") {
    const [leaves, objs] = await Promise.all([
      rows(sb.from("workspace_leave_requests").select("status").limit(2000)),
      rows(sb.from("workspace_objectives").select("status,due_on").limit(2000)),
    ]);
    const now = new Date().toISOString().slice(0, 10);
    const late = objs.filter(o => o.due_on && o.due_on < now && !["completed", "cancelled"].includes(o.status)).length;
    const atRisk = objs.filter(o => o.status === "at_risk").length;
    const pending = leaves.filter(l => l.status === "pending").length;
    return {
      kpis: [
        { label: "Congés en attente", value: pending, tone: pending ? "warn" : "good", hint: pending ? "À valider" : "Rien en attente" },
        { label: "Objectifs actifs", value: objs.filter(o => o.status === "active").length, tone: "neutral" },
        { label: "Objectifs à risque", value: atRisk, tone: atRisk ? "warn" : "good" },
        { label: "Objectifs en retard", value: late, tone: late ? "bad" : "good" },
      ],
      chartTitle: "Objectifs par état",
      chart: [
        { label: "Actifs", value: objs.filter(o => o.status === "active").length, tone: "neutral" },
        { label: "À risque", value: atRisk, tone: "warn" },
        { label: "En retard", value: late, tone: "bad" },
        { label: "Atteints", value: objs.filter(o => o.status === "completed").length, tone: "good" },
      ],
    };
  }
  if (mode === "budgets") {
    const [budgets, actions] = await Promise.all([
      rows(sb.from("department_budgets").select("department,budget_initial,budget_revised,actual_amount,committed_amount").limit(2000)),
      rows(sb.from("strategic_actions").select("status").limit(2000)),
    ]);
    const planned = budgets.reduce((s, b) => s + Number(b.budget_revised || b.budget_initial || 0), 0);
    const spent = sum(budgets, "actual_amount") + sum(budgets, "committed_amount");
    const rate = planned ? Math.round((spent / planned) * 100) : 0;
    const byDept: Record<string, { p: number; s: number }> = {};
    budgets.forEach(b => { const d = (byDept[b.department] ||= { p: 0, s: 0 }); d.p += Number(b.budget_revised || b.budget_initial || 0); d.s += Number(b.actual_amount || 0) + Number(b.committed_amount || 0); });
    const atRisk = actions.filter(a => a.status === "at_risk").length;
    return {
      kpis: [
        { label: "Budget prévu", value: money(planned), tone: "neutral" },
        { label: "Engagé et dépensé", value: money(spent), tone: "neutral" },
        { label: "Taux de consommation", value: rate + " %", tone: rate > 100 ? "bad" : rate > 85 ? "warn" : "good", hint: rate > 100 ? "Dépassement" : rate > 85 ? "Proche de la limite" : "Sous contrôle" },
        { label: "Actions à risque", value: atRisk, tone: atRisk ? "bad" : "good" },
      ],
      chartTitle: "Consommation par département (%)",
      chart: Object.entries(byDept).map(([label, d]) => { const v = d.p ? Math.round((d.s / d.p) * 100) : 0; return { label, value: v, tone: (v > 100 ? "bad" : v > 85 ? "warn" : "good") as Tone }; }),
    };
  }
  const props = await rows(sb.from("decision_proposals").select("status,amount").limit(2000));
  const waiting = props.filter(p => ["proposed", "in_review"].includes(p.status));
  return {
    kpis: [
      { label: "Propositions en attente", value: waiting.length, tone: waiting.length ? "warn" : "good", hint: waiting.length ? "Décision attendue" : "Rien en attente" },
      { label: "Montant en attente", value: money(sum(waiting, "amount")), tone: "neutral" },
      { label: "Approuvées", value: props.filter(p => ["approved", "executed"].includes(p.status)).length, tone: "good" },
      { label: "Refusées", value: props.filter(p => p.status === "rejected").length, tone: "neutral" },
    ],
    chartTitle: "Propositions par état",
    chart: [
      { label: "Brouillon", value: props.filter(p => p.status === "draft").length, tone: "neutral" },
      { label: "En attente", value: waiting.length, tone: "warn" },
      { label: "Approuvées", value: props.filter(p => ["approved", "executed", "closed"].includes(p.status)).length, tone: "good" },
      { label: "Refusées", value: props.filter(p => p.status === "rejected").length, tone: "bad" },
    ],
  };
}

export default function TabInsights({ mode }: { mode: InsightMode }) {
  const [state, setState] = useState<Awaited<ReturnType<typeof compute>> | null>(null);
  useEffect(() => { let alive = true; void compute(mode).then(r => alive && setState(r)).catch(() => alive && setState(null)); return () => { alive = false; }; }, [mode]);
  if (!state) return null;
  return (
    <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-4">
        {state.kpis.map(k => (
          <Card key={k.label} className={`border-l-4 ${BORDER[k.tone]}`}>
            <CardContent className="p-3">
              <p className="truncate text-xs text-muted-foreground">{k.label}</p>
              <p className="whitespace-nowrap text-xl font-bold tabular-nums">{k.value}</p>
              {k.hint && <p className="truncate text-[11px] text-muted-foreground">{k.hint}</p>}
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="p-3">
          <p className="mb-1 text-xs font-medium text-muted-foreground">{state.chartTitle}</p>
          {state.chart.length && state.chart.some(p => p.value) ? (
            <div className="h-32">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={state.chart}>
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} interval={0} />
                  <YAxis allowDecimals={false} width={28} tickLine={false} axisLine={false} fontSize={11} />
                  <Tooltip formatter={(v: number) => [v, ""]} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {state.chart.map((p, i) => <Cell key={i} fill={FILL[p.tone || "good"]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <p className="py-10 text-center text-xs text-muted-foreground">Pas encore de données à afficher.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
