"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import type { FormEvent, ReactNode } from "react";

import { Dialog } from "@/components/desk/ui/Dialog";
import { Kbd } from "@/components/desk/ui/Kbd";
import { Select, SegmentTabs } from "@/components/desk/ui/Toolbar";
import { Button } from "@/components/ui/Button";
import { initialAlias } from "@/lib/people/aliases";
import type { PhotoDraft } from "@/lib/people/card-queries";
import { generatePassword } from "@/lib/people/password";
import { AVAILABILITY_LABEL, ROLE_ABOUT, ROLE_LABEL, type Availability, type Person, type Role } from "@/lib/people/queries";
import type { PersonField } from "@/lib/people/validate";

import type { DeskDraft } from "./draft";
import { AliasChips, FormRow, INPUT, PasswordInput, splitAliases } from "./fields";
import { PhotoField } from "./PhotoField";
import { usePersonForm } from "./usePersonForm";

const AVAILABILITIES: Availability[] = ["active", "vacation", "sick"];

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

type Field = PersonField;

/** What the form holds right now — for a picture of the card being made beside it (`preview`). */
export type EditorView = {
  draft: DeskDraft;
  photo: PhotoDraft;
  /** The login: an email and a password were asked for, not the code. */
  withEmail: boolean;
  problems: Partial<Record<Field, string>>;
};

/**
 * A step of the new card (D-174): its number — a check once the step holds nothing wrong — and its
 * title over a card of ruled lines.
 */
function Plane({ step, title, done, hint, children }: { step: number; title: string; done: boolean; hint?: string; children: ReactNode }) {
  return (
    <section className="newp-step" data-done={done ? "" : undefined}>
      <header className="newp-step-head">
        <span className="newp-step-mark" aria-hidden>
          {done ? <Check size={14} /> : step}
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
  const { ids, draft, set, setName, photo, setPhoto, suggestion, setAliasesTouched, withEmail, setWithEmail, person, dirty, problems, twin, twinAsked, errorOf, touch, submit, cancel, leaving, setLeaving, promoting, setPromoting, form, discard } =
    usePersonForm({ initial, draftKey, mode, roster, everyone, pending, onSubmit, onCancel });

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
                discard(leaving?.go);
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
