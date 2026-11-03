"use client";

import { useState, type ReactNode } from "react";

import { SectionLabel } from "@/components/desk/ui/SectionLabel";
import { SegmentTabs } from "@/components/desk/ui/Toolbar";
import { PasswordField } from "@/components/people/PasswordField";
import { RolePicker } from "@/components/people/RolePicker";
import type { PersonDraft } from "@/components/people/PersonForm";
import { Button } from "@/components/ui/Button";
import { initialAlias, suggestAliases } from "@/lib/people/aliases";
import { AVAILABILITY_LABEL, type Availability, type Person, type Role } from "@/lib/people/queries";

const FIELD = "field h-10 w-full px-3 text-[14px] leading-5 text-text outline-none";
const AVAILABILITIES: Availability[] = ["active", "vacation", "sick"];
/** `PasswordField` is a 52-px phone field; on the desk it stands as high as its neighbours. */
export const COMPACT_PASSWORD = "[&_input]:min-h-10 [&_input]:text-[15px] [&_button]:h-9 [&_button]:w-9";

/** A person who works with the team, not the director at the top or the wall (PersonForm's rule). */
function hasManager(role: Role): boolean {
  return role !== "director" && role !== "tv";
}

function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium leading-4 text-muted">{label}</span>
      {children}
      {hint ? <span className="text-[12px] leading-4 text-muted">{hint}</span> : null}
    </label>
  );
}

function Switch({ on, onToggle, title, hint }: { on: boolean; onToggle: () => void; title: string; hint: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={onToggle} className="flex w-full items-center justify-between gap-3 text-left">
      <span>
        <span className="block text-[14px] leading-5">{title}</span>
        <span className="block text-[12px] leading-4 text-muted">{hint}</span>
      </span>
      <span aria-hidden className="relative h-6 w-10 shrink-0 rounded-full transition-colors duration-[120ms]" style={{ background: on ? "var(--accent)" : "var(--border)" }}>
        <span className="absolute top-1 h-4 w-4 rounded-full bg-bg transition-transform duration-[120ms]" style={{ transform: on ? "translateX(20px)" : "translateX(4px)" }} />
      </span>
    </button>
  );
}

