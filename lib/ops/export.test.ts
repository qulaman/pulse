import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  buildManifest,
  canPickFolder,
  ExportCancelled,
  exportCounts,
  ExportError,
  filePath,
  folderFromHandle,
  manifestText,
  nextOffset,
  pickFolder,
  runExport,
  sha256Hex,
  toHex,
  toNdjson,
  type ExportApi,
  type ExportFolder,
  type Manifest,
} from "./export";

const COMPANY = { id: "c1", name: "Тест", slug: "test" };

/** A folder in memory: what was closed is in `files`, what was aborted is in `aborted`. */
function memoryFolder() {
  const files = new Map<string, string>();
  const aborted: string[] = [];
  const folder: ExportFolder = {
    name: "тест",
    open: async (path) => {
      const key = path.join("/");
      const parts: (string | Blob)[] = [];
      return {
        write: async (chunk) => {
          parts.push(chunk);
        },
        close: async () => {
          const texts = await Promise.all(parts.map((part) => (typeof part === "string" ? part : part.text())));
          files.set(key, texts.join(""));
        },
        abort: async () => {
          aborted.push(key);
        },
      };
    },
  };
  return { folder, files, aborted };
}

type FakeFile = { bucket: string; name: string; text: string; bytes?: number };

/** The routes: `pageSize` rows at a time, the last page says `done`. */
function fakeApi({ rows = {}, files = [], pageSize = 2, onPage }: { rows?: Record<string, unknown[]>; files?: FakeFile[]; pageSize?: number; onPage?: () => void }) {
  const finish = vi.fn(async () => ({ ok: true as const }));
  const download = vi.fn(async (url: string) => new Blob([files.find((file) => file.name === url)?.text ?? ""]));
  const api: ExportApi = {
    start: async () => ({ export_id: "e1", tables: Object.keys(rows), duplicate: false }),
    page: async (_id, table, offset) => {
      onPage?.();
      const all = rows[table] ?? [];
      return { rows: all.slice(offset, offset + pageSize), done: offset + pageSize >= all.length };
    },
    files: async (_id, offset) => ({
      files: files.slice(offset, offset + pageSize).map((file) => ({ bucket: file.bucket, name: file.name, url: file.name, bytes: file.bytes ?? new Blob([file.text]).size })),
      done: offset + pageSize >= files.length,
    }),
    finish,
    download,
  };
  return { api, finish, download };
}

const STARTED = (tables: string[]) => ({ export_id: "e1", tables, duplicate: false });

const CLOCK = () => {
  let tick = 0;
  return () => new Date(Date.UTC(2026, 10, 4, 10, 0, tick++));
};

describe("toNdjson", () => {
  it("writes one line per row, each ended, so pages simply follow each other", () => {
    expect(toNdjson([{ a: 1 }, { b: "я" }])).toBe('{"a":1}\n{"b":"я"}\n');
    expect(toNdjson([])).toBe("");
  });

  it("keeps a line break inside a value on one line", () => {
    expect(toNdjson([{ text: "раз\nдва" }]).split("\n")).toHaveLength(2);
  });
});

describe("nextOffset", () => {
  it("steps by what really came", () => {
    expect(nextOffset(500, 500, false)).toBe(1000);
    expect(nextOffset(0, 37, false)).toBe(37);
  });

  it("stops on done, even on an empty last page", () => {
    expect(nextOffset(1000, 12, true)).toBeNull();
    expect(nextOffset(1000, 0, true)).toBeNull();
  });

  it("refuses an empty page that promises more: no endless loop, no silent cut", () => {
    expect(() => nextOffset(500, 0, false)).toThrow(ExportError);
  });
});

describe("filePath", () => {
  it("nests the storage key under files/<bucket>", () => {
    expect(filePath("voice", "c1/u1/a.webm")).toEqual(["files", "voice", "c1", "u1", "a.webm"]);
  });

  it("cleans the characters a disk refuses and drops empty steps", () => {
    expect(filePath("photos", "c1//2026-11-04T10:00:00.jpg")).toEqual(["files", "photos", "c1", "2026-11-04T10_00_00.jpg"]);
  });

  it("refuses a way out of the folder", () => {
    expect(() => filePath("voice", "../../secret")).toThrow(ExportError);
    expect(() => filePath("voice", "c1/./a")).toThrow(ExportError);
    expect(() => filePath("..", "a")).toThrow(ExportError);
    expect(() => filePath("voice", "")).toThrow(ExportError);
  });
});

