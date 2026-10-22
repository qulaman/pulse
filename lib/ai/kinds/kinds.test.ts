import { describe, expect, it } from "vitest";

import { fewShotMessages, fewShotPairs, FEW_SHOT } from "../examples";
import { PARSER_SYSTEM_PROMPT, parserSystemPrompt } from "../prompt";
import { entitiesJsonSchema, ModelParseResultSchema, modelParseResultSchema } from "../schema";
import { KIND_MODULES, kindModules } from "./index";
import { normalizeKinds, PARSER_KINDS } from "./names";

type Node = Record<string, unknown>;
const variants = (schema: Node) => ((((schema.properties as Node).entities as Node).items as Node).anyOf as Node[]) ?? [];
const kindsOf = (schema: Node) => variants(schema).map((v) => ((v.properties as Node).kind as Node).const);

describe("kind modules (task 026)", () => {
  it("are the eight kinds in the fixed order, each with its own section", () => {
    expect(KIND_MODULES.map((m) => m.kind)).toEqual([...PARSER_KINDS]);
    for (const kind of KIND_MODULES) {
      expect(kind.section.startsWith(`## ${kind.kind} — `)).toBe(true);
      expect(kind.modelSchema.shape.kind.value).toBe(kind.kind);
    }
  });

  it("each pair teaches its own kind and answers in the model's schema", () => {
    for (const kind of KIND_MODULES) {
      for (const pair of kind.examples) {
        expect(pair.assistant.entities.some((e) => e.kind === kind.kind)).toBe(true);
        expect(() => ModelParseResultSchema.parse(pair.assistant)).not.toThrow();
      }
    }
    expect(FEW_SHOT).toHaveLength(13);
  });

  it("normalizeKinds keeps the order, always keeps task and drops unknown names", () => {
    expect(normalizeKinds(undefined)).toEqual([...PARSER_KINDS]);
    expect(normalizeKinds(["query", "points", "magic"])).toEqual(["task", "points", "query"]);
    expect(normalizeKinds([])).toEqual(["task"]);
    expect(kindModules(["note"]).map((m) => m.kind)).toEqual(["task", "note"]);
  });
});

describe("the parser assembled from the kinds that are on", () => {
  it("all kinds — the core prompt; fewer — only their sections, the shared ones stay", () => {
    expect(parserSystemPrompt(undefined, "", PARSER_KINDS)).toBe(PARSER_SYSTEM_PROMPT);
    const narrow = parserSystemPrompt(undefined, "", ["task", "note"]);
    expect(narrow).toContain("## task — ");
    expect(narrow).toContain("## note — ");
    expect(narrow).not.toContain("## points — ");
    expect(narrow).not.toContain("## event — ");
    for (const shared of ["## Сотрудники компании (ростер)", "## Время", "## Безопасность", "## Формат ответа"]) {
      expect(narrow).toContain(shared);
    }
    expect(narrow.indexOf("## Время")).toBeLessThan(narrow.indexOf("## task — "));
    expect(narrow.indexOf("## note — ")).toBeLessThan(narrow.indexOf("## Безопасность"));
  });

  it("a pair shows only while every kind in its answer is on", () => {
    const pairs = fewShotPairs(["task"]);
    expect(pairs.length).toBeGreaterThan(0);
    for (const pair of pairs) expect(pair.assistant.entities.every((e) => e.kind === "task")).toBe(true);
    // П2 (event + points) and П3 (points) need their kinds
    expect(fewShotPairs(["task", "points"]).length).toBe(pairs.length + 1);
    const messages = fewShotMessages(["task"]);
    expect(messages).toHaveLength(pairs.length * 2);
    const last = messages[messages.length - 1].content;
    expect(Array.isArray(last) && "cache_control" in last[0] && last[0].cache_control).toEqual({ type: "ephemeral" });
  });

  it("the schema is the union of the kinds that are on; a switched-off kind does not parse", () => {
    expect(kindsOf(entitiesJsonSchema())).toEqual([...PARSER_KINDS]);
    expect(kindsOf(entitiesJsonSchema(["note", "task"]))).toEqual(["task", "note"]);
    const points = { kind: "points", assignee_queries: [], assignee_name: null, assignee_confidence: 0, amount: 5, reason: null, source_span: "+5" };
    expect(modelParseResultSchema().safeParse({ entities: [points] }).success).toBe(true);
    expect(modelParseResultSchema(["task"]).safeParse({ entities: [points] }).success).toBe(false);
  });
});
