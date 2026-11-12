import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { INDEX_PATH, readSchemaIndex, renderSchemaIndex } from "../scripts/schema-index";

const lf = (text: string) => text.split("\r\n").join("\n");

describe("supabase/SCHEMA.md (D-162)", () => {
  const index = readSchemaIndex();

  it("is rebuilt after every migration — run `pnpm db:index`", () => {
    // a migration that lands without the pointer leaves it pointing at an outdated definition
    expect(lf(readFileSync(INDEX_PATH, "utf8"))).toBe(renderSchemaIndex(index));
  });

  it("finds a definition in force for every function that was not dropped", () => {
    for (const [name, fn] of index.functions) {
      expect(fn.defs.length, name).toBeGreaterThan(0);
      if (!fn.dropped) expect(fn.defs[fn.defs.length - 1].file, name).toMatch(/^\d{14}_[a-z0-9_]+\.sql$/);
    }
  });

  it("reads the objects the schema is known to hold", () => {
    // anchors of the parser: the core table, its guard, the function redefined most often
    expect(index.tables.has("tasks")).toBe(true);
    expect(index.tables.has("ops.audit")).toBe(true);
    expect(index.functions.get("confirm_voice_batch")?.defs.length).toBeGreaterThanOrEqual(8);
    expect(index.policies.has("tasks.tasks_select")).toBe(true);
    expect(index.enums.has("task_status")).toBe(true);
  });
});
