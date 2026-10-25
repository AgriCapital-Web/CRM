import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Download, HardDrive, WifiOff, X, Zap } from "lucide-react";

interface BeforeInstallPromptEvent extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }>; }
const DISMISS_KEY="pwa-install-last-dismissed-ac-teams";
const DAY=24*60*60*1000;
const standalone=()=>window.matchMedia("(display-mode: standalone)").matches||window.matchMedia("(display-mode: fullscreen)").matches||window.matchMedia("(display-mode: minimal-ui)").matches||(window.navigator as any).standalone===true;
async function installed(){if(standalone())return true;try{const f=(navigator as any).getInstalledRelatedApps;if(typeof f==="function"){const a=await f.call(navigator);return Array.isArray(a)&&a.length>0;}}catch(error){ void error; }return false;}
const allowed=()=>{const t=Number(localStorage.getItem(DISMISS_KEY)||0);return !t||Date.now()-t>=DAY;};

export default function InstallPrompt(){
 const [deferred,setDeferred]=useState<BeforeInstallPromptEvent|null>(null),[show,setShow]=useState(false),[ios,setIos]=useState(false),[isInstalled,setInstalled]=useState(false);
 useEffect(()=>{let dead=false;const isIOS=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);setIos(isIOS);
 const before=async(e:Event)=>{e.preventDefault();if(await installed()||!allowed()||dead)return;setDeferred(e as BeforeInstallPromptEvent);window.setTimeout(()=>{if(!dead&&!standalone()&&allowed())setShow(true);},2000);};
 const app=()=>{localStorage.removeItem(DISMISS_KEY);setInstalled(true);setDeferred(null);setShow(false);};
 void installed().then(v=>{if(!dead&&v)setInstalled(true);});
 window.addEventListener("beforeinstallprompt",before);window.addEventListener("appinstalled",app);
 if(isIOS&&!standalone()&&allowed())window.setTimeout(()=>{if(!dead&&!standalone())setShow(true);},3000);
 return()=>{dead=true;window.removeEventListener("beforeinstallprompt",before);window.removeEventListener("appinstalled",app);};
 },[]);
 const dismiss=()=>{localStorage.setItem(DISMISS_KEY,String(Date.now()));setShow(false);};
 const install=async()=>{if(!deferred)return;await deferred.prompt();await deferred.userChoice;localStorage.setItem(DISMISS_KEY,String(Date.now()));setDeferred(null);setShow(false);};
 if(!show||isInstalled)return null;
 return <Dialog open={show} onOpenChange={o=>!o&&dismiss()}><DialogContent className="w-[calc(100vw-1.25rem)] max-w-xs rounded-[32px] border-primary/15 p-5 shadow-2xl sm:p-6"><style>{`@keyframes installPulse{0%,100%{transform:scale(1);box-shadow:0 0 0 0 rgba(220,38,38,.42)}50%{transform:scale(1.025);box-shadow:0 0 0 9px rgba(220,38,38,0)}}.install-pulse{animation:installPulse 1.25s ease-in-out infinite}`}</style>
  <DialogHeader><DialogTitle className="flex flex-col items-center gap-2 text-center text-base"><div className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-primary/15 bg-white p-2 shadow-lg"><img src="/icons/icon-crm.png" alt="AgriCapital" className="h-full w-full rounded-full object-contain"/></div><span>Installer AgriCapital 360</span></DialogTitle><DialogDescription asChild><div className="mt-4 space-y-4">{ios?<div className="space-y-3"><p className="font-medium text-foreground">Pour installer sur iPhone/iPad :</p><ol className="list-decimal list-inside space-y-2 text-sm"><li>Appuyez sur <strong>Partager</strong>.</li><li>Choisissez <strong>Sur l’écran d’accueil</strong>.</li><li>Appuyez sur <strong>Ajouter</strong>.</li></ol></div>:<p className="text-sm">Accès direct au CRM depuis votre écran d’accueil.</p>}<div className="grid grid-cols-3 gap-2 pt-1"><div className="flex flex-col items-center gap-1.5 rounded-xl bg-muted p-2.5"><WifiOff className="h-5 w-5 text-primary"/><span className="text-xs text-center font-medium">Hors ligne</span></div><div className="flex flex-col items-center gap-1.5 rounded-xl bg-muted p-2.5"><Zap className="h-5 w-5 text-primary"/><span className="text-xs text-center font-medium">Rapide</span></div><div className="flex flex-col items-center gap-1.5 rounded-xl bg-muted p-2.5"><HardDrive className="h-5 w-5 text-primary"/><span className="text-xs text-center font-medium">PWA</span></div></div></div></DialogDescription></DialogHeader>
  <div className="mt-4 flex flex-col gap-2">{!ios&&deferred&&<Button onClick={()=>void install()} size="lg" className="install-pulse w-full gap-2 rounded-full bg-red-600 text-white shadow-lg hover:bg-red-700"><Download className="h-5 w-5"/>Installer</Button>}<Button variant="ghost" onClick={dismiss} className="w-full rounded-full text-muted-foreground"><X className="mr-2 h-4 w-4"/>Plus tard</Button></div>
 </DialogContent></Dialog>;
}
