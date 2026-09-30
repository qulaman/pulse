import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PostprocessedEntity } from "../ai/postprocess";
import { VoiceApiError, type VoiceApi } from "../voice/api";
import type { KeptPhrase } from "../voice/kept";
import { bindIngestOwner, KEPT_MS, useIngestStore } from "./ingest";

// Hoisted: vi.mock runs before the imports it replaces.
const api = vi.hoisted(() => ({
  uploadUrl: vi.fn(),
  uploadAudio: vi.fn(),
  transcribe: vi.fn(),
  parse: vi.fn(),
  confirm: vi.fn(),
})) satisfies Record<keyof VoiceApi, unknown>;

vi.mock("../voice/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../voice/api")>();
  return { ...actual, voiceApi: api };
});

/** The phone's store, in memory: the same contract as lib/voice/kept.ts over IndexedDB. */
const phone = vi.hoisted(() => {
  const rows = new Map<string, KeptPhrase>();
  const claimed = new Set<string>();
  const parked = new Set<string>();
  return {
    rows,
    claimed,
    parked,
    keepPhrase: vi.fn(async (entry: KeptPhrase) => {
      rows.set(entry.id, structuredClone({ ...entry, audio: null }) as KeptPhrase);
      if (entry.audio) rows.get(entry.id)!.audio = entry.audio;
      return true;
    }),
    patchPhrase: vi.fn(async (id: string, patch: Partial<KeptPhrase>) => {
      const current = rows.get(id);
      if (!current) return null;
      const next = { ...current, ...patch };
      rows.set(id, next);
      return next;
    }),
    dropPhrase: vi.fn(async (id: string) => {
      rows.delete(id);
    }),
  };
});

vi.mock("../voice/kept", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../voice/kept")>();
  return {
    ...actual,
    keepPhrase: phone.keepPhrase,
    patchPhrase: phone.patchPhrase,
    dropPhrase: phone.dropPhrase,
    claimPhrase: (id: string) => {
      if (phone.claimed.has(id)) return false;
      phone.claimed.add(id);
      return true;
    },
    releasePhrase: (id: string) => {
      phone.claimed.delete(id);
    },
    markParked: (id: string) => {
      phone.parked.add(id);
    },
    forgetParked: (id: string) => {
      phone.parked.delete(id);
    },
    wasParkedHere: (id: string) => phone.parked.has(id),
  };
});

const audio = { blob: new Blob(["x"]), mime: "audio/webm;codecs=opus", durationMs: 4200 };
const offline = () => new VoiceApiError("network", 0, new TypeError("Failed to fetch"));

function task(overrides: Partial<PostprocessedEntity> = {}): PostprocessedEntity {
  return {
    kind: "task",
    assignee_queries: ["Марат"],
    assignee_id: "u-1",
    assignee_name: "Марат Оспанов",
    assignee_confidence: 0.95,
    group_id: null,
    title: "Отчёт по продажам",
    body: null,
    deadline_iso: null,
    deadline_confidence: null,
    deadline_source_text: null,
    priority: "normal",
    scheduled_send_at: null,
    source_span: "Марату отчёт",
    assignee: { status: "matched", user_id: "u-1", candidates: [], flag: "ok" },
    ...overrides,
  } as PostprocessedEntity;
}

/** A settled pipeline: the upload, the words and the cards all answer. */
function serverAnswers(entities: PostprocessedEntity[] = [task()]) {
  api.uploadUrl.mockResolvedValue({ audio_path: "c/u/a.webm", signed_url: "https://s/put", token: "t", inbox_id: "in-1" });
  api.uploadAudio.mockResolvedValue(undefined);
  api.transcribe.mockResolvedValue({ transcript: "Марату отчёт по продажам", audio_path: "c/u/a.webm", stt_provider: "openai", latency_ms: 900 });
  api.parse.mockResolvedValue({ entities });
}

const only = (): KeptPhrase => {
  expect(phone.rows.size).toBe(1);
  return [...phone.rows.values()][0];
};

beforeEach(() => {
  vi.clearAllMocks();
  phone.rows.clear();
  phone.claimed.clear();
  phone.parked.clear();
  bindIngestOwner("u-dir");
  useIngestStore.getState().reset();
});

afterEach(() => {
  vi.useRealTimers();
  bindIngestOwner(null);
});

