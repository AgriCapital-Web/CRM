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
  const { toast } = useToast(); const [description, setDescription] = useState(""); const [loading, setLoading] = useState(false); const [listening, setListening] = useState(false); const [cr, setCr] = useState<CR | null>(null); const recognitionRef = useRef<any>(null); const listeningRef = useRef(false); const voiceBaseRef = useRef(""); const finalTranscriptRef = useRef(""); const segmentBaseRef = useRef(""); const restartTimerRef = useRef<number | null>(null);
  const releaseMicrophone = () => {
    if (restartTimerRef.current !== null) { window.clearTimeout(restartTimerRef.current); restartTimerRef.current = null; }
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) {
      recognition.onend = null;
      recognition.onerror = null;
      recognition.onresult = null;
      try { recognition.abort(); } catch { try { recognition.stop(); } catch { /* already stopped */ } }
    }
  };
  useEffect(() => () => { listeningRef.current = false; releaseMicrophone(); }, []);
  const toggleVoice = async () => {
    if (listeningRef.current) {
      listeningRef.current = false;
      setListening(false);
      const activeRecognition = recognitionRef.current;
      // Stop gracefully so the browser can flush the last recognized words.
      try { activeRecognition?.stop(); } catch { /* recognition may already have ended */ }
      setDescription([voiceBaseRef.current, finalTranscriptRef.current].filter(Boolean).join(" ").trim());
      return;
    }
    const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) { toast({ variant: "destructive", title: "Saisie vocale indisponible", description: "Ce navigateur ne prend pas en charge la dictée vocale. Utilisez le clavier." }); return; }
    try {
      voiceBaseRef.current = description.trim();
      finalTranscriptRef.current = "";
      segmentBaseRef.current = "";
      // SpeechRecognition owns microphone capture. Do not open a second getUserMedia
      // stream in parallel: it is unused for recognition and can cause duplicate mic
      // indicators/audio-session churn on mobile.
      const recognition = new SpeechRecognitionCtor();
      recognition.lang = "fr-FR";
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      let segmentFinalResults: string[] = [];
      let lastInterim = "";
      let restartAttempts = 0;
      let restartPending = false;
      const renderTranscript = () => {
        const finalText = [segmentBaseRef.current, ...segmentFinalResults].filter(Boolean).join(" ").trim();
        finalTranscriptRef.current = finalText;
        setDescription([voiceBaseRef.current, finalText, lastInterim].filter(Boolean).join(" ").trim());
      };
      recognition.onresult = (event: any) => {
        // Snapshot final segments once; interim hypotheses are replaced, never appended repeatedly.
        for (let i = event.resultIndex ?? 0; i < event.results.length; i++) {
          const result = event.results[i];
          const part = String(result?.[0]?.transcript || "").trim();
          if (!part) continue;
          if (result.isFinal) {
            if (part && segmentFinalResults[segmentFinalResults.length - 1] !== part) segmentFinalResults.push(part);
            lastInterim = "";
          } else {
            lastInterim = part;
          }
        }
        renderTranscript();
      };
      recognition.onerror = (event: any) => {
        // Mobile speech engines frequently end a segment after silence or transient network errors.
        // Keep the session armed and do not change the button to "start" until the user stops it.
        if (event?.error === "not-allowed" || event?.error === "service-not-allowed" || event?.error === "audio-capture") {
          listeningRef.current = false;
          setListening(false);
          releaseMicrophone();
          toast({ variant: "destructive", title: "Accès au microphone refusé", description: "Vérifiez l’autorisation du microphone dans le navigateur puis relancez la dictée." });
        }
      };
      recognition.onend = () => {
        if (!listeningRef.current || recognitionRef.current !== recognition) {
          if (recognitionRef.current === recognition) releaseMicrophone();
          return;
        }
        if (restartPending) return;
        segmentBaseRef.current = [segmentBaseRef.current, ...segmentFinalResults].filter(Boolean).join(" ").trim();
        segmentFinalResults = [];
        // Preserve the latest interim hypothesis while the engine rolls to a new segment.
        renderTranscript();
        restartPending = true;
        const scheduleRestart = (delay: number) => {
          if (restartTimerRef.current !== null) window.clearTimeout(restartTimerRef.current);
          restartTimerRef.current = window.setTimeout(() => {
            restartTimerRef.current = null;
            if (!listeningRef.current || recognitionRef.current !== recognition) { restartPending = false; return; }
            try {
              recognition.start();
              restartPending = false;
              restartAttempts = 0;
            } catch {
              restartAttempts += 1;
              if (restartAttempts <= 20 && listeningRef.current) scheduleRestart(Math.min(1800, 250 + restartAttempts * 100));
              else restartPending = false;
            }
          }, delay);
        };
        scheduleRestart(500);
      };
      recognitionRef.current = recognition;
      listeningRef.current = true;
      setListening(true);
      recognition.start();
    } catch (error: any) {
      listeningRef.current = false;
      setListening(false);
      releaseMicrophone();
      toast({ variant: "destructive", title: "Microphone inaccessible", description: error?.message || "Autorisez l’accès au microphone puis réessayez." });
    }
  };
  const generer = async () => {
    if (description.trim().length < 10) { toast({ variant: "destructive", title: "Description trop courte", description: "Décrivez un peu plus la visite avant de générer le compte rendu." }); return; }
    setLoading(true);
    try {
      if (!navigator.onLine) throw new Error("offline-ai");
      // A network fetch is not a reliable connection test on mobile; refresh the session first.
      let { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      let session = sessionData.session;
      if (session?.refresh_token) {
        const refreshed = await supabase.auth.refreshSession();
        if (refreshed.data.session) session = refreshed.data.session;
      }
      if (sessionError || !session?.access_token) {
        throw new Error("offline-ai");
      }
      const { data, error } = await supabase.functions.invoke("compte-rendu-intervention", {
        body: { description: description.trim(), contexte },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error) {
        let msg = error.message;
        try { msg = (await (error as any).context?.json())?.error || msg; } catch { /* ignore */ }
        if (/connexion requise|jwt|token|network|failed to fetch|fetch failed|load failed|connection/i.test(String(msg))) {
          throw new Error("Connexion au service de compte rendu indisponible. Le texte reste conservé : réessayez lorsque la connexion revient.");
        }
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);
      if (!data?.compte_rendu) throw new Error("La réponse IA ne contient pas de compte rendu exploitable.");
      setCr(data.compte_rendu as CR); toast({ title: "Compte rendu structuré", description: "Vérifiez le contenu puis appliquez-le au rapport." });
    } catch (e: any) {
      // Never discard the dictated text. Provide a usable structured draft when AI auth/network is unavailable.
      const source = description.trim();
      const sentences = source.split(/(?<=[.!?])\\s+|\\n+/).map((x) => x.trim()).filter(Boolean);
      const fallback: CR = {
        titre: contexte?.toLowerCase().includes("intervention") ? "Compte rendu d’intervention" : "Compte rendu de visite technique",
        type_intervention: contexte || "",
        resume: source,
        actions_realisees: sentences.slice(0, 5),
        observations: source,
        problemes_constates: [],
        recommandations: [],
        nombre_plants_realises: null,
        informations_manquantes: ["Validation par l’IA en ligne à effectuer lorsque la connexion sera disponible."],
        complet: false,
      };
      setCr(fallback);
      toast({ title: "Compte rendu préparé localement", description: "Votre texte est conservé et structuré en brouillon. La validation IA sera disponible au retour de la connexion." });
    }
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
