import type { RosterEntry } from "@/lib/people/roster";

/**
 * The people of the /dev sandboxes — one cast for every screen there. Not real rows: nothing
 * here reaches the database.
 */
const person = (key: string, full_name: string, position: string, role: RosterEntry["role"] = "employee"): RosterEntry => ({
  id: `u-${key}`,
  full_name,
  position,
  avatar_url: null,
  role,
});

export const CAST = {
  director: person("director", "Ерлан Сапаров", "Директор", "director"),
  marat: person("marat", "Марат Оспанов", "Менеджер по продажам"),
  aigul: person("aigul", "Айгуль Сейтказиева", "Бухгалтер"),
  dana: person("dana", "Дана Жумабаева", "Юрист"),
  erlan: person("erlan", "Ерлан Бекмуханов", "Снабжение"),
  askhat: person("askhat", "Асхат Нурланов", "Прораб"),
  madi: person("madi", "Мади Каримов", "Инженер ПТО"),
  saule: person("saule", "Сауле Ахметова", "Секретарь"),
  timur: person("timur", "Тимур Ибраев", "Водитель"),
} as const;

export type CastKey = keyof typeof CAST;

/** The whole company, the director first: what a people picker lists. */
export const ROSTER: RosterEntry[] = Object.values(CAST);

/** Two people whom «Ерлан» alone does not tell apart: the parser asks which one (/dev/confirm). */
export const NAMESAKES = [person("erlan-satov", "Ерлан Сатов", "Водитель"), person("erlan-kim", "Ерлан Ким", "Снабжение")] as const;
