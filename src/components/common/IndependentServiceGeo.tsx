import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import SearchableSelect from "@/components/common/SearchableSelect";
import { supabase } from "@/integrations/supabase/client";

type Department={id:string;nom:string};
type Values={departement_id:string};

export default function IndependentServiceGeo({values,onChange}:{values:Partial<Values>;onChange:(v:Partial<Values>)=>void}){
 const [departments,setDepartments]=useState<Department[]>([]);
 useEffect(()=>{
  let active=true;
  void (supabase as any).from("departements").select("id,nom").order("nom").then(({data,error}:any)=>{
   if(active&&!error)setDepartments(data||[]);
  });
  return ()=>{active=false;};
 },[]);
 const options=[{value:"diaspora",label:"Diaspora"},...departments.map(d=>({value:d.id,label:d.nom}))];
 return <div>
  <Label>Département *</Label>
  <SearchableSelect value={values.departement_id||""} options={options} placeholder="Choisir le département" onValueChange={v=>onChange({departement_id:v})}/>
 </div>;
}
