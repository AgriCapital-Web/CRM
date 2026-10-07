import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ResponsiveTablePaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

export default function ResponsiveTablePagination({
  page,
  pageSize,
  total,
  onPageChange,
}: ResponsiveTablePaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  if (total === 0 || totalPages <= 1) return null;

  const start = (safePage - 1) * pageSize + 1;
  const end = Math.min(safePage * pageSize, total);

  return (
    <div className="mt-3 flex flex-col gap-2 border-t pt-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <span>{start}–{end} sur {total}</span>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onPageChange(Math.max(1, safePage - 1))}
          disabled={safePage <= 1}
          aria-label="Page précédente"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="sr-only">Précédente</span>
        </Button>
        <span className="min-w-16 text-center">Page {safePage}/{totalPages}</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onPageChange(Math.min(totalPages, safePage + 1))}
          disabled={safePage >= totalPages}
          aria-label="Page suivante"
        >
          <ChevronRight className="h-4 w-4" />
          <span className="sr-only">Suivante</span>
        </Button>
      </div>
    </div>
  );
}
