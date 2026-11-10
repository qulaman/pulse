import { describe, expect, it } from "vitest";

import { addInTurn, BULK_MAX, matchPerson, matchRows, nameKey, parseBulk, personBody, rowsToAdd, type RosterPerson } from "./bulk";

const read = (text: string) => parseBulk(text).map(({ full_name, position, phone }) => [full_name, position, phone]);

describe("parseBulk — the separators", () => {
  it("reads Excel's tabs", () => {
    expect(read("Иван Петров\tБухгалтер\t+7 701 234 56 78")).toEqual([["Иван Петров", "Бухгалтер", "+7 701 234 56 78"]]);
  });

  it("reads «;» and «,»", () => {
    expect(read("Иван Петров; Бухгалтер; 8 701 234 56 78\nДина Ким, Юрист, +77011112233")).toEqual([
      ["Иван Петров", "Бухгалтер", "8 701 234 56 78"],
      ["Дина Ким", "Юрист", "+77011112233"],
    ]);
  });

  it("takes the strongest separator of the line: a comma inside a tab's or a «;»'s cell stays", () => {
    expect(read("Иван Петров\tНачальник, отдел продаж\t87012345678")).toEqual([["Иван Петров", "Начальник, отдел продаж", "87012345678"]]);
    expect(read("Иван Петров;Начальник, отдел продаж;87012345678")).toEqual([["Иван Петров", "Начальник, отдел продаж", "87012345678"]]);
  });

  it("keeps a separator inside double quotes, as CSV does", () => {
    expect(read('"Петров, Иван",Бухгалтер,87012345678')).toEqual([["Петров, Иван", "Бухгалтер", "87012345678"]]);
    expect(read('Иван Петров,"Начальник ""склада"", старший",87012345678')).toEqual([["Иван Петров", 'Начальник "склада", старший', "87012345678"]]);
  });

  it("clears Excel's non-breaking and doubled spaces", () => {
    expect(read("Иван   Петров\t Бухгалтер ")).toEqual([["Иван Петров", "Бухгалтер", ""]]);
  });

  it("handles every line ending and skips blank lines, keeping the paste's line numbers", () => {
    const rows = parseBulk("Иван Петров\r\n\r\nДина Ким\rТимур Ли\n");
    expect(rows.map((row) => [row.line, row.full_name])).toEqual([
      [1, "Иван Петров"],
      [3, "Дина Ким"],
      [4, "Тимур Ли"],
    ]);
  });

  it("gives nothing for an empty paste", () => {
    expect(parseBulk("")).toEqual([]);
    expect(parseBulk("  \n\t\n ")).toEqual([]);
  });
});

describe("parseBulk — what stands where", () => {
  it("takes a name alone, and a name with a position", () => {
    expect(read("Иван Петров")).toEqual([["Иван Петров", "", ""]]);
    expect(read("Иван Петров; Бухгалтер")).toEqual([["Иван Петров", "Бухгалтер", ""]]);
  });

  it("finds the phone wherever it stands", () => {
    expect(read("Иван Петров\t+7 701 234 56 78\tБухгалтер")).toEqual([["Иван Петров", "Бухгалтер", "+7 701 234 56 78"]]);
  });

  it("finds it at the end of a line with no separator", () => {
    expect(read("Иван Петров 8 (701) 234-56-78")).toEqual([["Иван Петров", "", "8 (701) 234-56-78"]]);
    expect(read("Иван Петров")).toEqual([["Иван Петров", "", ""]]);
  });

  it("drops a word before the number", () => {
    expect(read("Иван Петров;Бухгалтер;тел. +7 701 234 56 78")).toEqual([["Иван Петров", "Бухгалтер", "+7 701 234 56 78"]]);
  });

  it("keeps an empty middle cell empty", () => {
    expect(read("Иван Петров\t\t87012345678")).toEqual([["Иван Петров", "", "87012345678"]]);
  });

  it("joins what is left into the position: a comma of a sentence, not a column", () => {
    expect(read("Иван Петров, начальник отдела, продажи, 87012345678")).toEqual([["Иван Петров", "начальник отдела, продажи", "87012345678"]]);
  });

  it("takes a short town number from the third column", () => {
    expect(read("Иван Петров;Бухгалтер;54-12-34")).toEqual([["Иван Петров", "Бухгалтер", "54-12-34"]]);
  });

  it("does not take a short number from a name's own cells", () => {
    expect(read("Иван Петров;Склад 12345")).toEqual([["Иван Петров", "Склад 12345", ""]]);
  });

  it("drops a row number", () => {
    expect(read("1\tИван Петров\tБухгалтер\n2\tДина Ким\tЮрист")).toEqual([
      ["Иван Петров", "Бухгалтер", ""],
      ["Дина Ким", "Юрист", ""],
    ]);
    expect(read("1. Иван Петров\n2) Дина Ким")).toEqual([
      ["Иван Петров", "", ""],
      ["Дина Ким", "", ""],
    ]);
  });
});

