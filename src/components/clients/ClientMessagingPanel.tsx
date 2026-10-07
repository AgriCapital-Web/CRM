import { useCallback, useEffect, useRef, useState } from "react";
import { MessageSquare, Send, Loader2, Headphones, Paperclip, FileText, Image as ImageIcon, Video, X, Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

const BUCKET = "portail-messages";
const MAX_FILE_SIZE = 50 * 1024 * 1024;

async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size < 700 * 1024) return file;
  const bitmap = await createImageBitmap(file);
  const maxSide = 2400;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.88));
  if (!blob) return file;
  return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".webp", { type: "image/webp", lastModified: Date.now() });
}

async function optimizeVideo(file: File): Promise<File> {
  if (!file.type.startsWith("video/") || file.size < 8 * 1024 * 1024 || typeof MediaRecorder === "undefined") return file;
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.src = URL.createObjectURL(file);
    await new Promise<void>((resolve, reject) => { video.onloadedmetadata = () => resolve(); video.onerror = () => reject(new Error("Vidéo illisible")); });
    const canvas = document.createElement("canvas");
    const maxSide = 1280;
    const scale = Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const stream = canvas.captureStream(30);
    const audio = (video as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream?.();
    audio?.getAudioTracks().forEach((track) => stream.addTrack(track));
    const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus") ? "video/webm;codecs=vp9,opus" : "video/webm";
    const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2_500_000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const finished = new Promise<Blob>((resolve) => { recorder.onstop = () => resolve(new Blob(chunks, { type: mime })); });
    await video.play();
    recorder.start(250);
    const draw = () => { if (video.ended || video.paused) { recorder.stop(); return; } canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height); requestAnimationFrame(draw); };
    draw();
    const blob = await finished;
    video.pause(); URL.revokeObjectURL(video.src);
    return blob.size < file.size ? new File([blob], file.name.replace(/\.[^.]+$/, "") + ".webm", { type: "video/webm", lastModified: Date.now() }) : file;
  } catch {
    return file;
  }
}

async function optimizeFile(file: File) {
  const optimized = file.type.startsWith("image/") ? await compressImage(file) : await optimizeVideo(file);
  if (optimized.size > MAX_FILE_SIZE) throw new Error("Le fichier optimisé dépasse encore 50 Mo.");
  return optimized;
}

function attachmentIcon(type?: string | null) {
  if (type?.startsWith("image/")) return <ImageIcon className="h-4 w-4" />;
  if (type?.startsWith("video/")) return <Video className="h-4 w-4" />;
  return <FileText className="h-4 w-4" />;
}

