import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import InternalCallRoom from "@/components/workspace/InternalCallRoom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CalendarDays, Loader2, ShieldCheck, Video } from "lucide-react";

type GuestMeeting = { meeting_id: string; meeting_title: string; starts_at: string; ends_at: string; join_url: string | null; provider_room_id: string | null; invitee_name: string | null };

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export default function ExternalMeetingGuest() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [meeting, setMeeting] = useState<GuestMeeting | null>(null);
  const [tokenHash, setTokenHash] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [inCall, setInCall] = useState(false);

  useEffect(() => {
    let active = true;
    const redeem = async () => {
      if (!token || token.length < 40 || token.length > 160) {
        setError("Ce lien d’invitation est incomplet ou invalide.");
        setLoading(false);
        return;
      }
      try {
        const hash = await sha256(token);
        const { data, error: redeemError } = await (supabase as any).rpc("workspace_redeem_external_meeting_invite", { p_token_hash: hash });
        if (redeemError) throw redeemError;
        const row = Array.isArray(data) ? data[0] : data;
        if (!row) throw new Error("Lien expiré, révoqué ou déjà utilisé au maximum autorisé.");
        if (active) { setMeeting(row as GuestMeeting); setTokenHash(hash); }
      } catch (e: any) {
        if (active) setError(e?.message || "Impossible de vérifier cette invitation.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void redeem();
    return () => { active = false; };
  }, [token]);

  const date = (value: string) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeStyle: "short" }).format(new Date(value));

  return <main className="min-h-[100dvh] bg-muted/30 px-3 py-8 sm:px-6">
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <header className="flex items-center gap-3"><div className="rounded-xl bg-primary/10 p-3"><Video className="h-6 w-6 text-primary" /></div><div className="min-w-0"><h1 className="text-xl font-bold sm:text-2xl">Rejoindre une réunion AgriCapital</h1><p className="text-sm text-muted-foreground">Accès invité sécurisé · aucune création de compte nécessaire</p></div></header>
      {loading ? <Card><CardContent className="flex items-center justify-center gap-2 p-8 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Vérification du lien sécurisé…</CardContent></Card>
      : error ? <Card><CardHeader><CardTitle>Invitation indisponible</CardTitle></CardHeader><CardContent><p className="text-sm text-destructive">{error}</p><p className="mt-2 text-xs text-muted-foreground">Demandez à l’organisateur de créer un nouveau lien si nécessaire.</p></CardContent></Card>
      : meeting && <Card><CardHeader><div className="flex items-start gap-2"><ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-primary"/><div className="min-w-0"><CardTitle className="break-words">{meeting.meeting_title}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{meeting.invitee_name ? `Bienvenue, ${meeting.invitee_name}` : "Vous êtes invité à participer."}</p></div></div></CardHeader><CardContent className="space-y-4"><div className="rounded-lg bg-muted/50 p-3"><p className="flex items-start gap-2 text-sm"><CalendarDays className="mt-0.5 h-4 w-4 shrink-0"/><span>{date(meeting.starts_at)} — {new Intl.DateTimeFormat("fr-FR", { timeStyle: "short" }).format(new Date(meeting.ends_at))}</span></p></div>
      {inCall && meeting.provider_room_id ? <InternalCallRoom roomId={meeting.provider_room_id} profileId={`guest-${tokenHash.slice(0, 24)}`} onClose={() => setInCall(false)} />
      : <div className="space-y-3"><p className="text-sm text-muted-foreground">Autorisez l’accès au micro et à la caméra lorsque le navigateur le demande. Pour une connexion fiable, utilisez un navigateur récent et une connexion stable.</p><Button className="w-full sm:w-auto" onClick={() => setInCall(true)} disabled={!meeting.provider_room_id}><Video className="mr-2 h-4 w-4"/>Rejoindre l’appel audio/vidéo</Button>{meeting.join_url && <a className="block break-all text-sm underline" href={meeting.join_url} rel="noreferrer">Ouvrir le lien de réunion externe</a>}</div>}</CardContent></Card>}
      <p className="text-center text-xs text-muted-foreground">Le lien est limité dans le temps. Ne le transférez pas à une personne non invitée.</p>
    </div>
  </main>;
}