describe("the phrase kept on the phone (D-130)", () => {
  it("is written down before the first byte leaves the phone", async () => {
    serverAnswers();
    await useIngestStore.getState().ingestAudio(audio);

    expect(phone.keepPhrase).toHaveBeenCalledTimes(1);
    expect(phone.keepPhrase.mock.invocationCallOrder[0]).toBeLessThan(api.uploadUrl.mock.invocationCallOrder[0]);
    const kept = phone.keepPhrase.mock.calls[0][0];
    expect(kept.userId).toBe("u-dir");
    expect(kept.stage).toBe("recorded");
    expect(kept.audio?.blob).toBe(audio.blob);
  });

  it("follows every step: the words, then the cards as the director edits them", async () => {
    serverAnswers();
    await useIngestStore.getState().ingestAudio(audio);
    await vi.waitFor(() => expect(only().stage).toBe("parsed"));
    expect(only()).toMatchObject({ audioPath: "c/u/a.webm", inboxId: "in-1", transcript: "Марату отчёт по продажам" });
    expect(only().entities).toHaveLength(1);

    useIngestStore.getState().editEntity(0, { title: "Отчёт за сентябрь" });
    await vi.waitFor(() => expect((only().entities[0] as { title: string }).title).toBe("Отчёт за сентябрь"));
    // the parser's own output stays for the share-of-edits diff (D-35)
    expect((only().parsedEntities[0] as { title: string }).title).toBe("Отчёт по продажам");
  });

  it("parks the phrase when the network is gone at the upload, and frees the face", async () => {
    vi.useFakeTimers();
    api.uploadUrl.mockRejectedValue(offline());
    await useIngestStore.getState().ingestAudio(audio);

    expect(useIngestStore.getState().stage).toBe("kept");
    expect(useIngestStore.getState().error).toBeNull();
    const kept = only();
    expect(kept.stage).toBe("recorded");
    // handed to the replay: not claimed by the face, remembered as parked here
    expect(phone.claimed.has(kept.id)).toBe(false);
    expect(phone.parked.has(kept.id)).toBe(true);

    vi.advanceTimersByTime(KEPT_MS);
    expect(useIngestStore.getState().stage).toBe("idle");
    expect(phone.rows.size).toBe(1); // the face let go, the phone did not
  });

  it("parks typed words when the parser cannot be reached", async () => {
    api.parse.mockRejectedValue(offline());
    await useIngestStore.getState().submitText("Марату отчёт к пятнице");

    expect(useIngestStore.getState().stage).toBe("kept");
    expect(only()).toMatchObject({ source: "typed", stage: "heard", transcript: "Марату отчёт к пятнице" });
  });

  it("keeps a thrown batch when the network is gone at the send — the same key, to go by itself", async () => {
    serverAnswers();
    await useIngestStore.getState().ingestAudio(audio);
    const key = useIngestStore.getState().clientRequestId;
    api.confirm.mockRejectedValue(offline());

    const res = await useIngestStore.getState().send();

    expect(res).toEqual({ result: {}, duplicate: false, queued: true });
    expect(useIngestStore.getState().stage).toBe("kept");
    const kept = only();
    expect(kept.stage).toBe("sending");
    expect(kept.confirm?.client_request_id).toBe(key);
    expect(kept.confirm?.confirmed_entities).toHaveLength(1);
  });

  it("forgets the phrase once the batch is on the server", async () => {
    serverAnswers();
    await useIngestStore.getState().ingestAudio(audio);
    api.confirm.mockResolvedValue({ result: { task_ids: ["t-1"] }, duplicate: false });

    await useIngestStore.getState().send();

    expect(phone.rows.size).toBe(0);
    expect(useIngestStore.getState().keptId).toBeNull();
  });

  it("forgets it when the director lets it go", async () => {
    serverAnswers();
    await useIngestStore.getState().ingestAudio(audio);
    useIngestStore.getState().reset();
    expect(phone.rows.size).toBe(0);
  });

  it("forgets a recording with no words in it — the audio stays in Storage, nothing is left to carry", async () => {
    serverAnswers();
    api.transcribe.mockResolvedValue({ transcript: null, code: "empty_transcript", audio_path: "c/u/a.webm", stt_provider: "openai", latency_ms: 700 });
    await useIngestStore.getState().ingestAudio(audio);

    expect(useIngestStore.getState().error?.code).toBe("empty_transcript");
    expect(phone.rows.size).toBe(0);
  });

  it("a server that answered with an error is not «no network»: the face shows it and keeps the phrase", async () => {
    api.uploadUrl.mockRejectedValue(new VoiceApiError("upload_failed", 500, null));
    await useIngestStore.getState().ingestAudio(audio);

    expect(useIngestStore.getState().stage).toBe("error");
    expect(useIngestStore.getState().retryFrom).toBe("upload");
    expect(phone.claimed.has(only().id)).toBe(true);
  });

  it("a new phrase over a failed one leaves the old to the replay instead of dropping it", async () => {
    api.uploadUrl.mockRejectedValue(new VoiceApiError("upload_failed", 500, null));
    await useIngestStore.getState().ingestAudio(audio);
    const old = only().id;

    await useIngestStore.getState().submitText("Всем: завтра выходной");

    expect(phone.rows.has(old)).toBe(true);
    expect(phone.claimed.has(old)).toBe(false);
  });

  it("without an owner nothing is kept, and no network is the old «повторить?»", async () => {
    bindIngestOwner(null);
    api.uploadUrl.mockRejectedValue(offline());
    await useIngestStore.getState().ingestAudio(audio);

    expect(phone.keepPhrase).not.toHaveBeenCalled();
    expect(useIngestStore.getState().stage).toBe("error");
    expect(useIngestStore.getState().error?.code).toBe("network");
  });
});

