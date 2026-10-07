import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

interface TableSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export default function TableSearchInput({
  value,
  onChange,
  placeholder = "Rechercher dans ce tableau…",
}: TableSearchInputProps) {
  return (
    <div className="relative w-full max-w-md">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="pl-9"
      />
    </div>
  );
}