/**
 * The person's card as the director or the secretary edits it on the desk (D-104, tasks/022
 * B.2–3): the same draft as the phone's `PersonForm` (`draftOf` / `patchOf`), the same role
 * picker and spoken forms, laid out for a mouse — and «Сохранить» an ordinary button at the
 * foot, not a bar docked over the tab bar. Creating starts with a ready password behind
 * «+ Почта и пароль»; by default the person signs in with a code (D-135).
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
  const [baseline, setBaseline] = useState<PersonDraft>(initial);
  const [draft, setDraft] = useState<PersonDraft>(initial);
  const set = (patch: Partial<PersonDraft>) => setDraft((d) => ({ ...d, ...patch }));
  // until the aliases field is touched, it follows the name being typed
  const [aliasesTouched, setAliasesTouched] = useState(mode === "edit");
  const suggestion = suggestAliases(draft.full_name, roster);
  const setName = (full_name: string) =>
    setDraft((d) => ({ ...d, full_name, aliases: aliasesTouched ? d.aliases : suggestAliases(full_name, roster).mine.join(", ") }));
  const [withEmail, setWithEmail] = useState(false);

  const person = draft.role !== "tv";
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  const typedEmail = (draft.email ?? "").trim();
  const valid =
    draft.full_name.trim().length >= 2 &&
    (mode === "edit" || !typedEmail || (typedEmail.includes("@") && (draft.password ?? "").length >= 6));

  const submit = async () => {
    try {
      await onSubmit(draft);
      setBaseline(draft);
    } catch {
      // the mutation toasts its own error; the draft stays for another try
    }
  };

  return (
    <form
      className="flex flex-col gap-5"
      data-testid="desk-person-editor"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid && (dirty || mode === "create") && !pending) void submit();
      }}
    >
      {mode === "create" ? (
        <div className="card flex flex-col gap-3 p-4">
          <p className="text-[13px] leading-[18px] text-muted" data-testid="new-person-code-hint">
            Вход по коду: после «Добавить» покажу код из 8 цифр и QR — почта и пароль не нужны.
          </p>
          {withEmail ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Почта">
                <input
                  type="email"
                  autoComplete="off"
                  autoCapitalize="none"
                  className={FIELD}
                  value={draft.email}
                  onChange={(e) => set({ email: e.target.value })}
                  placeholder="name@company.kz"
                />
              </Field>
              <Field label="Первый пароль">
                {/* the phone's field at the desk's height */}
                <div className={COMPACT_PASSWORD}>
                  <PasswordField label="Первый пароль" value={draft.password ?? ""} onChange={(password) => set({ password })} />
                </div>
              </Field>
            </div>
          ) : (
            <button type="button" onClick={() => setWithEmail(true)} className="self-start text-[13px] font-semibold leading-4 text-accent" data-testid="new-person-with-email">
              + Почта и пароль — для входа с компьютера
            </button>
          )}
        </div>
      ) : null}

      <div className="card flex flex-col gap-4 p-4">
        <Field label={person ? "Имя и фамилия" : "Название экрана"}>
          <input
            className={FIELD}
            value={draft.full_name}
            onChange={(e) => setName(e.target.value)}
            placeholder={person ? "Марат Оспанов" : "ТВ в холле"}
            data-autofocus={mode === "create" || undefined}
            autoFocus={mode === "create"}
          />
        </Field>
        {person ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Должность">
              <input className={FIELD} value={draft.position} onChange={(e) => set({ position: e.target.value })} placeholder="Снабженец" />
            </Field>
            <Field
              label="Как называет директор"
              hint={
                suggestion.namesakes.length
                  ? `Тёзка: ${suggestion.namesakes.join(", ")}. Инициал («${initialAlias(draft.full_name) ?? "Имя Ф."}») отличает их в речи`
                  : "Через запятую — по этим формам распознаётся речь"
              }
            >
              <input
                className={FIELD}
                value={draft.aliases}
                onChange={(e) => {
                  setAliasesTouched(true);
                  set({ aliases: e.target.value });
                }}
                placeholder="Ерлан, Ерлан Б."
              />
            </Field>
          </div>
        ) : null}
        {mode === "edit" && person ? (
          <Field label="Доступность" hint="В отпуске и на больничном: серия не сгорает, штрафов нет">
            <SegmentTabs
              aria-label="Доступность"
              value={draft.availability}
              onChange={(availability) => set({ availability })}
              items={AVAILABILITIES.map((key) => ({ value: key, label: AVAILABILITY_LABEL[key] }))}
            />
          </Field>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <SectionLabel className="px-1">Роль</SectionLabel>
        {/* the phone's picker, its 64-px rows at the desk's height */}
        <div className="[&_[role=radio]]:min-h-[52px] [&_[role=radio]]:py-2">
          <RolePicker
            value={draft.role}
            options={roles}
            locked={lockedRole}
            onChange={(role) => set({ role, manager_id: hasManager(role) ? draft.manager_id : null })}
          />
        </div>
        {hasManager(draft.role) && !lockedRole ? (
          <div className="card p-4">
            <Field label="Руководитель" hint="Руководитель видит задачи своих людей">
              <select className={`${FIELD} cursor-pointer`} value={draft.manager_id ?? ""} onChange={(e) => set({ manager_id: e.target.value || null })}>
                <option value="">Нет</option>
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        ) : null}
      </div>

      {mode === "edit" && !lockedRole ? (
        <div className="card p-4">
          <Switch
            on={draft.is_active}
            onToggle={() => set({ is_active: !draft.is_active })}
            title={person ? "Работает в компании" : "Экран включён"}
            hint={
              draft.is_active
                ? "При увольнении — выключить: вход закроется на всех устройствах, уведомления перестанут приходить, история останется"
                : "Вход закрыт: исчезнет из рейтинга и распознавания, история останется"
            }
          />
        </div>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        {onCancel ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => {
              setDraft(baseline);
              onCancel();
            }}
          >
            Отменить
          </Button>
        ) : null}
        <Button size="sm" type="submit" loading={pending} disabled={!valid || (mode === "edit" && !dirty)} data-testid="desk-person-save">
          {mode === "create" ? "Добавить" : "Сохранить"}
        </Button>
      </div>
    </form>
  );
}
