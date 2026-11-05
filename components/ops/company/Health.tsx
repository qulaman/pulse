"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";

import { IssueCode } from "@/components/ops/company/IssueCode";
import { actionText } from "@/components/ops/log/words";
import { ageLabel, queueStuck } from "@/components/ops/registry/alarm";
import { Button } from "@/components/ui/Button";
import { whenAqtobe } from "@/lib/lab/format";
import type { CardPerson, CompanyCard } from "@/lib/ops/contract";
import { useAudit, useCompanies } from "@/lib/ops/queries";
import { pluralRu } from "@/lib/tasks/status-text";

type Problem = { key: string; tone: "warn" | "danger"; what: string; next: string; href?: string; label?: string };

/** The director people reach: the one who was here last; a post held by nobody working gives none. */
export function activeDirector(card: CompanyCard): CardPerson | null {
  const working = card.people.filter((person) => person.role === "director" && person.is_active);
  return working.sort((a, b) => (b.last_seen_at ?? "").localeCompare(a.last_seen_at ?? ""))[0] ?? null;
}

/** What is wrong right now, the worst first, each with what to look at next. */
function problemsOf(card: CompanyCard, director: CardPerson | null): Problem[] {
  const { signals } = card;
  const base = `/ops/c/${card.id}`;
  const found: Problem[] = [];

  if (signals.parse_errors_24h > 0) {
    found.push({
      key: "parse",
      tone: "danger",
      what: `Ошибок разбора за сутки: ${signals.parse_errors_24h}`,
      next: "Голосовые сохранены, но задачи из них не вышли. Проверь модель разбора и ключ её поставщика на сервере.",
      href: `${base}?s=settings`,
      label: "Настройки",
    });
  }
  if (!director) {
    found.push({ key: "director", tone: "danger", what: "Работающего директора нет", next: "Голосом поручать некому: проверь, кто сейчас директор.", href: `${base}?s=director`, label: "Директор" });
  } else if (director.sessions === 0) {
    found.push({ key: "signin", tone: "warn", what: `У директора нет ни одного входа: ${director.full_name}`, next: "Нужен новый код: кнопка ниже." });
  }
  if (queueStuck(signals)) {
    const waiting = `${signals.queue_depth} ${pluralRu(signals.queue_depth, ["уведомление ждёт", "уведомления ждут", "уведомлений ждут"])}`;
    found.push({ key: "queue", tone: "warn", what: `Очередь стоит ${ageLabel(signals.queue_age_seconds ?? 0)}: ${waiting}`, next: "Фоновая рассылка не доходит до компании. Проверь плановый запуск на сервере." });
  }
  const failed = signals.failed_7d - signals.failed_no_subscription_7d;
  if (failed > 0) {
    found.push({ key: "failed", tone: "warn", what: `Не дошло за 7 дней: ${failed}`, next: "Это сбой отправки, а не выключенные пуши. Проверь ключи уведомлений на сервере." });
  }
  return found;
}

function Fact({ children }: { children: ReactNode }) {
  return <span className="whitespace-nowrap">{children}</span>;
}

/**
 * The first answer to «ничего не работает»: what is wrong in words with where to go, and when
 * things were last alive, including what was last done to the company from this console. What a
 * call for help asks most, a new code for the director, is one press from here.
 */
export function CompanyHealth({ card }: { card: CompanyCard }) {
  const companies = useCompanies();
  const audit = useAudit(card.id);
  const [coding, setCoding] = useState(false);

  const director = useMemo(() => activeDirector(card), [card]);
  const row = companies.data?.find((company) => company.id === card.id);
  const last = audit.data?.pages[0]?.rows[0];
  const problems = problemsOf(card, director);

  return (
    <section aria-label="Состояние компании" className="flex flex-col gap-2" data-testid="ops-health">
      {problems.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {problems.map((problem) => (
            <li key={problem.key} className="flex items-start gap-2 text-[13px] leading-5" data-testid="ops-health-problem">
              <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: `var(--${problem.tone})` }} />
              <p className="min-w-0 flex-1">
                <span className="font-medium">{problem.what}.</span> <span className="text-muted">{problem.next}</span>
              </p>
              {problem.href ? (
                <Link href={problem.href} replace scroll={false} className="shrink-0 underline underline-offset-2">
                  {problem.label}
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] leading-5 text-muted">
        {director ? (
          <Fact>
            Директор {director.full_name}: {director.last_seen_at ? `был ${whenAqtobe(director.last_seen_at)}` : "ещё не заходил"}
          </Fact>
        ) : null}
        {row ? <Fact>{row.last_parse_at ? `Последний разбор ${whenAqtobe(row.last_parse_at)}` : "Разборов ещё не было"}</Fact> : null}
        {row ? <Fact>{`Заходили за 7 дней: ${row.active_7d} из ${row.people}`}</Fact> : null}
        {audit.data ? <Fact>{last ? `В консоли ${whenAqtobe(last.at)}: ${actionText(last.action)}` : "Из консоли компанию не трогали"}</Fact> : null}
        {director ? (
          <span className="ml-auto">
            <Button size="sm" variant="secondary" onClick={() => setCoding(true)} data-testid="ops-director-code">
              Выдать код директору
            </Button>
          </span>
        ) : null}
      </div>
      {coding && director ? <IssueCode companyId={card.id} person={director} onClose={() => setCoding(false)} /> : null}
    </section>
  );
}
