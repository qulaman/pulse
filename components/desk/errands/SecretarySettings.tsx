"use client";

import { ChevronDown, ChevronUp, Plus, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";

import { useDeskParams } from "@/components/desk/DeskAddress";
import { GroupLink, landOn, NumberInput, SaveBar, SettingRow, SettingsGroup, TextInput } from "@/components/desk/settings/form";
import { patchOf, resetOf } from "@/components/desk/settings/sections";
import { useLeaveGuard } from "@/components/desk/team/useLeaveGuard";
import { Dialog } from "@/components/desk/ui/Dialog";
import { Kbd } from "@/components/desk/ui/Kbd";
import { Select } from "@/components/desk/ui/Toolbar";
import { useOptionalDraft } from "@/components/settings/draft";
import { Button } from "@/components/ui/Button";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import { toast } from "@/components/ui/Toast";
import { useSecretaries } from "@/lib/errands/queries";
import { DESK_SCENES, isAway, SCENE_NAME, sceneOfAction, untilLine, type DeskScene } from "@/lib/errands/scene";
import { shortName } from "@/lib/people/names";
import type { CompanySettings, SecretaryAction } from "@/lib/settings";
import { fetchSettings, settingsKey } from "@/lib/settings-query";
import { useNow } from "@/lib/useNow";

import { writeParams } from "../tasks/flow";
import { PersonFace, SceneTile } from "./look";
import { isSettingsView, useSecretaryDirty, type SecretaryView } from "./SecretaryTabs";
import { isAlarmAction, isDndAction } from "./useAsk";

/*
 * The two settings tabs of «Секретарь» on the desk (D-197): «Кнопки» — the requests the director
 * asks with, as a table beside the keypad they make; «Настройки» — who the secretary is, the repeat
 * push and the guard's phone. Both edit one section of the company settings (`secretary`), so one
 * «Сохранить» sends both tabs' edits; the draft lives above the tabs (ErrandsDesk), and a trip to
 * «Заявки» and back loses nothing. Drawn by app/desk/settings.css (the form) and
 * app/desk/errands-settings.css (the layout and the keypad's picture).
 */

type Action = CompanySettings["secretary"]["actions"][number];

const ACTIONS_MAX = 12;
/** The digit keys of the director's keypad: the first seven keys (Quick.tsx). */
const DIGITS = 7;

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
      <div>
        <div className="set-actions-head desk-label grid grid-cols-[48px_minmax(0,1fr)_290px_88px] items-center gap-4 border-b border-text pb-1 uppercase">
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
              className="set-actions-row group grid grid-cols-[48px_minmax(0,1fr)_290px_88px] items-center gap-4 border-b border-border/60 py-0.5 last:border-b-0"
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
    </div>
  );
}

/**
 * The buttons as the director's keypad will stand (Quick.tsx): the same keys in the same order,
 * the digit of each, «Охрана» last and wide — a picture, nothing presses. A row without words is
 * not a button yet. The tile is the scene's line icon, as «Сегодня» and «Заявки» draw it (D-194).
 */
