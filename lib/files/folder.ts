/**
 * Storage paths of the `photos` and `voice` buckets are `{company_id}/{owner_id}/{file}`
 * (20260910170000_photos_bucket.sql, 20260910100000_voice_pipeline.sql). A route that signs a path
 * with the service role signs anything it is handed, so it checks the path first: only the caller's
 * own company folder is ever signed, whatever a message row says (principle 6).
 */
export function inCompanyFolder(path: string, companyId: string): boolean {
  return path.startsWith(`${companyId}/`) && !path.includes("..");
}
