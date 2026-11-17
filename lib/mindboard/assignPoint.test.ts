import { describe, expect, it } from "vitest";

import { assignBody, facesFor } from "./assignPoint";

describe("facesFor", () => {
  const everyone = () => true;

  it("puts the board's people first, then the latest given tasks, each once, never the director", () => {
    const faces = facesFor(["b", "a", "b"], [{ assignee_id: "c" }, { assignee_id: "a" }, { assignee_id: "me" }, { assignee_id: "d" }], "me", everyone);
    expect(faces).toEqual(["b", "a", "c", "d"]);
  });

  it("stops at the limit and skips people who are not on the team", () => {
    const sent = ["a", "b", "c", "d", "e", "f", "g"].map((id) => ({ assignee_id: id }));
    expect(facesFor([], sent, "me", (id) => id !== "c", 4)).toEqual(["a", "b", "d", "e"]);
  });

  it("ignores tasks without an assignee", () => {
    expect(facesFor([null, undefined], [{ assignee_id: null }], "me", everyone)).toEqual([]);
  });
});

describe("assignBody", () => {
  it("is the line's task: first line the title, the rest the body, the point marked", () => {
    const body = assignBody({ id: "n1", text: " Генератор\nремонт или новый ", audio_path: null }, { id: "p1", full_name: "Ерлан Б" }, "k1");
    expect(body.client_request_id).toBe("k1");
    expect(body.note_id).toBe("n1");
    expect(body.confirmed_entities[0].title).toBe("Генератор");
    expect(body.confirmed_entities[0].body).toBe("ремонт или новый");
    expect(body.confirmed_entities[0].assignee_id).toBe("p1");
    expect("force_now" in body).toBe(false);
    expect(assignBody({ id: "n1", text: "x", audio_path: null }, { id: "p1", full_name: "Е" }, "k1", true).force_now).toBe(true);
  });
});
