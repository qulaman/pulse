import { describe, expect, it } from "vitest";

import { DEFAULT_WORD_KINDS, applyKindEdit, applyVocabularyEdit, classifyWords, similarWord, type WordMeta } from "./dictionary";
import { daysSince, suggestWords, usageOf, whenLine } from "./dictionary-usage";

const at = (day: number) => `2026-09-${String(day).padStart(2, "0")}T06:00:00Z`;

describe("similarWord", () => {
  it("catches the same letters split differently and a letter or two off", () => {
    expect(similarWord("Каз Азот", ["КазАзот", "ERG"])).toBe("КазАзот");
    expect(similarWord("Казазод", ["КазАзот"])).toBe("КазАзот");
  });

  it("leaves the word itself, short abbreviations and different names alone", () => {
    expect(similarWord("казазот", ["КазАзот"])).toBeNull();
    expect(similarWord("ERC", ["ERG"])).toBeNull();
    expect(similarWord("Береке", ["КазАзот", "Актобе-склад"])).toBeNull();
  });
});

describe("classifyWords", () => {
  it("says per line what a pasted column is to the list", () => {
    const people = [{ id: "u1", full_name: "Ерлан Байжанов", aliases: ["Ерлан"] }];
    expect(classifyWords(["КазАзот"], "Шубарколь\nКентау-Транс\nКаз Азот\nЕрлан\nказазот", people)).toEqual([
      { entry: "Шубарколь", verdict: "new" },
      { entry: "Кентау-Транс", verdict: "new" },
      { entry: "Каз Азот", verdict: "similar", to: "КазАзот" },
      { entry: "Ерлан", verdict: "name", to: "Ерлан Байжанов" },
      { entry: "казазот", verdict: "existing" },
    ]);
  });
});

describe("applyVocabularyEdit", () => {
  const stamp = { at: at(24), by: "ТЕСТ" };
  const meta: Record<string, WordMeta> = { казазот: { kind: "counterparty", added_at: at(1), added_by: "Директор" } };

  it("stamps new words with their kind, who and when", () => {
    const out = applyVocabularyEdit(["КазАзот"], meta, { add: ["Шубарколь"], kind: "site" }, stamp);
    expect(out.vocabulary).toEqual(["КазАзот", "Шубарколь"]);
    expect(out.meta.шубарколь).toEqual({ kind: "site", added_at: at(24), added_by: "ТЕСТ" });
    expect(out.meta.казазот).toEqual(meta.казазот);
  });

  it("renames in place, keeping kind and history; a replay is a no-op", () => {
    const once = applyVocabularyEdit(["ERG", "Казазот"], { казазот: meta.казазот }, { rename: { from: "Казазот", to: "КазАзот" } }, stamp);
    expect(once.vocabulary).toEqual(["ERG", "КазАзот"]);
    expect(once.meta.казазот).toEqual(meta.казазот);
    const twice = applyVocabularyEdit(["ERG", "КазАзот"], { казазот: meta.казазот }, { rename: { from: "Казазот", to: "КазАзот" } }, stamp);
    expect(twice.vocabulary).toEqual(["ERG", "КазАзот"]);
    expect(twice.conflict).toBeNull();
  });

  it("moves the meta when the spelling becomes another key, refuses a name already there", () => {
    const moved = applyVocabularyEdit(["Каз Азот"], { "каз азот": meta.казазот }, { rename: { from: "Каз Азот", to: "КазАзот" } }, stamp);
    expect(moved.meta).toEqual({ казазот: meta.казазот });
    const clash = applyVocabularyEdit(["КазАзот", "ERG"], meta, { rename: { from: "ERG", to: "казазот" } }, stamp);
    expect(clash.conflict).toBe("«казазот» уже есть");
    expect(clash.vocabulary).toEqual(["КазАзот", "ERG"]);
  });

  it("changes the kind and drops the meta of a removed word", () => {
    const kinded = applyVocabularyEdit(["КазАзот"], meta, { set_kind: { word: "казазот", kind: "product" } }, stamp);
    expect(kinded.meta.казазот.kind).toBe("product");
    expect(applyVocabularyEdit(["КазАзот"], meta, { remove: ["КазАзот"] }, stamp)).toMatchObject({ vocabulary: [], meta: {} });
  });
});

