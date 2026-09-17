import { verdict } from "@/lib/tasks/status-text";

import { tvTime } from "./clock";
import type { TvLine } from "./feed";
import type { TvSummary } from "./queries";
import { phraseOf } from "./voice";

/**
 * Бегущая строка над лицом: всё, что экран рассказывает о компании, одной лентой —
 * последние события, числа дня, вердикт и топ недели. Чистая функция: порядок и слова
 * проверяются тестом, а не глазами на стене.
 *
 * Правила те же, что у всего ТВ: никаких имён рядом с негативом (D-45) — вердикт идёт
 * числом («2 просрочки»), без «у кого»; у гостя в строку не попадают ни фамилии, ни
 * очки, потому что их нет уже в данных (D-33).
 */

export type TickerTone = "accent" | "ok" | "gold" | "muted" | "warn" | "danger";

export type TickerItem = { id: string; text: string; tone: TickerTone };

/** Сколько событий едет в строке: дальше уже не новости, а история. */
const EVENTS = 8;

export function tickerItems(lines: readonly TvLine[], summary: TvSummary | undefined): TickerItem[] {
  const items: TickerItem[] = [];

  if (summary) {
    const { today, counts } = summary;
    items.push({
      id: "today",
      text: `Сегодня: ${today.sent} ${pluralOrders(today.sent)} · ${today.done} принято · ${today.in_work} в работе`,
      tone: "muted",
    });

    const line = verdict(counts);
    items.push({ id: "verdict", text: line.text, tone: line.tone === "ok" ? "ok" : line.tone });
  }

  for (const line of lines.slice(0, EVENTS)) {
    items.push({
      id: `event:${line.id}`,
      text: `${tvTime(line.at)} · ${phraseOf(line)}`,
      tone: line.tone,
    });
  }

  if (summary?.points_enabled && summary.rating.length > 0) {
    const top = summary.rating
      .slice(0, 3)
      .map((row) => (row.points === null ? row.name : `${row.name} ${row.points}`))
      .join(" · ");
    items.push({ id: "rating", text: `Топ недели: ${top}`, tone: "gold" });
  }

  const week = summary?.week?.reduce((sum, day) => sum + day.done, 0) ?? 0;
  if (week > 0) {
    items.push({ id: "week", text: `За неделю закрыто: ${week}`, tone: "muted" });
  }

  if (summary?.points_enabled && summary.merch.length > 0) {
    const last = summary.merch[0]!;
    items.push({ id: "merch", text: `Награда: ${last.name} · ${last.title}`, tone: "gold" });
  }

  return items;
}

function pluralOrders(count: number): string {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return "поручений";
  if (mod10 === 1) return "поручение";
  if (mod10 >= 2 && mod10 <= 4) return "поручения";
  return "поручений";
}
