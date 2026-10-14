import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSystemReferences } from "@/hooks/useSystemReferences";

export const PieceTypeSelect = ({ value, onChange, compact = false }: { value?: string; onChange: (v: string) => void; compact?: boolean }) => {
  const { byCategory, loading } = useSystemReferences(["piece_identite"]);
  const items = byCategory("piece_identite");

  return (
    <Select value={value || ""} onValueChange={onChange} disabled={loading}>
      <SelectTrigger className={compact ? "h-8" : undefined}><SelectValue placeholder={items[0]?.metadata?.placeholder || "Sélectionner le type de pièce"} /></SelectTrigger>
      <SelectContent>
        {items.map((item) => <SelectItem key={item.code} value={item.code}>{item.libelle}</SelectItem>)}
      </SelectContent>
    </Select>
  );
};

export default PieceTypeSelect;
