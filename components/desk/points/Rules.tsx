"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { MiniMark } from "@/components/brand/MiniMark";
import { useDeskParams } from "@/components/desk/DeskAddress";
import { landOn, NumberInput, SaveBar, Segmented, SettingRow, SettingsGroup } from "@/components/desk/settings/form";
import { patchOf, resetOf } from "@/components/desk/settings/sections";
import { useLeaveGuard } from "@/components/desk/team/useLeaveGuard";
import { Dialog } from "@/components/desk/ui/Dialog";
import { Switch } from "@/components/desk/ui/Switch";
import { useDraft, useOptionalDraft } from "@/components/settings/draft";
import { Button } from "@/components/ui/Button";
import { Bone } from "@/components/ui/Skeleton";
import { toast } from "@/components/ui/Toast";
import { REACTION_CODES, REACTION_LABEL } from "@/lib/points/reactions";
import type { CompanySettings } from "@/lib/settings";
import { fetchSettings, settingsKey } from "@/lib/settings-query";

/*
 * The settings of the points game where the game is (D-215): the rules of the rating — on or off,
 * who sees it, what a task, the daily report and a reaction pay, the praise in Эфир — are the
 * «Правила» tab of «Рейтинг»; what the shop says in Эфир is the «Настройки» of «Магазин». Both edit
 * the `points` section of the company settings with the desk's settings draft, its bar «Не
 * сохранено · Отменить · Сохранить (Ctrl S)» and its «Сохранить правки?» on the way out. The
 * secretary, who has neither section, keeps the same rows in «Настройки» (D-104).
 */

type Rules = CompanySettings["points_rules"];

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** A reaction's price: its name, the points it pays. */
function ReactionPrice({ code, value, onChange }: { code: (typeof REACTION_CODES)[number]; value: number; onChange: (value: number) => void }) {
  return (
    <label className="set-price flex items-center gap-2.5 border-b border-border/60 py-0.5">
      <span className="min-w-0 flex-1 text-[14px] leading-5">{REACTION_LABEL[code]}</span>
      <NumberInput label={`Очков за ${REACTION_LABEL[code]}`} value={value} max={100000} unit="очк." width={110} onChange={onChange} />
    </label>
  );
}

/**
 * The rules of the rating (D-133, D-152): on/off and who sees the whole list, what a task pays by
 * itself, the daily report's plus and minus, the price of the director's reactions, the praise in
 * Эфир. `action` — a link in the first card's head (the secretary's «Настройки» have none).
 */