describe("applyKindEdit", () => {
  const meta: Record<string, WordMeta> = {
    казазот: { kind: "counterparty", added_at: at(1), added_by: "Директор" },
    шубарколь: { kind: "site", added_at: at(2), added_by: "Директор" },
  };

  it("adds a type once — a replay with the same id changes nothing", () => {
    const once = applyKindEdit(DEFAULT_WORD_KINDS, meta, { op: "add", id: "k_1", label: " Поставщик " });
    expect(once.kinds.at(-1)).toEqual({ id: "k_1", label: "Поставщик" });
    expect(applyKindEdit(once.kinds, meta, { op: "add", id: "k_1", label: "Поставщик" }).kinds).toEqual(once.kinds);
  });

  it("refuses a name another type has, an empty one and a thirteenth type", () => {
    expect(applyKindEdit(DEFAULT_WORD_KINDS, meta, { op: "add", id: "k_2", label: "товар" }).conflict).toBe("Тип «товар» уже есть");
    expect(applyKindEdit(DEFAULT_WORD_KINDS, meta, { op: "rename", id: "site", label: "Контрагент" }).conflict).toBe("Тип «Контрагент» уже есть");
    expect(applyKindEdit(DEFAULT_WORD_KINDS, meta, { op: "add", id: "k_3", label: "  " }).conflict).toBe("Так тип не назвать");
    const twelve = Array.from({ length: 12 }, (_, i) => ({ id: `k${i}`, label: `Тип ${i}` }));
    expect(applyKindEdit(twelve, meta, { op: "add", id: "k_x", label: "Ещё" }).conflict).toBe("Типов уже 12");
  });

  it("renames a type — its words keep it, by id", () => {
    const out = applyKindEdit(DEFAULT_WORD_KINDS, meta, { op: "rename", id: "counterparty", label: "Клиент" });
    expect(out.kinds[0]).toEqual({ id: "counterparty", label: "Клиент" });
    expect(out.meta.казазот.kind).toBe("counterparty");
  });

  it("removes a type, moving its words to another one or to «Без типа»", () => {
    const moved = applyKindEdit(DEFAULT_WORD_KINDS, meta, { op: "remove", id: "counterparty", move_to: "site" });
    expect(moved.kinds.map((k) => k.id)).toEqual(["site", "product", "term"]);
    expect(moved.meta.казазот.kind).toBe("site");
    expect(applyKindEdit(DEFAULT_WORD_KINDS, meta, { op: "remove", id: "counterparty", move_to: null }).meta.казазот.kind).toBeNull();
    // a target that is the type itself or gone means «Без типа»
    expect(applyKindEdit(DEFAULT_WORD_KINDS, meta, { op: "remove", id: "site", move_to: "k_gone" }).meta.шубарколь.kind).toBeNull();
  });

  it("moves a type up and down", () => {
    const out = applyKindEdit(DEFAULT_WORD_KINDS, meta, { op: "move", id: "term", index: 0 });
    expect(out.kinds.map((k) => k.id)).toEqual(["term", "counterparty", "site", "product"]);
  });

  it("writes a word's unknown type as «Без типа»", () => {
    const out = applyVocabularyEdit([], {}, { add: ["Шубарколь"], kind: "k_gone" }, { at: at(24), by: null }, DEFAULT_WORD_KINDS);
    expect(out.meta.шубарколь.kind).toBeNull();
  });
});

describe("usageOf", () => {
  const rows = [
    { transcript: "Ерлану отвезти документы в КазАзот до пятницы", created_at: at(20) },
    { transcript: "Позвони в КазАзот и в Актобе-склад", created_at: at(22) },
    { transcript: "с КазАзотом разберись", created_at: at(21) },
    { transcript: null, created_at: at(23) },
  ];

  it("counts phrases a word came up in, any case form, and the last time", () => {
    expect(usageOf(["КазАзот", "Актобе-склад", "ERG"], rows)).toEqual({
      казазот: { count: 3, lastAt: at(22) },
      "актобе-склад": { count: 1, lastAt: at(22) },
      erg: { count: 0, lastAt: null },
    });
  });
});

