import { describe, expect, it } from "vitest";

import { buildVocabularyHints } from "./stt";
import { guardTranscript, isOpus, isSilentOpus } from "./stt-guard";

const HINTS = buildVocabularyHints({
  users: [
    { full_name: "Ерлан Байжанов", aliases: ["Ерлан Б"] },
    { full_name: "Марат Оспанов", aliases: ["Марат"] },
  ],
  counterparties: ["Казхром", "ERG"],
});

// 120 normalized characters — the shape of a healthy 9-second dictation.
const NORMAL =
  "Марат подготовь коммерческое предложение для Казхрома завтра до обеда " +
  "и созвонись с подрядчиком по срокам поставки сразу";

describe("guardTranscript", () => {
  it("passes a healthy transcript (9 с / 120 симв)", () => {
    expect(guardTranscript({ text: NORMAL, durationMs: 9000, vocabularyHints: HINTS })).toEqual({
      ok: true,
      suspicious: false,
    });
  });

  it("too_short: a lone word", () => {
    expect(guardTranscript({ text: "Ага", durationMs: 4000, vocabularyHints: HINTS })).toEqual({
      ok: false,
      code: "too_short",
    });
  });

  // D-52: «Марат сигареты» is an order, not silence — it must reach the parser.
  it("passes a two-word telegraphic order", () => {
    expect(
      guardTranscript({ text: "Марат сигареты", durationMs: 1500, vocabularyHints: HINTS }),
    ).toEqual({ ok: true, suspicious: false });
  });

  it("a two-word transcript is never treated as prompt echo", () => {
    expect(
      guardTranscript({ text: "Марат Казхром", durationMs: 1500, vocabularyHints: HINTS }),
    ).toEqual({ ok: true, suspicious: false });
  });

  it("phantom: known Whisper filler", () => {
    expect(
      guardTranscript({ text: "Продолжение следует...", durationMs: 4000, vocabularyHints: HINTS }),
    ).toEqual({ ok: false, code: "phantom" });
  });

  it("prompt_echo: transcript built out of the hint vocabulary", () => {
    const result = guardTranscript({
      text: "Ерлан Байжанов Марат Оспанов Казхром",
      durationMs: 4000,
      vocabularyHints: HINTS,
    });
    expect(result).toEqual({ ok: false, code: "prompt_echo" });
  });

  // The prompt's own words are ordinary speech; only names count towards the echo share.
  it("prompt scaffolding words in real speech are not an echo", () => {
    expect(
      guardTranscript({
        text: "Директор сказал сотрудникам компании работать",
        durationMs: 4000,
        vocabularyHints: HINTS,
      }),
    ).toEqual({ ok: true, suspicious: false });
  });

  it("loop: one phrase repeated back to back", () => {
    expect(
      guardTranscript({ text: "иди сюда иди сюда иди сюда", durationMs: 6000, vocabularyHints: HINTS }),
    ).toEqual({ ok: false, code: "loop" });
  });

  it("too_dense: more than 30 chars per second", () => {
    expect(guardTranscript({ text: NORMAL, durationMs: 2000, vocabularyHints: HINTS })).toEqual({
      ok: false,
      code: "too_dense",
    });
  });

  // Slow speech with pauses looks exactly like noise to a density check; the director
  // decides on /confirm, the guard only flags (D-52).
  it("low_density: sparse speech is suspicious, never dropped", () => {
    expect(
      guardTranscript({ text: "Марат сделай КП завтра", durationMs: 5000, vocabularyHints: HINTS }),
    ).toEqual({ ok: true, suspicious: true, reason: "low_density" });

    expect(
      guardTranscript({ text: "Марат КП завтра", durationMs: 5000, vocabularyHints: HINTS }),
    ).toEqual({ ok: true, suspicious: true, reason: "low_density" });
  });

  // Live failure 2026-08-20: whisper returned a verbatim slice of the roster prompt
  // on a Kazakh phrase. Either diagnosis is acceptable, both drop the transcript.
  it("drops the live 'Контрагенты и объекты' echo", () => {
    const result = guardTranscript({
      text: "Контрагенты и объекты. Контрагенты и объекты.",
      durationMs: 5000,
      vocabularyHints: HINTS,
    });
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(["prompt_echo", "loop"]).toContain(result.code);
  });
});

describe("isSilentOpus — a dead microphone by the size of the file (AI.md §1 (з))", () => {
  it("the 2026-11-17 recording: 2981 bytes for 8.4 s of Opus is silence", () => {
    expect(isSilentOpus({ bytes: 2981, durationMs: 8435, opus: true })).toBe(true);
  });

  it("speech, even a short phrase in a long pause, is not", () => {
    expect(isSilentOpus({ bytes: 21952, durationMs: 2270, opus: true })).toBe(false);
    expect(isSilentOpus({ bytes: 6400, durationMs: 10000, opus: true })).toBe(false);
    // a latched minute of silence with 1.5 s of speech in it
    expect(isSilentOpus({ bytes: 9000 + 58_500 * 0.28, durationMs: 60_000, opus: true })).toBe(false);
  });

  it("a longer silence is silence too", () => {
    expect(isSilentOpus({ bytes: 1000 + 60 * 280, durationMs: 60_000, opus: true })).toBe(true);
  });

  it("judges neither a short recording nor an AAC one", () => {
    expect(isSilentOpus({ bytes: 300, durationMs: 2000, opus: true })).toBe(false);
    expect(isSilentOpus({ bytes: 2981, durationMs: 8435, opus: false })).toBe(false);
  });

  it("knows Opus in an mp4 and in a webm", () => {
    const bytes = (text: string) => new TextEncoder().encode(text);
    expect(isOpus(bytes("....ftypisom....moov....Opus....dOps"))).toBe(true);
    // «Opus» alone somewhere in the data of another codec is no sample entry
    expect(isOpus(bytes("....ftypM4A ....mp4a....esds....Opus...."))).toBe(false);
    expect(isOpus(bytes("\u001aE\u00df\u00a3....A_OPUS...."))).toBe(true);
    expect(isOpus(bytes("....ftypM4A ....mp4a....esds"))).toBe(false);
  });
});
