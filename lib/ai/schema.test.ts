import { describe, expect, it } from "vitest";

import { ENTITIES_JSON_SCHEMA, ParseResultSchema, type TaskEntity } from "./schema";

type Node = Record<string, unknown>;

function walk(node: unknown, visit: (n: Node) => void): void {
  if (Array.isArray(node)) {
    node.forEach((child) => walk(child, visit));
    return;
  }
  if (typeof node !== "object" || node === null) return;
  visit(node as Node);
  Object.values(node as Node).forEach((child) => walk(child, visit));
}

const TASK: TaskEntity = {
  kind: "task",
  assignee_queries: ["Марату"],
  assignee_id: "u-003",

  assignee_name: null,
  assignee_confidence: 0.9,
  group_id: null,
  title: "КП по Казхрому",
  body: null,
  deadline_iso: null,
  deadline_confidence: null,
  deadline_source_text: null,
  priority: "normal",
  scheduled_send_at: null,
  source_span: "Марату КП по Казхрому",
};

describe("ENTITIES_JSON_SCHEMA", () => {
  it("(а) closes every object and requires every property", () => {
    let objects = 0;
    walk(ENTITIES_JSON_SCHEMA, (node) => {
      if (node.type !== "object" || !node.properties) return;
      objects++;
      expect(node.additionalProperties).toBe(false);
      expect(node.required).toEqual(Object.keys(node.properties as Node));
    });
    expect(objects).toBeGreaterThanOrEqual(8); // root + seven entity kinds
  });

  it("(б) expresses nullability as anyOf, never as a type union with null", () => {
    walk(ENTITIES_JSON_SCHEMA, (node) => {
      expect(Array.isArray(node.type)).toBe(false);
    });

    const task = JSON.stringify(ENTITIES_JSON_SCHEMA);
    expect(task).toContain('{"type":"null"}');
  });
});

describe("ENTITIES_JSON_SCHEMA: discriminator", () => {
  it("(д) unions are anyOf and every variant pins `kind` with const", () => {
    const text = JSON.stringify(ENTITIES_JSON_SCHEMA);
    expect(text).not.toContain("oneOf");
    expect(text).not.toContain("$schema");

    const items = (ENTITIES_JSON_SCHEMA.properties as Node).entities as Node;
    const variants = (items.items as Node).anyOf as Node[];
    expect(variants).toHaveLength(8); // + note (D-75)
    for (const variant of variants) {
      const kind = (variant.properties as Node).kind as Node;
      expect(typeof kind.const).toBe("string");
    }
  });
});

describe("ParseResultSchema", () => {
  it("(в) accepts a task with a null deadline", () => {
    expect(ParseResultSchema.parse({ entities: [TASK] })).toEqual({ entities: [TASK] });
  });

  it("(г) rejects an entity with an unknown field", () => {
    expect(() => ParseResultSchema.parse({ entities: [{ ...TASK, extra: 1 }] })).toThrow();
  });
});