function KeypadPicture({ actions }: { actions: readonly Action[] }) {
  const named: SecretaryAction[] = actions.filter((row) => row.label.trim()).map((row) => ({ ...row, label: row.label.trim() }));
  const regular = named.filter((action) => !isAlarmAction(action));
  const alarm = named.find(isAlarmAction) ?? null;
  return (
    // `pult-frame` lends the keys the inks of «Пульт» (errands-pult.css)
    <aside className="pult-frame sec-picture" aria-label="Так увидит директор" data-testid="secretary-actions-preview">
      <div className="sec-picture-head">
        <p className="sec-picture-title">Так увидит директор</p>
        <p className="sec-picture-hint">на «Сегодня» и во вкладке «Заявки» · цифры — клавиши</p>
      </div>
      {named.length === 0 ? (
        <p className="pult-keypad-note">Кнопок нет — директору останется «Своими словами»</p>
      ) : (
        <div className="sec-picture-pad" aria-hidden>
          <div className="pult-keys">
            {regular.map((action, index) => (
              <div key={`${index}-${action.label}`} className="pult-key">
                <span className="pult-key-top">
                  <SceneTile scene={sceneOfAction(action)} size={32} />
                  {index < DIGITS ? <span className="pult-cap nums">{index + 1}</span> : null}
                </span>
                <span className="pult-key-word">
                  <span className="truncate">{action.label}</span>
                  {isDndAction(action) ? <ChevronDown size={14} strokeWidth={2.5} className="shrink-0" /> : null}
                </span>
                <span className="pult-key-note">{isDndAction(action) ? "на сколько?" : " "}</span>
              </div>
            ))}
            {alarm ? (
              <div className="pult-key pult-key-alarm" data-wide={regular.length % 2 === 0 ? "" : undefined}>
                <span className="pult-key-top">
                  <SceneTile scene="security" size={32} />
                  <span className="pult-key-hint">держать 2 с</span>
                </span>
                <span className="pult-key-word">{alarm.label}</span>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </aside>
  );
}

/** «Кнопки»: the table on the left, the keypad it makes on the right. */
function ButtonsTab() {
  const draft = useOptionalDraft();
  if (!draft) return null;
  const { draft: mine, server, update } = draft;
  const secretary = mine.secretary;
  const changed = JSON.stringify(secretary.actions) !== JSON.stringify(server.secretary.actions);
  return (
    <div className="sec-buttons">
      <SettingsGroup
        id="secretary-keys"
        title="Кнопки просьб"
        about="Чем директор зовёт секретаря: кофе, «зайди ко мне», охрана. Заявка — не задача: без срока, без приёмки, живёт минуты."
      >
        <SettingRow id="secretary-buttons" label="Кнопки" hint="Порядок — как на экране директора; первые семь нажимаются цифрами" stack changed={changed}>
          <ActionsTable actions={secretary.actions} onChange={(actions) => update({ secretary: { ...secretary, actions } })} />
        </SettingRow>
      </SettingsGroup>
      <KeypadPicture actions={secretary.actions} />
    </div>
  );
}

/** Who the secretary is: a face, a name and where they are now — the roster's, read live. */
function Who() {
  const secretaries = useSecretaries();
  const now = useNow(60_000);
  const people = secretaries.data ?? [];
  if (!secretaries.data && secretaries.isError) {
    return (
      <span className="text-[14px] leading-5 text-muted">
        Не загрузилось ·{" "}
        <button type="button" className="text-text underline-offset-2 hover:underline" onClick={() => void secretaries.refetch()}>
          Повторить
        </button>
      </span>
    );
  }
  if (!secretaries.data) return <span className="text-[14px] leading-5 text-muted">…</span>;
  if (people.length === 0) return <span className="text-[14px] leading-5 text-muted">никто</span>;
  return (
    <ul className="sec-who" data-testid="secretary-who">
      {people.map((person) => {
        const away = isAway(person, now);
        return (
          <li key={person.id} className="sec-who-person">
            <PersonFace id={person.id} name={person.full_name} size={28} away={away} />
            <span className="min-w-0">
              <span className="block truncate text-[14px] font-medium leading-5">{shortName(person.full_name)}</span>
              <span className="sec-who-state nums" data-away={away ? "" : undefined}>
                {away && person.away_until ? `нет ${untilLine(person.away_until)}` : "на месте"}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** «Настройки»: who the secretary is, then what happens to a request nobody took and to the alarm. */
function OptionsTab() {
  const draft = useOptionalDraft();
  const secretaries = useSecretaries();
  if (!draft) return null;
  const { draft: mine, server, update } = draft;
  const secretary = mine.secretary;
  const setSecretary = (patch: Partial<CompanySettings["secretary"]>) => update({ secretary: { ...secretary, ...patch } });
  const nobody = secretaries.data !== undefined && secretaries.data.length === 0;
  return (
    <div className="sec-options">
      <SettingsGroup
        id="secretary-people"
        title="Секретарь"
        about="Кто принимает просьбы директора. «На месте» или «Отойти» секретарь отмечает сам, на своей стойке."
        action={<GroupLink href="/desk/team">Роли — в «Команде»</GroupLink>}
      >
        <SettingRow
          id="secretary-who"
          label="Кто секретарь"
          hint={nobody ? "Назначьте роль «Секретарь» в карточке человека — тогда на Пульсе появится секретарь за столом" : "Роль меняется в карточке человека"}
        >
          <Who />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup id="secretary-errands" title="Заявки" about="Что бывает с просьбой, которую никто не взял, и с тревогой.">
        <SettingRow
          id="secretary-repeat"
          label="Повторить пуш"
          hint="Если заявку никто не взял — секретарю приходит ещё один пуш"
          htmlFor="ctl-secretary-repeat"
          changed={secretary.escalate_after_min !== server.secretary.escalate_after_min}
        >
          <NumberInput id="ctl-secretary-repeat" label="Повторить пуш через, минут" value={secretary.escalate_after_min} min={1} max={60} unit="мин" onChange={(escalate_after_min) => setSecretary({ escalate_after_min })} />
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
      </SettingsGroup>
    </div>
  );
}

/** A settings tab while the company settings load: its cards' shapes, nothing that will jump. */
function SettingsBone({ view }: { view: "buttons" | "settings" }) {
  return (
    <SkeletonGroup className={view === "buttons" ? "sec-buttons" : "sec-options"} aria-hidden>
      <Bone h={view === "buttons" ? 360 : 132} className="!rounded-[14px]" />
      <Bone h={view === "buttons" ? 240 : 156} className="!rounded-[14px]" />
    </SkeletonGroup>
  );
}

/** What of the secretary's section is unsaved, in the bar's words, and how it is saved or put back. */
function useSecretarySave() {
  const draft = useOptionalDraft();
  const dirty = useSecretaryDirty();
  const changes = draft
    ? [
        ...(dirty.buttons ? ["Кнопки"] : []),
        ...(draft.draft.secretary.escalate_after_min !== draft.server.secretary.escalate_after_min ? ["Повтор пуша"] : []),
        ...(draft.draft.secretary.security_phone !== draft.server.secretary.security_phone ? ["Телефон охраны"] : []),
      ]
    : [];
  const save = (onSaved?: () => void) => {
    if (!draft) return;
    if (changes.length === 0) {
      toast("Здесь всё сохранено");
      return;
    }
    draft.save(patchOf("secretary", draft.draft, draft.conventions), onSaved);
  };
  const reset = () => {
    if (draft) draft.update(resetOf("secretary", draft.server));
  };
  return { changes, busy: draft?.saving("secretary") ?? false, save, reset };
}

/**
 * Keeps the secretary's unsaved settings for the whole section (ErrandsDesk, inside the draft):
 * Ctrl/Cmd+S saves them from any tab — the browser's «save page» never while there is something to
 * save or a settings tab is open — and a way out of «Секретарь» with edits asks «Сохранить правки?»
 * (the desk's leave guard: the side nav, «G + буква», Back; the tabs are the same page and ask nothing).
 */
export function SecretaryDraftKeeper({ view }: { view: SecretaryView }) {
  const { changes, busy, save, reset } = useSecretarySave();
  const dirty = changes.length > 0;
  const passed = useRef(false);
  const [leaving, setLeaving] = useState<{ go: () => void } | null>(null);
  useLeaveGuard(dirty, passed, (go) => setLeaving({ go }), (url) => url.pathname === window.location.pathname);

  const latest = useRef({ save, active: dirty || isSettingsView(view) });
  useLayoutEffect(() => {
    latest.current = { save, active: dirty || isSettingsView(view) };
  });
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.code !== "KeyS" || !latest.current.active) return;
      if (document.body.hasAttribute("data-dialog-open") || document.body.hasAttribute("data-sheet-open")) return;
      event.preventDefault();
      // a number typed and not yet left settles on blur: let it, then save
      (document.activeElement as HTMLElement | null)?.blur?.();
      setTimeout(() => latest.current.save(), 0);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go = (then: (() => void) | undefined) => {
    passed.current = true;
    then?.();
  };
  return (
    <Dialog open={leaving !== null} onClose={() => setLeaving(null)} title="Сохранить правки?" width="sm">
      <div className="flex flex-col gap-4" data-testid="secretary-leave">
        <p className="text-[14px] leading-5 text-muted">Не сохранено: {changes.join(", ").toLowerCase()}.</p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => setLeaving(null)} data-testid="leave-stay">
            Остаться
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              const then = leaving?.go;
              setLeaving(null);
              reset();
              go(then);
            }}
            data-testid="leave-discard"
          >
            Не сохранять
          </Button>
          <Button
            size="sm"
            loading={busy}
            data-autofocus
            onClick={() => {
              const then = leaving?.go;
              setLeaving(null);
              save(() => go(then));
            }}
            data-testid="leave-save"
          >
            Сохранить
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

/**
 * «Кнопки» or «Настройки» of «Секретарь», with the one bar «Не сохранено · Отменить · Сохранить
 * (Ctrl S)» of the secretary's section (Ctrl+S itself is the keeper's, above the tabs). A failed
 * read of the settings says so with «Повторить», never bones for good. `?focus=<row>` — a settings
 * search result — lands on the row.
 */
export function SecretarySettings({ view }: { view: "buttons" | "settings" }) {
  const draft = useOptionalDraft();
  // the same cache entry the draft is made of: here for its failure and its retry
  const settings = useQuery({ queryKey: settingsKey, queryFn: fetchSettings });
  const { changes, busy, save, reset } = useSecretarySave();
  const params = useDeskParams();
  const focus = params.get("focus");
  const ready = draft !== null;
  const failed = !ready && settings.isError;

  // a search result: land on its row once the tab is drawn, then drop it from the address
  useEffect(() => {
    if (!focus || !ready) return;
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (landOn(focus) || tries > 40) {
        clearInterval(timer);
        writeParams({ focus: null });
      }
    }, 50);
    return () => clearInterval(timer);
  }, [focus, ready]);

  return (
    <section className="set-panel sec-settings" data-testid={`secretary-tab-${view}`} aria-label={view === "buttons" ? "Кнопки" : "Настройки"}>
      {failed ? (
        <p className="pult-keypad-note max-w-[880px]" role="alert" data-testid="secretary-settings-failed">
          Настройки не загрузились.{" "}
          <button type="button" className="text-text underline-offset-2 hover:underline" disabled={settings.isFetching} onClick={() => void settings.refetch()}>
            {settings.isFetching ? "Загружаю…" : "Повторить"}
          </button>
        </p>
      ) : !ready ? (
        <SettingsBone view={view} />
      ) : view === "buttons" ? (
        <ButtonsTab />
      ) : (
        <OptionsTab />
      )}
      <SaveBar changes={changes} saving={busy} onSave={() => save()} onReset={reset} />
    </section>
  );
}
