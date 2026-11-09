import { useEffect, useMemo, useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { cn, formatUserShortName } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { normalizeRole, roleLabel } from "@/lib/roles";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";

interface CommercialComboboxProps {
  value?: string | null;
  onChange: (userId: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * Champ « Affecter à un commercial » : recherche instantanée + liste déroulante.
 * N'affiche que les utilisateurs actifs dont le rôle autorise réellement l'affectation.
 */
const CommercialCombobox = ({
  value,
  onChange,
  placeholder = "Rechercher ou sélectionner un commercial",
  disabled,
}: CommercialComboboxProps) => {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const { capabilities } = usePermissions();
  const [options, setOptions] = useState<{ id: string; nom: string; roles: string[] }[]>([]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data, error } = await (supabase as any).rpc("get_commercial_directory");
        if (error) throw error;
        const list = (data || []).map((row: any) => ({
          id: row.user_id,
          nom: formatUserShortName(row.nom_complet || row.email || "Sans nom"),
          roles: Array.isArray(row.roles) ? row.roles.map(normalizeRole) : [],
        }));
        if (active && list.length) { setOptions(list); return; }
        throw new Error("Répertoire commercial vide");
      } catch {
        if (active) setOptions([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [user?.id]);

  const selected = useMemo(() => options.find((o) => o.id === value), [options, value]);

  useEffect(() => {
    if (value || !user?.id || !capabilities.commercialAssignable) return;
    let active = true;
    (async () => {
      try {
        const { data, error } = await (supabase as any).rpc("get_default_commercial_for_client", {
          _current_user: user.id,
        });
        if (!error && data && active) onChange(data);
      } catch {
        // L'affectation par défaut est décidée par la fonction SQL; aucun repli métier local.
      }
    })();
    return () => {
      active = false;
    };
  }, [value, user?.id, capabilities.commercialAssignable, onChange]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className={cn("flex items-center gap-2 truncate", !selected && "text-muted-foreground")}>
            <Search className="h-4 w-4 shrink-0" />
            {selected ? selected.nom : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Saisir un nom (ex. Koffi)" />
          <CommandList>
            <CommandEmpty>Aucun commercial correspondant.</CommandEmpty>
            <CommandGroup>
              {selected && (
                <CommandItem
                  value="__clear__"
                  onSelect={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                >
                  Retirer l'affectation
                </CommandItem>
              )}
              {options.map((o) => (
                <CommandItem
                  key={o.id}
                  value={`${o.nom} ${o.roles.join(" ")}`}
                  onSelect={() => {
                    onChange(o.id);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === o.id ? "opacity-100" : "opacity-0")} />
                  <span className="flex-1 truncate">{o.nom}</span>
                  {o.roles[0] && (
                    <Badge variant="outline" className="ml-2 text-[10px]">
                      {roleLabel(o.roles[0])}
                    </Badge>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default CommercialCombobox;
