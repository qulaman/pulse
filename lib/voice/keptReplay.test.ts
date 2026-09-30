import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PostprocessedEntity } from "../ai/postprocess";
import { VoiceApiError, type VoiceApi } from "./api";
import type { KeptPhrase } from "./kept";
import { advance, isTransient, MAX_ATTEMPTS, replayRound, type ReplayDeps } from "./keptReplay";

/** The phone's store, in memory (lib/voice/kept.ts keeps the same contract over IndexedDB). */
const phone = vi.hoisted(() => ({ rows: new Map<string, KeptPhrase>(), claimed: new Set<string>() }));

vi.mock("./kept", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./kept")>();
  return {
    ...actual,
    listPhrases: async (userId: string) =>
      [...phone.rows.values()].filter((p) => p.userId === userId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    claimPhrase: (id: string) => {
      if (phone.claimed.has(id)) return false;
      phone.claimed.add(id);
      return true;
    },
    releasePhrase: (id: string) => {
      phone.claimed.delete(id);
    },
  };
});

function makeApi() {
  return {
    uploadUrl: vi.fn().mockResolvedValue({ audio_path: "c/u/a.webm", signed_url: "https://s/put", token: "t", inbox_id: "in-1" }),
    uploadAudio: vi.fn().mockResolvedValue(undefined),
    transcribe: vi.fn().mockResolvedValue({ transcript: "отчёт по продажам к пятнице", audio_path: "c/u/a.webm", stt_provider: "openai", latency_ms: 900 }),
    parse: vi.fn().mockResolvedValue({ entities: [task()] }),
    confirm: vi.fn().mockResolvedValue({ result: { task_ids: ["t-1"] }, duplicate: false }),
  } satisfies Record<keyof VoiceApi, unknown>;
}

function deps(api = makeApi()): ReplayDeps & { api: ReturnType<typeof makeApi> } {
  return {
    api,
    patch: vi.fn(async (id: string, patch: Partial<KeptPhrase>) => {
      const current = phone.rows.get(id);
      if (!current) return null;
      const next = { ...current, ...patch };
      phone.rows.set(id, next);
      return next;
    }),
    drop: vi.fn(async (id: string) => {
      phone.rows.delete(id);
    }),
  } as ReplayDeps & { api: ReturnType<typeof makeApi> };
}

function task(): PostprocessedEntity {
  return { kind: "task", title: "Отчёт по продажам", assignee_id: "u-1" } as unknown as PostprocessedEntity;
}

function phrase(overrides: Partial<KeptPhrase> = {}): KeptPhrase {
  const entry: KeptPhrase = {
    id: "p-1",
    userId: "u-dir",
    createdAt: "2026-09-30T09:05:00.000Z",
    updatedAt: 0,
    crid: "p-1",
    source: "voice",
    audio: { blob: new Blob(["x"]), mime: "audio/webm;codecs=opus", durationMs: 4200 },
    audioPath: null,
    inboxId: null,
    transcript: "",
    address: null,
    pinned: null,
    toSecretary: false,
    suspicious: false,
    stage: "recorded",
    entities: [],
    parsedEntities: [],
    errand: null,
    confirm: null,
    failure: null,
    attempts: 0,
    ...overrides,
  };
  phone.rows.set(entry.id, entry);
  return entry;
}

const offline = () => new VoiceApiError("network", 0, new TypeError("Failed to fetch"));

beforeEach(() => {
  phone.rows.clear();
  phone.claimed.clear();
});

describe("advance", () => {
  it("carries a recording all the way to cards, under the key minted at the release", async () => {
    const d = deps();
    const outcome = await advance(phrase(), d);

    expect(outcome).toBe("ready");
    expect(d.api.uploadUrl).toHaveBeenCalledWith(
      expect.objectContaining({ client_request_id: "p-1", context: "director_input", ext: "webm", recorded_at: "2026-09-30T09:05:00.000Z" }),
    );
    expect(d.api.transcribe).toHaveBeenCalledWith(expect.objectContaining({ audio_path: "c/u/a.webm", client_request_id: "p-1", duration_ms: 4200 }));
    expect(d.api.parse).toHaveBeenCalledWith(expect.objectContaining({ transcript: "отчёт по продажам к пятнице", client_request_id: "p-1" }));
    expect(phone.rows.get("p-1")).toMatchObject({ stage: "parsed", audioPath: "c/u/a.webm", inboxId: "in-1" });
    expect(phone.rows.get("p-1")?.entities).toHaveLength(1);
    // the cards wait for the director's tap: nothing is sent by itself (D-36)
    expect(d.api.confirm).not.toHaveBeenCalled();
  });

  it("does not upload again what is in Storage already", async () => {
    const d = deps();
    await advance(phrase({ audioPath: "c/u/a.webm" }), d);
    expect(d.api.uploadUrl).not.toHaveBeenCalled();
    expect(d.api.transcribe).toHaveBeenCalled();
  });

  it("takes an upload the server already has as landed", async () => {
    const d = deps();
    d.api.uploadAudio.mockRejectedValue(new VoiceApiError("upload_failed", 409, { message: "The resource already exists" }));
    await advance(phrase(), d);
    expect(phone.rows.get("p-1")?.stage).toBe("parsed");
  });

  it("glues the addressee picked before speaking to the words, as the face does (D-72)", async () => {
    const d = deps();
    await advance(phrase({ address: "Динаре, " }), d);
    expect(d.api.parse).toHaveBeenCalledWith(expect.objectContaining({ transcript: "Динаре, отчёт по продажам к пятнице" }));
  });

  it("a recording without words waits for the director as «не расслышал»", async () => {
    const d = deps();
    d.api.transcribe.mockResolvedValue({ transcript: null, code: "empty_transcript", audio_path: "c/u/a.webm", stt_provider: "openai", latency_ms: 700 });
    expect(await advance(phrase(), d)).toBe("ready");
    expect(phone.rows.get("p-1")?.failure).toEqual({ code: "empty_transcript" });
    expect(d.api.parse).not.toHaveBeenCalled();
  });

  it("words said into the secretary's desk skip the parser (D-99)", async () => {
    const d = deps();
    await advance(phrase({ stage: "heard", transcript: "такси к шести", toSecretary: true }), d);
    expect(d.api.parse).not.toHaveBeenCalled();
    expect(phone.rows.get("p-1")?.stage).toBe("parsed");
  });

  it("«не берусь разобрать» is the empty card, not a failure", async () => {
    const d = deps();
    d.api.parse.mockRejectedValue(new VoiceApiError("parse_refused", 422, null));
    await advance(phrase({ stage: "heard", transcript: "эээ" }), d);
    expect(phone.rows.get("p-1")).toMatchObject({ stage: "parsed", entities: [], failure: null });
  });

  it("sends a thrown batch as it was thrown and forgets it", async () => {
    const d = deps();
    const confirm = { client_request_id: "p-1", source: "voice" as const, audio_path: "c/u/a.webm", transcript: "…", parsed_entities: [], confirmed_entities: [] };
    expect(await advance(phrase({ stage: "sending", confirm }), d)).toBe("sent");
    expect(d.api.confirm).toHaveBeenCalledWith(confirm);
    expect(phone.rows.has("p-1")).toBe(false);
  });
});

