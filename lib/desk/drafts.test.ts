import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Drafts = typeof import("./drafts");

/** A tab's sessionStorage: survives a reload (a fresh module), as the real one does. */
function fakeStorage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  return {
    get length() {
      return map.size;
    },
    key: (index: number) => [...map.keys()][index] ?? null,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    map,
  };
}

async function freshPage(sessionStorage: unknown): Promise<Drafts> {
  vi.resetModules();
  vi.stubGlobal("window", { sessionStorage });
  return import("./drafts");
}

describe("drafts of the answer field", () => {
  let box: ReturnType<typeof fakeStorage>;
  beforeEach(() => {
    box = fakeStorage();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("keeps the words by task", async () => {
    const { readDraft, writeDraft } = await freshPage(box);
    writeDraft("me", "t1", "Жду смету");
    writeDraft("me", "t2", "Другое");
    expect(readDraft("me", "t1")).toBe("Жду смету");
    expect(readDraft("me", "t2")).toBe("Другое");
    expect(readDraft("me", "t3")).toBe("");
  });

  it("survives a reload of the page", async () => {
    const first = await freshPage(box);
    first.writeDraft("me", "t1", "Жду смету");
    const second = await freshPage(box);
    expect(second.readDraft("me", "t1")).toBe("Жду смету");
    expect([...second.draftTasks("me")]).toEqual(["t1"]);
  });

  it("is over once sent, and spaces are no draft", async () => {
    const { clearDraft, draftTasks, readDraft, writeDraft } = await freshPage(box);
    writeDraft("me", "t1", "Жду смету");
    clearDraft("me", "t1");
    expect(readDraft("me", "t1")).toBe("");
    expect(draftTasks("me").size).toBe(0);
    expect(box.map.size).toBe(0);
    writeDraft("me", "t2", "   \n ");
    expect(draftTasks("me").size).toBe(0);
  });

  it("does not show one person's draft to another in the same tab", async () => {
    const { draftTasks, readDraft, writeDraft } = await freshPage(box);
    writeDraft("me", "t1", "Жду смету");
    expect(readDraft("other", "t1")).toBe("");
    expect(draftTasks("other").size).toBe(0);
  });

  it("gives the marks the same set until a task gains or loses a draft", async () => {
    const { draftTasks, writeDraft } = await freshPage(box);
    writeDraft("me", "t1", "Ж");
    const before = draftTasks("me");
    writeDraft("me", "t1", "Жд");
    expect(draftTasks("me")).toBe(before);
    writeDraft("me", "t2", "Ещё");
    expect(draftTasks("me")).not.toBe(before);
  });

  it("still holds the words when the storage refuses", async () => {
    const refusing = {
      get length(): number {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("quota");
      },
      removeItem() {
        throw new Error("blocked");
      },
    };
    const { clearDraft, readDraft, writeDraft } = await freshPage(refusing);
    writeDraft("me", "t1", "Жду смету");
    expect(readDraft("me", "t1")).toBe("Жду смету");
    clearDraft("me", "t1");
    expect(readDraft("me", "t1")).toBe("");
  });

  it("works with no window at all", async () => {
    vi.resetModules();
    vi.unstubAllGlobals();
    const { readDraft, writeDraft } = await import("./drafts");
    writeDraft("me", "t1", "Жду смету");
    expect(readDraft("me", "t1")).toBe("Жду смету");
  });
});
