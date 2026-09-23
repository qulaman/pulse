import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PostprocessedEntity } from "../ai/postprocess";
import { VoiceApiError, type VoiceApi } from "../voice/api";
import { describeParticipants, isNotesOnly, useIngestStore } from "./ingest";

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

function taskEntity(overrides: Partial<PostprocessedEntity> = {}): PostprocessedEntity {
  return {
    kind: "task",
    assignee_queries: ["Ерлан"],
    assignee_id: null,
    assignee_confidence: 0.4,
    group_id: null,
    title: "КП для Казхрома",
    body: null,
    deadline_iso: null,
    deadline_confidence: null,
    deadline_source_text: null,
    priority: "normal",
    scheduled_send_at: null,
    source_span: "КП для Казхрома",
    assignee: {
      status: "ambiguous",
      user_id: null,
      candidates: [
        { user_id: "u-1", full_name: "Ерлан Сатов", score: 0.8 },
        { user_id: "u-2", full_name: "Ерлан Ким", score: 0.75 },
      ],
      flag: "check",
    },
    blocked: "assignee_unmatched",
    ...overrides,
  } as PostprocessedEntity;
}

const audio = { blob: new Blob(["x"]), mime: "audio/webm;codecs=opus", durationMs: 4200 };

function noteEntity(text = "Сделать акцию для Альфы"): PostprocessedEntity {
  return { kind: "note", text, source_span: text } as PostprocessedEntity;
}

beforeEach(() => {
  vi.clearAllMocks();
  useIngestStore.getState().reset();
});

