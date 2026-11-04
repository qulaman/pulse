import { apiError, apiOk } from "@/lib/api/respond";
import type { ExportFilesAnswer } from "@/lib/ops/contract";
import { opsRpc, type ExportFile } from "@/lib/ops/db";
import { withOps } from "@/lib/ops/handler";

const PAGE = 50;
/** Long enough to fetch a page of recordings over an office connection. */
const SIGNED_SECONDS = 30 * 60;

/** One page of the company's files, each with a signed address the browser fetches itself. */
export const GET = withOps({ gate: "operator" }, async ({ req, service, params }) => {
  const offset = Number(new URL(req.url).searchParams.get("offset") ?? 0);
  if (!Number.isSafeInteger(offset) || offset < 0) return apiError(400, "validation_error", "Неверный запрос");

  const rows = await opsRpc(service, "ops_export_files", { p_export: params.id, p_offset: offset, p_limit: PAGE });

  const buckets = new Map<string, ExportFile[]>();
  for (const row of rows) buckets.set(row.bucket, [...(buckets.get(row.bucket) ?? []), row]);

  const files: ExportFilesAnswer["files"] = [];
  for (const [bucket, inBucket] of buckets) {
    const { data, error } = await service.storage.from(bucket).createSignedUrls(
      inBucket.map((file) => file.name),
      SIGNED_SECONDS,
    );
    if (error) throw new Error(`ops signed urls failed (${bucket}): ${error.message}`);
    for (const [index, file] of inBucket.entries()) {
      const url = data[index]?.signedUrl;
      if (!url) throw new Error(`ops signed url missing (${bucket})`);
      files.push({ bucket, name: file.name, url, bytes: file.bytes });
    }
  }
  return apiOk({ files, done: rows.length < PAGE } satisfies ExportFilesAnswer);
});
