import { describe, expect, it, vi } from "vitest";

import {
  buildVocabularyHints,
  hintsToPrompt,
  SttError,
  transcribe,
  type SttProvider,
  type SttResult,
} from "./stt";

const ROSTER = {
  users: [
    { full_name: "Ерлан Байжанов", aliases: ["Ерлан Б", "Ерлан Байжанов"] },
    { full_name: "Марат Оспанов", aliases: ["Марат"] },
  ],
  counterparties: ["Казхром", "ERG"],
};

const FAST = { timeoutMs: 50, retryPauseMs: 1 };
const AUDIO = Buffer.from("fake");

function okProvider(name: string, text = "ок"): SttProvider {
  return {
    name,
    transcribe: vi.fn(async (): Promise<SttResult> => ({ text, durationMs: 1, provider: name })),
  };
}

function failingProvider(name: string, status?: number): SttProvider {
  return {
    name,
    transcribe: vi.fn(async () => {
      throw status === undefined
        ? new Error(`${name}: network down`)
        : Object.assign(new Error(`${name} HTTP ${status}`), { status });
    }),
  };
}

function hangingProvider(name: string): SttProvider {
  return {
    name,
    transcribe: vi.fn(
      (_audio: Buffer, _mime: string, opts: { signal?: AbortSignal }) =>
        new Promise<SttResult>((_resolve, reject) => {
          opts.signal?.addEventListener("abort", () => reject(opts.signal?.reason));
        }),
    ),
  };
}

describe("buildVocabularyHints / hintsToPrompt", () => {
  it("joins each user's surfaces once and rebuilds the roster prompt", () => {
    const hints = buildVocabularyHints(ROSTER);
    expect(hints).toContain("Ерлан Байжанов / Ерлан Б");
    expect(hints).toContain("Марат Оспанов / Марат");
    expect(hintsToPrompt(hints)).toBe(
      "Имена сотрудников: Ерлан Байжанов / Ерлан Б, Марат Оспанов / Марат." +
        " Контрагенты и объекты: Казхром, ERG.",
    );
  });
});

describe("transcribe retry policy", () => {
  it("(а) returns the primary result and never touches the fallback", async () => {
    const primary = okProvider("primary", "готово");
    const fallback = okProvider("fallback");
    const result = await transcribe(AUDIO, "audio/mp4", {}, { primary, fallback }, FAST);

    expect(result).toMatchObject({ text: "готово", provider: "primary" });
    expect(fallback.transcribe).not.toHaveBeenCalled();
  });

  it("(б) falls back on a 5xx and returns the fallback result", async () => {
    const primary = failingProvider("primary", 503);
    const fallback = okProvider("fallback", "из фолбэка");
    const result = await transcribe(AUDIO, "audio/mp4", {}, { primary, fallback }, FAST);

    expect(result).toMatchObject({ text: "из фолбэка", provider: "fallback" });
    expect(primary.transcribe).toHaveBeenCalledTimes(1);
  });

  it("(в) retries the primary once after a timeout and a failed fallback", async () => {
    let call = 0;
    const primary: SttProvider = {
      name: "primary",
      transcribe: vi.fn((_audio: Buffer, _mime: string, opts: { signal?: AbortSignal }) => {
        call++;
        if (call === 1) {
          return new Promise<SttResult>((_resolve, reject) => {
            opts.signal?.addEventListener("abort", () => reject(opts.signal?.reason));
          });
        }
        return Promise.resolve({ text: "со второй попытки", durationMs: 1, provider: "primary" });
      }),
    };
    const fallback = failingProvider("fallback");

    const result = await transcribe(AUDIO, "audio/mp4", {}, { primary, fallback }, FAST);

    expect(result).toMatchObject({ text: "со второй попытки", provider: "primary" });
    expect(primary.transcribe).toHaveBeenCalledTimes(2);
    expect(fallback.transcribe).toHaveBeenCalledTimes(1);
  });

  it("(г) throws stt_failed when every attempt fails", async () => {
    const primary = hangingProvider("primary");
    const fallback = failingProvider("fallback", 500);

    await expect(transcribe(AUDIO, "audio/mp4", {}, { primary, fallback }, FAST)).rejects.toMatchObject({
      name: "SttError",
      code: "stt_failed",
    });
    expect(primary.transcribe).toHaveBeenCalledTimes(2);
  });

  it("(д) short-circuits on a 4xx without touching the fallback", async () => {
    const primary = failingProvider("primary", 400);
    const fallback = okProvider("fallback");

    const error = await transcribe(AUDIO, "audio/mp4", {}, { primary, fallback }, FAST).catch((e) => e);

    expect(error).toBeInstanceOf(SttError);
    expect(error.code).toBe("stt_http");
    expect(error.status).toBe(400);
    expect(fallback.transcribe).not.toHaveBeenCalled();
    expect(primary.transcribe).toHaveBeenCalledTimes(1);
  });
});
