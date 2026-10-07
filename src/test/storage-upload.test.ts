import { describe, it, expect, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: "user-1" } } }) },
    storage: {
      from: () => ({
        upload: (path: string) => Promise.resolve({ data: { path }, error: null }),
        createSignedUrl: () => Promise.resolve({ data: { signedUrl: "https://signed" } }),
        getPublicUrl: () => ({ data: { publicUrl: "https://pub" } }),
      }),
      getBucket: () => Promise.resolve({ data: { public: false } }),
    },
  },
}));

import { uploadFile, resolveStorageUrl } from "@/utils/storage";

describe("Storage upload (RLS-friendly)", () => {
  it("range les fichiers dans user.id/ pour matcher storage.foldername(name)[1]=auth.uid()", async () => {
    const file = new File(["x"], "x.png", { type: "image/png" });
    const r = await uploadFile("pieces-identite", file);
    expect(r?.path.startsWith("user-1/")).toBe(true);
  });
  it("retourne une URL signée pour bucket privé", async () => {
    const file = new File(["x"], "x.pdf", { type: "application/pdf" });
    const r = await uploadFile("documents-fonciers", file);
    const url = await resolveStorageUrl("documents-fonciers", r?.path);
    expect(url).toBe("https://signed");
  });
});
