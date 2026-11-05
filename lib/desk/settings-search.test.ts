import { describe, expect, it } from "vitest";

import { entryHref, searchSettings, SETTINGS_INDEX } from "@/components/desk/settings/search";

const director = (devTools: boolean) => ({ director: true, devTools });
const secretary = { director: false, devTools: false };

const ids = (query: string, options: Parameters<typeof searchSettings>[1]) => searchSettings(query, options).map((entry) => entry.id);

describe("the settings search and the developers' tools", () => {
  it("finds the lab and the data for a director with the flag", () => {
    expect(ids("парсер", director(true))).toContain("page-lab-parser");
    expect(ids("себестоимость", director(true))).toEqual(["page-lab-costs"]);
    expect(ids("таблицы", director(true))).toEqual(["page-data"]);
    expect(ids("правила компании", director(true))).toContain("parser-rules");
  });

  it("finds nothing of them without the flag — no entry leads to a closed screen", () => {
    for (const query of ["лаб", "парсер", "себестоимость", "таблицы", "правила компании"]) {
      const found = searchSettings(query, director(false));
      expect(found.filter((entry) => entryHref(entry).includes("/desk/settings/lab") || entryHref(entry).includes("/desk/settings/data"))).toEqual([]);
      expect(found.map((entry) => entry.id)).not.toContain("parser-rules");
    }
  });

  it("finds nothing of them for the secretary", () => {
    expect(ids("себестоимость", secretary)).toEqual([]);
    expect(ids("таблицы", secretary)).toEqual([]);
    expect(ids("правила компании", secretary)).toEqual([]);
  });

  it("marks every entry that lives in the two screens", () => {
    for (const entry of SETTINGS_INDEX) {
      if (entry.href?.startsWith("/desk/settings/lab") || entry.href?.startsWith("/desk/settings/data")) expect(entry.devTools).toBe(true);
    }
  });

  it("leaves everything else where it was", () => {
    expect(ids("логотип", secretary)).toEqual(["brand-logo"]);
    expect(ids("словарь", secretary)).toContain("page-words");
    expect(ids("магазин наград", director(false))).toContain("page-shop");
    expect(ids("магазин наград", secretary)).toEqual([]);
  });
});
