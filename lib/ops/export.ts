import { opsFetch } from "./client";
import type {
  ExportFilesAnswer,
  ExportFinishAnswer,
  ExportFinishBody,
  ExportPageAnswer,
  ExportStartAnswer,
  ExportStartBody,
} from "./contract";

/**
 * The company's export (D-157, tasks/029), written by the browser into a folder the operator
 * picked: the tables page by page into `<table>.ndjson`, the files into `files/<bucket>/<name>`,
 * `manifest.json` with the numbers and the file list, SHA-256 of the manifest, then `finish`.
 * The server stores nothing: a finished export is the only thing that unlocks the purge, so a
 * file that did not arrive fails the whole run instead of being skipped.
 */

/** One file being written. `abort` leaves no file behind. */
export type ExportWriter = {
  write: (chunk: string | Blob) => Promise<void>;
  close: () => Promise<void>;
  abort: () => Promise<void>;
};

/** Where the export lands; the browser's folder or a test's map. */
export type ExportFolder = {
  name: string;
  open: (path: readonly string[]) => Promise<ExportWriter>;
};

export type ExportApi = {
  start: (body: ExportStartBody) => Promise<ExportStartAnswer>;
  page: (exportId: string, table: string, offset: number) => Promise<ExportPageAnswer>;
  files: (exportId: string, offset: number) => Promise<ExportFilesAnswer>;
  finish: (exportId: string, body: ExportFinishBody) => Promise<ExportFinishAnswer>;
  /** The file's bytes by its signed address. */
  download: (url: string, signal?: AbortSignal) => Promise<Blob>;
};

export type ExportProgress = {
  stage: "tables" | "files" | "manifest";
  /** The table being written; null past the tables. */
  table: string | null;
  tablesDone: number;
  tablesTotal: number;
  rows: number;
  filesDone: number;
  bytes: number;
};

export type ManifestFile = { bucket: string; name: string; path: string; bytes: number };

export type Manifest = {
  format: 1;
  company: { id: string; name: string; slug: string | null };
  export_id: string;
  started_at: string;
  finished_at: string;
  tables: Record<string, number>;
  files: ManifestFile[];
  totals: { rows: number; files: number; bytes: number };
};

export type ExportResult = { exportId: string; sha256: string; totals: Manifest["totals"] };

/** A refused or broken run, in words for the operator. */
export class ExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExportError";
  }
}

/** The operator pressed «Отменить»: not a failure, nothing was finished. */
export class ExportCancelled extends Error {
  constructor() {
    super("Выгрузка отменена");
    this.name = "ExportCancelled";
  }
}

export const MANIFEST_FILE = "manifest.json";

/* ---- the pure part --------------------------------------------------------------------------- */

/** One JSON object per line, each line ended: pages simply follow each other in the file. */
export function toNdjson(rows: readonly unknown[]): string {
  return rows.map((row) => `${JSON.stringify(row)}\n`).join("");
}

/**
 * Where the next page starts; null when this one was the last. A page that says «there is more»
 * and brings nothing would loop for ever, and treating it as the end would cut the data short.
 */
export function nextOffset(offset: number, received: number, done: boolean): number | null {
  if (done) return null;
  if (received === 0) throw new ExportError("Сервер вернул пустую страницу посреди выгрузки");
  return offset + received;
}

