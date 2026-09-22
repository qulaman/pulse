import { describe, expect, it } from "vitest";

import { describeErrandsForDirector, describeErrandsForSecretary } from "@/lib/errands/say";
import type { Errand } from "@/lib/errands/queries";

const AIGUL = "10000000-0000-0000-0000-000000000008";
const ERLAN = "10000000-0000-0000-0000-000000000006";

function errand(patch: Partial<Errand> = {}): Errand {
  return {
    id: "e1",
    company_id: "c1",
    author_id: "d1",
    kind: "coffee",
    label: "Кофе",
    note: null,
    status: "sent",
    claimed_by: null,
    decline_reason: null,
    audio_path: null,
    source_transcript: null,
    inbox_item_id: null,
    client_request_id: null,
    escalated_at: null,
    created_at: "2026-09-22T09:00:00Z",
    accepted_at: null,
    done_at: null,
    updated_at: "2026-09-22T09:00:00Z",
    claimed: null,
    author: { full_name: "Директор Демо" },
    ...patch,
  } as Errand;
}

describe("describeErrandsForDirector", () => {
  it("says who took the errand, without a gendered verb", () => {
    const before = [errand()];
    const after = [errand({ status: "accepted", claimed_by: AIGUL, claimed: { full_name: "Айгуль Сапарова" } })];
    expect(describeErrandsForDirector(before, after)).toEqual([
      { text: "Айгуль · кофе принят", tone: "ok", source: "errand" },
    ]);
  });

  it("says it is done", () => {
    const before = [errand({ status: "accepted", claimed_by: AIGUL, claimed: { full_name: "Айгуль Сапарова" } })];
    const after = [errand({ status: "done", claimed_by: AIGUL, claimed: { full_name: "Айгуль Сапарова" } })];
    expect(describeErrandsForDirector(before, after)[0]?.text).toBe("Айгуль · кофе готов");
  });

  it("carries the reason of a refusal", () => {
    const before = [errand()];
    const after = [errand({ status: "declined", decline_reason: "Закончилось" })];
    expect(describeErrandsForDirector(before, after)).toEqual([
      { text: "кофе не выйдет: закончилось", tone: "warn", source: "errand" },
    ]);
  });

  it("stays silent about an errand that has not moved", () => {
    expect(describeErrandsForDirector([errand()], [errand()])).toEqual([]);
  });

  it("says nothing about the director's own new errand — the tap already said it", () => {
    expect(describeErrandsForDirector([], [errand()])).toEqual([]);
  });
});

describe("describeErrandsForSecretary", () => {
  it("announces a fresh request", () => {
    expect(describeErrandsForSecretary([], [errand()], AIGUL)).toEqual([
      { text: "Директор просит: кофе", tone: "warn", source: "errand" },
    ]);
  });

  it("tells that somebody else was faster", () => {
    const before = [errand()];
    const after = [errand({ status: "accepted", claimed_by: ERLAN, claimed: { full_name: "Ерлан Досов" } })];
    expect(describeErrandsForSecretary(before, after, AIGUL)).toEqual([
      { text: "кофе уже взяли · Ерлан", tone: "muted", source: "errand" },
    ]);
  });

  it("says nothing when the errand is mine", () => {
    const before = [errand()];
    const after = [errand({ status: "accepted", claimed_by: AIGUL, claimed: { full_name: "Айгуль Сапарова" } })];
    expect(describeErrandsForSecretary(before, after, AIGUL)).toEqual([]);
  });
});
