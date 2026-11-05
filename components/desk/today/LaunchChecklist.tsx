"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";

import { TONE_VAR } from "@/components/desk/ui/tone";
import { Button } from "@/components/ui/Button";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import { focusCommandLine } from "@/lib/desk/keys";
import { isNewCompany, launchHiddenKey, launchSteps, nextStep, tasksShowHistory, type LaunchStep } from "@/lib/desk/launch";
import { scanLogins, useCompanyHistory } from "@/lib/desk/launch-queries";
import { useCompanyCard } from "@/lib/desk/settings-queries";
import { isTeamMember, type Person } from "@/lib/people/queries";
import type { Health } from "@/lib/push/health";
import { pluralRu } from "@/lib/tasks/status-text";

function readHidden(companyId: string): boolean {
  try {
    return window.localStorage.getItem(launchHiddenKey(companyId)) === "1";
  } catch {
    return false;
  }
}

function writeHidden(companyId: string) {
  try {
    window.localStorage.setItem(launchHiddenKey(companyId), "1");
  } catch {
    // a per-browser convenience: with storage blocked the list simply comes back next time
  }
}

export type LaunchGate = {
  /** `checking` — a company with no task at hand, its history on the way: the moment's place is kept. */
  state: "off" | "checking" | "on";
  hide: () => void;
};

/**
 * Whether this company sees the launch instead of the moment. A task sent answers at once and
 * costs no request, so a working company never asks; only a director with nothing sent reads the
 * company's history, and anything unknown leaves the screen as it always was.
 */
export function useLaunchGate(companyId: string, tasks: readonly { status: string }[]): LaunchGate {
  const [hidden, setHidden] = useState(() => readHidden(companyId));
  const active = !hidden && !tasksShowHistory(tasks);
  const history = useCompanyHistory(companyId, active);
  const hide = () => {
    writeHidden(companyId);
    setHidden(true);
  };
  if (!active) return { state: "off", hide };
  if (history.isLoading) return { state: "checking", hide };
  return { state: isNewCompany(history.data) ? "on" : "off", hide };
}

/** The moment's height while the gate decides: nothing jumps whichever way it falls. */
export function LaunchBone() {
  return (
    <SkeletonGroup className="flex h-11 items-center gap-4">
      <Bone h={36} w={32} />
      <Bone h={18} w={240} />
    </SkeletonGroup>
  );
}

/** A square, not a ring: a circle on the sheet is a task's stage. */
function Mark({ done }: { done: boolean }) {
  if (!done) return <span aria-hidden className="block h-3 w-3 border border-[var(--text-muted)]" />;
  return (
    <svg aria-hidden viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="square">
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

const FILLED = "btn-primary inline-flex h-8 items-center whitespace-nowrap px-3 text-[13px] leading-4";
const QUIET = "whitespace-nowrap text-[13px] leading-4 text-muted transition-colors hover:text-text";

/** A step's way on. The step to take now is the screen's one filled button; the others are words. */
function StepAction({ step, main }: { step: LaunchStep; main: boolean }) {
  if (!step.action) return <span />;
  const { href, label } = step.action;
  const testId = `launch-go-${step.key}`;
  if (href === null) {
    return (
      <button type="button" className={main ? FILLED : QUIET} onClick={() => focusCommandLine()} data-testid={testId}>
        {label}
      </button>
    );
  }
  return (
    <Link href={href} prefetch className={main ? FILLED : QUIET} data-testid={testId}>
      {label}
    </Link>
  );
}

/**
 * The launch of a new company on «Сегодня» (И-77), in place of an empty «Всё закрыто»: how many
 * steps are left and the four of them, each with a word on where it stands and a way to its own
 * place. Everything is counted from what the company has, nothing is ticked by hand; the first
 * task sent ends the list, «Скрыть» puts it away in this browser.
 */
export function LaunchChecklist({
  people,
  health,
  healthKnown,
  onHide,
}: {
  people: readonly Person[];
  health: ReadonlyMap<string, Health> | undefined;
  /** the channels have been read or failed: the walk over logins starts from what they say */
  healthKnown: boolean;
  onHide: () => void;
}) {
  const client = useQueryClient();
  const card = useCompanyCard();
  const team = useMemo(() => people.filter(isTeamMember), [people]);
  const logins = useQuery({
    queryKey: ["desk", "launch", "logins", team.length],
    enabled: team.length > 0 && healthKnown,
    queryFn: () => scanLogins(client, team, health),
  });

  const steps = launchSteps({
    companyName: card.data?.name ?? null,
    hasLogo: Boolean(card.data?.brand.logo_url),
    team: team.length,
    anyLogin: logins.data?.anyLogin ?? false,
    nextPersonId: logins.data?.nextPersonId ?? null,
    firstName: team[0]?.full_name.trim().split(/\s+/)[0] ?? null,
  });
  const next = nextStep(steps);
  const left = steps.filter((step) => !step.done).length;

  return (
    <section className="@container flex flex-col gap-3" data-testid="desk-launch">
      <div className="desk-total flex items-center gap-x-4">
        <span className="nums desk-figure shrink-0 text-[44px] leading-[44px]" style={{ color: TONE_VAR.warn }} data-testid="launch-left">
          {left}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] font-semibold leading-[22px]">Запуск компании</p>
          <p className="truncate text-[13px] leading-[18px] text-muted">
            {pluralRu(left, ["Остался", "Осталось", "Осталось"])} {left} {pluralRu(left, ["шаг", "шага", "шагов"])} · с первым поручением здесь появится ваш день
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={onHide} data-testid="launch-hide">
          Скрыть
        </Button>
      </div>
      <ol className="desk-list">
        {steps.map((step) => (
          <li
            key={step.key}
            className="grid min-h-[44px] grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-x-3 py-1 @min-[760px]:grid-cols-[16px_200px_minmax(0,1fr)_auto]"
            data-testid={`launch-${step.key}`}
            data-done={step.done ? "" : undefined}
          >
            <span className="flex items-center justify-center">
              <Mark done={step.done} />
              <span className="sr-only">{step.done ? "Сделано" : "Не сделано"}</span>
            </span>
            <span className={`min-w-0 truncate ${step.done ? "text-muted" : "font-medium"}`}>{step.title}</span>
            <span className="min-w-0 truncate text-[13px] leading-[18px] text-muted @max-[760px]:col-start-2 @max-[760px]:row-start-2" title={step.hint}>
              {step.hint}
            </span>
            <span className="flex justify-end @max-[760px]:col-start-3 @max-[760px]:row-span-2 @max-[760px]:row-start-1">
              <StepAction step={step} main={step.key === next?.key} />
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
