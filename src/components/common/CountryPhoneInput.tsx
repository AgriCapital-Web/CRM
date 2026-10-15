import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import SearchableSelect from "@/components/common/SearchableSelect";
import { getCountries, getCountryCallingCode, parsePhoneNumberFromString } from "libphonenumber-js/max";

type Country = { code: string; name: string; callingCode: string; flag: string };
const digits = (value: string) => String(value || "").replace(/\D/g, "");
const countryFlag = (code: string) => String(code || "").toUpperCase().replace(/[A-Z]/g, letter => String.fromCodePoint(127397 + letter.charCodeAt(0)));
const displayNames = new Intl.DisplayNames(["fr"], { type: "region" });
const COUNTRIES: Country[] = getCountries().map(code => ({
  code,
  name: displayNames.of(code) || code,
  callingCode: "+" + getCountryCallingCode(code),
  flag: countryFlag(code),
})).sort((a, b) => a.name.localeCompare(b.name, "fr"));

const countryFromCode = (value: string, countries: Country[]) => {
  const normalized = String(value || "").trim();
  const exact = countries.find(c => c.code === normalized.toUpperCase());
  if (exact) return exact;
  const matches = countries.filter(c => c.callingCode === normalized);
  if (matches.length === 1) return matches[0];
  if (normalized === "+1") return countries.find(c => c.code === "US") || matches[0];
  if (normalized === "+44") return countries.find(c => c.code === "GB") || matches[0];
  return matches[0] || countries.find(c => c.code === "CI") || countries[0];
};

export interface CountryPhoneInputProps {
  label: string;
  countryCode?: string;
  localValue?: string;
  required?: boolean;
  disabled?: boolean;
  onChange: (v: { countryCode: string; callingCode: string; localValue: string; internationalValue: string }) => void;
  minLocalDigits?: number;
  maxLocalDigits?: number;
  compact?: boolean;
}

export const CountryPhoneInput = ({ label, countryCode, localValue = "", required, disabled, onChange, minLocalDigits, maxLocalDigits, compact = false }: CountryPhoneInputProps) => {
  const [selectedCode, setSelectedCode] = useState(() => countryFromCode(countryCode || "+225", COUNTRIES).code);
  const selected = COUNTRIES.find(c => c.code === selectedCode) || countryFromCode(countryCode || "+225", COUNTRIES);
  const flagUrl = (code: string) => `https://flagcdn.com/w40/${code.toLowerCase()}.png`;
  const options = useMemo(() => COUNTRIES.map(c => ({ value: c.code, label: c.name + " " + c.callingCode, flagUrl: flagUrl(c.code) })), []);
  const normalizedLocal = (value: string, country: Country) => {
    let valueDigits = digits(value);
    const callingDigits = digits(country.callingCode);
    if (callingDigits && valueDigits.startsWith(callingDigits) && valueDigits.length > (maxLocalDigits || 15)) valueDigits = valueDigits.slice(callingDigits.length);
    return valueDigits.slice(0, maxLocalDigits || 15);
  };
  const currentLocal = normalizedLocal(localValue, selected);
  const emit = (country: Country, value: string) => {
    setSelectedCode(country.code);
    const local = normalizedLocal(value, country);
    const internationalValue = local ? country.callingCode + local : "";
    const parsed = internationalValue ? parsePhoneNumberFromString(internationalValue, country.code as any) : undefined;
    const normalized = parsed?.countryCallingCode === digits(country.callingCode) ? parsed.nationalNumber : local;
    onChange({ countryCode: country.code, callingCode: country.callingCode, localValue: normalized, internationalValue });
  };

  return <div className={`min-w-0 ${compact ? "space-y-1" : "space-y-2"}`}>
    {label && <label className={`block font-medium leading-tight ${compact ? "whitespace-normal break-words text-xs" : "text-sm"}`}>{label}{required && " *"}</label>}
    <div className={`flex w-full min-w-0 items-stretch ${compact ? "gap-2" : "gap-2"}`}>
      <SearchableSelect
        value={selected.code}
        onValueChange={code => { const country = COUNTRIES.find(c => c.code === code); if (country) emit(country, currentLocal); }}
        options={options}
        placeholder="Pays"
        searchPlaceholder="Rechercher un pays..."
        emptyText="Aucun pays trouvé."
        disabled={disabled}
        className={compact ? "h-9 w-10 min-w-10 shrink-0 px-0" : "h-9 w-[112px] shrink-0 sm:w-[145px]"}
        triggerLabel={selected.callingCode}
        triggerFlagUrl={flagUrl(selected.code)}
        triggerIconOnly={compact}
      />
      <Input
        className={`min-w-0 w-0 flex-1 h-9 ${compact ? "px-2 text-sm" : ""}`}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        value={currentLocal}
        disabled={disabled}
        required={required}
        minLength={minLocalDigits}
        maxLength={maxLocalDigits || 15}
        placeholder="Numéro local"
        onInvalid={e => {
          const value = (e.currentTarget as HTMLInputElement).value;
          const phone = value ? parsePhoneNumberFromString(value, selected.code as any) : undefined;
          if (value && (!phone || !phone.isPossible())) e.currentTarget.setCustomValidity("Le numéro ne correspond pas à une longueur valide pour le pays sélectionné.");
        }}
        onInput={e => e.currentTarget.setCustomValidity("")}
        onChange={e => emit(selected, e.target.value)}
      />
    </div>
  </div>;
};
export default CountryPhoneInput;
