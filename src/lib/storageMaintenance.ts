import { supabase } from "@/integrations/supabase/client";

const LEGACY_PREFIX_RULES: Record<string, (path: string) => boolean> = {
  "photos-profils": (path) => !path.startsWith("profiles/"),
  "pieces-identite": (path) => !path.startsWith("profiles/"),
  // Card images are kept only when they are referenced by cartes_personnel.
  // The old originals/ and unreferenced processed/ files are disposable.
};

async function listAllFiles(bucket: string, path = ""): Promise<string[]> {
  const { data, error } = await supabase.storage.from(bucket).list(path, {
    limit: 1000,
    sortBy: { column: "name", order: "asc" },
  });
  if (error) throw error;

  const files: string[] = [];
  for (const item of data || []) {
    const fullPath = path ? `${path}/${item.name}` : item.name;
    if (item.id === null) files.push(...await listAllFiles(bucket, fullPath));
    else files.push(fullPath);
  }
  return files;
}

async function removePaths(bucket: string, paths: string[]): Promise<void> {
  for (let i = 0; i < paths.length; i += 1000) {
    const batch = paths.slice(i, i + 1000);
    if (!batch.length) continue;
    const { error } = await supabase.storage.from(bucket).remove(batch);
    if (error) throw error;
  }
}

/**
 * Removes only storage layouts that are known to be superseded by the
 * canonical current layouts. The Storage API performs the physical deletion;
 * SQL is never used for object removal.
 */
export async function cleanupLegacyStorage(): Promise<void> {
  for (const [bucket, keepRule] of Object.entries(LEGACY_PREFIX_RULES)) {
    const paths = await listAllFiles(bucket);
    await removePaths(bucket, paths.filter(keepRule));
  }

  // Card images: keep only the exact paths referenced by the live DB.
  const { data: cardRows, error: cardsError } = await (supabase as any)
    .from("cartes_personnel")
    .select("photo_url")
    .not("photo_url", "is", null);
  if (cardsError) throw cardsError;
  const referencedCardPhotos = new Set(
    (cardRows || []).map((row: any) => String(row.photo_url || "")).filter(Boolean),
  );
  const cardPaths = await listAllFiles("cartes-personnel");
  await removePaths(
    "cartes-personnel",
    cardPaths.filter((path) => !referencedCardPhotos.has(path)),
  );

  // Account-request photos use pending/<uuid> paths. Keep only files actually
  // referenced by account_requests.photo_url; everything else is stale.
  const { data: requests, error: requestsError } = await (supabase as any)
    .from("account_requests")
    .select("photo_url")
    .not("photo_url", "is", null);
  if (requestsError) throw requestsError;

  const referenced = new Set(
    (requests || [])
      .map((row: any) => String(row.photo_url || ""))
      .filter(Boolean)
      .map((value: string) => value.split("/storage/v1/object/sign/account-request-photos/").pop() || value)
      .map((value: string) => value.split("?")[0]),
  );

  const accountPaths = await listAllFiles("account-request-photos");
  const staleAccountPaths = accountPaths.filter((path) => !referenced.has(path));
  await removePaths("account-request-photos", staleAccountPaths);
}
