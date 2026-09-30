import { beforeEach, describe, expect, it, vi } from "vitest";

import { VoiceApiError } from "@/lib/voice/api";

import type { PendingMedia } from "./pending";
import { deliverMedia, isTransientMedia, MAX_MEDIA_ATTEMPTS, mediaRound, type MediaDeps } from "./replay";

/** The phone's store, in memory (./pending.ts keeps the same contract over IndexedDB). */
const phone = vi.hoisted(() => ({ rows: new Map<string, PendingMedia>(), claimed: new Set<string>() }));

vi.mock("./pending", () => ({
  listMedia: async (userId: string) =>
    [...phone.rows.values()].filter((item) => item.userId === userId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  patchMedia: async (id: string, patch: Partial<PendingMedia>) => {
    const current = phone.rows.get(id);
    if (current) phone.rows.set(id, { ...current, ...patch });
  },
  dropMedia: async (id: string) => {
    phone.rows.delete(id);
  },
  claimMedia: (id: string) => {
    if (phone.claimed.has(id)) return false;
    phone.claimed.add(id);
    return true;
  },
  releaseMedia: (id: string) => {
    phone.claimed.delete(id);
  },
}));

function item(overrides: Partial<PendingMedia> = {}): PendingMedia {
  const entry: PendingMedia = {
    id: "m-1",
    kind: "voice",
    userId: "u-1",
    companyId: "c-1",
    taskId: "t-1",
    crid: "k-1",
    blob: new Blob(["x"]),
    mime: "audio/webm",
    ext: "webm",
    durationMs: 6400,
    text: "",
    partial: false,
    filePath: null,
    createdAt: "2026-09-30T09:00:00.000Z",
    attempts: 0,
    ...overrides,
  };
  phone.rows.set(entry.id, entry);
  return entry;
}

function deps(overrides: Partial<MediaDeps> = {}) {
  const base = {
    upload: vi.fn<MediaDeps["upload"]>().mockResolvedValue("c-1/u-1/k-1.webm"),
    insertMessage: vi.fn<MediaDeps["insertMessage"]>().mockResolvedValue({ error: null }),
    handIn: vi.fn<MediaDeps["handIn"]>().mockResolvedValue({ status: 200 }),
  };
  return { ...base, ...overrides } as typeof base;
}

const offline = () => new TypeError("Failed to fetch");

beforeEach(() => {
  phone.rows.clear();
  phone.claimed.clear();
});

describe("deliverMedia", () => {
  it("a voice message: the file under its key, then the row under the id minted at the tap", async () => {
    const d = deps();
    expect(await deliverMedia(item(), d)).toEqual({ kind: "sent" });
    expect(d.upload).toHaveBeenCalledTimes(1);
    expect(d.insertMessage).toHaveBeenCalledWith({
      id: "m-1",
      task_id: "t-1",
      company_id: "c-1",
      sender_id: "u-1",
      type: "voice",
      content: null,
      file_path: "c-1/u-1/k-1.webm",
      meta: { duration_ms: 6400 },
    });
  });

  it("does not upload again what is in Storage already", async () => {
    const d = deps();
    await deliverMedia(item({ filePath: "c-1/u-1/k-1.webm" }), d);
    expect(d.upload).not.toHaveBeenCalled();
  });

  it("remembers the upload before the row: a failed row does not upload twice", async () => {
    const d = deps({ insertMessage: vi.fn().mockResolvedValue({ error: { message: "Failed to fetch" } }) });
    await expect(deliverMedia(item(), d)).rejects.toThrow();
    expect(phone.rows.get("m-1")?.filePath).toBe("c-1/u-1/k-1.webm");
  });

  it("a row that did land (duplicate id) is sent", async () => {
    const d = deps({ insertMessage: vi.fn().mockResolvedValue({ error: { message: 'duplicate key value violates unique constraint "task_messages_pkey"' } }) });
    expect(await deliverMedia(item({ kind: "photo", mime: "image/jpeg", ext: "jpg", durationMs: null, text: "Склад" }), d)).toEqual({ kind: "sent" });
  });

  it("a report hands the task in with the photo and the words inside", async () => {
    const d = deps();
    const report = item({ kind: "report", mime: "image/jpeg", ext: "jpg", durationMs: null, text: "Готово", partial: true });
    expect(await deliverMedia(report, d)).toEqual({ kind: "sent" });
    expect(d.handIn).toHaveBeenCalledWith(report, "c-1/u-1/k-1.webm");
    expect(d.insertMessage).not.toHaveBeenCalled();
  });

  it("a report the task outgrew still brings its photo and words into the thread", async () => {
    const d = deps({ handIn: vi.fn().mockResolvedValue({ status: 409, message: "Так нельзя: статус уже изменился" }) });
    const report = item({ kind: "report", mime: "image/jpeg", ext: "jpg", durationMs: null, text: "Готово" });
    expect(await deliverMedia(report, d)).toEqual({ kind: "refused", message: "Так нельзя: статус уже изменился" });
    expect(d.insertMessage).toHaveBeenCalledWith(expect.objectContaining({ id: "m-1", type: "photo", content: "Готово", file_path: "c-1/u-1/k-1.webm" }));
  });

  it("a server that failed at the handover is «later», not «no»", async () => {
    const d = deps({ handIn: vi.fn().mockResolvedValue({ status: 503 }) });
    const report = item({ kind: "report", mime: "image/jpeg", ext: "jpg", durationMs: null });
    const error = await deliverMedia(report, d).catch((e: unknown) => e);
    expect(isTransientMedia(error)).toBe(true);
  });
});

describe("mediaRound", () => {
  it("sends and forgets what went, oldest first", async () => {
    const d = deps();
    item({ id: "a", createdAt: "2026-09-30T09:00:00.000Z" });
    item({ id: "b", crid: "k-2", createdAt: "2026-09-30T09:05:00.000Z" });
    expect(await mediaRound("u-1", d)).toEqual({ sent: 2, refused: [] });
    expect(d.insertMessage.mock.calls.map((call) => (call[0] as { id: string }).id)).toEqual(["a", "b"]);
    expect(phone.rows.size).toBe(0);
    expect(phone.claimed.size).toBe(0);
  });

  it("stops at the first dead network and keeps everything", async () => {
    const d = deps({ upload: vi.fn().mockRejectedValue(offline()) });
    item({ id: "a" });
    item({ id: "b", crid: "k-2", createdAt: "2026-09-30T09:05:00.000Z" });
    expect(await mediaRound("u-1", d)).toEqual({ sent: 0, refused: [] });
    expect(d.upload).toHaveBeenCalledTimes(1);
    expect(phone.rows.get("a")?.attempts).toBe(0);
    expect(phone.rows.size).toBe(2);
  });

  it("leaves alone what the composer is sending right now and what is someone else's", async () => {
    const d = deps();
    item({ id: "mine-now" });
    phone.claimed.add("mine-now");
    item({ id: "other", userId: "u-2" });
    await mediaRound("u-1", d);
    expect(d.upload).not.toHaveBeenCalled();
  });

  it("a refusal that is not the network is tried a few rounds, then given up out loud", async () => {
    const d = deps({ insertMessage: vi.fn().mockRejectedValue(new Error("row-level security")) });
    item({ filePath: "c-1/u-1/k-1.webm" });
    for (let i = 1; i < MAX_MEDIA_ATTEMPTS; i++) {
      expect(await mediaRound("u-1", d)).toEqual({ sent: 0, refused: [] });
      expect(phone.rows.get("m-1")?.attempts).toBe(i);
    }
    expect(await mediaRound("u-1", d)).toEqual({ sent: 0, refused: ["голосовое не прошло"] });
    expect(phone.rows.size).toBe(0);
  });
});

describe("isTransientMedia", () => {
  it("waits out the network, a server hiccup and a lost session", () => {
    expect(isTransientMedia(offline())).toBe(true);
    expect(isTransientMedia(new VoiceApiError("network", 0, null))).toBe(true);
    expect(isTransientMedia(new VoiceApiError("unknown", 502, null))).toBe(true);
    expect(isTransientMedia(new Error("upload url failed (503)"))).toBe(true);
    expect(isTransientMedia(new Error("upload url failed (401)"))).toBe(true);
  });
  it("takes a 4xx as the server's word", () => {
    expect(isTransientMedia(new Error("upload url failed (400)"))).toBe(false);
    expect(isTransientMedia(new VoiceApiError("upload_failed", 403, null))).toBe(false);
  });
});
