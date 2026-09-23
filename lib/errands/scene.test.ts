import { describe, expect, it } from "vitest";

import type { Errand } from "@/lib/errands/queries";
import { deskFocus, deskLine, justDone, sceneOf } from "@/lib/errands/scene";

const AIGUL = "10000000-0000-0000-0000-000000000008";
const MARAT = "10000000-0000-0000-0000-000000000002";

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
    created_at: "2026-09-23T09:00:00Z",
    accepted_at: null,
    done_at: null,
    updated_at: "2026-09-23T09:00:00Z",
    claimed: null,
    author: { full_name: "Директор Демо" },
    ...patch,
  } as Errand;
}

describe("sceneOf", () => {
  it("reads the default buttons by their code, whatever the label became", () => {
    expect(sceneOf({ kind: "coffee", label: "Кофе с молоком" })).toBe("coffee");
    expect(sceneOf({ kind: "tea", label: "Чай" })).toBe("tea");
    expect(sceneOf({ kind: "dnd", label: "Не беспокоить" })).toBe("dnd");
    expect(sceneOf({ kind: "guest", label: "Пригласи гостя" })).toBe("guest");
    expect(sceneOf({ kind: "doctor", label: "Врач" })).toBe("doctor");
    expect(sceneOf({ kind: "come", label: "Зайди ко мне" })).toBe("come");
  });

  it("reads a button the director added by the words of its label", () => {
    expect(sceneOf({ kind: "kapuchino", label: "Капучино" })).toBe("coffee");
    expect(sceneOf({ kind: "chayku", label: "Чайку зелёного" })).toBe("tea");
    expect(sceneOf({ kind: "tishina", label: "Никого не пускать" })).toBe("dnd");
    expect(sceneOf({ kind: "posetitel", label: "Позови посетителя" })).toBe("guest");
  });

  it("does not take a word for a scene by a part in the middle of it", () => {
    // «начальник» holds «ча», «покоф…» is not coffee
    expect(sceneOf({ kind: "boss", label: "Позвать начальника цеха" })).toBe("other");
    expect(sceneOf({ kind: "taxi", label: "Такси" })).toBe("other");
  });
});

describe("deskFocus", () => {
  it("rests when nothing is alive", () => {
    expect(deskFocus([errand({ status: "done", claimed_by: AIGUL })], AIGUL)).toEqual({ scene: null, phase: "rest", errand: null });
  });

  it("puts a request nobody took first, the newest of them", () => {
    const older = errand({ id: "a", kind: "tea", label: "Чай", created_at: "2026-09-23T09:00:00Z" });
    const newer = errand({ id: "b", kind: "guest", label: "Пригласи гостя", created_at: "2026-09-23T09:05:00Z" });
    const doing = errand({ id: "c", status: "accepted", claimed_by: AIGUL });
    const focus = deskFocus([older, doing, newer], AIGUL);
    expect(focus.phase).toBe("asked");
    expect(focus.scene).toBe("guest");
    expect(focus.errand?.id).toBe("b");
  });

  it("acts out the secretary's own job, never somebody else's", () => {
    const theirs = errand({ id: "a", status: "accepted", claimed_by: MARAT, kind: "tea", label: "Чай" });
    const mine = errand({ id: "b", status: "accepted", claimed_by: AIGUL });
    expect(deskFocus([theirs, mine], AIGUL)).toMatchObject({ scene: "coffee", phase: "doing" });
    expect(deskFocus([theirs], AIGUL)).toMatchObject({ scene: null, phase: "rest" });
  });

  it("keeps «не беспокоить» under a job, and guards the door whoever took it", () => {
    const dnd = errand({ id: "a", status: "accepted", claimed_by: MARAT, kind: "dnd", label: "Не беспокоить", created_at: "2026-09-23T09:10:00Z" });
    const coffee = errand({ id: "b", status: "accepted", claimed_by: AIGUL, created_at: "2026-09-23T09:00:00Z" });
    expect(deskFocus([dnd, coffee], AIGUL)).toMatchObject({ scene: "coffee", phase: "doing" });
    expect(deskFocus([dnd], AIGUL)).toMatchObject({ scene: "dnd", phase: "doing" });
  });
});

describe("justDone", () => {
  it("cheers once for this secretary's own «Готово»", () => {
    const before = [errand({ status: "accepted", claimed_by: AIGUL })];
    const after = [errand({ status: "done", claimed_by: AIGUL })];
    expect(justDone(before, after, AIGUL)?.id).toBe("e1");
    expect(justDone(after, after, AIGUL)).toBeNull();
    expect(justDone(before, after, MARAT)).toBeNull();
  });

  it("does not cheer for a declined or cancelled request", () => {
    const before = [errand({ status: "accepted", claimed_by: AIGUL })];
    expect(justDone(before, [errand({ status: "cancelled", claimed_by: AIGUL })], AIGUL)).toBeNull();
  });
});

describe("deskLine", () => {
  it("says the moment in a few words, without gender", () => {
    expect(deskLine({ scene: null, phase: "rest", errand: null })).toBe("Заявок нет — на месте");
    const guest = errand({ kind: "guest", label: "Пригласи гостя" });
    expect(deskLine({ scene: "guest", phase: "asked", errand: guest })).toBe("Директор просит: пригласи гостя");
    expect(deskLine({ scene: "guest", phase: "doing", errand: guest })).toBe("Приглашаю гостя в кабинет");
    expect(deskLine({ scene: "coffee", phase: "done", errand: errand() })).toBe("Готово · кофе");
    const taxi = errand({ kind: "taxi", label: "Такси" });
    expect(deskLine({ scene: "other", phase: "doing", errand: taxi })).toBe("В работе: такси");
  });
});
