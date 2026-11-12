"use client";

import { ChevronDown, ChevronUp, Plus, X } from "lucide-react";
import type { KeyboardEvent } from "react";

import { GroupLink, NumberInput, SettingRow, SettingsGroup, Switch, TextInput } from "@/components/desk/settings/form";
import { TileFace } from "@/components/desk/team/TeamGrid";
import { Kbd } from "@/components/desk/ui/Kbd";
import { Select } from "@/components/desk/ui/Toolbar";
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
  requestAnimationFrame(() => {
    const cell = document.querySelector<HTMLElement>(`[data-action-row="${row}"] [data-col="${column}"]`);
    // the scene's cell is the desk's select: its button takes the caret
    (cell?.matches("input, button") ? cell : cell?.querySelector<HTMLElement>("button"))?.focus();
  });
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
  const columnOf = (event: KeyboardEvent<HTMLElement>) => (event.target as HTMLElement).closest<HTMLElement>("[data-col]")?.dataset.col ?? "label";
  // Alt+↑/↓ is the row's before any field's: the scene's select would open its list on a bare arrow
  const onRowMove = (index: number) => (event: KeyboardEvent<HTMLElement>) => {
    if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
    event.preventDefault();
    event.stopPropagation();
    move(index, index + (event.key === "ArrowUp" ? -1 : 1), columnOf(event));
  };
  const onRowKey = (index: number) => (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Enter" && columnOf(event) === "label" && index === actions.length - 1) {
      event.preventDefault();
      add();
    }
  };

  return (
    <div className="set-actions desk-cells flex flex-col gap-3" data-testid="secretary-actions">
      <div className="set-actions-table">
        <div className="set-actions-head desk-label grid grid-cols-[48px_minmax(0,1fr)_280px_88px] items-center gap-4 border-b border-text pb-1 uppercase">
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
              onKeyDownCapture={onRowMove(index)}
              onKeyDown={onRowKey(index)}
              className="set-actions-row group grid grid-cols-[48px_minmax(0,1fr)_280px_88px] items-center gap-4 border-b border-border/60 py-0.5 last:border-b-0"
            >
              <input
                data-col="icon"
                aria-label="Значок"
                maxLength={4}
                placeholder="☕"
                value={row.icon}
                onChange={(event) => set(index, { icon: event.target.value })}
                className="set-actions-icon field h-8 w-full px-0 text-center text-[16px] leading-5 outline-none"
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
              <span data-col="scene" className="min-w-0">
                <Select
                  aria-label="Что делает секретарь"
                  value={row.scene ?? ""}
                  onChange={(event) => set(index, { scene: event.target.value ? (event.target.value as DeskScene) : undefined })}
                  className="w-full text-[13px]"
                >
                  <option value="">По надписи — {SCENE_NAME[auto].toLowerCase()}</option>
                  {DESK_SCENES.map((scene) => (
                    <option key={scene} value={scene}>
                      {SCENE_NAME[scene]}
                    </option>
                  ))}
                </Select>
              </span>
              <span className="flex items-center justify-end gap-0.5 text-muted">
                <button
                  type="button"
                  aria-label="Выше"
                  title="Выше · Alt ↑"
                  disabled={index === 0}
                  onClick={() => move(index, index - 1, "label")}
                  className="set-icon-button flex h-7 w-7 items-center justify-center opacity-0 transition-opacity duration-[120ms] hover:bg-surface-2 hover:text-text focus-visible:opacity-100 disabled:!opacity-0 group-hover:opacity-100"
                >
                  <ChevronUp size={15} strokeWidth={2.25} aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label="Ниже"
                  title="Ниже · Alt ↓"
                  disabled={index === actions.length - 1}
                  onClick={() => move(index, index + 1, "label")}
                  className="set-icon-button flex h-7 w-7 items-center justify-center opacity-0 transition-opacity duration-[120ms] hover:bg-surface-2 hover:text-text focus-visible:opacity-100 disabled:!opacity-0 group-hover:opacity-100"
                >
                  <ChevronDown size={15} strokeWidth={2.25} aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label={`Убрать кнопку ${row.label || "без надписи"}`}
                  title="Убрать"
                  onClick={() => onChange(actions.filter((_, i) => i !== index))}
                  className="set-icon-button flex h-7 w-7 items-center justify-center hover:bg-surface-2 hover:text-danger"
                >
                  <X size={15} strokeWidth={2.25} aria-hidden />
                </button>
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="secondary" disabled={actions.length >= ACTIONS_MAX} onClick={add} icon={<Plus size={15} strokeWidth={2.25} />}>
          Кнопка
        </Button>
        <span className="flex items-center gap-1 text-[12px] leading-4 text-muted">
          <Kbd>Alt ↑</Kbd>
          <Kbd>Alt ↓</Kbd> переставить · {actions.length} из {ACTIONS_MAX}
        </span>
      </div>
      {/* the buttons as the director will see them, in this order — empty rows are not buttons yet */}
      {actions.some((row) => row.label.trim()) ? (
        <div className="set-actions-preview flex flex-wrap items-center gap-2" aria-label="Так увидит директор">
          <span className="text-[12px] leading-4 text-muted">Так увидит директор:</span>
          {actions
            .filter((row) => row.label.trim())
            .map((row, index) => (
              <span key={index} className="set-errand-chip">
                {row.icon ? <span aria-hidden>{row.icon}</span> : null}
                {row.label.trim()}
              </span>
            ))}
        </div>
      ) : null}
    </div>
  );
}

