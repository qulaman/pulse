import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseTranscript } from "./parse";
import type { RosterUser } from "../matchName";

const ROSTER: RosterUser[] = [{ id: "u-003", full_name: "Марат Оспанов", aliases: ["Марат"], is_active: true }];
const NOW = new Date("2026-08-13T10:00:00+05:00");

const TASK = {
  kind: "task",
  assignee_queries: ["Марат"],
  assignee_name: "Марат Оспанов",
  assignee_confidence: 0.98,
  group_id: null,
  title: "Купить сигареты",
  body: null,
  deadline: null,
  priority: "normal",
  scheduled_send: null,
  source_span: "Марат сигареты",
};

/** A DeepSeek chat completion whose message is `content`. */
function completion(content: string) {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content }, finish_reason: "stop" }],
      usage: { prompt_tokens: 1000, prompt_cache_hit_tokens: 800, prompt_cache_miss_tokens: 200, completion_tokens: 50 },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

describe("parseTranscript: one repair turn for a JSON-mode answer off the schema (task 026)", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  const parse = () =>
    parseTranscript({ transcript: "Марат сигареты", source: "voice", now: NOW, roster: ROSTER, model: "deepseek-chat", escalate: false });

  it("an answer off the schema is sent back once with the issues; both calls are recorded", async () => {
    fetchMock
      .mockResolvedValueOnce(completion(JSON.stringify({ entities: [{ ...TASK, priority: "urgent" }] })))
      .mockResolvedValueOnce(completion(JSON.stringify({ entities: [TASK] })));

    const outcome = await parse();

    expect(outcome.entities).toHaveLength(1);
    expect(outcome.entities[0]).toMatchObject({ kind: "task", title: "Купить сигареты", deadline_iso: null });
    expect(outcome.calls.map((call) => call.ok)).toEqual([false, true]);
    expect(outcome.calls[0].usage.output_tokens).toBe(50);

    const retry = JSON.parse(String(fetchMock.mock.calls[1][1]?.body)) as { messages: { role: string; content: string }[] };
    const [answer, ask] = retry.messages.slice(-2);
    expect(answer).toEqual({ role: "assistant", content: JSON.stringify({ entities: [{ ...TASK, priority: "urgent" }] }) });
    expect(ask.role).toBe("user");
    expect(ask.content).toContain("не прошёл схему");
    expect(ask.content).toContain("priority");
  });

  it("text that is not JSON gets the same one repair turn", async () => {
    fetchMock.mockResolvedValueOnce(completion("{entities: [")).mockResolvedValueOnce(completion(JSON.stringify({ entities: [TASK] })));
    const outcome = await parse();
    expect(outcome.entities).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("a second miss is a parse_failed — there is no third call", async () => {
    fetchMock.mockImplementation(async () => completion(JSON.stringify({ entities: [{ kind: "task" }] })));
    await expect(parse()).rejects.toMatchObject({ code: "parse_failed" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("an answer on the schema the first time is one call", async () => {
    fetchMock.mockResolvedValueOnce(completion(JSON.stringify({ entities: [TASK] })));
    const outcome = await parse();
    expect(outcome.calls).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
