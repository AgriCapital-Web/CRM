import { useEffect, useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import SearchableSelect from "@/components/common/SearchableSelect";
import { supabase } from "@/integrations/supabase/client";
type Row={id:string;nom:string;district_id?:string;region_id?:string;departement_id?:string;sous_prefecture_id?:string};
type Values={district_id:string;region_id:string;departement_id:string;sous_prefecture_id:string;village_id:string};
export default function IndependentServiceGeo({values,onChange}:{values:Partial<Values>;onChange:(v:Partial<Values>)=>void}){
 const [districts,setDistricts]=useState<Row[]>([]),[regions,setRegions]=useState<Row[]>([]),[departments,setDepartments]=useState<Row[]>([]),[subprefectures,setSubprefectures]=useState<Row[]>([]),[villages,setVillages]=useState<Row[]>([]);
 useEffect(()=>{void Promise.all([(supabase as any).from("districts").select("id,nom").order("nom"),(supabase as any).from("regions").select("id,nom,district_id").order("nom"),(supabase as any).from("departements").select("id,nom,region_id").order("nom"),(supabase as any).from("sous_prefectures").select("id,nom,departement_id").order("nom"),(supabase as any).from("villages").select("id,nom,sous_prefecture_id").order("nom").limit(50000)]).then(([d,r,de,sp,v])=>{setDistricts(d.data||[]);setRegions(r.data||[]);setDepartments(de.data||[]);setSubprefectures(sp.data||[]);setVillages(v.data||[]);});},[]);
 const districtOptions=useMemo(()=>districts.map(x=>({value:x.id,label:x.nom})),[districts]);
 const regionOptions=regions.filter(x=>x.district_id===values.district_id).map(x=>({value:x.id,label:x.nom}));
 const departmentOptions=[{value:"diaspora",label:"Diaspora"},...departments.filter(x=>x.region_id===values.region_id).map(x=>({value:x.id,label:x.nom}))];
 const subOptions=subprefectures.filter(x=>x.departement_id===values.departement_id).map(x=>({value:x.id,label:x.nom}));
 const villageOptions=villages.filter(x=>x.sous_prefecture_id===values.sous_prefecture_id).map(x=>({value:x.id,label:x.nom}));
 return <div className="grid gap-3 sm:grid-cols-2">
 <div><Label>District</Label><SearchableSelect value={values.district_id||""} options={districtOptions} placeholder="Choisir le district" onValueChange={v=>onChange({district_id:v,region_id:"",departement_id:"",sous_prefecture_id:"",village_id:""})}/></div>
 <div><Label>Région</Label><SearchableSelect value={values.region_id||""} disabled={!values.district_id} options={regionOptions} placeholder="Choisir la région" onValueChange={v=>onChange({region_id:v,departement_id:"",sous_prefecture_id:"",village_id:""})}/></div>
 <div><Label>Département</Label><SearchableSelect value={values.departement_id||""} disabled={!values.region_id} options={departmentOptions} placeholder="Choisir le département" onValueChange={v=>onChange({departement_id:v,sous_prefecture_id:"",village_id:""})}/></div>
 {values.departement_id!=="diaspora"&&<><div><Label>Sous-préfecture</Label><SearchableSelect value={values.sous_prefecture_id||""} disabled={!values.departement_id} options={subOptions} placeholder="Choisir la sous-préfecture" onValueChange={v=>onChange({sous_prefecture_id:v,village_id:""})}/></div><div><Label>Village</Label><SearchableSelect value={values.village_id||""} disabled={!values.sous_prefecture_id} options={villageOptions} placeholder="Choisir le village" onValueChange={v=>onChange({village_id:v})}/></div></>}
 </div>;
}