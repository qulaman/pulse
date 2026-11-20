"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

import { keysTaken } from "@/components/desk/ui/layers";
import { toast } from "@/components/ui/Toast";
import { suggestAliases } from "@/lib/people/aliases";
import { matchPerson } from "@/lib/people/bulk";
import type { PhotoDraft } from "@/lib/people/card-queries";
import type { Person } from "@/lib/people/queries";
import { personProblems, type PersonField } from "@/lib/people/validate";

import type { DeskDraft } from "./draft";
import { dropDraft, keepDraft, peekDraft, useLeaveGuard } from "./useLeaveGuard";

export const PHOTO_SAME: PhotoDraft = { kind: "same" };

/** A form that left without a word: what the next visit to it picks up. */
type Kept = { draft: DeskDraft; photo: PhotoDraft; withEmail: boolean };


export type PersonFormProps = {
  initial: DeskDraft;
  draftKey: string;
  mode: "create" | "edit";
  roster: Person[];
  everyone?: Person[];
  pending: boolean;
  onSubmit: (draft: DeskDraft, photo: PhotoDraft, options: { leaving: boolean }) => Promise<unknown>;
  onCancel?: () => void;
};

/**
 * The engine of the desk's person card (PersonEditor): the draft and its photo, what is wrong in
 * it and when to say so, a namesake on the roster, the spoken forms following the name until
 * touched, «Сохранить» with the director's role asked first, the way out asking about unsaved
 * words (and keeping them when nobody could be asked), and the form's own keys — Ctrl/Cmd+S or
 * Ctrl/Cmd+Enter save, Esc cancels. The card lays it out.
 */