describe("suggestWords", () => {
  const known = { names: ["Ерлан Байжанов", "Ерлан"], vocabulary: ["КазАзот"], dismissed: [] as string[] };

  it("finds names the speech keeps using and the vocabulary lacks", () => {
    const rows = [
      { transcript: "Ерлан, отвези накладные в Шубарколь. Потом в ТОО Береке.", created_at: at(20) },
      { transcript: "Надо позвонить в Шубарколь и КазАзот, Ерлану сказать про ТОО Береке", created_at: at(22) },
      { transcript: "Подготовь отчёт для ERG", created_at: at(21) },
    ];
    expect(suggestWords(rows, known)).toEqual([
      { key: "тоо бер", keys: ["тоо бер"], word: "ТОО Береке", variants: [], count: 2, lastAt: at(22) },
      { key: "шубарколь", keys: ["шубарколь"], word: "Шубарколь", variants: [], count: 2, lastAt: at(22) },
    ]);
  });

  it("reads a capital after the addressee as a sentence start, and joins spellings of one name", () => {
    // the owner's own recordings on dev, 2026-09-24
    const rows = [
      { transcript: "Динара, Срочно зайди пожалуйста ко мне, Динара.", created_at: at(20) },
      { transcript: "Ерлан, Подготовь коммерческое предложение для Касхрома", created_at: at(21) },
      { transcript: "Айгуль, Подготовь коммерческое предложение для Казхрома", created_at: at(22) },
      { transcript: "Ерлан, Срочно принеси отчёт", created_at: at(23) },
    ];
    const names = { names: ["Динара Ахметова", "Динара", "Ерлан Байжанов", "Ерлан", "Айгуль Сапарова", "Айгуль"], vocabulary: [], dismissed: [] };
    expect(suggestWords(rows, names)).toEqual([
      { key: "касхр", keys: ["касхр", "казхр"], word: "Касхрома", variants: ["Казхрома"], count: 2, lastAt: at(22) },
    ]);
    // once «Казхром» is in the vocabulary, «Касхрома» is its misspelling, not a new name
    expect(suggestWords(rows, { ...names, vocabulary: ["Казхром"] })).toEqual([]);
  });

  it("drops a capitalised word the speech also has in lower case", () => {
    const rows = [
      { transcript: "позвони в Банк насчёт выписки", created_at: at(20) },
      { transcript: "съезди в Банк за картой", created_at: at(21) },
      { transcript: "банк закрыт до обеда", created_at: at(22) },
    ];
    expect(suggestWords(rows, known)).toEqual([]);
  });

  it("skips sentence starts, people, known words, single mentions and what «×» hid", () => {
    const rows = [
      { transcript: "Подготовь отчёт. Отправь его Ерлану. Шубарколь ждёт", created_at: at(20) },
      { transcript: "Подготовь отчёт. Шубарколь снова", created_at: at(21) },
      { transcript: "ещё раз про Шубарколь", created_at: at(22) },
    ];
    expect(suggestWords(rows, known)).toEqual([]);
    const twice = [...rows, { transcript: "звонили из Шубарколь", created_at: at(23) }];
    expect(suggestWords(twice, known).map((s) => s.word)).toEqual(["Шубарколь"]);
    expect(suggestWords(twice, { ...known, dismissed: ["шубарколь"] })).toEqual([]);
  });
});

describe("time lines", () => {
  const now = Date.parse("2026-09-24T12:00:00Z");
  it("speaks in Aqtobe calendar days", () => {
    expect(whenLine("2026-09-24T01:00:00Z", now)).toBe("сегодня");
    expect(whenLine("2026-09-23T10:00:00Z", now)).toBe("вчера");
    expect(whenLine("2026-09-19T10:00:00Z", now)).toBe("5 дней назад");
    expect(daysSince("2026-08-24T10:00:00Z", now)).toBe(31);
  });
});
