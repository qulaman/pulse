"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

import { Dialog } from "@/components/desk/ui/Dialog";
import { Kbd } from "@/components/desk/ui/Kbd";
import { Select, SegmentTabs } from "@/components/desk/ui/Toolbar";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { initialAlias, suggestAliases } from "@/lib/people/aliases";
import { matchPerson } from "@/lib/people/bulk";
import type { PhotoDraft } from "@/lib/people/card-queries";
import { generatePassword } from "@/lib/people/password";
import { phoneLooksRight } from "@/lib/people/phone";
import { AVAILABILITY_LABEL, ROLE_ABOUT, ROLE_LABEL, type Availability, type Person, type Role } from "@/lib/people/queries";

import type { DeskDraft } from "./draft";
import { AliasChips, FormRow, INPUT, PasswordInput, splitAliases } from "./fields";
import { PhotoField } from "./PhotoField";
import { dropDraft, keepDraft, peekDraft, useLeaveGuard } from "./useLeaveGuard";

const AVAILABILITIES: Availability[] = ["active", "vacation", "sick"];
const PHOTO_SAME: PhotoDraft = { kind: "same" };

/** A form that left without a word: what the next visit to it picks up. */
type Kept = { draft: DeskDraft; photo: PhotoDraft; withEmail: boolean };

/**
 * The hint under the spoken forms: what they are for, or — with a namesake — how the parser tells
 * the two apart. «Ерлан Б.» says nothing when both are «Б.»: then a word of the director's own.
 */
function namesakeHint(fullName: string, namesakes: readonly string[]): string {
  if (namesakes.length === 0) return "По этим формам распознаётся речь. Enter — добавить, Backspace — убрать последнюю";
  const mine = initialAlias(fullName);
  const clash = mine !== null && namesakes.some((name) => initialAlias(name)?.toLowerCase() === mine.toLowerCase());
  return clash
    ? `Тёзка с той же буквой фамилии: ${namesakes.join(", ")}. Добавьте форму, по которой зовёте именно этого человека, — по фамилии или должности`
    : `Тёзка: ${namesakes.join(", ")}. Инициал («${mine ?? "Имя Ф."}») отличает их в речи`;
}

/** A person who works with the team, not the director at the top or the wall (PersonForm's rule). */
function hasManager(role: Role): boolean {
  return role !== "director" && role !== "tv";
}

type Field = "full_name" | "phone" | "email" | "password";

/** What the form holds right now — for a picture of the card being made beside it (`preview`). */
export type EditorView = {
  draft: DeskDraft;
  photo: PhotoDraft;
  /** The login: an email and a password were asked for, not the code. */
  withEmail: boolean;
  problems: Partial<Record<Field, string>>;
};