describe("parseBulk — a head of columns", () => {
  it("is no person", () => {
    expect(read("ФИО\tДолжность\tТелефон\nИван Петров\tБухгалтер\t87012345678")).toEqual([["Иван Петров", "Бухгалтер", "87012345678"]]);
  });

  it("says which column is which", () => {
    expect(read("Телефон;ФИО;Должность\n87012345678;Иван Петров;Бухгалтер")).toEqual([["Иван Петров", "Бухгалтер", "87012345678"]]);
  });

  it("leaves columns it does not know", () => {
    expect(read("№\tФИО\tОтдел\tДолжность\n1\tИван Петров\tСклад\tКладовщик")).toEqual([["Иван Петров", "Кладовщик", ""]]);
  });

  it("is looked for on the first filled line only", () => {
    expect(parseBulk("\n\nИван Петров\nИмя")[1].full_name).toBe("Имя");
  });

  it("does not take a person for a head", () => {
    expect(read("Иван Петров;Должность")).toEqual([["Иван Петров", "Должность", ""]]);
  });

  it("numbers the rows after it by the paste", () => {
    expect(parseBulk("ФИО;Телефон\nИван Петров;87012345678")[0].line).toBe(2);
  });
});

describe("parseBulk — the problems", () => {
  const problems = (text: string) => parseBulk(text)[0].problems;

  it("passes a fine row", () => {
    expect(problems("Иван Петров; Бухгалтер; +7 701 234 56 78")).toEqual([]);
  });

  it("says when there is no name", () => {
    expect(problems("Я")).toEqual(["Нет имени"]);
    expect(problems(";Бухгалтер;87012345678")).toEqual(["Нет имени"]);
    expect(problems("87012345678")).toEqual(["Нет имени"]);
  });

  it("says when columns are mixed up and a name holds digits", () => {
    expect(problems("Иван2 Петров")).toEqual(["В имени цифры — проверьте столбцы"]);
  });

  it("says what is over the server's limits", () => {
    expect(problems(`${"я".repeat(121)};Бухгалтер`)).toEqual(["Имя длиннее 120 знаков"]);
    expect(problems(`Иван Петров;${"я".repeat(121)}`)).toEqual(["Должность длиннее 120 знаков"]);
  });

  it("says a phone has a typo, Excel's scientific number included", () => {
    expect(problems("Иван Петров;Бухгалтер;8701234ж5678")).toEqual(["Похоже, в телефоне опечатка"]);
    expect(problems("Иван Петров\tБухгалтер\t7,70E+10")).toEqual(["Похоже, в телефоне опечатка"]);
  });

  it("has the phone read as the one-person form reads it", () => {
    expect(problems("Иван Петров;Бухгалтер;(701) 234.56.78")).toEqual([]);
  });

  it("names every problem of the row", () => {
    expect(problems(";;8701234ж5678")).toEqual(["Нет имени", "Похоже, в телефоне опечатка"]);
  });
});

describe("matchRows", () => {
  const roster: RosterPerson[] = [
    { id: "a", full_name: "Ерлан Досов", is_active: true },
    { id: "b", full_name: "Марат Оспанов", is_active: false },
    { id: "c", full_name: "Марат Оспанов", is_active: true },
    { id: "d", full_name: "Семён Ёлкин", is_active: true },
  ];
  const kinds = (text: string) => matchRows(parseBulk(text), roster).map((row) => row.match);

  it("finds the same name, whatever the order of words, the case and ё", () => {
    expect(kinds("досов ерлан")).toEqual([{ kind: "same", person: roster[0] }]);
    expect(kinds("СЕМЕН ЕЛКИН")).toEqual([{ kind: "same", person: roster[3] }]);
  });

  it("takes a working person before a fired namesake", () => {
    expect(kinds("Марат Оспанов")).toEqual([{ kind: "same", person: roster[2] }]);
  });

  it("finds a fired person too", () => {
    expect(matchRows(parseBulk("Вася Пупкин"), [{ id: "x", full_name: "Вася Пупкин", is_active: false }])[0].match).toMatchObject({ kind: "same", person: { id: "x" } });
  });

  it("calls a name that is part of another a likeness, not the same", () => {
    expect(kinds("Ерлан")).toEqual([{ kind: "like", person: roster[0] }]);
    expect(kinds("Ерлан Досов Сапарович")).toEqual([{ kind: "like", person: roster[0] }]);
  });

  it("leaves a namesake by first name alone", () => {
    expect(kinds("Ерлан Ахметов")).toEqual([null]);
  });

  it("marks the second copy inside the list", () => {
    expect(kinds("Дина Ким\nТимур Ли\nкИм дИна")).toEqual([null, null, { kind: "list", line: 1 }]);
  });

  it("does not compare a row that cannot go", () => {
    expect(matchRows(parseBulk("Ерлан Досов;Юрист;8701234ж5678"), roster)[0].match).toBeNull();
  });
});