describe("the manifest", () => {
  const manifest: Manifest = buildManifest({
    company: COMPANY,
    exportId: "e1",
    startedAt: "2026-11-04T10:00:00.000Z",
    finishedAt: "2026-11-04T10:05:00.000Z",
    tables: { tasks: 3, profiles: 2, notes_empty: 0 },
    files: [
      { bucket: "voice", name: "a", path: "files/voice/a", bytes: 10 },
      { bucket: "photos", name: "b", path: "files/photos/b", bytes: 5 },
    ],
  });

  it("adds the numbers up", () => {
    expect(manifest.totals).toEqual({ rows: 5, files: 2, bytes: 15 });
  });

  it("gives finish the rows per table and the file count", () => {
    expect(exportCounts(manifest)).toEqual({ tasks: 3, profiles: 2, notes_empty: 0, files: 2 });
  });

  it("is a stable text, ended by a line break", () => {
    expect(manifestText(manifest)).toBe(manifestText(manifest));
    expect(manifestText(manifest).endsWith("}\n")).toBe(true);
    expect(JSON.parse(manifestText(manifest))).toEqual(manifest);
  });
});

describe("the hash", () => {
  it("is SHA-256 of the text in hex", async () => {
    const text = "манифест";
    expect(await sha256Hex(text)).toBe(createHash("sha256").update(text).digest("hex"));
  });

  it("keeps the leading zero of a byte", () => {
    expect(toHex(new Uint8Array([0, 15, 255]).buffer)).toBe("000fff");
  });

  it("takes an injected crypto", async () => {
    const digest = vi.fn(async () => new Uint8Array([1]).buffer);
    expect(await sha256Hex("x", { digest })).toBe("01");
  });
});

describe("runExport", () => {
  const rows = { tasks: [{ id: 1 }, { id: 2 }, { id: 3 }], notes: [] };
  const files = [
    { bucket: "voice", name: "c1/a.webm", text: "голос" },
    { bucket: "photos", name: "c1/b.jpg", text: "фото" },
    { bucket: "photos", name: "c1/c.jpg", text: "ещё" },
  ];

  it("writes tables, files and the manifest, then finishes with its hash", async () => {
    const { folder, files: written } = memoryFolder();
    const { api, finish } = fakeApi({ rows, files });

    const result = await runExport({ started: STARTED(["tasks", "notes"]), company: COMPANY, folder, api, now: CLOCK() });

    expect(written.get("tasks.ndjson")).toBe('{"id":1}\n{"id":2}\n{"id":3}\n');
    expect(written.get("notes.ndjson")).toBe("");
    expect(written.get("files/voice/c1/a.webm")).toBe("голос");
    expect(written.get("files/photos/c1/c.jpg")).toBe("ещё");

    const text = written.get("manifest.json") ?? "";
    const manifest = JSON.parse(text) as Manifest;
    expect(manifest.tables).toEqual({ tasks: 3, notes: 0 });
    expect(manifest.files.map((file) => file.path)).toEqual(["files/voice/c1/a.webm", "files/photos/c1/b.jpg", "files/photos/c1/c.jpg"]);
    expect(manifest.company).toEqual(COMPANY);
    expect(manifest.started_at < manifest.finished_at).toBe(true);

    const sha256 = createHash("sha256").update(text).digest("hex");
    expect(result.sha256).toBe(sha256);
    expect(result.totals.files).toBe(3);
    expect(finish).toHaveBeenCalledWith("e1", { sha256, counts: { tasks: 3, notes: 0, files: 3 } });
  });

  it("tells its progress through the stages", async () => {
    const { folder } = memoryFolder();
    const { api } = fakeApi({ rows, files });
    const seen: { stage: string; rows: number; filesDone: number; tablesDone: number }[] = [];

    await runExport({ started: STARTED(["tasks", "notes"]), company: COMPANY, folder, api, onProgress: (p) => seen.push(p) });

    expect(seen.map((p) => p.stage)).toContain("files");
    expect(seen[seen.length - 1]).toMatchObject({ stage: "manifest", rows: 3, filesDone: 3, tablesDone: 2, tablesTotal: 2 });
  });

  it("retries a file once, and survives one stumble", async () => {
    const { folder, files: written } = memoryFolder();
    const { api, download } = fakeApi({ rows: {}, files: [files[0]] });
    download.mockRejectedValueOnce(new Error("сеть"));

    await runExport({ started: STARTED([]), company: COMPANY, folder, api });

    expect(download).toHaveBeenCalledTimes(2);
    expect(written.get("files/voice/c1/a.webm")).toBe("голос");
  });

  it("never finishes without a file: the export opens the purge", async () => {
    const { folder } = memoryFolder();
    const { api, download, finish } = fakeApi({ rows: {}, files: [files[0]] });
    download.mockRejectedValue(new Error("сеть"));

    await expect(runExport({ started: STARTED([]), company: COMPANY, folder, api })).rejects.toThrow("Файл не скачался: voice/c1/a.webm");
    expect(finish).not.toHaveBeenCalled();
  });

  it("never finishes on a cut file", async () => {
    const { folder } = memoryFolder();
    const { api, finish } = fakeApi({ rows: {}, files: [{ ...files[0], bytes: 9999 }] });

    await expect(runExport({ started: STARTED([]), company: COMPANY, folder, api })).rejects.toThrow("не целиком");
    expect(finish).not.toHaveBeenCalled();
  });

  it("takes a file of unknown size as it came", async () => {
    const { folder } = memoryFolder();
    const { api, finish } = fakeApi({ rows: {}, files: [{ ...files[0], bytes: 0 }] });

    await runExport({ started: STARTED([]), company: COMPANY, folder, api });
    expect(finish).toHaveBeenCalled();
  });

  it("stops on cancel: the open file is dropped, nothing is finished", async () => {
    const controller = new AbortController();
    const { folder, files: written, aborted } = memoryFolder();
    let pages = 0;
    const { api, finish } = fakeApi({
      rows,
      onPage: () => {
        pages += 1;
        if (pages === 1) controller.abort();
      },
    });

    await expect(runExport({ started: STARTED(["tasks"]), company: COMPANY, folder, api, signal: controller.signal })).rejects.toBeInstanceOf(ExportCancelled);
    expect(aborted).toEqual(["tasks.ndjson"]);
    expect(written.has("tasks.ndjson")).toBe(false);
    expect(finish).not.toHaveBeenCalled();
  });

  it("does not retry a download on cancel", async () => {
    const controller = new AbortController();
    const { folder } = memoryFolder();
    const { api, download, finish } = fakeApi({ rows: {}, files: [files[0]] });
    download.mockImplementation(async () => {
      controller.abort();
      throw new Error("aborted");
    });

    await expect(runExport({ started: STARTED([]), company: COMPANY, folder, api, signal: controller.signal })).rejects.toBeInstanceOf(ExportCancelled);
    expect(download).toHaveBeenCalledTimes(1);
    expect(finish).not.toHaveBeenCalled();
  });

  it("drops the table's file when a page fails", async () => {
    const { folder, aborted } = memoryFolder();
    const { api } = fakeApi({ rows });
    api.page = async () => {
      throw new Error("500");
    };

    await expect(runExport({ started: STARTED(["tasks"]), company: COMPANY, folder, api })).rejects.toThrow("500");
    expect(aborted).toEqual(["tasks.ndjson"]);
  });
});

