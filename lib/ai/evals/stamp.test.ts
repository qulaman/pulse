import { describe, expect, it } from "vitest";

import { collectRun, runFingerprint, signPiece, type RunConfig } from "./stamp";
import { failedCase, type CaseResult, type EvalCase } from "./score";

const SECRET = "test-secret";
const COMPANY = "company-a";

const CONFIG: RunConfig = {
  rules: "«Склад» — это Тимур.",
  model: "claude-haiku-4-5",
  escalate: true,
  escalationModel: "claude-sonnet-5",
  corpusHash: "corpus-1",
};

function okCase(id: string): CaseResult {
  const c: EvalCase = { id, source: "voice", transcript: "", frozen_now: "2026-08-13T16:32:00+05:00", expected: { entities: [] } };
  return { ...failedCase(c, ""), ok: true, error: undefined, splitOk: true, queryOk: true };
}

function piece(ids: string[], fingerprint = runFingerprint(CONFIG), company = COMPANY, cost: number | null = 0.01) {
  return signPiece(SECRET, company, { fingerprint, ran_at: "2026-10-20T10:00:00Z", results: ids.map(okCase), cost_usd: cost });
}

describe("signed corpus runs (D-138)", () => {
  const fingerprint = runFingerprint(CONFIG);

  it("genuine pieces covering the corpus make one run, metrics recomputed on the server", () => {
    const run = collectRun(SECRET, COMPANY, fingerprint, ["a", "b", "c"], [piece(["a", "b"]), piece(["c"])]);
    expect(run.ok).toBe(true);
    if (!run.ok) return;
    expect(run.results.map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(run.metrics.cases).toBe(3);
    expect(run.costUsd).toBeCloseTo(0.02);
  });

  it("an edited payload, another company's piece or a made-up stamp is forged", () => {
    const genuine = piece(["a"]);
    const edited = { ...genuine, payload: genuine.payload.replace('"ok":true', '"ok":false') };
    expect(collectRun(SECRET, COMPANY, fingerprint, ["a"], [edited])).toEqual({ ok: false, reason: "forged" });
    expect(collectRun(SECRET, COMPANY, fingerprint, ["a"], [piece(["a"], fingerprint, "company-b")])).toEqual({ ok: false, reason: "forged" });
    expect(collectRun(SECRET, COMPANY, fingerprint, ["a"], [{ ...genuine, stamp: "zz" }])).toEqual({ ok: false, reason: "forged" });
  });

  it("a run of another text, model or corpus is stale; a missing case is incomplete", () => {
    const other = runFingerprint({ ...CONFIG, rules: "другое" });
    expect(collectRun(SECRET, COMPANY, fingerprint, ["a"], [piece(["a"], other)])).toEqual({ ok: false, reason: "stale" });
    expect(collectRun(SECRET, COMPANY, fingerprint, ["a", "b"], [piece(["a"])])).toEqual({ ok: false, reason: "incomplete" });
  });

  it("a case run twice keeps one result; an unpriced piece makes the cost unknown", () => {
    const run = collectRun(SECRET, COMPANY, fingerprint, ["a"], [piece(["a"]), piece(["a"], fingerprint, COMPANY, null)]);
    expect(run.ok && run.results.length).toBe(1);
    expect(run.ok && run.costUsd).toBeNull();
  });

  it("the fingerprint follows everything the parse depends on", () => {
    expect(runFingerprint({ ...CONFIG })).toBe(fingerprint);
    expect(runFingerprint({ ...CONFIG, model: "claude-sonnet-5" })).not.toBe(fingerprint);
    expect(runFingerprint({ ...CONFIG, escalate: false })).not.toBe(fingerprint);
    expect(runFingerprint({ ...CONFIG, corpusHash: "corpus-2" })).not.toBe(fingerprint);
    expect(runFingerprint({ ...CONFIG, matching: { autoThreshold: 0.6 } })).not.toBe(fingerprint);
    // the second model does not matter while nothing is sent to it
    const off = { ...CONFIG, escalate: false };
    expect(runFingerprint({ ...off, escalationModel: "deepseek-chat" })).toBe(runFingerprint(off));
  });
});