export function RatingRules({ action = null }: { action?: ReactNode }) {
  const { draft, server, update } = useDraft();
  const rules = draft.points_rules;
  const saved = server.points_rules;
  const setRules = (patch: Partial<Rules>) => update({ points_rules: { ...rules, ...patch } });
  const off = !draft.points_enabled;

  return (
    <>
      <SettingsGroup id="points" title="Очки и рейтинг" about="Очки начисляются сами за задачи, отчёты и реакции; директор добавляет свои. Тратятся в магазине." action={action}>
        <SettingRow id="points-enabled" label="Очки включены" hint="Без них нет рейтинга, начислений и штрафов; магазин выдаёт заказанное" htmlFor="ctl-points-enabled" changed={draft.points_enabled !== server.points_enabled}>
          <Switch id="ctl-points-enabled" label="Очки включены" checked={draft.points_enabled} onChange={(points_enabled) => update({ points_enabled })} />
        </SettingRow>
        <SettingRow id="rating-mode" label="Кто видит рейтинг целиком" hint="Директор всегда видит полный список" muted={off} changed={draft.rating_mode !== server.rating_mode}>
          <Segmented
            label="Кто видит рейтинг целиком"
            value={draft.rating_mode}
            onChange={(rating_mode) => update({ rating_mode })}
            items={[
              { value: "top5", label: "Топ-5 всем" },
              { value: "full", label: "Весь список всем" },
            ]}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup id="points-task" title="Сами за задачу" about={off ? "Очки выключены — правила хранятся и заработают, когда их включат." : "Приходят без участия директора, по ходу задачи."}>
        <SettingRow id="points-quick" label="Принял быстро" hint={`Нажал «Принял» в первые ${rules.quick_accept_min} мин после пуша`} muted={off} changed={rules.quick_accept !== saved.quick_accept}>
          <NumberInput label="Очков за быстрое «Принял»" value={rules.quick_accept} unit="очк." onChange={(quick_accept) => setRules({ quick_accept })} />
        </SettingRow>
        <SettingRow id="points-quick-min" label="Быстро — это" hint="Сколько минут после пуша считаются быстрым ответом" muted={off} changed={rules.quick_accept_min !== saved.quick_accept_min}>
          <NumberInput label="Минут на «Принял»" value={rules.quick_accept_min} min={1} max={240} unit="мин" onChange={(quick_accept_min) => setRules({ quick_accept_min })} />
        </SettingRow>
        <SettingRow id="points-on-time" label="Сдал в срок" hint="Очки приходят, когда директор принял работу" muted={off} changed={rules.on_time !== saved.on_time}>
          <NumberInput label="Очков за сдачу в срок" value={rules.on_time} unit="очк." onChange={(on_time) => setRules({ on_time })} />
        </SettingRow>
        <SettingRow id="points-early" label="Сдал досрочно" hint="В первой половине срока — вместо «в срок»" muted={off} changed={rules.early !== saved.early}>
          <NumberInput label="Очков за досрочную сдачу" value={rules.early} unit="очк." onChange={(early) => setRules({ early })} />
        </SettingRow>
        <SettingRow
          id="points-late"
          label="Штраф за просрочку"
          hint="Не снимается с тех, кто в отпуске или на больничном. Сотрудник может оспорить"
          htmlFor="ctl-points-late"
          muted={off}
          changed={rules.late_on !== saved.late_on || rules.late !== saved.late}
        >
          <span className={rules.late_on ? "" : "pointer-events-none opacity-40"}>
            <NumberInput label="Очков штрафа за просрочку" value={rules.late} unit="очк." onChange={(late) => setRules({ late })} />
          </span>
          <Switch id="ctl-points-late" label="Штраф за просрочку" checked={rules.late_on} onChange={(late_on) => setRules({ late_on })} />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup id="points-report" title="За отчёт за день" about="Только в рабочие дни. Штрафуем только тех, кто уже сдал хотя бы один отчёт.">
        <SettingRow id="points-report-plus" label="+ за сданный" hint="Первая сдача за рабочий день" muted={off} changed={rules.daily_report !== saved.daily_report}>
          <NumberInput label="Очков за сданный отчёт" value={rules.daily_report} unit="очк." onChange={(daily_report) => setRules({ daily_report })} />
        </SettingRow>
        <SettingRow id="points-report-minus" label="− за несданный" hint="Утром за прошедший день; можно оспорить" muted={off} changed={rules.daily_report_missed !== saved.daily_report_missed}>
          <NumberInput label="Очков штрафа за несданный отчёт" value={rules.daily_report_missed} unit="очк." onChange={(daily_report_missed) => setRules({ daily_report_missed })} />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup id="points-reactions" title="Реакция директора на задачу" about="Реакция платит свою цену; 0 — реакция без очков. Сменил реакцию — очки пересчитались.">
        <SettingRow id="points-reactions-prices" label="Цена реакций" stack muted={off} changed={!same(rules.reactions, saved.reactions)}>
          <div className="desk-cells grid grid-cols-2 gap-x-8">
            {REACTION_CODES.map((code) => (
              <ReactionPrice key={code} code={code} value={rules.reactions[code]} onChange={(value) => setRules({ reactions: { ...rules.reactions, [code]: value } })} />
            ))}
          </div>
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup id="points-ether" title="В Эфир — всей команде" about="Хорошие новости, которые видит вся команда. Минусы в Эфир не попадают.">
        <SettingRow id="ether-praise" label="Похвала директора" hint="При «Начислить» можно снять галочку «Сказать в Эфире»" htmlFor="ctl-ether-praise" muted={off} changed={draft.ether_events.praise !== server.ether_events.praise}>
          <Switch id="ctl-ether-praise" label="Похвала директора в Эфир" checked={draft.ether_events.praise} onChange={(praise) => update({ ether_events: { ...draft.ether_events, praise } })} />
        </SettingRow>
      </SettingsGroup>
    </>
  );
}

/** The shop's own setting: whether a reward handed out is said to the whole team in Эфир. */
export function ShopRules() {
  const { draft, server, update } = useDraft();
  return (
    <SettingsGroup id="shop-settings" title="Настройки магазина" about="Цена, остаток и видимость награды меняются в её карточке — щелчком по награде.">
      <SettingRow id="ether-merch" label="Выдача наград — в Эфир" hint="«Айгуль — Брендовая куртка» после «Выдал»: видит вся команда" htmlFor="ctl-ether-merch" changed={draft.ether_events.merch !== server.ether_events.merch}>
        <Switch id="ctl-ether-merch" label="Выдача наград в Эфир" checked={draft.ether_events.merch} onChange={(merch) => update({ ether_events: { ...draft.ether_events, merch } })} />
      </SettingRow>
    </SettingsGroup>
  );
}

