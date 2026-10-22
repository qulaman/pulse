"use client";

import { useMemo, useState } from "react";

import { PeoplePicker } from "@/components/people/PeoplePicker";
import { RepeatSheet } from "@/components/recurrence/RepeatSheet";
import { Icon } from "@/components/tasks/desk/icons";
import { Button } from "@/components/ui/Button";
import { Sheet, SHEET_CLOSE_MS } from "@/components/ui/Sheet";
import { shortName } from "@/lib/people/names";
import { hmOf, ruleOf, useDeleteRule, useRecurrenceRules, useUpdateRule, type Rule } from "@/lib/recurrence/queries";
import { dayOfYmd, describeDay, describeRule } from "@/lib/recurrence/schedule";

/** «каждый понедельник · к 18:00» for an order, «каждую среду · 10:00 · в офисе» for a meeting. */
export function ruleLine(rule: Rule): string {
  const when = describeRule(ruleOf(rule));
  if (rule.target === "event") return [when, hmOf(rule.at_time), rule.location].filter(Boolean).join(" · ");
  return `${when} · к ${hmOf(rule.at_time)}`;
}

/** What the rule is doing now: when the next one comes, or why nothing comes. */
export function ruleState(rule: Rule): { text: string; quiet: boolean } {
  if (!rule.is_active) {
    return rule.stopped_reason === "assignee_inactive"
      ? { text: "остановлен: сотрудник больше не работает", quiet: false }
      : { text: "на паузе", quiet: true };
  }
  const next = dayOfYmd(rule.next_on);
  if (next === null) return { text: "больше дат нет", quiet: true };
  return { text: `${rule.target === "event" ? "следующая встреча" : "следующая"} — ${describeDay(next)}`, quiet: true };
}

type Step = { name: "list" } | { name: "schedule"; id: string } | { name: "who"; id: string } | null;

/**
 * «Повторы» on the director's «Задачи» (D-148): one line while there are rules — how many and
 * when the next one comes — and a sheet with every rule: its days and hour, who, the next day,
 * and the four moves (расписание, кому, пауза, удалить). Nothing here is on the main flow:
 * a rule is born by voice, this is the second layer by an explicit tap (principle 1).
 */
