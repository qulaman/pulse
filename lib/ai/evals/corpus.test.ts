import { describe, expect, it } from "vitest";

import { piecesOf } from "@/lib/lab/parser";
import { casesForKinds, loadCorpus } from "./corpus";
import { PARSER_KINDS } from "../kinds/names";

describe("the parser corpus on disk (docs/AI.md §6)", () => {
  const corpus = loadCorpus();

  it("loads every case with a unique id and a frozen moment", () => {
    expect(corpus.cases.length).toBeGreaterThanOrEqual(66);
    expect(new Set(corpus.cases.map((c) => c.id)).size).toBe(corpus.cases.length);
    for (const c of corpus.cases) expect(Number.isNaN(Date.parse(c.frozen_now))).toBe(false);
  });

  it("hands the model uuids and maps them back to the fixture ids", () => {
    const first = corpus.roster[0];
    expect(first.id).toMatch(/^10000000-0000-4000-8000-\d{12}$/);
    expect(corpus.fixtureId(first.id)).toMatch(/^u-\d{3}$/);
    expect(loadCorpus(undefined, { demoIds: true }).roster[0].id).toMatch(/^u-\d{3}$/);
  });

  it("the hash is stable for one corpus", () => {
    expect(loadCorpus().hash).toBe(corpus.hash);
  });

  it("the lab sends it in pieces that cover every case once", () => {
    const ids = corpus.cases.map((c) => c.id);
    const pieces = piecesOf(ids, 6);
    expect(pieces.flat()).toEqual(ids);
    expect(Math.max(...pieces.map((p) => p.length))).toBe(6);
  });
});

describe("casesForKinds: the corpus of a company's kinds (task 026)", () => {
  const corpus = loadCorpus();

  it("keeps the cases whose expected kinds are all on; a case expecting nothing stays", () => {
    const only = casesForKinds(corpus.cases, ["task"]);
    expect(only.length).toBeGreaterThan(0);
    expect(only.length).toBeLessThan(corpus.cases.length);
    expect(only.every((c) => c.expected.entities.every((e) => e.kind === "task"))).toBe(true);
    expect(only.some((c) => c.expected.entities.length === 0)).toBe(true);
  });

  it("every kind on — the whole corpus, in file order", () => {
    expect(casesForKinds(corpus.cases, PARSER_KINDS).map((c) => c.id)).toEqual(corpus.cases.map((c) => c.id));
  });
});
