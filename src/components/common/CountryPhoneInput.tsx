import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import SearchableSelect from "@/components/common/SearchableSelect";
import { supabase } from "@/integrations/supabase/client";
import { parsePhoneNumberFromString } from "libphonenumber-js/max";

type Country={code:string;iso3?:string;name:string;callingCode:string;flag:string;minLocalDigits?:number;maxLocalDigits?:number;metadata?:Record<string,any>};
const digits=(value:string)=>String(value||"").replace(/\D/g,"");
const countryFromCode=(value:string,countries:Country[])=>countries.find(c=>c.code===value)||countries.find(c=>c.callingCode===value)||countries[0];

export interface CountryPhoneInputProps{
  label:string; countryCode?:string; localValue?:string; required?:boolean; disabled?:boolean;
  onChange:(v:{countryCode:string;callingCode:string;localValue:string;internationalValue:string})=>void;
  minLocalDigits?:number; maxLocalDigits?:number;
}

export const CountryPhoneInput=({label,countryCode,localValue="",required,disabled,onChange,minLocalDigits,maxLocalDigits}:CountryPhoneInputProps)=>{
  const [countries,setCountries]=useState<Country[]>([]);
  useEffect(()=>{let active=true;void (async()=>{const {data,error}=await (supabase as any).from("referentiels_systeme").select("code,libelle,ordre,metadata").eq("categorie","pays_telephone").eq("actif",true).order("ordre").order("libelle");if(active&&!error)setCountries((data||[]).map((r:any)=>({code:r.code,name:r.libelle,iso3:r.metadata?.iso3,callingCode:r.metadata?.callingCode||"",flag:r.metadata?.flag||"🌐",minLocalDigits:r.metadata?.minLocalDigits,maxLocalDigits:r.metadata?.maxLocalDigits,metadata:r.metadata})).filter((c:Country)=>c.callingCode));})();return()=>{active=false;};},[]);
  const selected=countryFromCode(countryCode||"",countries);
  const resolvedMin=minLocalDigits ?? selected?.minLocalDigits ?? 7;
  const resolvedMax=maxLocalDigits ?? selected?.maxLocalDigits ?? 15;
  const normalizeLocal=(value:string,country:Country)=>{let d=digits(value);const cc=digits(country?.callingCode||"");if(cc&&d.startsWith(cc)&&d.length>resolvedMax)d=d.slice(cc.length);return d.slice(0,resolvedMax);};
  const currentLocal=selected?normalizeLocal(localValue,selected):"";
  const options=useMemo(()=>countries.map(c=>({value:c.code,label:c.flag+" "+c.name+" "+c.callingCode})),[countries]);
  const emit=(country:Country,value:string)=>{const local=normalizeLocal(value,country);const international=local?country.callingCode+local:"";const parsed=international?parsePhoneNumberFromString(international,country.code as any):undefined;const normalizedLocal=parsed?.countryCallingCode===digits(country.callingCode)?parsed.nationalNumber:local;onChange({countryCode:country.code,callingCode:country.callingCode,localValue:normalizedLocal,internationalValue:international});};
  return <div className="space-y-2 min-w-0">
    {label&&<label className="text-sm font-medium truncate block">{label}{required&&" *"}</label>}
    <div className="flex w-full min-w-0 items-stretch gap-2">
      <SearchableSelect value={selected?.code||""} onValueChange={code=>{const c=countries.find(x=>x.code===code);if(c)emit(c,currentLocal);}}
        options={options} placeholder="Pays" searchPlaceholder="Rechercher un pays..." disabled={disabled||!countries.length}
        className="w-[88px] min-[390px]:w-[104px] sm:w-[120px] shrink-0" triggerLabel={(selected?.flag||"🌐")+" "+(selected?.callingCode||"")} />
      <Input className="min-w-0 flex-1" type="tel" inputMode="numeric" autoComplete="tel" value={currentLocal}
        disabled={disabled||!selected} required={required} minLength={resolvedMin} maxLength={resolvedMax}
        pattern={selected?.metadata?.pattern || undefined}
        placeholder={selected?.metadata?.placeholder || "Numéro local"}
        onInvalid={e=>{const value=(e.currentTarget as HTMLInputElement).value;const phone=selected&&value?parsePhoneNumberFromString(value,selected.code as any):undefined;if(value&&(!phone||!phone.isPossible()))e.currentTarget.setCustomValidity(selected?.metadata?.invalidMessage || "Le numéro ne correspond pas à une longueur valide pour le pays sélectionné.");}}
        onInput={e=>e.currentTarget.setCustomValidity("")} onChange={e=>selected&&emit(selected,e.target.value)} />
    </div>
  </div>;
};
export default CountryPhoneInput;