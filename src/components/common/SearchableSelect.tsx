import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface Option { value: string; label: string; flagUrl?: string; }

interface SearchableSelectProps {
  value?: string | null;
  onValueChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  triggerLabel?: string;
  triggerFlagUrl?: string;
  triggerIconOnly?: boolean;
}

export default function SearchableSelect({
  value,
  onValueChange,
  options,
  placeholder = "Sélectionner",
  searchPlaceholder = "Rechercher...",
  emptyText = "Aucun résultat.",
  disabled = false,
  className,
  triggerLabel,
  triggerFlagUrl,
  triggerIconOnly = false,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => options.find((option) => option.value === value), [options, value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" aria-expanded={open} disabled={disabled} className={cn("w-full justify-between font-normal", triggerIconOnly && "justify-center p-0", className)}>
          <span className="flex min-w-0 items-center justify-center gap-2 truncate">{triggerFlagUrl && <img src={triggerFlagUrl} alt="" aria-hidden="true" className="h-4 w-6 shrink-0 rounded-[2px] border object-cover" loading="lazy" />}{!triggerIconOnly && <span className="truncate">{triggerLabel ?? selected?.label ?? placeholder}</span>}</span>
          {!triggerIconOnly ? <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" /> : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem key={option.value} value={option.label} onSelect={() => { onValueChange(option.value); setOpen(false); }}>
                  <Check className={cn("mr-2 h-4 w-4", value === option.value ? "opacity-100" : "opacity-0")} />
                  <span className="flex min-w-0 items-center gap-2 truncate">{option.flagUrl && <img src={option.flagUrl} alt="" aria-hidden="true" className="h-4 w-6 shrink-0 rounded-[2px] border object-cover" loading="lazy" />}<span className="truncate">{option.label}</span></span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
