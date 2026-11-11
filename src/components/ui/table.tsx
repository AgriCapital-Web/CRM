import * as React from "react";
import { cn } from "@/lib/utils";
import { useResponsivePageSize } from "@/hooks/useResponsivePageSize";
import ResponsiveTablePagination from "@/components/common/ResponsiveTablePagination";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Download, Search, X } from "lucide-react";

interface TableProps extends React.HTMLAttributes<HTMLTableElement> {
  paginate?: boolean;
  searchable?: boolean;
  exportable?: boolean;
  searchPlaceholder?: string;
  exportFileName?: string;
}

function flattenRows(nodes: React.ReactNode): React.ReactNode[] {
  return React.Children.toArray(nodes).flatMap((node) => {
    if (React.isValidElement(node) && node.type === React.Fragment) {
      return flattenRows((node.props as { children?: React.ReactNode }).children);
    }
    return node == null || typeof node === "boolean" ? [] : [node];
  });
}

function nodeText(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join(" ");
  if (React.isValidElement(node)) {
    return nodeText((node.props as { children?: React.ReactNode }).children);
  }
  return "";
}

function normalizeSearch(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr");
}

function csvCell(value: string): string {
  return '"' + value.replace(/"/g, '""') + '"';
}

function rowCells(row: React.ReactNode): string[] {
  if (!React.isValidElement(row)) return [nodeText(row).trim()];
  const children = flattenRows((row.props as { children?: React.ReactNode }).children);
  return children.map((cell) => nodeText(cell).replace(/\s+/g, " ").trim());
}

const Table = React.forwardRef<HTMLTableElement, TableProps>(
  (
    {
      className,
      children,
      paginate = true,
      searchable = true,
      exportable = true,
      searchPlaceholder = "Rechercher dans ce tableau…",
      exportFileName = "agricapital-export",
      ...props
    },
    ref,
  ) => {
    const pageSize = useResponsivePageSize();
    const [page, setPage] = React.useState(1);
    const [query, setQuery] = React.useState("");
    const childArray = React.Children.toArray(children);
    const bodyIndex = childArray.findIndex(
      (child) => React.isValidElement(child) && child.type === TableBody,
    );
    const header = childArray.find(
      (child) => React.isValidElement(child) && child.type === TableHeader,
    );
    const body = bodyIndex >= 0 ? childArray[bodyIndex] : null;
    const rows = body && React.isValidElement(body)
      ? flattenRows((body.props as { children?: React.ReactNode }).children)
      : [];
    const filteredRows = React.useMemo(() => {
      const term = normalizeSearch(query.trim());
      if (!term) return rows;
      return rows.filter((row) => normalizeSearch(nodeText(row)).includes(term));
    }, [rows, query]);
    const totalRows = filteredRows.length;
    const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
    const safePage = Math.min(page, totalPages);
    const visibleRows = paginate
      ? filteredRows.slice((safePage - 1) * pageSize, safePage * pageSize)
      : filteredRows;

    React.useEffect(() => {
      setPage((current) => Math.min(current, Math.max(1, Math.ceil(totalRows / pageSize))));
    }, [totalRows, pageSize]);

    const renderedChildren = body && React.isValidElement(body)
      ? childArray.map((child, index) =>
          index === bodyIndex
            ? React.cloneElement(child as React.ReactElement, {
                children: visibleRows,
              })
            : child,
        )
      : children;

    const exportCsv = () => {
      const headerRow = header && React.isValidElement(header)
        ? flattenRows((header.props as { children?: React.ReactNode }).children)[0]
        : null;
      const headings = headerRow ? rowCells(headerRow) : [];
      const data = filteredRows.map(rowCells);
      const width = Math.max(headings.length, ...data.map((row) => row.length), 0);
      const csv = [
        headings.length ? headings : Array.from({ length: width }, (_, i) => `Colonne ${i + 1}`),
        ...data,
      ].map((row) => Array.from({ length: width }, (_, i) => csvCell(row[i] || "")).join(";")).join("\r\n");
      const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${exportFileName}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    };

    return (
      <div className="relative w-full min-w-0">
        {(searchable || exportable) && (
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            {searchable ? (
              <div className="relative w-full sm:max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setPage(1);
                  }}
                  placeholder={searchPlaceholder}
                  aria-label={searchPlaceholder}
                  className="h-9 pl-9 pr-9"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => { setQuery(""); setPage(1); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                    aria-label="Effacer la recherche"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ) : <span />}
            {exportable && (
              <Button type="button" variant="outline" size="sm" onClick={exportCsv} disabled={filteredRows.length === 0}>
                <Download className="mr-2 h-4 w-4" />
                Exporter CSV
              </Button>
            )}
          </div>
        )}
        <div className="relative w-full min-w-0 overflow-x-auto overscroll-x-contain">
          <table ref={ref} className={cn("w-max min-w-full caption-bottom text-sm", className)} {...props}>
            {renderedChildren}
          </table>
        </div>
        {paginate && (
          <ResponsiveTablePagination
            page={safePage}
            pageSize={pageSize}
            total={totalRows}
            onPageChange={setPage}
          />
        )}
        {searchable && query && totalRows === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">Aucun résultat</p>
        )}
      </div>
    );
  },
);
Table.displayName = "Table";

const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => <thead ref={ref} className={cn("[&_tr]:border-b", className)} {...props} />,
);
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody ref={ref} className={cn("[&_tr:last-child]:border-0", className)} {...props} />
  ),
);
TableBody.displayName = "TableBody";

const TableFooter = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tfoot ref={ref} className={cn("border-t bg-muted/50 font-medium [&>tr]:last:border-b-0", className)} {...props} />
  ),
);
TableFooter.displayName = "TableFooter";

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn("border-b transition-colors data-[state=selected]:bg-muted hover:bg-muted/50", className)}
      {...props}
    />
  ),
);
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th
      ref={ref}
      className={cn(
        "h-9 px-2 py-1.5 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    />
  ),
);
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <td ref={ref} className={cn("px-2 py-1.5 align-middle [&:has([role=checkbox])]:pr-0", className)} {...props} />
  ),
);
TableCell.displayName = "TableCell";

const TableCaption = React.forwardRef<HTMLTableCaptionElement, React.HTMLAttributes<HTMLTableCaptionElement>>(
  ({ className, ...props }, ref) => (
    <caption ref={ref} className={cn("mt-4 text-sm text-muted-foreground", className)} {...props} />
  ),
);
TableCaption.displayName = "TableCaption";

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
