import { firstNameOf } from "@/lib/text/normalize";

import type { Phrase } from "./board";
import { quoteTitle } from "./briefing";

/**
 * What the assistant says about Эфир. The board only knew tasks, so an announcement went
 * out and came back read without the face moving at all (owner, 2026-09-17). Pure, like
 * the rest of the assistant's wording: the diff of two feeds, one phrase per change.
 *
 * Verbs never agree with the person — names give no gender (see `describeChange`), hence
 * «Марат в курсе объявления», not «Марат ознакомился».
 */

/** The shape the speech needs from Эфир; `Announcement` of `lib/ether/queries` fits it. */
export type EtherPost = {
  id: string;
  transcript: string;
  author_id: string;
  author: { full_name: string } | null;
  acks: { user_id: string; user: { full_name: string } | null }[];
};

/** The director hears both sides of Эфир: their word going out and the company reading it. */
export function describeEther(prev: readonly EtherPost[], next: readonly EtherPost[], meId: string): Phrase[] {
  const before = new Map(prev.map((post) => [post.id, post]));
  const phrases: Phrase[] = [];
  for (const post of next) {
    const was = before.get(post.id);
    const quote = quoteTitle(post.transcript);
    if (!was) {
      phrases.push(
        post.author_id === meId
          ? { text: `Объявление ушло всем: ${quote}`, tone: "ok", source: "ether" }
          : { text: `${firstNameOf(post.author?.full_name) || "Объявление"}: ${quote}`, tone: "muted", source: "ether" },
      );
      continue;
    }
    // my own ack is not news to me; a second tap of the same person is not a change either
    const seen = new Set(was.acks.map((ack) => ack.user_id));
    const fresh = post.acks.filter((ack) => !seen.has(ack.user_id) && ack.user_id !== meId);
    if (fresh.length === 1) {
      const name = firstNameOf(fresh[0]!.user?.full_name) || "Сотрудник";
      phrases.push({ text: `${name} в курсе объявления ${quote}`, tone: "muted", source: "ether" });
    } else if (fresh.length > 1) {
      phrases.push({ text: `Объявление ${quote}: ознакомились ещё ${fresh.length}`, tone: "muted", source: "ether" });
    }
  }
  return phrases;
}

/** The employee hears the announcement itself — who else has read it is not their business. */
export function describeEtherForEmployee(prev: readonly EtherPost[], next: readonly EtherPost[], meId: string): Phrase[] {
  const before = new Set(prev.map((post) => post.id));
  return next
    .filter((post) => !before.has(post.id) && post.author_id !== meId)
    .map((post) => ({ text: `Новое объявление: ${quoteTitle(post.transcript)}`, tone: "warn" as const, source: "ether" as const }));
}
