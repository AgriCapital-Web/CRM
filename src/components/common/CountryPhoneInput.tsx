import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import SearchableSelect from "@/components/common/SearchableSelect";
import { getCountries, getCountryCallingCode, parsePhoneNumberFromString } from "libphonenumber-js/max";
import { getLocalizedCountryNames } from "@/lib/countrySearch";

type Country = { code: string; name: string; callingCode: string; flag: string };
const digits = (value: string) => String(value || "").replace(/\D/g, "");
const countryFlag = (code: string) => String(code || "").toUpperCase().replace(/[A-Z]/g, letter => String.fromCodePoint(127397 + letter.charCodeAt(0)));
const displayNames = new Intl.DisplayNames(["fr"], { type: "region" });
export const COUNTRIES: Country[] = getCountries().map(code => ({
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
  const [selectedCode, setSelectedCode] = useState(() => {
    const explicit = String(countryCode || "").trim();
    if (explicit) return countryFromCode(explicit, COUNTRIES).code;
    const parsed = parsePhoneNumberFromString(String(localValue || ""));
    return parsed?.country || countryFromCode("+225", COUNTRIES).code;
  });
  useEffect(() => {
    const explicit = String(countryCode || "").trim();
    if (explicit) {
      setSelectedCode(countryFromCode(explicit, COUNTRIES).code);
      return;
    }
    const parsed = parsePhoneNumberFromString(String(localValue || ""));
    if (parsed?.country) setSelectedCode(parsed.country);
  }, [countryCode, localValue]);
  const [internationalDraft, setInternationalDraft] = useState<string | null>(null);
  const selected = COUNTRIES.find(c => c.code === selectedCode) || countryFromCode(countryCode || "+225", COUNTRIES);
  const flagUrl = (code: string) => `https://flagcdn.com/w40/${code.toLowerCase()}.png`;
  const options = useMemo(() => COUNTRIES.map(c => ({
    value: c.code,
    label: c.name + " " + c.callingCode,
    flagUrl: flagUrl(c.code),
    searchTerms: `${getLocalizedCountryNames(c.code)} ${c.code} ${c.callingCode} ${c.code === "CI" ? "Ivory Coast Ivory-Coast Ivoire Ivorie" : ""}`,
  })), []);
  const normalizedLocal = (value: string, country: Country) => {
    const rawValue = String(value || "").trim();
    let valueDigits = digits(rawValue);
    const callingDigits = digits(country.callingCode);

    // Preserve the national number exactly as typed. Parsing a national number
    // on every keystroke can treat its leading zero as a trunk prefix and remove
    // it from the controlled input, making numbers beginning with 0 impossible
    // to enter. Only remove a country prefix when the user explicitly pasted
    // an international number (starting with +).
    if (rawValue.startsWith("+") && callingDigits && valueDigits.startsWith(callingDigits)) {
      const parsedInternational = parsePhoneNumberFromString(rawValue);
      if (parsedInternational?.countryCallingCode === callingDigits) {
        valueDigits = valueDigits.slice(callingDigits.length);
      }
    } else if (country.code === "CI" && valueDigits.length === 13 && valueDigits.startsWith("225")) {
      valueDigits = valueDigits.slice(3);
    }

    return valueDigits.slice(0, maxLocalDigits || 15);
  };
  const currentLocal = normalizedLocal(localValue, selected);
  const emit = (country: Country, value: string) => {
    setSelectedCode(country.code);
    const local = normalizedLocal(value, country);
    const internationalValue = local ? country.callingCode + local : "";
    // Keep the local digits untouched, including a leading zero.
    onChange({ countryCode: country.code, callingCode: country.callingCode, localValue: local, internationalValue });
  };
  const handlePhoneInput = (rawValue: string) => {
    const raw = rawValue.trim();
    if (raw.startsWith("+")) {
      const rawDigits = digits(raw);
      const match = COUNTRIES
        .filter(country => rawDigits.startsWith(digits(country.callingCode)))
        .sort((a, b) => digits(b.callingCode).length - digits(a.callingCode).length)[0];
      setInternationalDraft(raw);
      if (!match) {
        onChange({ countryCode: selected.code, callingCode: selected.callingCode, localValue: "", internationalValue: "" });
        return;
      }
      const parsed = parsePhoneNumberFromString(raw);
      const country = (parsed?.country && COUNTRIES.find(item => item.code === parsed.country))
        || (match.callingCode === "+1" ? countryFromCode("+1", COUNTRIES) : match);
      const local = rawDigits.slice(digits(country.callingCode).length).slice(0, maxLocalDigits || 15);
      setSelectedCode(country.code);
      onChange({
        countryCode: country.code,
        callingCode: country.callingCode,
        localValue: local,
        internationalValue: local ? country.callingCode + local : "",
      });
      return;
    }
    setInternationalDraft(null);
    emit(selected, rawValue);
  };

  return <div className={`min-w-0 ${compact ? "space-y-1" : "space-y-2"}`}>
    {label && <label className={`block font-medium leading-tight ${compact ? "whitespace-normal break-words text-xs" : "text-sm"}`}>{label}{required && " *"}</label>}
    <div className={`flex w-full min-w-0 items-stretch ${compact ? "gap-2" : "gap-2"}`}>
      <SearchableSelect
        value={selected.code}
        onValueChange={code => { const country = COUNTRIES.find(c => c.code === code); if (country) { setInternationalDraft(null); emit(country, currentLocal); } }}
        options={options}
        placeholder="Pays"
        searchPlaceholder="Rechercher un pays..."
        emptyText="Aucun pays trouvé."
        disabled={disabled}
        className="h-10 w-[112px] min-w-[112px] shrink-0 px-3"
        triggerLabel={selected.callingCode}
        triggerFlagUrl={flagUrl(selected.code)}
        contentClassName="w-max min-w-[260px] max-w-[calc(100vw-24px)]"
      />
      <Input
        className={`min-w-0 w-0 flex-1 h-10 ${compact ? "px-2 text-sm" : ""}`}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        value={internationalDraft ?? currentLocal}
        disabled={disabled}
        required={required}
        minLength={minLocalDigits}
        maxLength={internationalDraft ? (maxLocalDigits || 15) + 4 : (maxLocalDigits || 15)}
        placeholder="Numéro local ou international"
        onInvalid={e => {
          const value = (e.currentTarget as HTMLInputElement).value;
          const phone = value ? parsePhoneNumberFromString(value, selected.code as any) : undefined;
          if (value && (!phone || !phone.isPossible())) e.currentTarget.setCustomValidity("Le numéro ne correspond pas à une longueur valide pour le pays sélectionné.");
        }}
        onInput={e => e.currentTarget.setCustomValidity("")}
        onChange={e => handlePhoneInput(e.target.value)}
      />
    </div>
  </div>;
};
export default CountryPhoneInput;
