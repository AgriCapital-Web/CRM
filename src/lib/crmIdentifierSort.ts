const crmIdentifierCollator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

export function compareCrmIdentifiers(a: unknown, b: unknown): number {
  return crmIdentifierCollator.compare(String(a ?? ""), String(b ?? ""));
}

export function sortByCrmIdentifier<T extends { id_unique?: string | null }>(records: readonly T[]): T[] {
  return [...records].sort((a, b) => compareCrmIdentifiers(a.id_unique, b.id_unique));
}
