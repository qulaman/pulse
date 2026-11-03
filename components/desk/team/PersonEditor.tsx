"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

import { Kbd } from "@/components/desk/ui/Kbd";
import { SectionLabel } from "@/components/desk/ui/SectionLabel";
import { Select, SegmentTabs } from "@/components/desk/ui/Toolbar";
import type { PersonDraft } from "@/components/people/PersonForm";
import { Button } from "@/components/ui/Button";
import { initialAlias, suggestAliases } from "@/lib/people/aliases";
import { generatePassword } from "@/lib/people/password";
import { AVAILABILITY_LABEL, ROLE_ABOUT, ROLE_LABEL, type Availability, type Person, type Role } from "@/lib/people/queries";

import { AliasChips, FormRow, INPUT, PasswordInput, Switch, splitAliases } from "./fields";

const AVAILABILITIES: Availability[] = ["active", "vacation", "sick"];
/** Esc twice within this to drop what was typed. */
const ESC_ARM_MS = 4000;

/** A person who works with the team, not the director at the top or the wall (PersonForm's rule). */
function hasManager(role: Role): boolean {
  return role !== "director" && role !== "tv";
}

type Field = "full_name" | "email" | "password";

/** What is wrong with the draft, field by field — said under the field, not as a dead button. */
function problemsOf(draft: PersonDraft, mode: "create" | "edit", withEmail: boolean): Partial<Record<Field, string>> {
  const problems: Partial<Record<Field, string>> = {};
  if (draft.full_name.trim().length < 2) problems.full_name = draft.role === "tv" ? "Назовите экран — хотя бы две буквы" : "Имя и фамилия — хотя бы две буквы";
  if (mode === "create" && withEmail) {
    const email = (draft.email ?? "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) problems.email = email ? "Похоже, в почте опечатка" : "Впишите почту — или вход по коду";
    if ((draft.password ?? "").length < 6) problems.password = "Не короче 6 символов";
  }
  return problems;
}

/** The section of a long form: its label over a flat plane of rows. */
function Plane({ title, children, end }: { title?: string; children: ReactNode; end?: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      {title ? (
        <SectionLabel action={end} className="px-1">
          {title}
        </SectionLabel>
      ) : null}
      <div className="rounded-[12px] border border-border bg-surface/40">{children}</div>
    </section>
  );
}

/**
 * The person's card as the director or the secretary fills it in on the desk (D-104, D-154
 * wave 3): the phone's draft (`draftOf` / `patchOf` in PersonForm) laid out for a mouse and the
 * keys — the label on the left, the control on the right; the role and the manager as dropdowns
 * with the role's meaning under it, the availability as segments, the spoken forms as chips. A
 * problem is said under its field. Ctrl+S (or Ctrl+Enter) saves, Esc cancels — twice when
 * something is typed; while it is unsaved the form says so and the tab asks before closing.
 * Creating: a code by default (D-135), an email and a ready password on request.
 */
export function PersonEditor({
  initial,
  mode,
  roles,
  lockedRole,
  managers,
  roster,
  pending,
  onSubmit,
  onCancel,
}: {
  initial: PersonDraft;
  mode: "create" | "edit";
  roles: Role[];
  /** Why role, manager and «работает» cannot change here — then they are shown, not offered. */
  lockedRole?: string;
  managers: Person[];
  /** Everyone else on the roster — spoken forms are suggested against it (D-54). */
  roster: Person[];
  pending: boolean;
  /** Resolves when saved; the draft then becomes the new baseline. */
  onSubmit: (draft: PersonDraft) => Promise<unknown>;
  onCancel?: () => void;
}) {
  const uid = useId();
  const ids = { name: `${uid}-name`, position: `${uid}-position`, aliases: `${uid}-aliases`, role: `${uid}-role`, manager: `${uid}-manager`, active: `${uid}-active`, email: `${uid}-email`, password: `${uid}-password` };
  const [baseline, setBaseline] = useState<PersonDraft>(initial);
  const [draft, setDraft] = useState<PersonDraft>(initial);
  const set = (patch: Partial<PersonDraft>) => setDraft((d) => ({ ...d, ...patch }));
  // until the spoken forms are touched, they follow the name being typed
  const [aliasesTouched, setAliasesTouched] = useState(mode === "edit");
  const suggestion = suggestAliases(draft.full_name, roster);
  const setName = (full_name: string) =>
    setDraft((d) => ({ ...d, full_name, aliases: aliasesTouched ? d.aliases : suggestAliases(full_name, roster).mine.join(", ") }));
  const [withEmail, setWithEmail] = useState(false);
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [tried, setTried] = useState(false);
  const [armed, setArmed] = useState(false);
  const form = useRef<HTMLFormElement>(null);

  const person = draft.role !== "tv";
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline) || (mode === "create" && withEmail);
  const problems = problemsOf(draft, mode, withEmail);
  const errorOf = (field: Field) => (tried || touched[field] ? (problems[field] ?? null) : null);
  const touch = (field: Field) => () => setTouched((t) => ({ ...t, [field]: true }));

  const submit = async () => {
    if (pending) return;
    if (mode === "edit" && !dirty) return;
    const first = (Object.keys(problems) as Field[])[0];
    if (first) {
      setTried(true);
      document.getElementById(first === "full_name" ? ids.name : first === "email" ? ids.email : ids.password)?.focus();
      return;
    }
    try {
      // the code is the login unless an email was asked for: a half-typed email goes nowhere
      await onSubmit(mode === "create" && !withEmail ? { ...draft, email: "", password: "" } : draft);
      setBaseline(draft);
    } catch {
      // the mutation toasts its own error; the draft stays for another try
    }
  };
  const cancel = () => {
    setDraft(baseline);
    setArmed(false);
    onCancel?.();
  };

  // the keys of the form: Ctrl/Cmd+S and Ctrl/Cmd+Enter — save from any field; Esc — cancel,
  // twice when something is typed. Caught before the desk's own Esc (which would only let go of
  // the field's caret); a dialog or a menu over the form keeps its Esc.
  const latest = useRef({ submit, cancel, dirty, armed });
  useLayoutEffect(() => {
    latest.current = { submit, cancel, dirty, armed };
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
      if (latest.current.dirty && !latest.current.armed) {
        setArmed(true);
        return;
      }
      latest.current.cancel();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel]);
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), ESC_ARM_MS);
    return () => clearTimeout(timer);
  }, [armed]);
  // closing the tab with unsaved words asks first
  useEffect(() => {
    if (!dirty) return;
    const hold = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", hold);
    return () => window.removeEventListener("beforeunload", hold);
  }, [dirty]);
  // the caret in the name from the first look
  useEffect(() => {
    const field = document.getElementById(ids.name) as HTMLInputElement | null;
    field?.focus({ preventScroll: false });
    if (mode === "edit") field?.select();
  }, [ids.name, mode]);

  const nameRow = (
    <FormRow label={person ? "Имя и фамилия" : "Название экрана"} htmlFor={ids.name} error={errorOf("full_name")}>
      <input
        id={ids.name}
        className={INPUT}
        value={draft.full_name}
        onChange={(e) => setName(e.target.value)}
        onBlur={touch("full_name")}
        placeholder={person ? "Марат Оспанов" : "ТВ в холле"}
        autoComplete="off"
        aria-invalid={Boolean(errorOf("full_name"))}
        data-testid="person-name"
      />
    </FormRow>
  );
  const personRows = person ? (
    <>
      <FormRow label="Должность" htmlFor={ids.position}>
        <input id={ids.position} className={INPUT} value={draft.position} onChange={(e) => set({ position: e.target.value })} placeholder="Снабженец" autoComplete="off" />
      </FormRow>
      <FormRow
        label="Как называет директор"
        htmlFor={ids.aliases}
        hint={
          suggestion.namesakes.length
            ? `Тёзка: ${suggestion.namesakes.join(", ")}. Инициал («${initialAlias(draft.full_name) ?? "Имя Ф."}») отличает их в речи`
            : "По этим формам распознаётся речь. Enter — добавить, Backspace — убрать последнюю"
        }
      >
        <AliasChips
          id={ids.aliases}
          value={splitAliases(draft.aliases)}
          onChange={(next) => {
            setAliasesTouched(true);
            set({ aliases: next.join(", ") });
          }}
          suggestions={suggestion.mine}
          placeholder="Ерлан, Ерлан Б."
        />
      </FormRow>
    </>
  ) : null;
  const roleRows = lockedRole ? (
    <FormRow label="Роль" align="text" hint={lockedRole}>
      <span className="pt-0 text-[14px] leading-5">{ROLE_LABEL[draft.role]}</span>
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
        <FormRow label="Руководитель" htmlFor={ids.manager} hint="Руководитель видит задачи своих людей">
          <Select id={ids.manager} value={draft.manager_id ?? ""} onChange={(e) => set({ manager_id: e.target.value || null })} className="w-full max-w-[280px]">
            <option value="">Нет</option>
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
    <div className="sticky bottom-0 z-[1] flex flex-wrap items-center gap-3 rounded-b-[12px] border-t border-border/70 bg-surface px-5 py-3" data-testid="person-form-footer">
      <p className="min-w-0 flex-1 text-[12px] leading-4" aria-live="polite">
        {armed ? (
          <span style={{ color: "var(--warn)" }} data-testid="person-form-armed">
            Не сохранено — <Kbd>Esc</Kbd> ещё раз, чтобы отменить
          </span>
        ) : dirty && mode === "edit" ? (
          <span className="inline-flex items-center gap-1.5" style={{ color: "var(--warn)" }} data-testid="person-form-dirty">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-warn" />
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

  if (mode === "edit") {
    return (
      <form
        ref={form}
        noValidate
        onSubmit={onFormSubmit}
        className="rounded-[12px] border bg-surface/40 transition-[border-color,box-shadow] duration-[120ms]"
        // the form is the director's own action now: the accent frames it (D-154)
        style={{
          borderColor: dirty ? "color-mix(in srgb, var(--warn) 55%, var(--border))" : "color-mix(in srgb, var(--accent) 45%, var(--border))",
          boxShadow: `0 0 0 3px color-mix(in srgb, ${dirty ? "var(--warn)" : "var(--accent)"} 10%, transparent)`,
        }}
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
        {!lockedRole ? (
          <FormRow
            label={person ? "Работает в компании" : "Экран"}
            htmlFor={ids.active}
            hint={
              draft.is_active
                ? "При увольнении — выключить: вход закроется на всех устройствах, уведомления перестанут приходить, история останется"
                : "Вход закрыт: исчезнет из рейтинга и распознавания, история останется"
            }
          >
            <Switch id={ids.active} on={draft.is_active} onToggle={() => set({ is_active: !draft.is_active })} label={draft.is_active ? (person ? "Работает" : "Включён") : person ? "Не работает" : "Выключен"} />
          </FormRow>
        ) : null}
        {footer}
      </form>
    );
  }

  return (
    <form ref={form} noValidate onSubmit={onFormSubmit} className="flex flex-col gap-6" data-testid="desk-person-editor">
      <Plane title={person ? "О человеке" : "Экран"}>
        {nameRow}
        {personRows}
        {roleRows}
      </Plane>
      {person ? (
        <Plane title="Вход">
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
                  placeholder="name@company.kz"
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
      ) : null}
      <div className="rounded-[12px] border border-border bg-surface/40">{footer}</div>
    </form>
  );
}