describe("rowsToAdd", () => {
  const roster: RosterPerson[] = [{ id: "a", full_name: "Ерлан Досов", is_active: true }];
  const items = matchRows(parseBulk("Дина Ким\nЕрлан Досов\nЯ\nДина Ким"), roster);

  it("takes only rows with nothing against them", () => {
    expect(rowsToAdd(items, new Set()).map((row) => row.line)).toEqual([1]);
  });

  it("takes a likeness only when the person says so", () => {
    expect(rowsToAdd(items, new Set([2, 4])).map((row) => row.line)).toEqual([1, 2, 4]);
  });

  it("never takes a row with a problem", () => {
    expect(rowsToAdd(items, new Set([3])).map((row) => row.line)).toEqual([1]);
  });
});

describe("personBody", () => {
  it("sends what the one-person form sends: an empty field is no field", () => {
    expect(personBody({ full_name: "Дина Ким", position: "", phone: "  " }, "employee")).toEqual({ full_name: "Дина Ким", role: "employee", position: undefined, phone: undefined });
    expect(personBody({ full_name: "Дина Ким", position: "Юрист", phone: " +7 701 " }, "manager")).toEqual({ full_name: "Дина Ким", role: "manager", position: "Юрист", phone: "+7 701" });
  });
});

describe("addInTurn", () => {
  const rows = [{ line: 1 }, { line: 2 }, { line: 3 }];

  it("goes one after another", async () => {
    const running: number[] = [];
    let at = 0;
    await addInTurn(rows, async (row) => {
      running.push((at += 1));
      await Promise.resolve();
      at -= 1;
      return `id-${row.line}`;
    });
    expect(running).toEqual([1, 1, 1]);
  });

  it("carries on past a failure and says whose it is", async () => {
    const seen: number[] = [];
    const outcomes = await addInTurn(
      rows,
      async (row) => {
        if (row.line === 2) throw new Error("Такая почта уже зарегистрирована");
        return `id-${row.line}`;
      },
      (outcome) => seen.push(outcome.line),
    );
    expect(outcomes).toEqual([{ line: 1, id: "id-1" }, { line: 2, error: "Такая почта уже зарегистрирована" }, { line: 3, id: "id-3" }]);
    expect(seen).toEqual([1, 2, 3]);
  });

  it("says something even when the error says nothing", async () => {
    const [outcome] = await addInTurn([{ line: 1 }], async () => {
      throw new Error("");
    });
    expect(outcome.error).toBe("Не получилось создать");
  });
});

describe("nameKey", () => {
  it("is the name whatever the order, the case, the hyphen and ё", () => {
    expect(nameKey("Петров-Водкин Семён")).toBe(nameKey("семен водкин ПЕТРОВ"));
  });
});

it("keeps a list within a working size", () => {
  expect(BULK_MAX).toBeGreaterThanOrEqual(100);
});

describe("matchPerson — the one-person form's double (D-160)", () => {
  const roster: RosterPerson[] = [
    { id: "b", full_name: "Болат Сейтов", is_active: true },
    { id: "g", full_name: "Гульнара Ахметова", is_active: false },
    { id: "k", full_name: "Ким", is_active: true },
  ];

  it("the same name in any order and case", () => {
    expect(matchPerson("сейтов болат", roster)).toMatchObject({ kind: "same", person: { id: "b" } });
  });

  it("one who left is found too", () => {
    expect(matchPerson("Гульнара Ахметова", roster)).toMatchObject({ kind: "same", person: { id: "g", is_active: false } });
  });

  it("one letter off in the surname: «Сейтоф», «Сейтова», «Сеитов»", () => {
    expect(matchPerson("Болат Сейтоф", roster)).toMatchObject({ kind: "like", person: { id: "b" } });
    expect(matchPerson("Болат Сейтова", roster)).toMatchObject({ kind: "like", person: { id: "b" } });
  });

  it("another first name with a near surname is somebody else", () => {
    expect(matchPerson("Арман Сейтоф", roster)).toBeNull();
    expect(matchPerson("Болат Нуров", roster)).toBeNull();
  });

  it("a part of the name: a patronymic added", () => {
    expect(matchPerson("Болат Сейтов Ержанович", roster)).toMatchObject({ kind: "like", person: { id: "b" } });
  });
});
