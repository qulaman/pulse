import { describe, expect, it } from "vitest";

import { personProblems } from "./validate";

const person = { full_name: "Иван Петров", role: "employee", phone: "", email: "", password: "" };

describe("personProblems", () => {
  it("wants a name of two letters, a TV named as a screen", () => {
    expect(personProblems({ ...person, full_name: "И" }, false).full_name).toBe("Имя и фамилия — хотя бы две буквы");
    expect(personProblems({ ...person, full_name: " ", role: "tv" }, false).full_name).toBe("Назовите экран — хотя бы две буквы");
    expect(personProblems(person, false)).toEqual({});
  });

  it("checks the phone only when the form has one", () => {
    expect(personProblems({ ...person, phone: "12" }, false).phone).toBe("Похоже, в телефоне опечатка");
    expect(personProblems({ full_name: "Иван", role: "employee" }, false)).toEqual({});
  });

  it("checks the email and the password of a password login", () => {
    expect(personProblems(person, true)).toEqual({ email: "Впишите почту — или вход по коду", password: "Не короче 6 символов" });
    expect(personProblems({ ...person, email: "ivan@", password: "abcdef" }, true)).toEqual({ email: "Похоже, в почте опечатка" });
    expect(personProblems({ ...person, email: "ivan@firm.kz", password: "abcdef" }, true)).toEqual({});
  });
});
