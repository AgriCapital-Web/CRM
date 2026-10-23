import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, Video, VideoOff, PhoneOff } from "lucide-react";
import { toast } from "sonner";

type Signal = { from: string; to?: string; kind: "hello" | "offer" | "answer" | "ice"; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };

export default function InternalCallRoom({ roomId, profileId, onClose }: { roomId: string; profileId: string; onClose: () => void }) {
  const localVideo = useRef<HTMLVideoElement>(null);
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const peers = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingIce = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const channelRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [status, setStatus] = useState("Connexion à la salle…");

  useEffect(() => {
    let alive = true;
    const send = (payload: Signal) => channelRef.current?.send({ type: "broadcast", event: "signal", payload });
    const makePeer = (remoteId: string) => {
      let pc = peers.current.get(remoteId);
      if (pc) return pc;
      pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
      streamRef.current?.getTracks().forEach(track => pc!.addTrack(track, streamRef.current!));
      pc.onicecandidate = e => { if (e.candidate) send({ from: profileId, to: remoteId, kind: "ice", candidate: e.candidate.toJSON() }); };
      pc.ontrack = e => {
        if (remoteVideo.current) {
          const current = remoteVideo.current.srcObject as MediaStream | null;
          if (current) e.streams[0]?.getTracks().forEach(t => { if (!current.getTracks().some(x => x.id === t.id)) current.addTrack(t); });
          else remoteVideo.current.srcObject = e.streams[0];
        }
        setStatus("Appel connecté");
      };
      pc.onconnectionstatechange = () => {
        if (pc?.connectionState === "failed") setStatus("Connexion impossible : vérifiez le réseau et les autorisations du navigateur.");
      };
      peers.current.set(remoteId, pc);
      return pc;
    };
    const handleSignal = async (signal: Signal) => {
      if (!alive || !signal?.from || signal.from === profileId || (signal.to && signal.to !== profileId)) return;
      try {
        if (signal.kind === "hello") {
          if (profileId.localeCompare(signal.from) < 0) {
            const pc = makePeer(signal.from);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            send({ from: profileId, to: signal.from, kind: "offer", sdp: offer });
          }
        } else if (signal.kind === "offer" && signal.sdp) {
          const pc = makePeer(signal.from);
          await pc.setRemoteDescription(signal.sdp);
          const queued = pendingIce.current.get(signal.from) || [];
          for (const candidate of queued) await pc.addIceCandidate(candidate);
          pendingIce.current.delete(signal.from);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          send({ from: profileId, to: signal.from, kind: "answer", sdp: answer });
        } else if (signal.kind === "answer" && signal.sdp) {
          const pc = peers.current.get(signal.from);
          if (pc && !pc.remoteDescription) {
            await pc.setRemoteDescription(signal.sdp);
            const queued = pendingIce.current.get(signal.from) || [];
            for (const candidate of queued) await pc.addIceCandidate(candidate);
            pendingIce.current.delete(signal.from);
          }
        } else if (signal.kind === "ice" && signal.candidate) {
          const pc = peers.current.get(signal.from) || makePeer(signal.from);
          if (pc.remoteDescription) await pc.addIceCandidate(signal.candidate);
          else pendingIce.current.set(signal.from, [...(pendingIce.current.get(signal.from) || []), signal.candidate]);
        }
      } catch (e) { console.error("Internal call signaling failed", e); setStatus("Connexion interrompue. Réessayez l’appel."); }
    };
    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        if (!alive) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (localVideo.current) localVideo.current.srcObject = stream;
        const channel = supabase.channel("agricapital-call-" + roomId, { config: { broadcast: { self: false } } });
        channelRef.current = channel;
        channel.on("broadcast", { event: "signal" }, ({ payload }: { payload: Signal }) => { void handleSignal(payload); });
        channel.subscribe(async (state: string) => {
          if (state === "SUBSCRIBED" && alive) {
            setReady(true); setStatus("Salle prête — en attente des autres participants…");
            await channel.send({ type: "broadcast", event: "signal", payload: { from: profileId, kind: "hello" } });
          }
        });
      } catch (e) {
        console.error(e);
        setStatus("Micro ou caméra inaccessible. Autorisez leur utilisation puis relancez l’appel.");
        toast.error("Impossible d’accéder au micro ou à la caméra.");
      }
    };
    void start();
    return () => {
      alive = false;
      streamRef.current?.getTracks().forEach(t => t.stop());
      peers.current.forEach(pc => pc.close());
      peers.current.clear();
      pendingIce.current.clear();
      if (channelRef.current) void supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    };
  }, [roomId, profileId]);

  const toggleAudio = () => {
    const next = !muted; setMuted(next);
    streamRef.current?.getAudioTracks().forEach(t => { t.enabled = !next; });
  };
  const toggleVideo = () => {
    const next = !cameraOff; setCameraOff(next);
    streamRef.current?.getVideoTracks().forEach(t => { t.enabled = !next; });
  };
  return <div className="space-y-3">
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="overflow-hidden rounded-lg bg-black"><video ref={localVideo} autoPlay playsInline muted className="aspect-video w-full object-cover" /><p className="px-2 py-1 text-xs text-white">Vous</p></div>
      <div className="overflow-hidden rounded-lg bg-black"><video ref={remoteVideo} autoPlay playsInline className="aspect-video w-full object-cover" /><p className="px-2 py-1 text-xs text-white">Participant</p></div>
    </div>
    <p className="text-sm text-muted-foreground" role="status">{status}</p>
    <div className="flex flex-wrap justify-center gap-2">
      <Button type="button" variant="outline" onClick={toggleAudio}>{muted ? <MicOff className="mr-2 h-4 w-4"/> : <Mic className="mr-2 h-4 w-4"/>}{muted ? "Activer le micro" : "Couper le micro"}</Button>
      <Button type="button" variant="outline" onClick={toggleVideo}>{cameraOff ? <VideoOff className="mr-2 h-4 w-4"/> : <Video className="mr-2 h-4 w-4"/>}{cameraOff ? "Activer la caméra" : "Couper la caméra"}</Button>
      <Button type="button" variant="destructive" onClick={onClose}><PhoneOff className="mr-2 h-4 w-4"/>Quitter l’appel</Button>
    </div>
    {!ready && <p className="text-xs text-muted-foreground">L’appel utilise le micro, la caméra et la connexion réseau de votre navigateur.</p>}
  </div>;
}