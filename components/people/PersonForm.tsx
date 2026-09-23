"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState, type ReactNode } from "react";

import { PasswordField } from "@/components/people/PasswordField";
import { RolePicker } from "@/components/people/RolePicker";
import { Button } from "@/components/ui/Button";
import { initialAlias, suggestAliases } from "@/lib/people/aliases";
import { generatePassword } from "@/lib/people/password";
import {
  AVAILABILITY_LABEL,
  type Availability,
  type Person,
  type PersonPatch,
  type Role,
} from "@/lib/people/queries";

const FIELD =
  "min-h-[48px] w-full field px-3 text-[16px] leading-[22px] text-text outline-none focus:border-accent";

const AVAILABILITIES: Availability[] = ["active", "vacation", "sick"];
/** Short enough for three segments on a 320px phone; the full words live in AVAILABILITY_LABEL. */
const AVAILABILITY_SHORT: Record<Availability, string> = { active: "На месте", vacation: "Отпуск", sick: "Больничный" };
const THUMB = { type: "spring" as const, stiffness: 520, damping: 42, mass: 0.9 };

export type PersonDraft = {
  full_name: string;
  position: string;
  role: Role;
  aliases: string;
  manager_id: string | null;
  availability: Availability;
  is_active: boolean;
  email?: string;
  password?: string;
};

export function draftOf(person?: Person | null): PersonDraft {
  return {
    full_name: person?.full_name ?? "",
    position: person?.position ?? "",
    role: person?.role ?? "employee",
    aliases: (person?.aliases ?? []).join(", "),
    manager_id: person?.manager_id ?? null,
    availability: person?.availability ?? "active",
    is_active: person?.is_active ?? true,
    email: "",
    // a new person starts with a ready password: take it, roll again or type your own (D-104)
    password: person ? "" : generatePassword(),
  };
}

/** Role, manager and activity go out only when the editor may change them (D-104). */
export function patchOf(draft: PersonDraft, access = true): PersonPatch {
  const patch: PersonPatch = {
    full_name: draft.full_name.trim(),
    position: draft.position.trim() || null,
    aliases: draft.aliases.split(/[,;\n]/).map((a) => a.trim()).filter(Boolean),
    availability: draft.availability,
  };
  if (!access) return patch;
  return { ...patch, role: draft.role, manager_id: draft.manager_id, is_active: draft.is_active };
}

/** A person who works with the team, not the director at the top or the wall. */
function hasManager(role: Role): boolean {
  return role !== "director" && role !== "tv";
}

function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-[14px] font-medium leading-[18px] text-muted">{label}</span>
      {children}
      {hint ? <span className="text-[13px] leading-4 text-muted">{hint}</span> : null}
    </label>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="eyebrow px-1">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