/** What of the `points` section is unsaved, and its «Сохранить» and «Отменить». */
function usePointsSave(name: string) {
  const draft = useOptionalDraft();
  const router = useRouter();
  const changes = draft?.dirty.points ? [name] : [];
  const save = (onSaved?: () => void) => {
    if (!draft) return;
    if (changes.length === 0) {
      toast("Здесь всё сохранено");
      return;
    }
    // the navigation lists «Рейтинг» and «Магазин» by the switch: the shell reads it again once saved
    const switched = draft.draft.points_enabled !== draft.server.points_enabled;
    draft.save(patchOf("points", draft.draft, draft.conventions), () => {
      if (switched) router.refresh();
      onSaved?.();
    });
  };
  const reset = () => {
    if (draft) draft.update(resetOf("points", draft.server));
  };
  return { changes, busy: draft?.saving("points_rules") ?? false, save, reset };
}

/**
 * Keeps the unsaved rules for the whole section (inside the draft, above its tabs): Ctrl/Cmd+S saves
 * them while there is something to save or the settings are on screen — the browser's «save page»
 * never then — and a way out of the section with edits asks «Сохранить правки?» (the desk's leave
 * guard: the side nav, «G + буква», Back; the tabs are the same page and ask nothing).
 */
export function PointsDraftKeeper({ name, open }: { name: string; open: boolean }) {
  const { changes, busy, save, reset } = usePointsSave(name);
  const dirty = changes.length > 0;
  const passed = useRef(false);
  const [leaving, setLeaving] = useState<{ go: () => void } | null>(null);
  useLeaveGuard(dirty, passed, (go) => setLeaving({ go }), (url) => url.pathname === window.location.pathname);

  const latest = useRef({ save, active: dirty || open });
  useLayoutEffect(() => {
    latest.current = { save, active: dirty || open };
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
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
      <div className="flex flex-col gap-4" data-testid="points-leave">
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

/** The shape of the cards while the settings load. */
function RulesBone({ cards }: { cards: number }) {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      {Array.from({ length: cards }, (_, card) => (
        <div key={card} className="set-card">
          <div className="set-card-head">
            <div className="flex flex-col gap-1.5">
              <Bone h={16} w={140} />
              <Bone h={12} w={320} />
            </div>
          </div>
          <div className="set-card-rows desk-list">
            {[0, 1].map((row) => (
              <div key={row} className="set-row flex items-center justify-between gap-6">
                <div className="flex flex-col gap-1.5">
                  <Bone h={14} w={180} />
                  <Bone h={12} w={280} />
                </div>
                <Bone h={20} w={36} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * The settings of a section of the game as a block of the settings' cards with the one bar «Не
 * сохранено · Отменить · Сохранить (Ctrl S)». A failed read of the settings says so with
 * «Повторить», never bones for good. `?focus=<row>` — a settings search result or a link from
 * «Настройки» — lands on the row.
 */
export function RulesBlock({ name, cards, testId, children }: { name: string; cards: number; testId: string; children: ReactNode }) {
  const draft = useOptionalDraft();
  // the same cache entry the draft is made of: here for its failure and its retry
  const settings = useQuery({ queryKey: settingsKey, queryFn: fetchSettings });
  const { changes, busy, save, reset } = usePointsSave(name);
  const params = useDeskParams();
  const focus = params.get("focus");
  const ready = draft !== null;

  // a search result: land on its row once the cards are drawn, then drop it from the address
  useEffect(() => {
    if (!focus || !ready) return;
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (landOn(focus) || tries > 40) {
        clearInterval(timer);
        const query = new URLSearchParams(window.location.search);
        query.delete("focus");
        const text = query.toString();
        window.history.replaceState(null, "", text ? `${window.location.pathname}?${text}` : window.location.pathname);
      }
    }, 50);
    return () => clearInterval(timer);
  }, [focus, ready]);

  return (
    <section className="set-panel pts-rules flex max-w-[880px] flex-col gap-6" data-testid={testId} aria-label={name}>
      {!ready && settings.isError ? (
        <p className="text-[14px] leading-5 text-muted" role="alert">
          Настройки не загрузились.{" "}
          <button type="button" className="text-text underline-offset-2 hover:underline" disabled={settings.isFetching} onClick={() => void settings.refetch()}>
            {settings.isFetching ? (
              <>
                <MiniMark state="busy" tone="var(--accent)" className="mr-1.5" />
                Загружаю…
              </>
            ) : (
              "Повторить"
            )}
          </button>
        </p>
      ) : !ready ? (
        <RulesBone cards={cards} />
      ) : (
        children
      )}
      <SaveBar changes={changes} saving={busy} onSave={() => save()} onReset={reset} />
    </section>
  );
}