describe("ingest store", () => {
  it("takes typed input straight to confirm", async () => {
    const entity = taskEntity({ blocked: undefined, assignee_id: "u-1" });
    api.parse.mockResolvedValue({ entities: [entity] });

    await useIngestStore.getState().submitText("  Ерлану КП для Казхрома  ");
    const state = useIngestStore.getState();

    expect(api.parse).toHaveBeenCalledWith(
      expect.objectContaining({ transcript: "Ерлану КП для Казхрома", source: "typed" }),
    );
    expect(state.stage).toBe("confirm");
    expect(state.source).toBe("typed");
    expect(state.clientRequestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(state.entities).toEqual([entity]);
    expect(state.parsedEntities).toEqual([entity]);
    expect(state.error).toBeNull();
  });

  it("surfaces empty_transcript without calling the parser", async () => {
    api.uploadUrl.mockResolvedValue({ audio_path: "c/u/1.webm", signed_url: "https://s", token: "t" });
    api.uploadAudio.mockResolvedValue(undefined);
    api.transcribe.mockRejectedValue(new VoiceApiError("empty_transcript", 422, { error: { code: "empty_transcript" } }));

    await useIngestStore.getState().ingestAudio(audio);
    const state = useIngestStore.getState();

    expect(state.stage).toBe("error");
    expect(state.error?.code).toBe("empty_transcript");
    expect(state.retryFrom).toBeNull();
    expect(api.parse).not.toHaveBeenCalled();
  });

  it("keeps the audio path on stt_failed and retries transcription", async () => {
    api.uploadUrl.mockResolvedValue({ audio_path: "c/u/2.webm", signed_url: "https://s", token: "t" });
    api.uploadAudio.mockResolvedValue(undefined);
    api.transcribe.mockRejectedValue(
      new VoiceApiError("stt_failed", 502, { error: { code: "stt_failed" }, audio_path: "c/u/2.webm" }),
    );

    useIngestStore.setState({ clientRequestId: crypto.randomUUID() });
    await useIngestStore.getState().ingestAudio(audio);

    expect(useIngestStore.getState().error?.code).toBe("stt_failed");
    expect(useIngestStore.getState().retryFrom).toBe("transcribe");
    expect(useIngestStore.getState().audioPath).toBe("c/u/2.webm");
    expect(useIngestStore.getState().audio).not.toBeNull();

    api.transcribe.mockResolvedValue({
      transcript: "Ерлану КП",
      audio_path: "c/u/2.webm",
      stt_provider: "openai",
      latency_ms: 900,
    });
    api.parse.mockResolvedValue({ entities: [taskEntity({ blocked: undefined, assignee_id: "u-1" })] });

    await useIngestStore.getState().retry();

    expect(api.uploadUrl).toHaveBeenCalledTimes(1); // no re-upload of the same recording
    expect(api.uploadUrl).toHaveBeenCalledWith(
      expect.objectContaining({ client_request_id: useIngestStore.getState().clientRequestId }),
    );
    expect(api.transcribe).toHaveBeenCalledWith(expect.objectContaining({ duration_ms: audio.durationMs }));
    expect(useIngestStore.getState().stage).toBe("confirm");
  });

  it("sends only unblocked entities and the assignee the director picked", async () => {
    const blocked = taskEntity();
    const announcement = {
      kind: "announcement",
      text: "В пятницу общий сбор",
      source_span: "В пятницу общий сбор",
    } as PostprocessedEntity;
    const points = {
      kind: "points",
      assignee_queries: ["Ерлан"],
      assignee_id: "u-1",
      assignee_confidence: 0.9,
      amount: 10,
      reason: "за скорость",
      source_span: "плюс десять Ерлану",
    } as PostprocessedEntity;

    api.parse.mockResolvedValue({ entities: [blocked, announcement, points] });
    api.confirm.mockResolvedValue({ result: { task_ids: ["t-1"] }, duplicate: false });

    await useIngestStore.getState().submitText("Ерлану КП, в пятницу общий сбор, плюс десять");

    // The director taps the second candidate on the ambiguous chip.
    useIngestStore.getState().editEntity(0, {
      assignee: {
        status: "matched",
        user_id: "u-2",
        candidates: blocked.assignee?.candidates ?? [],
        flag: "ok",
      },
      blocked: undefined,
    });

    await useIngestStore.getState().send(true);

    expect(api.confirm).toHaveBeenCalledTimes(1);
    const payload = api.confirm.mock.calls[0][0];
    expect(payload.force_now).toBe(true);
    expect(payload.source).toBe("typed");
    expect(payload.client_request_id).toBe(useIngestStore.getState().clientRequestId);
    expect(payload.confirmed_entities).toHaveLength(2); // points never reach the batch (G.22)
    expect(payload.confirmed_entities[0]).toMatchObject({ kind: "task", assignee_id: "u-2" });
    expect(payload.confirmed_entities[0]).not.toHaveProperty("assignee");
    expect(payload.confirmed_entities[0]).not.toHaveProperty("blocked");
    expect(payload.confirmed_entities[1]).toMatchObject({ kind: "announcement" });
    expect(payload.parsed_entities[0]).not.toHaveProperty("assignee");
    expect(payload.parsed_entities[0].assignee_id).toBeNull(); // the diff keeps what the model said
    expect(useIngestStore.getState().stage).toBe("done");
  });

  it("saves a notes-only phrase without the confirm screen", async () => {
    api.parse.mockResolvedValue({ entities: [noteEntity()] });
    api.confirm.mockResolvedValue({ result: { note_ids: ["n-1"] }, duplicate: false });

    await useIngestStore.getState().submitText("запиши мысль: сделать акцию для Альфы");

    expect(api.confirm).toHaveBeenCalledTimes(1);
    expect(api.confirm.mock.calls[0][0].confirmed_entities).toHaveLength(1);
    // the toast said «Записал» and the pipeline is free for the next phrase
    expect(useIngestStore.getState().stage).toBe("idle");
    expect(useIngestStore.getState().entities).toEqual([]);
  });

  it("retries a failed notes-only send and still says «Записал»", async () => {
    api.parse.mockResolvedValue({ entities: [noteEntity()] });
    api.confirm
      .mockRejectedValueOnce(new VoiceApiError("network", 0, null))
      .mockResolvedValueOnce({ result: { note_ids: ["n-1"] }, duplicate: false });

    await useIngestStore.getState().submitText("запиши мысль: сделать акцию для Альфы");
    expect(useIngestStore.getState().stage).toBe("error");
    expect(useIngestStore.getState().retryFrom).toBe("send");

    await useIngestStore.getState().retry();

    expect(api.confirm).toHaveBeenCalledTimes(2);
    // the second attempt ends exactly like the first would have: saved, toasted, pipeline free
    expect(useIngestStore.getState().stage).toBe("idle");
    expect(useIngestStore.getState().entities).toEqual([]);
  });

  it("keeps a mixed phrase on the confirm screen", async () => {
    const task = taskEntity({ blocked: undefined, assignee_id: "u-1" });
    api.parse.mockResolvedValue({ entities: [noteEntity(), task] });

    await useIngestStore.getState().submitText("запиши мысль про акцию и Марат позвони Альфе");

    expect(api.confirm).not.toHaveBeenCalled();
    expect(useIngestStore.getState().stage).toBe("confirm");
    expect(useIngestStore.getState().entities).toHaveLength(2);
  });

  it("hands a note out as a task titled by its first line, the rest under it", () => {
    useIngestStore
      .getState()
      .startFromNote({ id: "n-1", text: "\nАкция для Альфы\nскидка 10% оптовикам\nдо пятницы ", audio_path: "c/u/n.webm" }, "task");
    const state = useIngestStore.getState();

    expect(api.parse).not.toHaveBeenCalled();
    expect(state.stage).toBe("confirm");
    expect(state.noteId).toBe("n-1");
    expect(state.audioPath).toBe("c/u/n.webm");
    expect(state.entities[0]).toMatchObject({
      kind: "task",
      title: "Акция для Альфы",
      body: "скидка 10% оптовикам\nдо пятницы",
      blocked: "assignee_unmatched",
    });
  });

  it("announces a note with its whole text", () => {
    useIngestStore.getState().startFromNote({ id: "n-2", text: "Собрание в пятницу\nв 10:00", audio_path: null }, "announcement");

    expect(useIngestStore.getState().entities[0]).toMatchObject({ kind: "announcement", text: "Собрание в пятницу\nв 10:00" });
  });
});

describe("isNotesOnly", () => {
  it("is true for notes alone", () => {
    expect(isNotesOnly([noteEntity(), noteEntity("Подумать про склад")])).toBe(true);
  });

  it("is false when a task rides along", () => {
    expect(isNotesOnly([noteEntity(), taskEntity()])).toBe(false);
  });

  it("is false for an empty parse", () => {
    expect(isNotesOnly([])).toBe(false);
  });
});

describe("describeParticipants", () => {
  const nameOf = (id: string) => ({ "u-003": "Марат", "u-005": "Айгуль", "u-001": "Ерлан" })[id];

  it("says «Все» when the whole company is invited", () => {
    expect(describeParticipants({ everyone: true, participant_ids: [] }, nameOf)).toBe("Все");
  });

  it("says «Только я» when nobody else is in it — the author always is", () => {
    expect(describeParticipants({ everyone: false, participant_ids: [] }, nameOf)).toBe("Только я");
  });

  it("names two people in full", () => {
    expect(describeParticipants({ everyone: false, participant_ids: ["u-003", "u-005"] }, nameOf)).toBe(
      "Марат, Айгуль",
    );
  });

  it("counts the rest after the first name", () => {
    expect(
      describeParticipants({ everyone: false, participant_ids: ["u-003", "u-005", "u-001"] }, nameOf),
    ).toBe("Марат +2");
  });
});
