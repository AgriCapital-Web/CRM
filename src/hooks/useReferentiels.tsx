import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RoleDefinition } from "@/lib/roles";

export interface DepartementEntreprise { id:string; code:string; nom:string; requiert_couverture:boolean; actif:boolean; }

export function useDepartementsEntreprise() {
  const [departements,setDepartements]=useState<DepartementEntreprise[]>([]);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{ void (async()=>{
    const {data,error}=await (supabase as any).from("departements_entreprise").select("*").eq("actif",true).order("ordre",{ascending:true});
    if(!error) setDepartements(data||[]);
    setLoading(false);
  })(); },[]);
  const requiresCoverage=(nomOuCode?:string|null)=>!!departements.find(x=>x.nom===nomOuCode||x.code===nomOuCode)?.requiert_couverture;
  return {departements,loading,requiresCoverage};
}

export function useAppRoles() {
  const [roles,setRoles]=useState<RoleDefinition[]>([]);
  const [loading,setLoading]=useState(true);
  const [fromDatabase,setFromDatabase]=useState(false);
  const load=async()=>{
    setLoading(true);
    const {data,error}=await (supabase as any).from("app_roles").select("*").eq("actif",true).order("niveau",{ascending:true});
    if(error){setRoles([]);setFromDatabase(false);} else {
      setRoles((data||[]).map((r:any)=>({code:r.code,nom:r.nom,court:r.court||r.nom,description:r.description||"",niveau:r.niveau??5,niveauLabel:r.niveau_label||"",couleur:r.couleur||""})));
      setFromDatabase(true);
    }
    setLoading(false);
  };
  useEffect(()=>{void load();},[]);
  return {roles,loading,fromDatabase,reload:load};
}

export function useGeoHierarchy(initial?:{districtId?:string|null;regionId?:string|null;departementId?:string|null;sousPrefectureId?:string|null}) {
  const [districts,setDistricts]=useState<any[]>([]);
  const [regions,setRegions]=useState<any[]>([]);
  const [departements,setDepartements]=useState<any[]>([]);
  const [sousPrefectures,setSousPrefectures]=useState<any[]>([]);
  const [villages,setVillages]=useState<any[]>([]);
  useEffect(()=>{void (async()=>{const {data,error}=await (supabase as any).from("v_geo_districts").select("id,nom").eq("est_actif_effectif",true).order("nom");if(!error)setDistricts(data||[]);})();},[]);
  const loadRegions=async(id?:string|null)=>{if(!id){setRegions([]);return;}const {data,error}=await (supabase as any).from("v_geo_regions").select("id,nom").eq("district_id",id).eq("est_active_effectif",true).order("nom");setRegions(error?[]:(data||[]));};
  const loadDepartements=async(id?:string|null)=>{if(!id){setDepartements([]);return;}const {data,error}=await (supabase as any).from("v_geo_departements").select("id,nom").eq("region_id",id).eq("est_actif_effectif",true).order("nom");setDepartements(error?[]:(data||[]));};
  const loadSousPrefectures=async(id?:string|null)=>{if(!id){setSousPrefectures([]);return;}const {data,error}=await (supabase as any).from("v_geo_sous_prefectures").select("id,nom").eq("departement_id",id).eq("est_active_effectif",true).order("nom");setSousPrefectures(error?[]:(data||[]));};
  const loadVillages=async(id?:string|null)=>{if(!id){setVillages([]);return;}const {data,error}=await (supabase as any).from("v_geo_villages").select("id,nom").eq("sous_prefecture_id",id).eq("est_actif_effectif",true).order("nom");setVillages(error?[]:(data||[]));};
  useEffect(()=>{if(initial?.districtId)void loadRegions(initial.districtId);if(initial?.regionId)void loadDepartements(initial.regionId);if(initial?.departementId)void loadSousPrefectures(initial.departementId);if(initial?.sousPrefectureId)void loadVillages(initial.sousPrefectureId);},[initial?.districtId,initial?.regionId,initial?.departementId,initial?.sousPrefectureId]);
  return {districts,regions,departements,sousPrefectures,villages,loadRegions,loadDepartements,loadSousPrefectures,loadVillages};
}

export function useAllRegions() {
  const [regions,setRegions]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{void (async()=>{const {data,error}=await (supabase as any).from("v_geo_regions").select("id,nom,district_id").eq("est_active_effectif",true).order("nom");if(!error)setRegions(data||[]);setLoading(false);})();},[]);
  return {regions,loading};
}
