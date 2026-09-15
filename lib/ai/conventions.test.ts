import { describe, expect, it } from "vitest";

import { DEFAULT_CONVENTIONS, renderConventionsTable } from "./conventions";
import { PARSER_SYSTEM_PROMPT, parserSystemPrompt } from "./prompt";

describe("conventions in the parser prompt", () => {
  it("renders every default row and the fixed explicit-time row", () => {
    const table = renderConventionsTable(DEFAULT_CONVENTIONS);
    for (const row of DEFAULT_CONVENTIONS) {
      expect(table).toContain(`| ${row.phrase} | ${row.meaning} | ${row.confidence} |`);
    }
    expect(table).toContain("явное время");
  });

  it("skips rows that are blank after trimming", () => {
    const table = renderConventionsTable([
      { phrase: "  ", meaning: "13:00", confidence: 0.7 },
      { phrase: "к чаю", meaning: "16:00 названного дня", confidence: 0.6 },
    ]);
    expect(table).not.toContain("|   |");
    expect(table).toContain("| к чаю | 16:00 названного дня | 0.6 |");
  });

  it("a company row lands in the prompt; the default prompt has no placeholder left", () => {
    const prompt = parserSystemPrompt([{ phrase: "к пересменке", meaning: "20:00 названного дня", confidence: 0.7 }]);
    expect(prompt).toContain("| к пересменке | 20:00 названного дня | 0.7 |");
    expect(prompt).not.toContain("до обеда");
    expect(PARSER_SYSTEM_PROMPT).not.toContain("{CONVENTIONS_TABLE}");
    expect(PARSER_SYSTEM_PROMPT).toContain("| до обеда | 13:00 названного дня | 0.7 |");
  });
});
