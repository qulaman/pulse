import { AuthError, authErrorMessageRu, getSessionProfile, requireRole } from "@/lib/auth";
import { apiError, apiOk } from "@/lib/api/respond";
import { loadCompanySettings } from "@/lib/roster";
import { parseCompanySettings } from "@/lib/settings";
import { createServiceSupabase } from "@/lib/supabase/service";
import type { Json } from "@/lib/supabase/types";

const MAX_BYTES = 2 * 1024 * 1024;
const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

/**
 * Director uploads the company logo (multipart, ≤ 2 MB). The file lands in the public
 * `brand` bucket under the company folder; the public URL goes to settings.brand.logo_url.
 * Not wrapped in withAuth: the body is a form, not JSON.
 */
export async function POST(req: Request) {
  let profile;
  try {
    profile = await getSessionProfile(req);
    requireRole(profile, "director");
  } catch (error) {
    if (error instanceof AuthError) return apiError(error.status, error.code, authErrorMessageRu(error.code));
    throw error;
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return apiError(400, "validation_error", "Нет файла");
  const ext = EXT[file.type];
  if (!ext) return apiError(400, "validation_error", "Логотип — PNG, JPEG, WebP или SVG");
  if (file.size > MAX_BYTES) return apiError(400, "validation_error", "Логотип не больше 2 МБ");

  const service = createServiceSupabase();
  const path = `${profile.companyId}/logo-${Date.now().toString(36)}.${ext}`;
  const upload = await service.storage.from("brand").upload(path, await file.arrayBuffer(), {
    contentType: file.type,
    upsert: true,
    cacheControl: "3600",
  });
  if (upload.error) {
    console.error("logo upload failed:", upload.error.message);
    return apiError(502, "upload_failed", "Не удалось загрузить логотип, попробуй ещё раз");
  }
  const { data: pub } = service.storage.from("brand").getPublicUrl(path);

  // the service role carries no company, so the RPC merge is not for it: write the row
  const raw = ((await loadCompanySettings(profile.companyId)) ?? {}) as Record<string, unknown>;
  const current = parseCompanySettings(raw);
  const previous = current.brand.logo_url;
  const next = { ...raw, brand: { ...current.brand, logo_url: pub.publicUrl } } as Json;
  const { error } = await service.from("companies").update({ settings: next }).eq("id", profile.companyId);
  if (error) throw new Error(`brand update failed: ${error.message}`);

  // the old file is not needed any more
  const oldPath = previous?.split("/brand/")[1];
  if (oldPath && oldPath !== path) await service.storage.from("brand").remove([oldPath]).catch(() => undefined);

  return apiOk({ logo_url: pub.publicUrl });
}
