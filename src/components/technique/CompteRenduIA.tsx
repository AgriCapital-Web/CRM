import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, AlertTriangle, CheckCircle2, Copy, Loader2, Mic, MicOff, FileCheck2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
type CR = { titre: string; type_intervention: string; resume: string; actions_realisees: string[]; observations: string; problemes_constates: string[]; recommandations: string[]; nombre_plants_realises: number | null; informations_manquantes: string[]; complet: boolean; };
type Props = { contexte?: string; compact?: boolean; onApply?: (compteRendu: CR, description: string) => void; };
const List = ({ title, items }: { title: string; items: string[] }) => items?.length ? <div><p className="text-sm font-semibold">{title}</p><ul className="ml-5 list-disc text-sm">{items.map((x, i) => <li key={i}>{x}</li>)}</ul></div> : null;
export default function CompteRenduIA({ contexte, compact = false, onApply }: Props) {
  const { toast } = useToast(); const [description, setDescription] = useState(""); const [loading, setLoading] = useState(false); const [listening, setListening] = useState(false); const [cr, setCr] = useState<CR | null>(null); const recognitionRef = useRef<any>(null);
  useEffect(() => () => { try { recognitionRef.current?.stop(); } catch { /* already stopped */ } }, []);
  const toggleVoice = () => {
    if (listening) { recognitionRef.current?.stop(); setListening(false); return; }
    const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) { toast({ variant: "destructive", title: "Saisie vocale indisponible", description: "Ce navigateur ne prend pas en charge la dictée vocale. Utilisez le clavier." }); return; }
    try {
      const recognition = new SpeechRecognitionCtor(); recognition.lang = "fr-FR"; recognition.continuous = false; recognition.interimResults = false;
      recognition.onresult = (event: any) => { const transcript = Array.from(event.results || []).map((result: any) => result?.[0]?.transcript || "").join(" ").trim(); if (transcript) setDescription(previous => [previous.trim(), transcript].filter(Boolean).join(" ")); };
      recognition.onerror = () => { setListening(false); toast({ variant: "destructive", title: "Dictée interrompue", description: "Vérifiez l’autorisation du microphone puis réessayez." }); };
      recognition.onend = () => setListening(false); recognitionRef.current = recognition; recognition.start(); setListening(true);
    } catch (error: any) { setListening(false); toast({ variant: "destructive", title: "Microphone inaccessible", description: error?.message || "Impossible de démarrer la dictée." }); }
  };
  const generer = async () => {
    if (description.trim().length < 10) { toast({ variant: "destructive", title: "Description trop courte", description: "Décrivez un peu plus la visite avant de générer le compte rendu." }); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("compte-rendu-intervention", { body: { description: description.trim(), contexte } });
      if (error) { let msg = error.message; try { msg = (await (error as any).context?.json())?.error || msg; } catch { /* ignore */ } throw new Error(msg); }
      if (data?.error) throw new Error(data.error); if (!data?.compte_rendu) throw new Error("La réponse IA ne contient pas de compte rendu exploitable.");
      setCr(data.compte_rendu as CR); toast({ title: "Compte rendu structuré", description: "Vérifiez le contenu puis appliquez-le au rapport." });
    } catch (e: any) { toast({ variant: "destructive", title: "Compte rendu impossible", description: e?.message || "Erreur" }); }
    finally { setLoading(false); }
  };
  const texte = cr ? [cr.titre, cr.type_intervention ? `Type : ${cr.type_intervention}` : "", "", cr.resume, (cr.actions_realisees || []).length ? "Actions réalisées :\n- " + cr.actions_realisees.join("\n- ") : "", cr.observations ? `Observations : ${cr.observations}` : "", (cr.problemes_constates || []).length ? "Problèmes constatés :\n- " + cr.problemes_constates.join("\n- ") : "", (cr.recommandations || []).length ? "Recommandations :\n- " + cr.recommandations.join("\n- ") : "", cr.nombre_plants_realises != null ? `Plants réalisés : ${cr.nombre_plants_realises}` : ""].filter(Boolean).join("\n") : "";
  const content = <div className={compact ? "space-y-2" : "space-y-3"}>
    <Textarea rows={compact ? 2 : 5} value={description} onChange={e => setDescription(e.target.value)} placeholder="Décrivez librement la visite : travaux, état de la plantation, problèmes, actions et suite à donner… Vous pouvez aussi dicter." />
    <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" onClick={toggleVoice} className="h-8">{listening ? <MicOff className="mr-1.5 h-4 w-4" /> : <Mic className="mr-1.5 h-4 w-4" />}{listening ? "Arrêter la dictée" : "Saisie vocale"}</Button><Button type="button" size="sm" onClick={generer} disabled={loading || description.trim().length < 10} className="h-8">{loading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}{loading ? "Analyse IA…" : "Analyser et structurer"}</Button></div>
    {cr && <div className={compact ? "space-y-2 rounded-md border p-2" : "space-y-3 rounded-lg border p-4"}><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold text-sm">{cr.titre}</h3>{cr.complet ? <Badge className="gap-1"><CheckCircle2 className="h-3 w-3" />Complet</Badge> : <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />À compléter</Badge>}</div><p className="text-sm">{cr.resume}</p>
      {!compact && <><List title="Actions réalisées" items={cr.actions_realisees || []} />{cr.observations && <p className="text-sm"><span className="font-semibold">Observations : </span>{cr.observations}</p>}<List title="Problèmes constatés" items={cr.problemes_constates || []} /><List title="Recommandations" items={cr.recommandations || []} />{(cr.informations_manquantes || []).length > 0 && <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3"><p className="flex items-center gap-1 text-sm font-semibold text-destructive"><AlertTriangle className="h-4 w-4" />Informations manquantes</p><ul className="ml-5 list-disc text-sm">{cr.informations_manquantes.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}</>}
      <div className="flex flex-wrap gap-2">{onApply && <Button type="button" size="sm" onClick={() => onApply(cr, description)}><FileCheck2 className="mr-1.5 h-4 w-4" />Appliquer au rapport</Button>}<Button type="button" variant="outline" size="sm" onClick={() => { void navigator.clipboard.writeText(texte); toast({ title: "Compte rendu copié" }); }}><Copy className="mr-1.5 h-4 w-4" />Copier</Button></div>
    </div>}
  </div>;
  if (compact) return <div className="rounded-lg border border-primary/25 bg-primary/[0.025] p-3 technique-ai-compact"><div className="mb-2 flex items-center gap-2 font-semibold text-sm"><Sparkles className="h-4 w-4 text-primary" />Compte rendu assisté par IA</div>{content}</div>;
  return <Card><CardHeader><CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" />Compte rendu assisté par IA</CardTitle></CardHeader><CardContent>{content}</CardContent></Card>;
}