/** «Программа» on the desk: the secretary's buttons, her repeat push and the security phone; the faces' two switches. */
export function AppPanel() {
  const { draft, server, update } = useDraft();
  const people = usePeople();
  const secretaries = (people.data ?? []).filter((p) => p.role === "secretary" && p.is_active);
  const secretary = draft.secretary;
  const setSecretary = (patch: Partial<CompanySettings["secretary"]>) => update({ secretary: { ...secretary, ...patch } });

  return (
    <div className="flex flex-col gap-6">
      <SettingsGroup
        id="secretary"
        title="Секретарь"
        about="Кнопки, которыми директор зовёт секретаря. Заявка — не задача: без срока, без приёмки, живёт минуты."
        action={<GroupLink href="/desk/team">Роли — в «Команде»</GroupLink>}
      >
        <SettingRow
          id="secretary-who"
          label="Кто секретарь"
          hint={secretaries.length ? "Роль меняется в карточке человека" : "Назначьте роль «Секретарь» в карточке человека — тогда на Пульсе появится секретарь за столом"}
        >
          {people.data && secretaries.length ? (
            <span className="flex flex-wrap items-center justify-end gap-3">
              {secretaries.map((person) => (
                <span key={person.id} className="flex items-center gap-2 text-[14px] leading-5">
                  <TileFace person={person} size={26} />
                  {person.full_name.split(" ")[0]}
                </span>
              ))}
            </span>
          ) : (
            <span className="text-[14px] leading-5 text-muted">{people.data ? "никто" : "…"}</span>
          )}
        </SettingRow>
        <SettingRow id="secretary-buttons" label="Кнопки" hint="Порядок — как на экране директора" stack changed={!same(secretary.actions, server.secretary.actions)}>
          <ActionsTable actions={secretary.actions} onChange={(actions) => setSecretary({ actions })} />
        </SettingRow>
        <SettingRow
          id="secretary-phone"
          label="Телефон охраны"
          hint="Для кнопки «Позвонить охране» на экране тревоги; пусто — кнопки нет"
          htmlFor="ctl-security-phone"
          changed={secretary.security_phone !== server.secretary.security_phone}
        >
          <TextInput id="ctl-security-phone" label="Телефон охраны" value={secretary.security_phone} maxLength={24} placeholder="+7 700 000 00 00" width={200} className="nums" onChange={(security_phone) => setSecretary({ security_phone })} />
        </SettingRow>
        <SettingRow
          id="secretary-repeat"
          label="Повторить пуш"
          hint="Если заявку никто не взял — секретарю приходит ещё один пуш"
          htmlFor="ctl-secretary-repeat"
          changed={secretary.escalate_after_min !== server.secretary.escalate_after_min}
        >
          <NumberInput id="ctl-secretary-repeat" label="Повторить пуш через, минут" value={secretary.escalate_after_min} min={1} max={60} unit="мин" onChange={(escalate_after_min) => setSecretary({ escalate_after_min })} />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup id="mascot" title="Маскот" about="Лица на телефонах и на стене. Новый год — колпак с 20 декабря по 7 января, Наурыз — тюльпан 20–23 марта.">
        <SettingRow
          id="mascot-seasons"
          label="Праздничные наряды"
          hint="Лица директора, сотрудников, секретаря и экрана в кабинете"
          htmlFor="ctl-mascot-seasons"
          changed={draft.mascot_seasons !== server.mascot_seasons}
        >
          <Switch id="ctl-mascot-seasons" label="Праздничные наряды" checked={draft.mascot_seasons} onChange={(mascot_seasons) => update({ mascot_seasons })} />
        </SettingRow>
        <SettingRow
          id="mascot-telegraph"
          label="Лицо сотрудника переживает за дела"
          hint="Зовёт, пока ждёт «Принял», волнуется у срока, ждёт ответа на слово директора. Выключите — лицо спокойно, сценки и сны остаются"
          htmlFor="ctl-mascot-telegraph"
          changed={draft.mascot_telegraph !== server.mascot_telegraph}
        >
          <Switch id="ctl-mascot-telegraph" label="Лицо сотрудника переживает за дела" checked={draft.mascot_telegraph} onChange={(mascot_telegraph) => update({ mascot_telegraph })} />
        </SettingRow>
      </SettingsGroup>
    </div>
  );
}
