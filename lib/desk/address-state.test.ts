import { describe, expect, it } from "vitest";

import { addressKey, followNext, remember, withParams, wrote, WRITES_KEPT, type DeskAddressState } from "./address-state";

const start = (search = ""): DeskAddressState => ({ seen: addressKey("/desk/tasks", search), path: "/desk/tasks", search });

describe("withParams", () => {
  it("sets, drops and keeps names", () => {
    expect(withParams("/desk/tasks", "who=a&q=x", { id: "7", q: null, who: undefined })).toBe("/desk/tasks?who=a&id=7");
    expect(withParams("/desk/tasks", "id=7", { id: "" })).toBe("/desk/tasks");
  });
});

describe("the desk's address against Next's", () => {
  it("a write of the desk changes what the screen reads", () => {
    expect(wrote(start(), "/desk/tasks", "id=1").search).toBe("id=1");
  });

  it("a write meant for another screen is not taken", () => {
    const one = start("id=1");
    expect(wrote(one, "/desk/team", "p=1")).toBe(one);
  });

  it("Next catching up with the desk's write is only noted — the screen changes in its own transition", () => {
    const after = followNext(start(), "/desk/tasks", "id=1", true);
    expect(after.search).toBe("");
    expect(after.seen).toBe("/desk/tasks?id=1");
  });

  it("Next catching up late does not take the desk back from a newer write", () => {
    const two = wrote(wrote(start(), "/desk/tasks", "id=1"), "/desk/tasks", "id=2");
    expect(followNext(two, "/desk/tasks", "id=1", true).search).toBe("id=2");
  });

  it("Next's own move wins: a link, another screen", () => {
    const one = wrote(start(), "/desk/tasks", "id=1");
    expect(followNext(one, "/desk/tasks", "who=b", false)).toEqual({ seen: "/desk/tasks?who=b", path: "/desk/tasks", search: "who=b" });
    expect(followNext(one, "/desk/team", "", true)).toMatchObject({ path: "/desk/team", search: "" });
  });

  it("remembers the last few writes, a repeat as the newest", () => {
    let list: string[] = [];
    for (let i = 0; i < 20; i += 1) list = remember(list, `k${i}`);
    expect(list).toHaveLength(WRITES_KEPT);
    expect(remember(list, "k15").at(-1)).toBe("k15");
    expect(remember(list, "k15")).toHaveLength(WRITES_KEPT);
  });
});

describe("Back and Forward replay the step", () => {
  it("a tab or a view is a switch, the thing open is a pick, a step of days is nothing", async () => {
    const { moveBetween } = await import("./address-state");
    expect(moveBetween("tab=day", "tab=tabel&month=2026-11")).toBe("desk-switch");
    expect(moveBetween("view=list&p=1", "p=1")).toBe("desk-switch");
    expect(moveBetween("n=1", "n=2")).toBe("desk-pick");
    expect(moveBetween("day=2026-11-20&person=a", "day=2026-11-20")).toBe("desk-pick");
    expect(moveBetween("day=2026-11-19", "day=2026-11-20")).toBeUndefined();
  });
});