describe("replayRound", () => {
  it("stops at the first dead network and leaves the phrase as it was", async () => {
    const d = deps();
    d.api.uploadUrl.mockRejectedValue(offline());
    phrase({ id: "p-1", createdAt: "2026-09-30T09:00:00.000Z" });
    phrase({ id: "p-2", crid: "p-2", createdAt: "2026-09-30T09:10:00.000Z" });

    const result = await replayRound("u-dir", d);

    expect(result).toEqual({ sent: 0, ready: [] });
    expect(d.api.uploadUrl).toHaveBeenCalledTimes(1);
    expect(phone.rows.get("p-1")).toMatchObject({ stage: "recorded", attempts: 0, failure: null });
    expect(phone.claimed.size).toBe(0);
  });

  it("leaves alone what the face carries, what waits for the director and what is someone else's", async () => {
    const d = deps();
    phrase({ id: "live" });
    phone.claimed.add("live");
    phrase({ id: "cards", stage: "parsed" });
    phrase({ id: "refused", failure: { code: "stt_failed" } });
    phrase({ id: "other", userId: "u-other" });

    await replayRound("u-dir", d);

    expect(d.api.uploadUrl).not.toHaveBeenCalled();
  });

  it("returns the phrases that became ready and counts the batches sent", async () => {
    const d = deps();
    phrase({ id: "p-1", createdAt: "2026-09-30T09:00:00.000Z" });
    phrase({
      id: "p-2",
      crid: "p-2",
      createdAt: "2026-09-30T09:10:00.000Z",
      stage: "sending",
      confirm: { client_request_id: "p-2", source: "typed", audio_path: null, transcript: "…", parsed_entities: [], confirmed_entities: [] },
    });

    const result = await replayRound("u-dir", d);

    expect(result.sent).toBe(1);
    expect(result.ready.map((p) => p.id)).toEqual(["p-1"]);
  });

  it("a step the server keeps refusing goes to the director after a few tries", async () => {
    const d = deps();
    d.api.parse.mockRejectedValue(new VoiceApiError("parse_failed", 422, null));
    phrase({ stage: "heard", transcript: "Марату отчёт" });

    for (let i = 1; i < MAX_ATTEMPTS; i++) {
      await replayRound("u-dir", d);
      expect(phone.rows.get("p-1")).toMatchObject({ attempts: i, failure: null });
    }
    await replayRound("u-dir", d);
    expect(phone.rows.get("p-1")).toMatchObject({ attempts: MAX_ATTEMPTS, failure: { code: "parse_failed" } });
  });

  it("a refused batch goes back to the director at once, with the server's words", async () => {
    const d = deps();
    d.api.confirm.mockRejectedValue(new VoiceApiError("assignee_not_found", 404, { error: { code: "assignee_not_found", message_ru: "Такого сотрудника нет" } }));
    phrase({
      stage: "sending",
      confirm: { client_request_id: "p-1", source: "voice", audio_path: null, transcript: "…", parsed_entities: [], confirmed_entities: [] },
    });

    await replayRound("u-dir", d);

    expect(phone.rows.get("p-1")?.failure).toEqual({ code: "assignee_not_found", message: "Такого сотрудника нет" });
  });

  it("a phrase another tab holds is skipped", async () => {
    const d = deps();
    phrase();
    await replayRound("u-dir", d, { lock: async () => "busy" as const });
    expect(phone.rows.get("p-1")?.stage).toBe("recorded");
  });
});

describe("isTransient", () => {
  it("waits out the network, a server hiccup and «слишком часто»", () => {
    expect(isTransient(offline())).toBe(true);
    expect(isTransient(new VoiceApiError("unknown", 502, null))).toBe(true);
    expect(isTransient(new VoiceApiError("rate_limited", 429, null))).toBe(true);
    expect(isTransient(new VoiceApiError("ai_timeout", 504, null))).toBe(true);
  });
  it("takes a 4xx as the server's word", () => {
    expect(isTransient(new VoiceApiError("parse_failed", 422, null))).toBe(false);
    expect(isTransient(new VoiceApiError("assignee_not_found", 404, null))).toBe(false);
  });
});