export function RecurrenceSection({ personId, rules: given }: { personId: string | null; rules?: readonly Rule[] }) {
  const query = useRecurrenceRules(given === undefined);
  const rules = { data: given ?? query.data };
  const update = useUpdateRule();
  const remove = useDeleteRule();
  const [step, setStep] = useState<Step>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [askDelete, setAskDelete] = useState<string | null>(null);

  // a person on the strip narrows to their orders; meetings belong to nobody's pile
  const scoped = useMemo(() => {
    const all = rules.data ?? [];
    const mine = personId ? all.filter((rule) => rule.target === "task" && rule.assignee_id === personId) : all;
    return [...mine].sort((a, b) => Number(b.is_active) - Number(a.is_active) || (a.next_on ?? "9").localeCompare(b.next_on ?? "9"));
  }, [rules.data, personId]);

  const nearest = scoped.find((rule) => rule.is_active && rule.next_on);
  const byId = (id: string) => (rules.data ?? []).find((rule) => rule.id === id) ?? null;
  const current = step && step.name !== "list" ? byId(step.id) : null;

  // one sheet at a time: the list leaves, the editor comes, and the list returns after it
  const go = (next: Step) => {
    setStep(null);
    setTimeout(() => setStep(next), SHEET_CLOSE_MS);
  };

  if (scoped.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setStep({ name: "list" })}
        data-testid="recurrence-entry"
        className="mt-2 flex min-h-[48px] w-full items-center gap-3 rounded-[14px] border border-border/70 px-3 text-left transition-colors duration-[120ms] active:bg-surface-2"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-accent/14 text-accent">
          <Icon name="repeat" size={17} />
        </span>
        <span className="font-display text-[15px] font-semibold">
          Повторы <span className="nums text-muted">· {scoped.length}</span>
        </span>
        <span className="ml-auto truncate text-[13px] text-muted">
          {nearest ? `следующий — ${describeDay(dayOfYmd(nearest.next_on) as number)}` : "все на паузе"}
        </span>
        <span className="text-muted">
          <Icon name="right" size={14} />
        </span>
      </button>

      <Sheet open={step?.name === "list"} onClose={() => setStep(null)} title="Повторы">
        <p className="-mt-1 text-[14px] leading-[19px] text-muted">
          Задача по правилу приходит утром своего дня, как обычная. Новый повтор — голосом или строкой: «каждый понедельник — отчёт по продажам».
        </p>
        <ul className="mt-3 flex flex-col gap-2">
          {scoped.map((rule) => {
            const open = openId === rule.id;
            const state = ruleState(rule);
            const who =
              rule.target === "event"
                ? rule.everyone
                  ? "Встреча · все"
                  : `Встреча · ${rule.participant_ids.length + 1} чел.`
                : shortName(rule.assignee?.full_name) || "—";
            return (
              <li key={rule.id} className="rounded-[16px] border border-border/70" data-testid="recurrence-rule">
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => {
                    setAskDelete(null);
                    setOpenId(open ? null : rule.id);
                  }}
                  className="flex w-full flex-col gap-0.5 px-3 py-2.5 text-left"
                  style={{ opacity: rule.is_active ? 1 : 0.7 }}
                >
                  <span className="text-[16px] font-semibold leading-[21px]">{rule.title}</span>
                  <span className="text-[14px] leading-[19px]">
                    {who} · {ruleLine(rule)}
                  </span>
                  <span className={`text-[13px] leading-4 ${state.quiet ? "text-muted" : "text-warn"}`}>{state.text}</span>
                </button>

                {open ? (
                  askDelete === rule.id ? (
                    <div className="border-t border-border/60 px-3 py-2.5">
                      <p className="text-[14px] leading-[19px]">
                        Удалить повтор? {rule.target === "event" ? "Встречи, что уже в календаре, останутся." : "Задачи, что он уже выдал, останутся."}
                      </p>
                      <div className="mt-2 flex gap-2">
                        <Button variant="danger" size="sm" block loading={remove.isPending} onClick={() => remove.mutate({ id: rule.id }, { onSuccess: () => setOpenId(null) })}>
                          Удалить
                        </Button>
                        <Button variant="secondary" size="sm" block onClick={() => setAskDelete(null)}>
                          Нет
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 border-t border-border/60 px-3 py-2.5">
                      {rule.target === "task" ? (
                        <>
                          <Button variant="secondary" size="sm" onClick={() => go({ name: "schedule", id: rule.id })}>
                            Расписание
                          </Button>
                          <Button variant="secondary" size="sm" onClick={() => go({ name: "who", id: rule.id })}>
                            Кому
                          </Button>
                        </>
                      ) : null}
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          update.mutate({
                            id: rule.id,
                            patch: { is_active: !rule.is_active },
                            toast: rule.is_active ? "Повтор на паузе" : "Повтор снова работает",
                          })
                        }
                      >
                        {rule.is_active ? "Пауза" : "Возобновить"}
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => setAskDelete(rule.id)}>
                        Удалить
                      </Button>
                    </div>
                  )
                ) : null}
              </li>
            );
          })}
        </ul>
      </Sheet>

      {current ? (
        <RepeatSheet
          open={step?.name === "schedule"}
          onClose={() => go({ name: "list" })}
          title={current.title}
          value={{ ...ruleOf(current), due_time: hmOf(current.at_time) }}
          onDone={(value) =>
            update.mutate({
              id: current.id,
              patch: {
                every: value.every,
                interval_n: value.interval,
                weekdays: value.weekdays,
                month_day: value.month_day,
                at_time: value.due_time,
              },
              toast: `Теперь ${describeRule(value)}`,
            })
          }
        />
      ) : null}

      {current ? (
        <PeoplePicker
          open={step?.name === "who"}
          onClose={() => go({ name: "list" })}
          title="Кому повторять?"
          subject={current.title}
          currentId={current.assignee_id}
          onPick={(person) =>
            update.mutate({ id: current.id, patch: { assignee_id: person.id }, toast: `Теперь — ${shortName(person.full_name)}` })
          }
        />
      ) : null}
    </>
  );
}
