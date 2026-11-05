"use client";

import Link from "next/link";
import type { KeyboardEvent } from "react";

import { NumberInput, SettingRow, SettingsGroup, Switch, TextInput } from "@/components/desk/settings/form";
import { Kbd } from "@/components/desk/ui/Kbd";
import { useDraft } from "@/components/settings/draft";
import { Button } from "@/components/ui/Button";
import { DESK_SCENES, SCENE_NAME, sceneOfAction, type DeskScene } from "@/lib/errands/scene";
import { usePeople } from "@/lib/people/queries";
import type { CompanySettings } from "@/lib/settings";

type Action = CompanySettings["secretary"]["actions"][number];

const ACTIONS_MAX = 12;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Puts the caret back in the same column of a row after the list moved under it. */
function focusCell(row: number, column: string) {
  requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-action-row="${row}"] [data-col="${column}"]`)?.focus());
}

/**
 * The secretary's buttons as a small table (D-79, D-97): the icon, the words on the button, the
 * scene her face plays — «сама по надписи» unless one is chosen — and ×. Alt+↑/↓ in a row moves it,
 * Enter in the last label adds a row. The order is the order on the director's screen.
 */
function ActionsTable({ actions, onChange }: { actions: Action[]; onChange: (actions: Action[]) => void }) {
  const set = (index: number, patch: Partial<Action>) => onChange(actions.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const move = (from: number, to: number, column: string) => {
    if (to < 0 || to >= actions.length) return;
    const next = [...actions];
    const [row] = next.splice(from, 1);
    next.splice(to, 0, row);
    onChange(next);
    focusCell(to, column);
  };
  const add = () => {
    if (actions.length >= ACTIONS_MAX) return;
    // the code is filled on save: the director names the button, not its id
    onChange([...actions, { code: "", label: "", icon: "", synonyms: [] }]);
    focusCell(actions.length, "label");
  };
  const onRowKey = (index: number) => (event: KeyboardEvent<HTMLElement>) => {
    const column = (event.target as HTMLElement).dataset.col ?? "label";
    if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      move(index, index + (event.key === "ArrowUp" ? -1 : 1), column);
    } else if (event.key === "Enter" && column === "label" && index === actions.length - 1) {
      event.preventDefault();
      add();
    }
  };

  return (
    <div className="desk-cells flex flex-col gap-2" data-testid="secretary-actions">
      <div>
        <div className="desk-label grid grid-cols-[48px_minmax(0,1fr)_280px_88px] items-center gap-4 border-b border-text pb-1 uppercase">
          <span>Знак</span>
          <span>Надпись на кнопке</span>
          <span>Что делает секретарь</span>
          <span />
        </div>
        {actions.length === 0 ? <p className="py-2 text-[13px] text-muted">Кнопок нет — добавьте первую</p> : null}
        {actions.map((row, index) => {
          const auto = sceneOfAction({ code: row.code, label: row.label });
          return (
            <div
              key={index}
              data-action-row={index}
              onKeyDown={onRowKey(index)}
              className="group grid grid-cols-[48px_minmax(0,1fr)_280px_88px] items-center gap-4 border-b border-border/60 py-0.5 last:border-b-0"
            >
              <input
                data-col="icon"
                aria-label="Значок"
                maxLength={4}
                placeholder="☕"
                value={row.icon}
                onChange={(event) => set(index, { icon: event.target.value })}
                className="field h-8 w-full px-0 text-[16px] leading-5 outline-none"
              />
              <input
                data-col="label"
                aria-label="Надпись"
                placeholder="Кофе"
                maxLength={40}
                value={row.label}
                onChange={(event) => set(index, { label: event.target.value })}
                className="field h-8 w-full px-0 text-[14px] leading-5 outline-none"
              />
              <select
                data-col="scene"
                aria-label="Что делает секретарь"
                value={row.scene ?? ""}
                onChange={(event) => set(index, { scene: event.target.value ? (event.target.value as DeskScene) : undefined })}
                className="field h-8 w-full cursor-pointer pl-0 text-[13px] leading-5"
              >
                <option value="">По надписи — {SCENE_NAME[auto].toLowerCase()}</option>
                {DESK_SCENES.map((scene) => (
                  <option key={scene} value={scene}>
                    {SCENE_NAME[scene]}
                  </option>
                ))}
              </select>
              <span className="flex items-center justify-end gap-0.5 text-muted">
                <button
                  type="button"
                  aria-label="Выше"
                  title="Выше · Alt ↑"
                  disabled={index === 0}
                  onClick={() => move(index, index - 1, "label")}
                  className="flex h-7 w-7 items-center justify-center opacity-0 transition-opacity duration-[120ms] hover:bg-surface-2 hover:text-text focus-visible:opacity-100 disabled:!opacity-0 group-hover:opacity-100"
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label="Ниже"
                  title="Ниже · Alt ↓"
                  disabled={index === actions.length - 1}
                  onClick={() => move(index, index + 1, "label")}
                  className="flex h-7 w-7 items-center justify-center opacity-0 transition-opacity duration-[120ms] hover:bg-surface-2 hover:text-text focus-visible:opacity-100 disabled:!opacity-0 group-hover:opacity-100"
                >
                  ↓
                </button>
                <button
                  type="button"
                  aria-label={`Убрать кнопку ${row.label || "без надписи"}`}
                  title="Убрать"
                  onClick={() => onChange(actions.filter((_, i) => i !== index))}
                  className="flex h-7 w-7 items-center justify-center text-[17px] leading-none hover:bg-surface-2 hover:text-danger"
                >
                  ×
                </button>
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-3">
        <Button size="sm" variant="secondary" disabled={actions.length >= ACTIONS_MAX} onClick={add}>
          + Кнопка
        </Button>
        <span className="flex items-center gap-1 text-[12px] leading-4 text-muted">
          <Kbd>Alt ↑</Kbd>
          <Kbd>Alt ↓</Kbd> переставить · {actions.length} из {ACTIONS_MAX}
        </span>
      </div>
    </div>
  );
}

/** «Программа» on the desk: the secretary's buttons, her repeat push and the security phone; the faces' two switches. */
export function AppPanel() {
  const { draft, server, update } = useDraft();
  const people = usePeople();
  const secretaries = (people.data ?? []).filter((p) => p.role === "secretary" && p.is_active).map((p) => p.full_name.split(" ")[0]);
  const secretary = draft.secretary;
  const setSecretary = (patch: Partial<CompanySettings["secretary"]>) => update({ secretary: { ...secretary, ...patch } });

  return (
    <div className="flex flex-col gap-8">
      <SettingsGroup
        id="secretary"
        title="Секретарь"
        about="Кнопки, которыми директор зовёт секретаря. Заявка — не задача: без срока, без приёмки, живёт минуты."
        action={
          <Link href="/desk/team" className="text-[13px] font-medium underline underline-offset-2">
            Роли — в «Команде»
          </Link>
        }
      >
        <SettingRow
          id="secretary-who"
          label="Кто секретарь"
          hint={secretaries.length ? "Роль меняется в карточке человека" : "Назначьте роль «Секретарь» в карточке человека — тогда на Пульсе появится секретарь за столом"}
        >
          <span className={`text-[14px] leading-5 ${secretaries.length ? "" : "text-muted"}`}>{people.data ? secretaries.join(", ") || "никто" : "…"}</span>
        </SettingRow>
        <SettingRow id="secretary-buttons" label="Кнопки" hint="Порядок — как на экране директора" stack changed={!same(secretary.actions, server.secretary.actions)}>
          <ActionsTable actions={secretary.actions} onChange={(actions) => setSecretary({ actions })} />
        </SettingRow>
        <SettingRow
          id="secretary-phone"
          label="Телефон охраны"
          hint="Для кнопки «Позвонить охране» на экране тревоги; пусто — кнопки нет"
          htmlFor="set-security-phone"
          changed={secretary.security_phone !== server.secretary.security_phone}
        >
          <TextInput id="set-security-phone" label="Телефон охраны" value={secretary.security_phone} maxLength={24} placeholder="+7 700 000 00 00" width={200} className="nums" onChange={(security_phone) => setSecretary({ security_phone })} />
        </SettingRow>
        <SettingRow
          id="secretary-repeat"
          label="Повторить пуш"
          hint="Если заявку никто не взял — секретарю приходит ещё один пуш"
          htmlFor="set-secretary-repeat"
          changed={secretary.escalate_after_min !== server.secretary.escalate_after_min}
        >
          <NumberInput id="set-secretary-repeat" label="Повторить пуш через, минут" value={secretary.escalate_after_min} min={1} max={60} unit="мин" onChange={(escalate_after_min) => setSecretary({ escalate_after_min })} />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup id="mascot" title="Маскот" about="Лица на телефонах и на стене. Новый год — колпак с 20 декабря по 7 января, Наурыз — тюльпан 20–23 марта.">
        <SettingRow
          id="mascot-seasons"
          label="Праздничные наряды"
          hint="Лица директора, сотрудников, секретаря и экрана в кабинете"
          htmlFor="set-mascot-seasons"
          changed={draft.mascot_seasons !== server.mascot_seasons}
        >
          <Switch id="set-mascot-seasons" label="Праздничные наряды" checked={draft.mascot_seasons} onChange={(mascot_seasons) => update({ mascot_seasons })} />
        </SettingRow>
        <SettingRow
          id="mascot-telegraph"
          label="Лицо сотрудника переживает за дела"
          hint="Зовёт, пока ждёт «Принял», волнуется у срока, ждёт ответа на слово директора. Выключите — лицо спокойно, сценки и сны остаются"
          htmlFor="set-mascot-telegraph"
          changed={draft.mascot_telegraph !== server.mascot_telegraph}
        >
          <Switch id="set-mascot-telegraph" label="Лицо сотрудника переживает за дела" checked={draft.mascot_telegraph} onChange={(mascot_telegraph) => update({ mascot_telegraph })} />
        </SettingRow>
      </SettingsGroup>
    </div>
  );
}
