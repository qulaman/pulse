/**
 * Storage paths of the `photos` and `voice` buckets are `{company_id}/{owner_id}/{file}.{ext}`
 * (20260910170000_photos_bucket.sql, 20260910100000_voice_pipeline.sql). A route that signs or
 * downloads a path with the service role acts on anything it is handed, so it checks the path
 * first: only the caller's own company folder, and only that exact shape (principle 6).
 *
 * The shape is the whole check, not a prefix test: storage-js puts the path into the request URL
 * as it is, and fetch folds dot segments — `..` and `%2e%2e` alike — so a path that merely starts
 * with the company folder could still climb out of the bucket and reach another Storage endpoint
 * under the service key. Two plain segments of letters, digits, `-` and `_` and a known extension
 * leave no dot segment, no percent sign, no slash or backslash to play with.
 */
const SEGMENT = "[A-Za-z0-9_-]+";
const EXTENSIONS = "webm|m4a|mp4|jpg|jpeg|png|webp";
const SHAPE = new RegExp(`^(${SEGMENT})/${SEGMENT}/${SEGMENT}\\.(?:${EXTENSIONS})$`);

export function inCompanyFolder(path: string, companyId: string): boolean {
  const match = SHAPE.exec(path);
  return match !== null && match[1] === companyId;
}

/** The caller's own folder inside the company: `{company_id}/{user_id}/…`, same shape rules. */
export function inOwnFolder(path: string, companyId: string, userId: string): boolean {
  return inCompanyFolder(path, companyId) && path.split("/")[1] === userId;
}
