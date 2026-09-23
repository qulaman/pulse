import { describe, expect, it } from "vitest";

import { describeEther, describeEtherForEmployee, type EtherPost } from "./ether";

const ME = "d";

function post(id: string, transcript: string, author: string, acks: [string, string][] = []): EtherPost {
  return {
    id,
    transcript,
    author_id: author,
    author: { full_name: author === ME ? "Тест Директоров" : "Ерлан Сапаров" },
    acks: acks.map(([userId, name]) => ({ user_id: userId, user: { full_name: name } })),
  };
}

describe("describeEther — директору", () => {
  it("первый снимок ленты не новость: сравнение идёт от него", () => {
    expect(describeEther([post("a", "Собрание в пятницу", ME)], [post("a", "Собрание в пятницу", ME)], ME)).toEqual([]);
  });

  it("своё объявление — квитанция «ушло всем»", () => {
    const said = describeEther([], [post("a", "Собрание в пятницу в 10", ME)], ME);
    expect(said).toEqual([{ text: "Объявление ушло всем: «Собрание в пятницу в 10»", tone: "ok", source: "ether" }]);
  });

  it("чужое объявление — от имени автора", () => {
    const said = describeEther([], [post("a", "Машина в ремонте", "u1")], ME);
    expect(said).toEqual([{ text: "Ерлан: «Машина в ремонте»", tone: "muted", source: "ether" }]);
  });

  it("ознакомление — без рода в глаголе", () => {
    const said = describeEther([post("a", "Собрание", ME)], [post("a", "Собрание", ME, [["u1", "Марат Досов"]])], ME);
    expect(said).toEqual([{ text: "Марат в курсе объявления «Собрание»", tone: "muted", source: "ether" }]);
  });

  it("несколько ознакомлений разом — счётом", () => {
    const before = [post("a", "Собрание", ME, [["u1", "Марат Досов"]])];
    const after = [post("a", "Собрание", ME, [["u1", "Марат Досов"], ["u2", "Динара Ким"], ["u3", "Ерлан Сапаров"]])];
    expect(describeEther(before, after, ME)).toEqual([
      { text: "Объявление «Собрание»: ознакомились ещё 2", tone: "muted", source: "ether" },
    ]);
  });

  it("своё ознакомление и повтор того же человека — не новость", () => {
    const before = [post("a", "Собрание", ME, [["u1", "Марат Досов"]])];
    const after = [post("a", "Собрание", ME, [["u1", "Марат Досов"], [ME, "Тест Директоров"]])];
    expect(describeEther(before, after, ME)).toEqual([]);
  });
});

describe("describeEtherForEmployee — сотруднику", () => {
  it("новое объявление директора", () => {
    expect(describeEtherForEmployee([], [post("a", "Собрание в пятницу", "d")], "u1")).toEqual([
      { text: "Новое объявление: «Собрание в пятницу»", tone: "warn", source: "ether" },
    ]);
  });

  it("чужие ознакомления сотруднику не говорятся", () => {
    const before = [post("a", "Собрание", "d")];
    const after = [post("a", "Собрание", "d", [["u2", "Динара Ким"]])];
    expect(describeEtherForEmployee(before, after, "u1")).toEqual([]);
  });

  it("своё объявление обратно не зачитывается", () => {
    expect(describeEtherForEmployee([], [post("a", "Я на объекте", "u1")], "u1")).toEqual([]);
  });
});
