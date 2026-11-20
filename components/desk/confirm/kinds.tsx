import { Bell, CalendarDays, CircleHelp, Megaphone, Repeat, Send, SquareCheck, Star, StickyNote, type LucideIcon } from "lucide-react";

import type { Entity } from "@/lib/ai/schema";

/** What a parsed entity is called on the desk's confirm editor (D-154 wave 3). */
export const KIND_LABEL: Record<Entity["kind"], string> = {
  task: "Задача",
  delegation: "Поручение",
  recurrence: "Повторяющаяся задача",
  event: "Встреча",
  announcement: "Объявление",
  reminder: "Напоминание",
  note: "Заметка",
  points: "Очки",
  query: "Вопрос",
};

/** The mark of a kind in the head of its card in the editor («Графит»). */
export const KIND_ICON: Record<Entity["kind"], LucideIcon> = {
  task: SquareCheck,
  delegation: Send,
  recurrence: Repeat,
  event: CalendarDays,
  announcement: Megaphone,
  reminder: Bell,
  note: StickyNote,
  points: Star,
  query: CircleHelp,
};