// what Windows refuses in a name; a storage key may hold any of these
const RESERVED = /[<>:"\\|?*\u0000-\u001f]/g;

/**
 * `files/<bucket>/<name>` as folder steps. A name comes from the server's listing, but it lands
 * on the operator's disk: a step up the tree is refused, not cleaned, because that is no name
 * this product ever wrote.
 */
export function filePath(bucket: string, name: string): string[] {
  const steps = name.split("/").filter((step) => step.length > 0);
  if (steps.length === 0 || [bucket, ...steps].some((step) => step === "." || step === "..")) {
    throw new ExportError(`Странное имя файла: ${bucket}/${name}`);
  }
  return ["files", bucket, ...steps.map((step) => step.replace(RESERVED, "_"))];
}

export function buildManifest(input: {
  company: Manifest["company"];
  exportId: string;
  startedAt: string;
  finishedAt: string;
  tables: Record<string, number>;
  files: ManifestFile[];
}): Manifest {
  const rows = Object.values(input.tables).reduce((sum, count) => sum + count, 0);
  const bytes = input.files.reduce((sum, file) => sum + file.bytes, 0);
  return {
    format: 1,
    company: input.company,
    export_id: input.exportId,
    started_at: input.startedAt,
    finished_at: input.finishedAt,
    tables: input.tables,
    files: input.files,
    totals: { rows, files: input.files.length, bytes },
  };
}

/** The exact text that lands in the file and goes under the hash. */
export function manifestText(manifest: Manifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

/** What `finish` records: rows per table and the number of files. */
export function exportCounts(manifest: Manifest): Record<string, number> {
  return { ...manifest.tables, files: manifest.totals.files };
}

export function toHex(digest: ArrayBuffer): string {
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(text: string, subtle: Pick<SubtleCrypto, "digest"> = globalThis.crypto.subtle): Promise<string> {
  return toHex(await subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

/* ---- the run --------------------------------------------------------------------------------- */

function checkCancel(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new ExportCancelled();
}

/** One retry: a signed address may stumble once, a second miss is a real one. */
async function fetchFile(api: ExportApi, url: string, signal: AbortSignal | undefined): Promise<Blob> {
  try {
    return await api.download(url, signal);
  } catch {
    checkCancel(signal);
    return api.download(url, signal);
  }
}

async function writeWhole(folder: ExportFolder, path: readonly string[], chunk: string | Blob): Promise<void> {
  const writer = await folder.open(path);
  try {
    await writer.write(chunk);
    await writer.close();
  } catch (error) {
    await writer.abort().catch(() => undefined);
    throw error;
  }
}

/** Every page of one table into its file; the row count back. */
async function writeTable(
  api: ExportApi,
  folder: ExportFolder,
  exportId: string,
  table: string,
  signal: AbortSignal | undefined,
  onRows: (rows: number) => void,
): Promise<number> {
  const writer = await folder.open([`${table}.ndjson`]);
  let count = 0;
  try {
    let offset: number | null = 0;
    while (offset !== null) {
      checkCancel(signal);
      const page: ExportPageAnswer = await api.page(exportId, table, offset);
      if (page.rows.length > 0) await writer.write(toNdjson(page.rows));
      count += page.rows.length;
      onRows(page.rows.length);
      offset = nextOffset(offset, page.rows.length, page.done);
    }
    await writer.close();
  } catch (error) {
    await writer.abort().catch(() => undefined);
    throw error;
  }
  return count;
}

export async function runExport({
  started,
  company,
  folder,
  api,
  signal,
  onProgress,
  digest = sha256Hex,
  now = () => new Date(),
}: {
  started: ExportStartAnswer;
  company: Manifest["company"];
  folder: ExportFolder;
  api: ExportApi;
  signal?: AbortSignal;
  onProgress?: (progress: ExportProgress) => void;
  digest?: (text: string) => Promise<string>;
  now?: () => Date;
}): Promise<ExportResult> {
  const exportId = started.export_id;
  const startedAt = now().toISOString();
  const progress: ExportProgress = { stage: "tables", table: null, tablesDone: 0, tablesTotal: started.tables.length, rows: 0, filesDone: 0, bytes: 0 };
  const tell = () => onProgress?.({ ...progress });

  const tables: Record<string, number> = {};
  for (const table of started.tables) {
    progress.table = table;
    tell();
    tables[table] = await writeTable(api, folder, exportId, table, signal, (rows) => {
      progress.rows += rows;
      tell();
    });
    progress.tablesDone += 1;
  }

  progress.stage = "files";
  progress.table = null;
  tell();
  const files: ManifestFile[] = [];
  let offset: number | null = 0;
  while (offset !== null) {
    checkCancel(signal);
    const page: ExportFilesAnswer = await api.files(exportId, offset);
    for (const file of page.files) {
      checkCancel(signal);
      const path = filePath(file.bucket, file.name);
      let blob: Blob;
      try {
        blob = await fetchFile(api, file.url, signal);
      } catch {
        checkCancel(signal);
        throw new ExportError(`Файл не скачался: ${file.bucket}/${file.name}`);
      }
      // storage may not know a size (0), but a size it knows must match what arrived
      if (file.bytes > 0 && blob.size !== file.bytes) {
        throw new ExportError(`Файл пришёл не целиком: ${file.bucket}/${file.name}`);
      }
      await writeWhole(folder, path, blob);
      files.push({ bucket: file.bucket, name: file.name, path: path.join("/"), bytes: blob.size });
      progress.filesDone += 1;
      progress.bytes += blob.size;
      tell();
    }
    offset = nextOffset(offset, page.files.length, page.done);
  }

  checkCancel(signal);
  progress.stage = "manifest";
  tell();
  const manifest = buildManifest({ company, exportId, startedAt, finishedAt: now().toISOString(), tables, files });
  const text = manifestText(manifest);
  await writeWhole(folder, [MANIFEST_FILE], text);
  const sha256 = await digest(text);

  // past this line the run is finished: a late «Отменить» must not leave it half-recorded
  checkCancel(signal);
  await api.finish(exportId, { sha256, counts: exportCounts(manifest) });
  return { exportId, sha256, totals: manifest.totals };
}

/* ---- the browser ------------------------------------------------------------------------------ */

type PickerOptions = { mode: "readwrite" };
type PickerHost = { showDirectoryPicker?: (options: PickerOptions) => Promise<FileSystemDirectoryHandle> };

/** Only Chrome and Edge can write into a chosen folder. */
export function canPickFolder(host: object = globalThis): boolean {
  return typeof (host as PickerHost).showDirectoryPicker === "function";
}

export function folderFromHandle(root: FileSystemDirectoryHandle): ExportFolder {
  return {
    name: root.name,
    open: async (path) => {
      let dir = root;
      for (const step of path.slice(0, -1)) dir = await dir.getDirectoryHandle(step, { create: true });
      const file = await dir.getFileHandle(path[path.length - 1], { create: true });
      const stream = await file.createWritable();
      return {
        write: (chunk) => stream.write(chunk),
        close: () => stream.close(),
        abort: () => stream.abort(),
      };
    },
  };
}

/**
 * The browser's folder picker. It wants a live click, so it runs first thing on the press, before
 * any network or the code dialog. null — the operator closed it.
 */
export async function pickFolder(host: object = globalThis): Promise<ExportFolder | null> {
  const picker = host as PickerHost;
  if (!picker.showDirectoryPicker) throw new ExportError("Выгрузка в папку работает только в Chrome или Edge");
  try {
    return folderFromHandle(await picker.showDirectoryPicker({ mode: "readwrite" }));
  } catch (error) {
    if ((error as { name?: string }).name === "AbortError") return null;
    throw error;
  }
}

/** The console's routes; signed addresses point at the storage, so no credentials go there. */
export function opsExportApi(companyId: string): ExportApi {
  return {
    start: (body) => opsFetch<ExportStartAnswer>(`/api/ops/companies/${companyId}/export`, { body }),
    page: (exportId, table, offset) =>
      opsFetch<ExportPageAnswer>(`/api/ops/exports/${exportId}/page?table=${encodeURIComponent(table)}&offset=${offset}`),
    files: (exportId, offset) => opsFetch<ExportFilesAnswer>(`/api/ops/exports/${exportId}/files?offset=${offset}`),
    finish: (exportId, body) => opsFetch<ExportFinishAnswer>(`/api/ops/exports/${exportId}/finish`, { body }),
    download: async (url, signal) => {
      const response = await fetch(url, { signal, credentials: "omit" });
      if (!response.ok) throw new ExportError(`Хранилище ответило ${response.status}`);
      return response.blob();
    },
  };
}
