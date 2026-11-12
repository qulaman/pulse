/**
 * Data of this contestant only (the shared fixtures stay untouched): what a phrase pinned to a
 * person says, the quick deadlines and repeats, the first-day steps, the phrase kept offline.
 */
import { at, DRAFT, HEARD } from "@/app/dev/pulse-alt/fixtures";

import type { DraftItem, KeptPhrase } from "./types";

/** A phrase said with a person picked — parsed into one task already pinned to them (D-84). */
export const PINNED_SAY: Record<string, { heard: string; title: string; deadline: string }> = {
  "p-marat": { heard: "К пятнице график работ по объекту на Абая.", title: "Подготовить график работ по объекту на Абая", deadline: at(4, 18, 0) },
  "p-aigul": { heard: "Оплати счёт за цемент сегодня.", title: "Оплатить счёт за цемент", deadline: at(0, 18, 0) },
  "p-oleg": { heard: "Проверь резервные копии сегодня до вечера.", title: "Проверить резервные копии", deadline: at(0, 18, 0) },
  "p-gulnara": { heard: "Подготовь приказ об отпуске Нурлана на подпись к обеду.", title: "Подготовить приказ об отпуске Нурлана", deadline: at(0, 13, 0) },
};
export const PINNED_FALLBACK = { heard: "Зайди ко мне после обеда, обсудим объект на Абая.", title: "Зайти после обеда — объект на Абая", deadline: at(0, 14, 30) };

/** «Всем: …» said from Эфир — the announcement from the shared draft. */
export const ALL_SAY = { heard: "Всем: в пятницу короткий день до шестнадцати.", draft: DRAFT.find((d) => d.kind === "announcement")! as DraftItem };

/** What the secretary hears when the desk is held. */
export const ERRAND_SAY = "Принеси, пожалуйста, договор с «КазСтройСнаб» к одиннадцати.";

export const DEADLINE_CHOICES = [
  { label: "Сегодня 18:00", iso: at(0, 18, 0) },
  { label: "Завтра 12:00", iso: at(1, 12, 0) },
  { label: "Завтра 18:00", iso: at(1, 18, 0) },
  { label: "Пятница 18:00", iso: at(4, 18, 0) },
  { label: "Через неделю", iso: at(7, 18, 0) },
];

export const REPEAT_CHOICES = ["Не повторять", "Каждый день в 9:00", "Каждый понедельник в 9:00", "Каждую пятницу в 17:00", "Первого числа месяца"];

export const ERRAND_TIMES = ["Сейчас", "Через 10 мин", "К 11:00", "После совещания"];

/** The phrase that waits for the network in the `kept` state. */
export const KEPT_PHRASE: KeptPhrase = { id: "k1", at: at(0, 10, 39), sec: 21, text: HEARD, kind: "voice" };

/** «Как?» for the home-screen install hint. */
export const INSTALL_STEPS = ["Откройте Pulse в Safari", "Нажмите «Поделиться» внизу", "Выберите «На экран „Домой“»"];