/** What is wrong with the draft, field by field — said under the field, not as a dead button. */
function problemsOf(draft: DeskDraft, mode: "create" | "edit", withEmail: boolean): Partial<Record<Field, string>> {
  const problems: Partial<Record<Field, string>> = {};
  if (draft.full_name.trim().length < 2) problems.full_name = draft.role === "tv" ? "Назовите экран — хотя бы две буквы" : "Имя и фамилия — хотя бы две буквы";
  if (!phoneLooksRight(draft.phone)) problems.phone = "Похоже, в телефоне опечатка";
  if (mode === "create" && withEmail) {
    const email = (draft.email ?? "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) problems.email = email ? "Похоже, в почте опечатка" : "Впишите почту — или вход по коду";
    if ((draft.password ?? "").length < 6) problems.password = "Не короче 6 символов";
  }
  return problems;
}

/**
 * A step of the new card (D-174): its number — a check once the step holds nothing wrong — and its
 * title over a card of ruled lines.
 */
function Plane({ step, title, done, hint, children }: { step: number; title: string; done: boolean; hint?: string; children: ReactNode }) {
  return (
    <section className="newp-step" data-done={done ? "" : undefined}>
      <header className="newp-step-head">
        <span className="newp-step-mark" aria-hidden>
          {done ? <Check size={13} strokeWidth={3} /> : step}
        </span>
        <h2 className="newp-step-title">{title}</h2>
        {hint ? <span className="newp-step-hint">{hint}</span> : null}
      </header>
      <div className="newp-step-body desk-list">{children}</div>
    </section>
  );
}

/**
 * The person's card as the director or the secretary fills it in on the desk (D-104, D-154
 * wave 3): the phone's draft (`draftOf` / `patchOf` in PersonForm) laid out for a mouse and the
 * keys — the label on the left, the control on the right; the role and the manager as dropdowns
 * with the role's meaning under it, the availability as segments, the spoken forms as chips. A
 * problem is said under its field. Ctrl+S (or Ctrl+Enter) saves, Esc cancels — and asks first
 * when something is typed (D-160: a second Esc dropped a whole form without a word). While it is
 * unsaved the form says so, and leaving asks «Сохранить / Не сохранять / Остаться»; a way out
 * that cannot be seen coming keeps the draft and offers the way back. Giving somebody the
 * director's role asks first, on «Сохранить». The photo and the phone are the card's fields like
 * any other; removing is not one, it lives in the card's moves. Creating: a code by default
 * (D-135), an email and a ready password on request; a name already on the roster (or one letter
 * off it, or among those who left) is said under the field, and «Добавить» asks once more.
 * The examples in the fields are nobody's: a real colleague's name there read as already typed.
 */
export function PersonEditor({
  initial,
  draftKey,
  photoUrl = null,
  mode,
  roles,
  lockedRole,
  managers,
  roster,
  everyone,
  pending,
  onSubmit,
  onCancel,
  preview,
}: {
  initial: DeskDraft;
  /** Whose form this is: a draft that left without a word waits under this key. */
  draftKey: string;
  /** The photo on the card now. */
  photoUrl?: string | null;
  mode: "create" | "edit";
  roles: Role[];
  /** Why role and manager cannot change here — then they are shown, not offered. */
  lockedRole?: string;
  managers: Person[];
  /** Everyone else on the roster — spoken forms are suggested against it (D-54). */
  roster: Person[];
  /** Creating: everybody the new card may already be, those who left too — the double is said before «Добавить». */
  everyone?: Person[];
  pending: boolean;
  /** Resolves when saved; the draft then becomes the new baseline. `leaving` — the form goes elsewhere right after, stay put. */
  onSubmit: (draft: DeskDraft, photo: PhotoDraft, options: { leaving: boolean }) => Promise<unknown>;
  onCancel?: () => void;
  /** Creating: the card being made, drawn beside the form from what it holds (NewPersonDesk). */
  preview?: (view: EditorView) => ReactNode;
}) {
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
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
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
  const problems = problemsOf(draft, mode, withEmail);
  // creating: somebody with this name is here already (or was) — said under the name
  const twin = mode === "create" && person && everyone && draft.full_name.trim().length >= 3 ? matchPerson(draft.full_name, everyone) : null;
  const twinAsked = twin !== null && twinOk !== draft.full_name.trim();
  const errorOf = (field: Field) => (tried || touched[field] ? (problems[field] ?? null) : null);
  const touch = (field: Field) => () => setTouched((t) => ({ ...t, [field]: true }));

  const submit = async ({ go, promoted = false }: { go?: () => void; promoted?: boolean } = {}) => {
    if (pending) return;
    if (mode === "edit" && !dirty) return;
    const first = (Object.keys(problems) as Field[])[0];
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
      const body = document.body;
      if (body.hasAttribute("data-dialog-open") || body.hasAttribute("data-sheet-open") || document.querySelector(".desk-pop")) return;
      // the form's keys, not the order line's or the panel's (their Ctrl+Enter sends an order)
      const target = event.target as Node | null;
      if (target !== body && !form.current?.contains(target)) return;
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

  const nameRow = (
    <FormRow
      label={person ? "Имя и фамилия" : "Название экрана"}
      htmlFor={ids.name}
      error={errorOf("full_name")}
      hint={
        twin ? (
          <span style={{ color: "var(--warn)" }} data-testid="person-twin">
            {twin.kind === "same" ? (twin.person.is_active ? "Уже в команде: " : "Среди ушедших: ") : "Похоже на "}
            <Link href={`/desk/team/${twin.person.id}`} target="_blank" className="underline underline-offset-2">
              {twin.person.full_name}
            </Link>
            {twin.person.position ? ` · ${twin.person.position}` : ""}.{" "}
            {!twin.person.is_active ? "Вернуть его — в его карточке. " : ""}
            {twinAsked ? "Проверьте, не тот ли это человек" : "Это другой человек? Нажмите «Добавить» ещё раз"}
          </span>
        ) : undefined
      }
    >
      <input
        id={ids.name}
        className={INPUT}
        value={draft.full_name}
        onChange={(e) => setName(e.target.value)}
        // an empty name is said on «Добавить», not on the way out: the error line appearing under
        // the caret moved the form, and the click meant for «Почта и пароль» landed on nothing
        onBlur={draft.full_name.trim() ? touch("full_name") : undefined}
        placeholder={person ? "Например, Иван Петров" : "Например, ТВ в холле"}
        autoComplete="off"
        aria-invalid={Boolean(errorOf("full_name"))}
        data-testid="person-name"
      />
    </FormRow>
  );
  const personRows = person ? (
    <>
      <FormRow label="Фото" hint="Обрежу в квадрат и сожму. Сохранится вместе с карточкой">
        <PhotoField id={draftKey} name={draft.full_name} current={photoUrl} value={photo} onChange={setPhoto} />
      </FormRow>
      <FormRow label="Должность" htmlFor={ids.position}>
        <input id={ids.position} className={INPUT} value={draft.position} onChange={(e) => set({ position: e.target.value })} placeholder="Например, бухгалтер" autoComplete="off" />
      </FormRow>
      <FormRow label="Телефон" htmlFor={ids.phone} error={errorOf("phone")}>
        <input
          id={ids.phone}
          type="tel"
          inputMode="tel"
          className={INPUT}
          value={draft.phone}
          onChange={(e) => set({ phone: e.target.value })}
          onBlur={touch("phone")}
          placeholder="Например, +7 700 000 00 00"
          autoComplete="off"
          aria-invalid={Boolean(errorOf("phone"))}
          data-testid="person-phone"
        />
      </FormRow>
      <FormRow
        label="Как называет директор"
        htmlFor={ids.aliases}
        hint={namesakeHint(draft.full_name, suggestion.namesakes)}
      >
        <AliasChips
          id={ids.aliases}
          value={splitAliases(draft.aliases)}
          onChange={(next) => {
            setAliasesTouched(true);
            set({ aliases: next.join(", ") });
          }}
          suggestions={suggestion.mine}
          placeholder="Например: Ваня, Иван П."
        />
      </FormRow>
    </>
  ) : null;
  const roleRows = lockedRole ? (
    <FormRow label="Роль" align="text" hint={lockedRole}>
      <span className="text-[14px] leading-5">{ROLE_LABEL[draft.role]}</span>
    </FormRow>
  ) : (
    <>
      <FormRow label="Роль" htmlFor={ids.role} hint={ROLE_ABOUT[draft.role]}>
        <Select
          id={ids.role}
          value={draft.role}
          disabled={roles.length < 2}
          onChange={(e) => {
            const role = e.target.value as Role;
            set({ role, manager_id: hasManager(role) ? draft.manager_id : null });
          }}
          className="w-full max-w-[280px]"
          data-testid="person-role"
        >
          {roles.map((role) => (
            <option key={role} value={role}>
              {ROLE_LABEL[role]}
            </option>
          ))}
        </Select>
      </FormRow>
      {hasManager(draft.role) ? (
        <FormRow label="Подчиняется" htmlFor={ids.manager} hint="Тот, кому человек подчиняется, видит его задачи">
          <Select id={ids.manager} value={draft.manager_id ?? ""} onChange={(e) => set({ manager_id: e.target.value || null })} className="w-full max-w-[280px]">
            <option value="">Никому</option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name}
              </option>
            ))}
          </Select>
        </FormRow>
      ) : null}
    </>
  );

  const footer = (
    // stays at the foot of the window while the form is longer than it: the unsaved state and «Сохранить» in sight
    <div className="desk-form-foot sticky bottom-0 z-[1] flex flex-wrap items-center gap-3 bg-bg py-2" data-testid="person-form-footer">
      <p className="min-w-0 flex-1 text-[12px] leading-4" aria-live="polite">
        {dirty && mode === "edit" ? (
          <span style={{ color: "var(--warn)" }} data-testid="person-form-dirty">
            Есть несохранённые изменения
          </span>
        ) : (
          <span className="text-muted">
            <Kbd>{mode === "create" ? "Ctrl Enter" : "Ctrl S"}</Kbd> {mode === "create" ? "добавить" : "сохранить"}
            {onCancel ? (
              <>
                {" · "}
                <Kbd>Esc</Kbd> отменить
              </>
            ) : null}
          </span>
        )}
      </p>
      {onCancel ? (
        <Button size="sm" variant="ghost" disabled={pending} onClick={cancel} data-testid="person-form-cancel">
          Отменить
        </Button>
      ) : null}
      <Button size="sm" type="submit" loading={pending} disabled={mode === "edit" && !dirty} data-testid="desk-person-save">
        {mode === "create" ? "Добавить" : "Сохранить"}
      </Button>
    </div>
  );

  const onFormSubmit = (event: FormEvent) => {
    event.preventDefault();
    void submit();
  };

  const dialogs = (
    <>
      <Dialog open={leaving !== null} onClose={() => setLeaving(null)} title={mode === "edit" ? "Сохранить правки?" : "Уйти без сохранения?"} width="sm">
        <div className="flex flex-col gap-4" data-testid="person-leave">
          <p className="text-[14px] leading-5 text-muted">
            {mode === "edit" ? "В карточке есть несохранённые изменения." : "Человек ещё не добавлен: всё вписанное пропадёт."}
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setLeaving(null)} data-testid="leave-stay">
              Остаться
            </Button>
            <Button
              size="sm"
              variant={mode === "edit" ? "secondary" : "danger"}
              onClick={() => {
                passed.current = true;
                leaving?.go();
                setLeaving(null);
              }}
              data-testid="leave-discard"
            >
              Не сохранять
            </Button>
            {mode === "edit" ? (
              <Button
                size="sm"
                loading={pending}
                data-autofocus
                onClick={() => {
                  const go = leaving?.go;
                  setLeaving(null);
                  void submit({ go });
                }}
                data-testid="leave-save"
              >
                Сохранить
              </Button>
            ) : null}
          </div>
        </div>
      </Dialog>
      <Dialog open={promoting !== null} onClose={() => setPromoting(null)} title={mode === "edit" ? "Сделать директором?" : "Добавить директора?"} width="sm">
        <div className="flex flex-col gap-4" data-testid="person-promote">
          <p className="text-[14px] leading-5 text-muted">
            <span className="font-medium text-text">{draft.full_name.trim()}</span> получит полный доступ: все задачи и люди компании, настройки, роли других, в том числе ваша. Снять эту роль сможет только другой директор.
          </p>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" data-autofocus onClick={() => setPromoting(null)} data-testid="promote-cancel">
              Отмена
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                const go = promoting?.go;
                setPromoting(null);
                void submit({ go, promoted: true });
              }}
              data-testid="promote-confirm"
            >
              {mode === "edit" ? "Сделать директором" : "Добавить директора"}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );

  if (mode === "edit") {
    return (
      <form
        ref={form}
        noValidate
        onSubmit={onFormSubmit}
        // the form is the director's own move now: the sheet's rule over it turns to the pen (D-158)
        className="desk-list desk-fields desk-editing"
        data-testid="desk-person-editor"
        data-dirty={dirty ? "" : undefined}
      >
        {nameRow}
        {personRows}
        {roleRows}
        {person ? (
          <FormRow label="Доступность" hint="В отпуске и на больничном: серия не сгорает, штрафов нет">
            <div className="self-start">
              <SegmentTabs aria-label="Доступность" value={draft.availability} onChange={(availability) => set({ availability })} items={AVAILABILITIES.map((key) => ({ value: key, label: AVAILABILITY_LABEL[key] }))} />
            </div>
          </FormRow>
        ) : null}
        {footer}
        {dialogs}
      </form>
    );
  }

  // a step is whole when nothing in it is wrong: the name typed, the phone (if any) readable; the login chosen
  const aboutDone = draft.full_name.trim().length >= 2 && !problems.full_name && !problems.phone;
  const loginDone = !withEmail || (!problems.email && !problems.password);
  return (
    <form ref={form} noValidate onSubmit={onFormSubmit} className={`desk-fields newp ${preview ? "newp-with-preview" : ""}`} data-testid="desk-person-editor">
      <div className="newp-main">
        {person ? (
          <>
            <Plane step={1} title="О человеке" done={aboutDone} hint="Обязательно только имя">
              {nameRow}
              {personRows}
            </Plane>
            <Plane step={2} title="Роль" done>
              {roleRows}
            </Plane>
            <Plane step={3} title="Вход" done={loginDone}>
              <FormRow
                label="Как войдёт"
                hint={
                  withEmail ? (
                    "Почта и первый пароль — для входа с компьютера. Пароль покажу ещё раз после «Добавить»"
                  ) : (
                    <span data-testid="new-person-code-hint">После «Добавить» покажу код из 8 цифр и QR — почта и пароль не нужны</span>
                  )
                }
              >
                <div className="self-start">
                  <SegmentTabs<"code" | "email">
                    aria-label="Как войдёт"
                    value={withEmail ? "email" : "code"}
                    onChange={(next) => {
                      setWithEmail(next === "email");
                      // a fresh ready password each time the email is asked for
                      if (next === "email" && !(draft.password ?? "")) set({ password: generatePassword() });
                    }}
                    items={[
                      { value: "code", label: "По коду" },
                      { value: "email", label: "Почта и пароль" },
                    ]}
                  />
                </div>
              </FormRow>
              {withEmail ? (
                <>
                  <FormRow label="Почта" htmlFor={ids.email} error={errorOf("email")}>
                    <input
                      id={ids.email}
                      type="email"
                      autoComplete="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      className={INPUT}
                      value={draft.email}
                      onChange={(e) => set({ email: e.target.value })}
                      onBlur={touch("email")}
                      placeholder="Например, name@company.kz"
                      aria-invalid={Boolean(errorOf("email"))}
                      data-testid="new-person-email"
                    />
                  </FormRow>
                  <FormRow label="Первый пароль" htmlFor={ids.password} error={errorOf("password")} hint="Читается вслух и набирается без смены раскладки; свой человек поставит в «Профиле»">
                    <PasswordInput id={ids.password} value={draft.password ?? ""} onChange={(password) => set({ password })} />
                  </FormRow>
                </>
              ) : null}
            </Plane>
          </>
        ) : (
          <Plane step={1} title="Экран" done={aboutDone}>
            {nameRow}
            {roleRows}
          </Plane>
        )}
        {footer}
      </div>
      {preview ? <aside className="newp-aside">{preview({ draft, photo, withEmail, problems })}</aside> : null}
      {dialogs}
    </form>
  );
}
