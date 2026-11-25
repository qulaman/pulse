"use client";

import { useMemo } from "react";

import { toast } from "@/components/ui/Toast";
import type { PostprocessedEntity } from "@/lib/ai/postprocess";
import type { RosterPerson } from "@/lib/dictionary";
import { lessonOf } from "@/lib/dictionary-learn";
import { useCompanySettings, useEditAliases } from "@/lib/dictionary-queries";
import { usePeople } from "@/lib/people/queries";

/** How long «Отменить» stays under a learned name — the same five seconds as every undo (D-139). */
export const LEARN_UNDO_MS = 5_000;

/**
 * The dictionary learns without a tap (D-192, И-107): the AI could not place «Жаке», the director
 * chose Жандос on the card — the form is his at once, and a toast «Запомнил: «Жаке» — Жандос»
 * holds «Отменить» for five seconds. Changing the person on a card was the director's most
 * frequent extra action; the «Запомнить?» tap of D-111 made it two. A slip of the finger is
 * guarded by `lessonOf`: nothing is learned when the matcher was sure and the director simply
 * chose somebody else (a change of mind, not a mishearing), when the form is somebody else's, or
 * when it would still not make the matcher sure of this very person.
 */
export function useLearnName() {
  const people = usePeople();
  const settings = useCompanySettings();
  const edit = useEditAliases();

  const roster: RosterPerson[] = useMemo(
    () =>
      (people.data ?? [])
        .filter((p) => p.is_active && p.role !== "tv")
        .map((p) => ({ id: p.id, full_name: p.full_name, aliases: p.aliases })),
    [people.data],
  );

  /** Call with the card as it was before the pick — its match says whether the AI hesitated. */
  return (entity: PostprocessedEntity, person: { user_id: string; full_name: string }) => {
    const queries = "assignee_queries" in entity ? entity.assignee_queries : [];
    const form = lessonOf({ queries, match: entity.assignee }, person.user_id, roster, settings.data?.matching);
    if (!form) return;
    edit.mutate({ id: person.user_id, add: [form] });
    toast(`Запомнил: «${form}» — ${person.full_name}`, {
      lifetimeMs: LEARN_UNDO_MS,
      action: {
        label: "Отменить",
        onClick: () => edit.mutate({ id: person.user_id, remove: [form] }),
      },
    });
  };
}
