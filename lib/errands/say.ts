import type { Phrase } from "@/lib/pulse/board";
import { firstNameOf } from "@/lib/text/normalize";

import type { Errand } from "./queries";

/**
 * Что лицо думает о заявках — четвёртый источник новостей после доски, Эфира и
 * календаря, устроенный так же: разница двух лент, по фразе на изменение, факты без
 * восклицательных знаков (docs/DESIGN.md §4). Глаголы не соглашаются с человеком:
 * имя не даёт рода, поэтому «Айгуль · кофе принят», а не «приняла» (D-79 §9).
 */

function lower(label: string): string {
  return label.charAt(0).toLowerCase() + label.slice(1);
}

/** Директору: кто взял просьбу, кто её закрыл и кто не смог. */
export function describeErrandsForDirector(prev: readonly Errand[], next: readonly Errand[]): Phrase[] {
  const before = new Map(prev.map((row) => [row.id, row]));
  const phrases: Phrase[] = [];

  for (const row of next) {
    const was = before.get(row.id);
    if (!was || was.status === row.status) continue;
    const who = firstNameOf(row.claimed?.full_name ?? "");
    const what = lower(row.label);

    if (row.status === "accepted") {
      phrases.push({ text: who ? `${who} · ${what} принят` : `${what} принят`, tone: "ok", source: "errand" });
    } else if (row.status === "done") {
      phrases.push({ text: who ? `${who} · ${what} готов` : `${what} готов`, tone: "ok", source: "errand" });
    } else if (row.status === "declined") {
      const why = row.decline_reason ? `: ${lower(row.decline_reason)}` : "";
      phrases.push({ text: `${what} не выйдет${why}`, tone: "warn", source: "errand" });
    }
  }
  return phrases;
}

/** Секретарю: пришла новая просьба, и её забрал кто-то другой. */
export function describeErrandsForSecretary(
  prev: readonly Errand[],
  next: readonly Errand[],
  meId: string,
): Phrase[] {
  const before = new Map(prev.map((row) => [row.id, row]));
  const phrases: Phrase[] = [];

  for (const row of next) {
    const was = before.get(row.id);
    const what = lower(row.label);

    if (!was) {
      if (row.status === "sent") {
        phrases.push({ text: `Директор просит: ${what}`, tone: "warn", source: "errand" });
      }
      continue;
    }
    if (was.status === row.status) continue;
    if (row.status === "accepted" && row.claimed_by !== meId) {
      // без рода: «кофе уже взяли · Айгуль»
      const who = firstNameOf(row.claimed?.full_name ?? "");
      phrases.push({ text: who ? `${what} уже взяли · ${who}` : `${what} уже взяли`, tone: "muted", source: "errand" });
    }
  }
  return phrases;
}