/** Three states in one row: one tap instead of opening a select (D-104). */
function AvailabilitySegments({ value, onChange }: { value: Availability; onChange: (value: Availability) => void }) {
  return (
    <div role="radiogroup" aria-label="Доступность" className="seg flex gap-1 rounded-[14px] p-1">
      {AVAILABILITIES.map((key) => {
        const active = key === value;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(key)}
            className={`relative min-h-[40px] flex-1 rounded-[10px] px-1 font-display text-[13px] font-semibold leading-4 tracking-[-0.01em] transition-colors duration-[120ms] ${
              active ? "text-text" : "text-muted active:text-text"
            }`}
          >
            {active ? <motion.span layoutId="availability-thumb" transition={THUMB} className="seg-thumb absolute inset-0 rounded-[10px]" /> : null}
            <span className="relative z-[1]" aria-label={AVAILABILITY_LABEL[key]}>
              {AVAILABILITY_SHORT[key]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Switch({ on, onToggle, title, hint }: { on: boolean; onToggle: () => void; title: string; hint: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className="flex min-h-[44px] w-full items-center justify-between gap-3 text-left"
    >
      <span>
        <span className="block text-[16px] leading-[22px]">{title}</span>
        <span className="block text-[13px] leading-4 text-muted">{hint}</span>
      </span>
      <span aria-hidden className="relative h-7 w-12 shrink-0 rounded-full transition-colors duration-[120ms]" style={{ background: on ? "var(--accent)" : "var(--border)" }}>
        <span className="absolute top-1 h-5 w-5 rounded-full bg-bg transition-transform duration-[120ms]" style={{ transform: on ? "translateX(24px)" : "translateX(4px)" }} />
      </span>
    </button>
  );
}

/**
 * A person's card as the director or the secretary edits it (D-104): who they are, what
 * role they play — each role a row that says what it means — and whether they are here.
 * Editing keeps the edits in a draft; «Сохранить / Отменить» float above the tab bar only
 * while something differs, so nothing is saved by accident and nothing is lost by a
 * scroll. Creating starts with a ready password; the login itself is handed over after.
 */
export function PersonForm({
  initial,
  managers,
  roster = [],
  mode,
  roles,
  lockedRole,
  pending,
  onSubmit,
  footer,
}: {
  initial: PersonDraft;
  managers: Person[];
  /** Everyone else on the roster — spoken forms are suggested against it (D-54). */
  roster?: Person[];
  mode: "create" | "edit";
  /** What the editor may hand out, from `assignableRoles`. */
  roles: Role[];
  /** Why role, manager and «работает» cannot change here (one's own card) — then they are shown, not offered. */
  lockedRole?: string;
  pending: boolean;
  /** Resolves when saved; the draft then becomes the new baseline. */
  onSubmit: (draft: PersonDraft) => Promise<unknown>;
  /** Rendered under the card sections — the login block on the editor. */
  footer?: ReactNode;
}) {
  const [baseline, setBaseline] = useState<PersonDraft>(initial);
  const [draft, setDraft] = useState<PersonDraft>(initial);
  const set = (patch: Partial<PersonDraft>) => setDraft((d) => ({ ...d, ...patch }));
  // Until the aliases field is touched, it follows the name being typed.
  const [aliasesTouched, setAliasesTouched] = useState(mode === "edit");
  const suggestion = suggestAliases(draft.full_name, roster);
  const setName = (full_name: string) =>
    setDraft((d) => ({ ...d, full_name, aliases: aliasesTouched ? d.aliases : suggestAliases(full_name, roster).mine.join(", ") }));

  const person = draft.role !== "tv";
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  const valid =
    draft.full_name.trim().length >= 2 &&
    (mode === "edit" || ((draft.email ?? "").includes("@") && (draft.password ?? "").length >= 6));

  const submit = async () => {
    try {
      await onSubmit(draft);
      setBaseline(draft);
    } catch {
      // the mutation toasts its own error; the draft stays for another try
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {mode === "create" ? (
        <Section title="Вход">
          <div className="card flex flex-col gap-4 p-4">
            <Field label="Почта">
              <input
                type="email"
                inputMode="email"
                autoComplete="off"
                autoCapitalize="none"
                className={FIELD}
                value={draft.email}
                onChange={(e) => set({ email: e.target.value })}
                placeholder="name@company.kz"
              />
            </Field>
            <Field label="Первый пароль" hint="После добавления покажу вход целиком — скопировать или отправить в мессенджер">
              <PasswordField label="Первый пароль" value={draft.password ?? ""} onChange={(password) => set({ password })} />
            </Field>
          </div>
        </Section>
      ) : null}

      <Section title="Карточка">
        <div className="card flex flex-col gap-4 p-4">
          <Field label={person ? "Имя и фамилия" : "Название экрана"}>
            <input className={FIELD} value={draft.full_name} onChange={(e) => setName(e.target.value)} placeholder={person ? "Марат Оспанов" : "ТВ в холле"} />
          </Field>
          {person ? (
            <>
              <Field label="Должность">
                <input className={FIELD} value={draft.position} onChange={(e) => set({ position: e.target.value })} placeholder="Снабженец" />
              </Field>
              <Field
                label="Как называет директор"
                hint={
                  suggestion.namesakes.length
                    ? `Тёзка: ${suggestion.namesakes.join(", ")}. Инициал («${initialAlias(draft.full_name) ?? "Имя Ф."}») отличает их в речи`
                    : "Через запятую: Ерлан, Ерлан Б. — по этим формам распознаётся речь"
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
            </>
          ) : null}
        </div>
      </Section>

      <Section title="Роль">
        <RolePicker
          value={draft.role}
          options={roles}
          locked={lockedRole}
          onChange={(role) => set({ role, manager_id: hasManager(role) ? draft.manager_id : null })}
        />
        {hasManager(draft.role) && !lockedRole ? (
          <div className="card mt-2 p-4">
            <Field label="Руководитель" hint="Руководитель видит задачи своих людей">
              <select className={FIELD} value={draft.manager_id ?? ""} onChange={(e) => set({ manager_id: e.target.value || null })}>
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
      </Section>

      {mode === "edit" ? (
        <Section title="Статус">
          <div className="card flex flex-col gap-4 p-4">
            {person ? (
              <Field label="Доступность" hint="В отпуске и на больничном: серая точка в «Команде», серия не сгорает, штрафов нет">
                <AvailabilitySegments value={draft.availability} onChange={(availability) => set({ availability })} />
              </Field>
            ) : null}
            {lockedRole ? null : (
              <Switch
                on={draft.is_active}
                onToggle={() => set({ is_active: !draft.is_active })}
                title={person ? "Работает в компании" : "Экран включён"}
                hint={
                  draft.is_active
                    ? "Выключи при увольнении: вход закроется, история останется"
                    : "Вход закрыт: исчезнет из рейтинга и распознавания, история останется"
                }
              />
            )}
          </div>
        </Section>
      ) : null}

      {footer}

      {mode === "create" ? (
        <Button block size="lg" loading={pending} disabled={!valid} onClick={submit}>
          Добавить
        </Button>
      ) : (
        <AnimatePresence>
          {dirty ? (
            <motion.div
              key="save-bar"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
              className="above-tabbar fixed inset-x-0 z-[15] mx-auto w-full max-w-lg px-4"
              style={{ bottom: "calc(var(--tabbar-space) + 4px)" }}
            >
              <div className="card flex items-center gap-2 p-2 shadow-[0_10px_30px_rgba(0,0,0,.35)]" data-testid="save-bar">
                <Button variant="ghost" onClick={() => setDraft(baseline)} disabled={pending}>
                  Отменить
                </Button>
                <Button className="flex-1" loading={pending} disabled={!valid} onClick={submit}>
                  Сохранить
                </Button>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      )}
    </div>
  );
}
