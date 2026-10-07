import { useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Camera, Upload, X } from "lucide-react";
type Props={label?:string;files:File[];onChange:(files:File[])=>void;multiple?:boolean;accept?:string};
export default function MediaUploadVisual({label="Photos / vidéos",files,onChange,multiple=true,accept="image/*,video/*"}:Props){
 const fileRef=useRef<HTMLInputElement>(null); const cameraRef=useRef<HTMLInputElement>(null);
 const previews=useMemo(()=>files.map(file=>({file,url:URL.createObjectURL(file)})),[files]);
 useEffect(()=>()=>previews.forEach(({url})=>URL.revokeObjectURL(url)),[previews]);
 const handleFiles=(list:FileList|null)=>onChange(Array.from(list||[]));
 return <div className="space-y-2">
  <label className="text-sm font-medium">{label}</label>
  <input ref={fileRef} type="file" accept={accept} multiple={multiple} className="hidden" onChange={e=>{handleFiles(e.currentTarget.files);e.currentTarget.value="";}}/>
  <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e=>{const file=e.currentTarget.files?.[0];if(file)onChange(multiple?[...files,file]:[file]);e.currentTarget.value="";}}/>
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
   <Button type="button" variant="outline" className="w-full" onClick={()=>cameraRef.current?.click()}><Camera className="mr-2 h-4 w-4"/>Prendre une photo</Button>
   <Button type="button" variant="outline" className="w-full" onClick={()=>fileRef.current?.click()}><Upload className="mr-2 h-4 w-4"/>Ajouter {multiple?"des fichiers":"un fichier"}</Button>
  </div>
  {files.length>0&&<div className="grid grid-cols-2 md:grid-cols-3 gap-3">{previews.map(({file,url},i)=><div key={file.name+"-"+i} className="relative border rounded-lg overflow-hidden bg-muted">
   {file.type.startsWith("video/")?<video src={url} controls className="w-full h-32 object-cover"/>:file.type==="application/pdf"?<iframe title={file.name} src={url} className="w-full h-32"/>:<img src={url} alt={file.name} className="w-full h-32 object-cover"/>}
   <button type="button" aria-label="Supprimer" className="absolute top-1 right-1 rounded-full bg-background/90 p-1" onClick={()=>onChange(files.filter((_,j)=>j!==i))}><X className="h-4 w-4"/></button>
   <p className="truncate text-xs p-1">{file.name}</p>
  </div>)}</div>}
 </div>;
}