describe("a kept phrase comes back to the face (D-130)", () => {
  function kept(overrides: Partial<KeptPhrase> = {}): KeptPhrase {
    return {
      id: "p-1",
      userId: "u-dir",
      createdAt: "2026-09-30T09:05:00.000Z",
      updatedAt: 0,
      crid: "p-1",
      source: "voice",
      audio: null,
      audioPath: "c/u/a.webm",
      inboxId: "in-1",
      transcript: "Марату отчёт по продажам",
      address: null,
      pinned: null,
      toSecretary: false,
      suspicious: false,
      stage: "parsed",
      entities: [task()],
      parsedEntities: [task()],
      errand: null,
      confirm: null,
      failure: null,
      attempts: 0,
      ...overrides,
    };
  }

  it("its cards go on the board to be confirmed, under its own key", () => {
    const phrase = kept();
    phone.rows.set(phrase.id, phrase);

    expect(useIngestStore.getState().restore(phrase)).toBe(true);
    const state = useIngestStore.getState();
    expect(state.stage).toBe("confirm");
    expect(state.keptId).toBe("p-1");
    expect(state.clientRequestId).toBe("p-1");
    expect(state.entities).toHaveLength(1);
    expect(phone.claimed.has("p-1")).toBe(true);
  });

  it("a batch the server refused comes back as cards to fix, not as a dead end", () => {
    const phrase = kept({ stage: "sending", failure: { code: "assignee_not_found", message: "Такого сотрудника нет" } });
    phone.rows.set(phrase.id, phrase);

    expect(useIngestStore.getState().restore(phrase)).toBe(true);
    expect(useIngestStore.getState().stage).toBe("confirm");
  });

  it("words the replay could not hear come back as «не понял»", () => {
    const phrase = kept({ stage: "recorded", entities: [], parsedEntities: [], transcript: "", failure: { code: "empty_transcript" } });
    phone.rows.set(phrase.id, phrase);

    useIngestStore.getState().restore(phrase);
    expect(useIngestStore.getState().stage).toBe("error");
    expect(useIngestStore.getState().error?.code).toBe("empty_transcript");
    expect(useIngestStore.getState().retryFrom).toBeNull();
  });

  it("a phrase still on its way is not the director's to open", () => {
    expect(useIngestStore.getState().restore(kept({ stage: "heard", entities: [] }))).toBe(false);
    expect(useIngestStore.getState().stage).toBe("idle");
  });

  it("waits while the face is busy with another phrase", async () => {
    serverAnswers();
    await useIngestStore.getState().ingestAudio(audio);
    expect(useIngestStore.getState().stage).toBe("confirm");

    expect(useIngestStore.getState().restore(kept({ id: "p-2", crid: "p-2" }))).toBe(false);
  });
});
