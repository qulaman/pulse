import { phoneLooksRight } from "@/lib/people/phone";

/** The fields of a person's card that can be wrong. */
export type PersonField = "full_name" | "phone" | "email" | "password";

/** An address that looks like one: something, «@», a domain with a dot. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * What is wrong with a person's card, field by field — the phone's form and the desk's alike: the
 * name (two letters at least; a TV is «named»), the phone when the form has one, and — `login` —
 * the email and the first password when a password login is being made.
 */
export function personProblems(
  draft: { full_name: string; role: string; phone?: string; email?: string | null; password?: string | null },
  login: boolean,
): Partial<Record<PersonField, string>> {
  const problems: Partial<Record<PersonField, string>> = {};
  if (draft.full_name.trim().length < 2) problems.full_name = draft.role === "tv" ? "Назовите экран — хотя бы две буквы" : "Имя и фамилия — хотя бы две буквы";
  if (draft.phone !== undefined && !phoneLooksRight(draft.phone)) problems.phone = "Похоже, в телефоне опечатка";
  if (login) {
    const email = (draft.email ?? "").trim();
    if (!EMAIL.test(email)) problems.email = email ? "Похоже, в почте опечатка" : "Впишите почту — или вход по коду";
    if ((draft.password ?? "").length < 6) problems.password = "Не короче 6 символов";
  }
  return problems;
}
