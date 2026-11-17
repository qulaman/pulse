import { describe, expect, it } from "vitest";

import type { Note } from "@/lib/notes/queries";

import { pointToThoughtRefusal } from "./thought";

type Line = Pick<Note, "id" | "board_id" | "parent_id" | "sketch" | "converted_task_id">;
const line = (fields: Partial<Line> = {}): Line => ({
  id: "p1",
  board_id: "b1",
  parent_id: null,
  sketch: null,
  converted_task_id: null,
  ...fields,
});

describe("pointToThoughtRefusal", () => {
  it("lets a plain line of a board go back to the thoughts", () => {
    expect(pointToThoughtRefusal(line(), [{ parent_id: null }, { parent_id: "other" }])).toBeNull();
  });

  it("keeps a point with sub-points, a drawing and a handed-out point on the board", () => {
    expect(pointToThoughtRefusal(line(), [{ parent_id: "p1" }])).toMatch(/подпункт/);
    expect(pointToThoughtRefusal(line({ sketch: { v: 1, strokes: [] } as never }), [])).toMatch(/Рисунок/);
    expect(pointToThoughtRefusal(line({ converted_task_id: "t1" }), [])).toMatch(/поручен/);
  });

  it("keeps a sub-point on the board: «Отменить» would put it back as a point", () => {
    expect(pointToThoughtRefusal(line({ parent_id: "p0" }), [])).toMatch(/Подпункт/);
  });

  it("says nothing of a line that is a thought already", () => {
    expect(pointToThoughtRefusal(line({ board_id: null, sketch: { v: 1 } as never }), [])).toBeNull();
  });
});
