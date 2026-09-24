"use client";

import { useMemo } from "react";

import { toast } from "@/components/ui/Toast";
import type { PostprocessedEntity } from "@/lib/ai/postprocess";
import type { RosterPerson } from "@/lib/dictionary";
import { lessonOf } from "@/lib/dictionary-learn";
import { useCompanySettings, useEditAliases } from "@/lib/dictionary-queries";
import { usePeople } from "@/lib/people/queries";

/**
 * «Запомнить?» right where the director fixes a name (D-111, second wave): the AI could
 * not place «Жаке», the director chose Жандос on the card — a toast offers to remember the
 * form, one tap and the next «Жаке» is his. Nothing is remembered without that tap: one
 * slip of the finger must not teach the dictionary a wrong name. The offer is a toast, so
 * the main flow gains no step (принцип 1); no lesson — no toast (see `lessonOf`).
 */
export function useRememberOffer() {
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
    toast(`Запомнить «${form}» — ${person.full_name}?`, {
      lifetimeMs: 6_000,
      action: {
        label: "Запомнить",
        onClick: () => {
          edit.mutate({ id: person.user_id, add: [form] });
          toast(`Запомнил: «${form}» — ${person.full_name}`);
        },
      },
    });
  };
}
