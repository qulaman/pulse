import { describe, expect, it } from "vitest";

import { choicesOf, isYesNo } from "@/lib/errands/scene";

describe("the two answers of «X или Y?» (D-175)", () => {
  it("splits a question of two choices into two buttons", () => {
    expect(choicesOf("Чёрный или зелёный?")).toEqual(["Чёрный", "Зелёный"]);
    expect(choicesOf("С сахаром или без?")).toEqual(["С сахаром", "Без"]);
    expect(choicesOf("сейчас или после обеда")).toEqual(["Сейчас", "После обеда"]);
  });

  it("leaves every other question to «Да / Нет» or a word", () => {
    expect(choicesOf("Вызвать на 15:00?")).toBeNull();
    expect(choicesOf("Куда принести?")).toBeNull();
    expect(choicesOf("Чай, кофе или воду?")).toEqual(["Чай, кофе", "Воду"]);
    expect(choicesOf("Кофе или чай или воду?")).toBeNull();
    expect(choicesOf("Позвонить в приёмную акимата прямо сейчас или подождать до завтрашнего утра?")).toBeNull();
    expect(choicesOf("")).toBeNull();
  });

  it("wins over «Да / Нет»: «С сахаром или без?» is not a yes-or-no", () => {
    // isYesNo reads it as one (it starts with «с»), the director's card asks choicesOf first
    expect(isYesNo("С сахаром или без?")).toBe(true);
    expect(choicesOf("С сахаром или без?")).not.toBeNull();
  });
});
