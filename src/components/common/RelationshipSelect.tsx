import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSystemReferences } from "@/hooks/useSystemReferences";

export const RelationshipSelect = ({ value, onChange }: { value?: string; onChange: (v: string) => void }) => {
  const { byCategory, loading } = useSystemReferences(["lien_familial"]);
  const items = byCategory("lien_familial");

  return (
    <Select value={value || ""} onValueChange={onChange} disabled={loading}>
      <SelectTrigger><SelectValue placeholder={items[0]?.metadata?.placeholder || "Sélectionner le lien"} /></SelectTrigger>
      <SelectContent>
        {items.map((item) => <SelectItem key={item.code} value={item.code}>{item.libelle}</SelectItem>)}
      </SelectContent>
    </Select>
  );
};

export default RelationshipSelect;
