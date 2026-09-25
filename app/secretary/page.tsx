"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";

import { ErrandCards } from "@/components/secretary/ErrandCards";
import { PageHead } from "@/components/ui/PageHead";
import { Sheet } from "@/components/ui/Sheet";
import { SecretarySkeleton } from "@/components/secretary/SecretarySkeleton";
import { isActive, useErrandHistory, waitedFor, type Errand } from "@/lib/errands/queries";
import { averageDoneMinutes, humanMinutes, tallyByPerson, unclaimedCount } from "@/lib/errands/stats";
import { useNow } from "@/lib/pulse/queries";
import { useMe } from "@/lib/tasks/queries";
import { firstNameOf } from "@/lib/text/normalize";

const STATUS_WORD: Record<string, string> = {
  sent: "ждёт",
  accepted: "в работе",
  done: "готово",
  declined: "не смогли",
  cancelled: "отменена",
};

/**
 * /secretary — заявки одним списком. Директору: что происходит сейчас и что было за
 * тридцать дней, кто сколько взял и за сколько закрывает. Секретарю: живые заявки и
 * свои закрытые за сегодня. Пуш ведёт сюда со ссылкой `?e=<id>` — карточка открывается
 * шторкой поверх списка.
 */
export default function SecretaryPage() {
  return (
    <Suspense fallback={<SecretarySkeleton />}>
      <SecretaryScreen />
    </Suspense>
  );
}

function SecretaryScreen() {
  const me = useMe();
  const now = useNow();
  const params = useSearchParams();
  const deepLink = params.get("e");
  const history = useErrandHistory(30, Boolean(me.data));
  const rows = useMemo(() => history.data ?? [], [history.data]);
  const [openId, setOpenId] = useState<string | null>(null);

  const isDirector = me.data?.role === "director";
  const meId = me.data?.userId ?? "";
  const active = rows.filter(isActive);
  const focused = rows.find((row) => row.id === (openId ?? deepLink)) ?? null;

  const today = useMemo(() => {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return rows.filter((row) => !isActive(row) && new Date(row.created_at) >= start);
  }, [rows, now]);

  if (me.isLoading || history.isLoading) return <SecretarySkeleton />;

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36">
      <PageHead title="Заявки" />

      {isDirector ? (
        <>
          <DirectorStats rows={rows} />
          <h2 className="mt-6 text-[13px] font-semibold uppercase tracking-wide text-muted">Сейчас</h2>
          {active.length === 0 ? (
            <p className="mt-2 text-[16px] leading-[22px] text-muted">Ничего не ждёт ответа.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {active.map((row) => (
                <li key={row.id}>
                  <ErrandLine errand={row} now={now} onOpen={() => setOpenId(row.id)} />
                </li>
              ))}
            </ul>
          )}
          <h2 className="mt-6 text-[13px] font-semibold uppercase tracking-wide text-muted">За 30 дней</h2>
          {rows.length === 0 ? (
            <p className="mt-2 text-[16px] leading-[22px] text-muted">Заявок ещё не было.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {rows.filter((row) => !isActive(row)).map((row) => (
                <li key={row.id}>
                  <ErrandLine errand={row} now={now} onOpen={() => setOpenId(row.id)} />
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/settings?tab=app"
            className="mt-4 flex min-h-[52px] items-center justify-between gap-3 card px-4 text-[16px] leading-[22px]"
          >
            Каталог кнопок
            <span className="text-[13px] leading-4 text-muted">надписи, значки, повтор пуша ›</span>
          </Link>
        </>
      ) : (
        <>
          <div className="mt-3">
            <ErrandCards errands={rows} meId={meId} now={now} />
          </div>
          <h2 className="mt-6 text-[13px] font-semibold uppercase tracking-wide text-muted">Сегодня закрыто</h2>
          {today.length === 0 ? (
            <p className="mt-2 text-[16px] leading-[22px] text-muted">Пока ничего.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {today.map((row) => (
                <li key={row.id}>
                  <ErrandLine errand={row} now={now} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <Sheet open={Boolean(focused)} onClose={() => setOpenId(null)} title={focused?.label ?? ""}>
        {focused ? (
          isDirector || !isActive(focused) ? (
            <div className="flex flex-col gap-1">
              {focused.note ? <p className="text-[16px] leading-[22px]">{focused.note}</p> : null}
              <p className="text-[14px] leading-[18px] text-muted">
                {STATUS_WORD[focused.status]}
                {focused.claimed?.full_name ? ` · ${firstNameOf(focused.claimed.full_name)}` : ""}
                {focused.decline_reason ? ` · ${focused.decline_reason}` : ""}
              </p>
            </div>
          ) : (
            <ErrandCards errands={[focused]} meId={meId} now={now} />
          )
        ) : null}
      </Sheet>
    </main>
  );
}

function DirectorStats({ rows }: { rows: readonly Errand[] }) {
  const tally = tallyByPerson(rows);
  const average = humanMinutes(averageDoneMinutes(rows));
  const unclaimed = unclaimedCount(rows);

  return (
    <div className="mt-4 card px-4 py-3">
      <p className="text-[15px] leading-5">
        Среднее «попросил → готово»: <span className="font-semibold">{average}</span>
        {unclaimed > 0 ? <span className="text-muted"> · без ответа: {unclaimed}</span> : null}
      </p>
      {tally.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-1">
          {tally.map((row) => (
            // без рода: «взято», «готово», «отказ» (docs/DESIGN.md)
            <li key={row.name} className="text-[14px] leading-[18px] text-muted">
              {row.name} · взято {row.taken}
              {row.done > 0 ? ` · готово ${row.done}` : ""}
              {row.declined > 0 ? ` · отказ ${row.declined}` : ""}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ErrandLine({ errand, now, onOpen }: { errand: Errand; now: Date; onOpen?: () => void }) {
  const who = firstNameOf(errand.claimed?.full_name ?? "");
  const body = (
    <>
      <span className="text-[15px] leading-5">
        {errand.label}
        {errand.note ? <span className="text-muted"> · {errand.note}</span> : null}
      </span>
      <span className="shrink-0 text-[13px] leading-4 text-muted">
        {STATUS_WORD[errand.status]}
        {who ? ` · ${who}` : ""} · {waitedFor(errand, now)}
      </span>
    </>
  );
  const className = "flex w-full items-center justify-between gap-3 card px-4 py-3 text-left";
  return onOpen ? (
    <button type="button" className={className} onClick={onOpen}>
      {body}
    </button>
  ) : (
    <div className={className}>{body}</div>
  );
}