describe("the browser's folder", () => {
  it("tells a browser without the picker", () => {
    expect(canPickFolder({})).toBe(false);
    expect(canPickFolder({ showDirectoryPicker: () => undefined })).toBe(true);
  });

  it("says so honestly instead of opening nothing", async () => {
    await expect(pickFolder({})).rejects.toThrow("Chrome или Edge");
  });

  it("takes a closed picker as no choice, not as a failure", async () => {
    const showDirectoryPicker = async () => {
      throw Object.assign(new Error("closed"), { name: "AbortError" });
    };
    await expect(pickFolder({ showDirectoryPicker })).resolves.toBeNull();
  });

  it("lets any other failure through", async () => {
    const showDirectoryPicker = async () => {
      throw Object.assign(new Error("нет прав"), { name: "SecurityError" });
    };
    await expect(pickFolder({ showDirectoryPicker })).rejects.toThrow("нет прав");
  });

  it("creates the folders on the way to a file", async () => {
    const chain: string[] = [];
    const stream = { write: vi.fn(async () => undefined), close: vi.fn(async () => undefined), abort: vi.fn(async () => undefined) };
    const dir = (name: string): unknown => ({
      name,
      getDirectoryHandle: async (step: string, options: { create: boolean }) => {
        chain.push(`dir:${step}:${options.create}`);
        return dir(step);
      },
      getFileHandle: async (step: string, options: { create: boolean }) => {
        chain.push(`file:${step}:${options.create}`);
        return { createWritable: async () => stream };
      },
    });

    const folder = folderFromHandle(dir("корень") as FileSystemDirectoryHandle);
    const writer = await folder.open(["files", "voice", "a.webm"]);
    await writer.write("x");
    await writer.close();

    expect(folder.name).toBe("корень");
    expect(chain).toEqual(["dir:files:true", "dir:voice:true", "file:a.webm:true"]);
    expect(stream.write).toHaveBeenCalledWith("x");
    expect(stream.close).toHaveBeenCalled();
  });
});
