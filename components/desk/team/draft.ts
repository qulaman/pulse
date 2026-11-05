import { draftOf, patchOf, type PersonDraft } from "@/components/people/PersonForm";
import type { Person, PersonPatch } from "@/lib/people/queries";

/** The phone's draft (PersonForm) plus what only the desk edits. */
export type DeskDraft = PersonDraft & { phone: string };

export function deskDraftOf(person?: Person | null, phone?: string | null): DeskDraft {
  return { ...draftOf(person), phone: phone ?? "" };
}

/**
 * What a saved form writes. Never `is_active`: firing has its own move now, and a draft opened
 * before it must not bring a fired person back. The phone lives elsewhere: `useSavePhone`.
 */
export function deskPatchOf(draft: DeskDraft, access: boolean): PersonPatch {
  const patch = patchOf(draft, access);
  delete patch.is_active;
  return patch;
}
