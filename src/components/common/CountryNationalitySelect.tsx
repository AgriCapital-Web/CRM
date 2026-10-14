import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import SearchableSelect from "@/components/common/SearchableSelect";

type Nationality = { code: string; name: string; order: number };

type Props = {
  value?: string | null;
  onChange: (value: string) => void;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  compact?: boolean;
};

export default function CountryNationalitySelect({
  value,
  onChange,
  label = "Nationalité",
  required = false,
  disabled = false,
  placeholder = "Sélectionner une nationalité",
  compact = false,
}: Props) {
  const [countries, setCountries] = useState<Nationality[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data, error } = await (supabase as any)
        .from("v_referentiels_systeme")
        .select("code,libelle,ordre")
        .eq("categorie", "pays_nationalite")
        .order("ordre")
        .order("libelle");
      if (!active) return;
      setCountries(error ? [] : (data || []).map((row: any) => ({
        code: row.code,
        name: row.libelle,
        order: row.ordre ?? 0,
      })));
      setLoading(false);
    })();
    return () => { active = false; };
  }, []);

  const countryFlag = (code: string) => String(code || "").toUpperCase().replace(/[A-Z]/g, (letter) => String.fromCodePoint(127397 + letter.charCodeAt(0)));

  const options = useMemo(() => countries.map((country) => ({
    value: country.code,
    label: `${countryFlag(country.code)} ${country.name}`,
  })), [countries]);

  // Supporte les dossiers historiques qui contiennent encore le libellé au lieu du code ISO.
  const selectedValue = countries.find((country) => country.code === value || country.name === value)?.code || "";

  return (
    <div className={`min-w-0 ${compact ? "space-y-1" : "space-y-2"}`}>
      {label && <label className={`block font-medium ${compact ? "text-xs" : "text-sm"}`}>{label}{required && " *"}</label>}
      <SearchableSelect
        value={selectedValue}
        onValueChange={onChange}
        options={options}
        placeholder={placeholder}
        searchPlaceholder="Rechercher un pays..."
        emptyText="Aucun pays trouvé."
        disabled={disabled || loading || countries.length === 0}
        className={compact ? "h-8" : undefined}
      />
    </div>
  );
}