export default function ClientMessagingPanel({ clientId, plantationId }: { clientId: string; plantationId?: string | null }) {
  const [messages, setMessages] = useState<any[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!clientId) return;
    const { data, error } = await (supabase as any).from("portail_messages")
      .select("id,client_id,plantation_id,auteur_user_id,auteur_type,auteur_nom,message,lu,recu_at,lu_at,created_at,piece_jointe_url,piece_jointe_nom,piece_jointe_type,piece_jointe_taille,piece_jointe_bucket")
      .eq("client_id", clientId).order("created_at", { ascending: true });
    if (!error) {
      const enriched = await Promise.all((data || []).map(async (m: any) => {
        if (!m.piece_jointe_url) return m;
        const { data: signed } = await supabase.storage.from(m.piece_jointe_bucket || BUCKET).createSignedUrl(m.piece_jointe_url, 3600);
        return { ...m, piece_jointe_signed_url: signed?.signedUrl || null };
      }));
      const unread=enriched.filter((m:any)=>m.auteur_type==="client"&&!m.lu).map((m:any)=>m.id);
      if(unread.length){
        const readAt=new Date().toISOString();
        await (supabase as any).rpc("mark_portail_message_read", { p_message_id: unread[0], p_client_id: clientId }).catch(() => null);
        if (unread.length > 1) {
          await Promise.all(unread.slice(1).map((messageId:string) =>
            (supabase as any).rpc("mark_portail_message_read", { p_message_id: messageId, p_client_id: clientId }).catch(() => null)
          ));
        }
        setMessages(enriched.map((m:any)=>unread.includes(m.id)?{...m,lu:true,lu_at:readAt}:m));
      } else setMessages(enriched);
    }
    setLoading(false);
  }, [clientId]);

  useEffect(() => {
    void load();
    const channel = supabase.channel(`crm-client-messages-${clientId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "portail_messages", filter: `client_id=eq.${clientId}` }, () => void load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [clientId, load]);

  const chooseFile = async (file?: File) => {
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) return;
    setOptimizing(true);
    try { setAttachment(await optimizeFile(file)); }
    catch { setAttachment(file); }
    finally { setOptimizing(false); }
  };

  const send = async () => {
    const message = draft.trim();
    if (!message && !attachment) return;
    setSending(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Session CRM introuvable.");
      const { data: profile } = await (supabase as any).from("profiles").select("nom_complet").eq("user_id", userId).maybeSingle();

      let attachmentMeta: Record<string, unknown> = {};
      if (attachment) {
        const safeName = attachment.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `clients/${clientId}/messages/${crypto.randomUUID()}-${safeName}`;
        const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, attachment, { contentType: attachment.type, upsert: false, cacheControl: "31536000" });
        if (uploadError) throw uploadError;
        attachmentMeta = {
          piece_jointe_url: path,
          piece_jointe_nom: attachment.name,
          piece_jointe_type: attachment.type,
          piece_jointe_taille: attachment.size,
          piece_jointe_bucket: BUCKET,
        };
      }

      const { error } = await (supabase as any).from("portail_messages").insert({
        client_id: clientId, plantation_id: plantationId || null, auteur_user_id: userId,
        auteur_type: "staff", auteur_nom: profile?.nom_complet || "AgriCapital", message: message || "Pièce jointe",
        lu: false, ...attachmentMeta,
      });
      if (error) throw error;
      setDraft(""); setAttachment(null);
      if (inputRef.current) inputRef.current.value = "";
      // Realtime will deliver the INSERT; don't force a second full read here.
      // This keeps the CRM composer state stable and avoids UI jumps.
    } finally { setSending(false); }
  };

  const isMobileLike=()=>typeof window!=="undefined"&&(window.matchMedia?.("(pointer: coarse)").matches||/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent));
  const handleComposerKeyDown=(event:React.KeyboardEvent<HTMLTextAreaElement>)=>{if(event.key==="Enter"&&!event.shiftKey&&!isMobileLike()){event.preventDefault();void send();}};
  const visible=messages.filter((m)=>!plantationId||!m.plantation_id||m.plantation_id===plantationId);

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader className="min-w-0">
        <CardTitle className="flex items-center gap-2"><MessageSquare className="h-5 w-5 shrink-0" /> Messagerie client</CardTitle>
        <p className="text-sm text-muted-foreground">Échange direct avec le client depuis son dossier CRM.</p>
      </CardHeader>
      <CardContent className="min-w-0 space-y-4">
        <div className="max-h-[500px] min-h-[260px] min-w-0 overflow-y-auto overflow-x-hidden rounded-xl bg-muted/20 p-3 sm:p-4 space-y-3">
          {loading ? <div className="h-40 flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div> :
            visible.length === 0 ? <div className="h-40 flex flex-col items-center justify-center text-center"><Headphones className="h-8 w-8 text-muted-foreground/40 mb-2" /><p className="font-medium">Aucun message</p><p className="text-xs text-muted-foreground">Envoyez le premier message au client.</p></div> :
            visible.map((m: any) => {
              const mine = m.auteur_type !== "client";
              return <div key={m.id} className={`flex min-w-0 ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`min-w-0 max-w-[92%] overflow-hidden rounded-2xl px-3 py-2 ${mine ? "bg-primary text-primary-foreground" : "bg-background border"}`}>
                  <div className="flex flex-wrap items-center gap-2 mb-1"><span className="text-[10px] font-semibold">{mine ? (m.auteur_nom || "AgriCapital") : (m.auteur_nom || "Client")}</span><Badge variant="outline" className="text-[8px] h-4">{mine ? "Équipe" : "Client"}</Badge></div>
                  <p className="text-sm whitespace-pre-wrap break-words">{m.message}</p>
                  {m.piece_jointe_signed_url && (
                    <a href={m.piece_jointe_signed_url} target="_blank" rel="noreferrer" className="mt-2 flex max-w-full items-center gap-2 rounded-lg bg-black/10 p-2 text-xs underline">
                      {attachmentIcon(m.piece_jointe_type)}
                      <span className="min-w-0 flex-1 truncate">{m.piece_jointe_nom}</span>
                      <Download className="h-3.5 w-3.5 shrink-0" />
                    </a>
                  )}
                  <div className={`mt-1 flex items-center gap-2 text-[9px] ${mine?"text-primary-foreground/60":"text-muted-foreground"}`}><span>{new Date(m.created_at).toLocaleString("fr-FR")}</span>{mine&&<span>{m.lu?"✓✓ Lu":m.recu_at?"✓ Reçu":"✓ Envoyé"}</span>}</div>
                </div>
              </div>;
            })}
        </div>

        {attachment && (
          <div className="flex min-w-0 items-center gap-2 rounded-xl border bg-muted/30 p-2">
            {attachmentIcon(attachment.type)}
            <span className="min-w-0 flex-1 truncate text-sm">{attachment.name} · {(attachment.size / 1024 / 1024).toFixed(2)} Mo</span>
            <Button type="button" variant="ghost" size="icon" onClick={()=>setAttachment(null)} disabled={sending}><X className="h-4 w-4" /></Button>
          </div>
        )}

        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end">
          <Textarea uppercase={false} className="min-w-0 flex-1" value={draft} maxLength={4000} rows={3} placeholder="Répondre au client… (Entrée = envoyer, Maj+Entrée = nouvelle ligne)" onChange={e=>setDraft(e.target.value)} onKeyDown={handleComposerKeyDown} disabled={sending||optimizing}/>
          <div className="flex shrink-0 gap-2">
            <input ref={inputRef} type="file" className="hidden" accept="image/*,video/*,.pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx" onChange={e=>{void chooseFile(e.currentTarget.files?.[0]);e.currentTarget.value="";}} />
            <Button type="button" variant="outline" onClick={() => inputRef.current?.click()} disabled={sending || optimizing} title="Joindre un fichier"><Paperclip className="h-4 w-4" /><span className="ml-2 hidden sm:inline">{optimizing ? "Optimisation…" : "Joindre"}</span></Button>
            <Button type="button" onClick={send} disabled={sending||optimizing||(!draft.trim()&&!attachment)}>{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
