"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import {
  AVAILABILITY_LABEL,
  ROLE_LABEL,
  type Availability,
  type Person,
  type PersonPatch,
  type Role,
} from "@/lib/people/queries";

const FIELD =
  "min-h-[44px] w-full field px-3 text-[16px] leading-[22px] text-text outline-none focus:border-accent";

const ROLES: Role[] = ["employee", "manager", "shopkeeper", "director", "tv"];
const AVAILABILITIES: Availability[] = ["active", "vacation", "sick"];

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
    password: "",
  };
}

export function patchOf(draft: PersonDraft): PersonPatch {
  return {
    full_name: draft.full_name.trim(),
    position: draft.position.trim() || null,
    role: draft.role,
    aliases: draft.aliases.split(/[,;\n]/).map((a) => a.trim()).filter(Boolean),
    manager_id: draft.manager_id,
    availability: draft.availability,
    is_active: draft.is_active,
  };
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-[14px] font-medium leading-[18px] text-muted">{label}</span>
      {children}
      {hint ? <span className="text-[13px] leading-4 text-muted">{hint}</span> : null}
    </label>
  );
}

export function PersonForm({
  initial,
  managers,
  mode,
  pending,
  onSubmit,
}: {
  initial: PersonDraft;
  managers: Person[];
  mode: "create" | "edit";
  pending: boolean;
  onSubmit: (draft: PersonDraft) => void;
}) {
  const [draft, setDraft] = useState<PersonDraft>(initial);
  const set = (patch: Partial<PersonDraft>) => setDraft({ ...draft, ...patch });

  const valid =
    draft.full_name.trim().length >= 2 &&
    (mode === "edit" || ((draft.email ?? "").includes("@") && (draft.password ?? "").length >= 6));

  return (
    <div className="flex flex-col gap-4">
      {mode === "create" ? (
        <section className="card p-4">
          <h2 className="text-[19px] font-semibold leading-6">Вход</h2>
          <p className="mt-1 text-[13px] leading-4 text-muted">
            Пока вход по почте и паролю. Скажи пароль сотруднику лично — в приложении он его сменит
          </p>
          <div className="mt-4 flex flex-col gap-4">
            <Field label="Почта">
              <input type="email" inputMode="email" autoComplete="off" className={FIELD} value={draft.email} onChange={(e) => set({ email: e.target.value })} />
            </Field>
            <Field label="Первый пароль" hint="Не короче 6 символов">
              <input type="text" autoComplete="off" className={FIELD} value={draft.password} onChange={(e) => set({ password: e.target.value })} />
            </Field>
          </div>
        </section>
      ) : null}

      <section className="card p-4">
        <h2 className="text-[19px] font-semibold leading-6">Карточка</h2>
        <div className="mt-4 flex flex-col gap-4">
          <Field label="Имя и фамилия">
            <input className={FIELD} value={draft.full_name} onChange={(e) => set({ full_name: e.target.value })} />
          </Field>
          <Field label="Должность">
            <input className={FIELD} value={draft.position} onChange={(e) => set({ position: e.target.value })} placeholder="Снабженец" />
          </Field>
          <Field label="Как называет директор" hint="Через запятую: Ерлан, Ерлан Б. — по этим формам распознаётся речь">
            <input className={FIELD} value={draft.aliases} onChange={(e) => set({ aliases: e.target.value })} placeholder="Ерлан, Ерлан Б." />
          </Field>
          <Field label="Роль">
            <select className={FIELD} value={draft.role} onChange={(e) => set({ role: e.target.value as Role })}>
              {ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_LABEL[r]}</option>
              ))}
            </select>
          </Field>
          <Field label="Руководитель" hint="Руководитель видит задачи своих людей (глубина 1)">
            <select className={FIELD} value={draft.manager_id ?? ""} onChange={(e) => set({ manager_id: e.target.value || null })}>
              <option value="">Нет</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>{m.full_name}</option>
              ))}
            </select>
          </Field>
        </div>
      </section>

      {mode === "edit" ? (
        <section className="card p-4">
          <h2 className="text-[19px] font-semibold leading-6">Статус</h2>
          <div className="mt-4 flex flex-col gap-4">
            <Field label="Доступность" hint="В отпуске и на больничном: серая точка в «Людях», серия не сгорает, штрафы не начисляются">
              <select className={FIELD} value={draft.availability} onChange={(e) => set({ availability: e.target.value as Availability })}>
                {AVAILABILITIES.map((a) => (
                  <option key={a} value={a}>{AVAILABILITY_LABEL[a]}</option>
                ))}
              </select>
            </Field>
            <button
              type="button"
              role="switch"
              aria-checked={draft.is_active}
              onClick={() => set({ is_active: !draft.is_active })}
              className="flex min-h-[44px] w-full items-center justify-between gap-3 text-left"
            >
              <span>
                <span className="block text-[16px] leading-[22px]">Работает в компании</span>
                <span className="block text-[13px] leading-4 text-muted">
                  Выключи при увольнении: исчезнет из рейтинга и распознавания, история сохранится (D-07)
                </span>
              </span>
              <span aria-hidden className="relative h-7 w-12 shrink-0 rounded-full" style={{ background: draft.is_active ? "var(--accent)" : "var(--border)" }}>
                <span className="absolute top-1 h-5 w-5 rounded-full bg-bg transition-transform duration-[120ms]" style={{ transform: draft.is_active ? "translateX(24px)" : "translateX(4px)" }} />
              </span>
            </button>
          </div>
        </section>
      ) : null}

      <Button block disabled={!valid || pending} onClick={() => onSubmit(draft)}>
        {pending ? "Сохраняю…" : mode === "create" ? "Добавить сотрудника" : "Сохранить"}
      </Button>
    </div>
  );
}