export function usePersonForm({ initial, draftKey, mode, roster, everyone, pending, onSubmit, onCancel }: PersonFormProps) {
  const uid = useId();
  const ids = { name: `${uid}-name`, position: `${uid}-position`, phone: `${uid}-phone`, aliases: `${uid}-aliases`, role: `${uid}-role`, manager: `${uid}-manager`, email: `${uid}-email`, password: `${uid}-password` };
  const router = useRouter();
  const [restored] = useState(() => peekDraft<Kept>(draftKey));
  const [baseline, setBaseline] = useState<DeskDraft>(initial);
  const [draft, setDraft] = useState<DeskDraft>(restored?.draft ?? initial);
  const [photo, setPhoto] = useState<PhotoDraft>(restored?.photo ?? PHOTO_SAME);
  useEffect(() => dropDraft(draftKey), [draftKey]);
  const set = (patch: Partial<DeskDraft>) => setDraft((d) => ({ ...d, ...patch }));
  // until the spoken forms are touched, they follow the name being typed
  const [aliasesTouched, setAliasesTouched] = useState(mode === "edit");
  const suggestion = suggestAliases(draft.full_name, roster);
  const setName = (full_name: string) =>
    setDraft((d) => ({ ...d, full_name, aliases: aliasesTouched ? d.aliases : suggestAliases(full_name, roster).mine.join(", ") }));
  const [withEmail, setWithEmail] = useState(restored?.withEmail ?? false);
  const [touched, setTouched] = useState<Partial<Record<PersonField, boolean>>>({});
  const [tried, setTried] = useState(false);
  /** The double the person has seen and still wants to add — asked once per name. */
  const [twinOk, setTwinOk] = useState<string | null>(null);
  // on the way out: «Сохранить / Не сохранять / Остаться»; the promotion asks before any save
  const [leaving, setLeaving] = useState<{ go: () => void } | null>(null);
  const [promoting, setPromoting] = useState<{ go?: () => void } | null>(null);
  const form = useRef<HTMLFormElement>(null);
  /** The form lets go by itself: saved or cancelled — no question, nothing to keep. */
  const passed = useRef(false);
  const alive = useRef(false);

  const person = draft.role !== "tv";
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline) || photo.kind !== "same" || (mode === "create" && withEmail);
  const problems = personProblems(draft, mode === "create" && withEmail);
  // creating: somebody with this name is here already (or was) — said under the name
  const twin = mode === "create" && person && everyone && draft.full_name.trim().length >= 3 ? matchPerson(draft.full_name, everyone) : null;
  const twinAsked = twin !== null && twinOk !== draft.full_name.trim();
  const errorOf = (field: PersonField) => (tried || touched[field] ? (problems[field] ?? null) : null);
  const touch = (field: PersonField) => () => setTouched((t) => ({ ...t, [field]: true }));

  const submit = async ({ go, promoted = false }: { go?: () => void; promoted?: boolean } = {}) => {
    if (pending) return;
    if (mode === "edit" && !dirty) return;
    const first = (Object.keys(problems) as PersonField[])[0];
    if (first) {
      setTried(true);
      document.getElementById(first === "full_name" ? ids.name : first === "phone" ? ids.phone : first === "email" ? ids.email : ids.password)?.focus();
      return;
    }
    // a double asks once: the first «Добавить» only points at it, the second adds anyway
    if (twinAsked) {
      setTwinOk(draft.full_name.trim());
      document.getElementById(ids.name)?.focus();
      return;
    }
    // the one role its giver cannot take back alone: a director can only be changed by another (D-104)
    if (draft.role === "director" && baseline.role !== "director" && !promoted) {
      setPromoting({ go });
      return;
    }
    passed.current = true;
    try {
      // the code is the login unless an email was asked for: a half-typed email goes nowhere
      await onSubmit(mode === "create" && !withEmail ? { ...draft, email: "", password: "" } : draft, photo, { leaving: Boolean(go) });
      setBaseline(draft);
      setPhoto(PHOTO_SAME);
      go?.();
    } catch {
      // the mutation toasts its own error; the draft stays for another try
      passed.current = false;
    }
  };
  const cancel = () => {
    passed.current = true;
    setDraft(baseline);
    setPhoto(PHOTO_SAME);
    onCancel?.();
  };
  useLeaveGuard(dirty, passed, (go) => setLeaving({ go }));

  // the keys of the form: Ctrl/Cmd+S and Ctrl/Cmd+Enter — save from any field; Esc — cancel,
  // asking first when something is typed. Caught before the desk's own Esc (which would only let
  // go of the field's caret); a dialog or a menu over the form keeps its Esc.
  const latest = useRef({ submit, cancel, dirty, kept: { draft, photo, withEmail } as Kept });
  useLayoutEffect(() => {
    latest.current = { submit, cancel, dirty, kept: { draft, photo, withEmail } };
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (keysTaken()) return;
      // the form's keys, not the order line's or the panel's (their Ctrl+Enter sends an order)
      const target = event.target as Node | null;
      if (target !== document.body && !form.current?.contains(target)) return;
      const mod = event.ctrlKey || event.metaKey;
      if (mod && !event.altKey && (event.code === "KeyS" || event.code === "Enter" || event.code === "NumpadEnter")) {
        event.preventDefault();
        void latest.current.submit();
        return;
      }
      if (event.key !== "Escape" || !onCancel) return;
      event.preventDefault();
      // words in the form: the same question as any way out — nothing is dropped silently
      if (latest.current.dirty) {
        setLeaving({ go: () => latest.current.cancel() });
        return;
      }
      latest.current.cancel();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel]);
  // gone with words in it, by a way out nobody could ask about (the palette, the profile menu):
  // the draft stays in this tab and the toast leads back. A timeout: Strict Mode unmounts and
  // mounts every effect once, and that rehearsal is no way out
  useEffect(() => {
    const address = `${window.location.pathname}${window.location.search}`;
    alive.current = true;
    return () => {
      alive.current = false;
      if (passed.current || !latest.current.dirty) return;
      const { kept } = latest.current;
      setTimeout(() => {
        if (alive.current) return;
        keepDraft<Kept>(draftKey, kept);
        toast("Правки карточки не сохранены", { lifetimeMs: 12_000, action: { label: "Вернуться", onClick: () => router.push(address) } });
      }, 0);
    };
  }, [draftKey, router]);
  // the caret in the name from the first look
  useEffect(() => {
    const field = document.getElementById(ids.name) as HTMLInputElement | null;
    field?.focus({ preventScroll: false });
    if (mode === "edit") field?.select();
  }, [ids.name, mode]);


  /** «Не сохранять»: the form lets go without a word and the way out goes on. */
  const discard = (go?: () => void) => {
    passed.current = true;
    go?.();
  };

  return {
    ids,
    draft,
    set,
    setName,
    photo,
    setPhoto,
    suggestion,
    setAliasesTouched,
    withEmail,
    setWithEmail,
    person,
    dirty,
    problems,
    twin,
    twinAsked,
    errorOf,
    touch,
    submit,
    cancel,
    leaving,
    setLeaving,
    promoting,
    setPromoting,
    form,
    discard,
  };
}
