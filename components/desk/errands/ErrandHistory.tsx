"use client";

import { Heart } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useMemo, useRef, useState } from "react";

import { DataGrid, type Column } from "@/components/desk/ui/DataGrid";
import { EmptyState } from "@/components/desk/ui/EmptyState";
import { SectionLabel } from "@/components/desk/ui/SectionLabel";
import { useShortcuts } from "@/components/desk/ui/Shortcuts";
import { SearchField, SegmentTabs, Select, Toolbar } from "@/components/desk/ui/Toolbar";
import { TONE_VAR } from "@/components/desk/ui/tone";
import { When } from "@/components/desk/ui/When";
import { Button } from "@/components/ui/Button";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import { toast } from "@/components/ui/Toast";
import { humanAqtobe } from "@/lib/ai/time";
import { parseRange, rowsLeft, type DayRange } from "@/lib/desk/archive";
import { loadStateOf } from "@/lib/desk/tasks";
import { CLOSED_ERRANDS, isActive, useErrandArchive, useErrandCounts, useSecretaries, type ClosedErrandStatus, type Errand, type ErrandFilter } from "@/lib/errands/queries";
import { atLine } from "@/lib/errands/scene";
import { shortName } from "@/lib/people/names";
import type { SecretaryAction } from "@/lib/settings";

import { DateRangeField } from "../tasks/DateRange";
import { writeParams } from "../tasks/flow";
import { LoadFailure, LoadNote } from "../tasks/LoadState";
import { arrowOf, stepKey, useScreenKeys } from "../team/keys";
import { ThankButton } from "./ErrandCard";
import { ErrandTile, PersonFace } from "./look";
import { canThank, lower, STATUS_TONE, STATUS_WORD } from "./words";

/** A request in a table cell: its scene's icon, the label, the note after it, the time it is needed by. */
export function ErrandWhat({ errand, now, catalogue }: { errand: Errand; now: Date; catalogue: readonly SecretaryAction[] }) {
  const late = Boolean(errand.due_at) && isActive(errand) && new Date(errand.due_at as string) < now;
  return (
    <span className="flex min-w-0 items-center gap-2.5" title={[errand.label, errand.note, errand.result ? `передано: ${errand.result}` : null].filter(Boolean).join(" · ")}>
      <ErrandTile errand={errand} catalogue={catalogue} size={24} muted={errand.status === "cancelled"} />
      <span className="min-w-0 truncate">
      <span className="font-medium">{errand.label}</span>
      {errand.due_at ? (
        <>
          {" · "}
          <When overdue={late}>{atLine(errand.due_at, now)}</When>
        </>
      ) : null}
      {errand.note ? <span className="text-muted"> · {errand.note}</span> : null}
      {errand.result ? <span className="text-muted"> · «{errand.result}»</span> : null}
      </span>
    </span>
  );
}

/** A request's state in a table cell: a dot and the word, who took it — their circle — and why not. */
export function ErrandWord({ errand, taker = true, compact = false }: { errand: Errand; taker?: boolean; compact?: boolean }) {
  // the secretary's own history: every row is hers, her name says nothing
  const who = taker ? shortName(errand.claimed?.full_name ?? "") : "";
  // the secretary asked and waits for the director: the row says so, the panel answers (D-99)
  const asks = Boolean(errand.question && !errand.answer) && (errand.status === "sent" || errand.status === "accepted");
  const tone = TONE_VAR[asks ? "accent" : STATUS_TONE[errand.status]];
  return (
    <span className="flex min-w-0 items-center gap-2" title={errand.decline_reason ?? undefined}>
      <span className="errands-status" data-status={asks ? "asks" : errand.status} style={{ color: tone }}>
        {asks ? "спрашивает" : STATUS_WORD[errand.status]}
      </span>
      {who ? (
        <span className="flex min-w-0 items-center gap-1.5 text-muted" title={errand.claimed?.full_name ?? who}>
          <PersonFace id={errand.claimed_by} name={errand.claimed?.full_name ?? who} size={18} />
          {/* a reason takes the room: the circle stays for who */}
          {errand.decline_reason || compact ? null : <span className="truncate">{who}</span>}
        </span>
      ) : null}
      {errand.decline_reason && !compact ? <span className="min-w-0 truncate text-muted">· {lower(errand.decline_reason)}</span> : null}
    </span>
  );
}

type Show = "all" | ClosedErrandStatus;

const SHOW_WORD: Record<ClosedErrandStatus, string> = { done: "Готово", declined: "Отказ", cancelled: "Отменено" };

/**
 * Closed requests by the server (lib/errands/queries.ts): a range of days in the address, the
 * request's own words, how it ended and who took it, a page at a time. The director's list is the
 * company's. The secretary's is what she took herself — the query narrows it: `errands_select`
 * would show her every request of the company. F — the search.
 */
export function ErrandHistory({
  viewer,
  meId,
  openId,
  onOpen,
  now,
  pointsOn,
  catalogue,
}: {
  viewer: "director" | "secretary";
  meId: string;
  openId: string | null;
  onOpen: (id: string) => void;
  now: Date;
  pointsOn: boolean;
  catalogue: readonly SecretaryAction[];
}) {
  const director = viewer === "director";
  const params = useSearchParams();
  const rangeFrom = params.get("from");
  const rangeTo = params.get("to");
  const range = useMemo(() => parseRange(rangeFrom, rangeTo), [rangeFrom, rangeTo]);
  const setRange = (value: DayRange | null) => writeParams({ from: value?.from ?? null, to: value?.to ?? null });
  const [show, setShow] = useState<Show>("all");
  const [who, setWho] = useState("");
  const [query, setQuery] = useState("");
  const search = useRef<HTMLInputElement>(null);

  const claimed = director ? who || null : meId;
  const filter: ErrandFilter = { range, claimed, text: query };
  const live = Boolean(meId);
  const archive = useErrandArchive(filter, show === "all" ? null : show, live);
  const counts = useErrandCounts(filter, live);
  const secretaries = useSecretaries(director);
  const load = loadStateOf(archive.query);

  const rows = archive.rows;
  const whole = counts ? CLOSED_ERRANDS.reduce((sum, status) => sum + counts[status], 0) : undefined;
  const left = rowsLeft(archive.total, rows.length);
  const narrowed = show !== "all" || Boolean(who) || Boolean(query) || Boolean(range);
  // a person's id, with the name to show: who works here, and whoever took a request on screen
  const takers = useMemo(() => {
    const names = new Map((secretaries.data ?? []).map((person) => [person.id, person.full_name]));
    for (const errand of rows) if (errand.claimed_by && errand.claimed?.full_name) names.set(errand.claimed_by, errand.claimed.full_name);
    return [...names].sort((a, b) => a[1].localeCompare(b[1], "ru"));
  }, [secretaries.data, rows]);
  const reset = () => {
    setShow("all");
    setWho("");
    setQuery("");
    setRange(null);
  };

  useScreenKeys((event) => {
    if (event.code === "KeyF") {
      search.current?.focus();
      return true;
    }
    // the director's screen walks «Сейчас» and this list together
    const arrow = director ? null : arrowOf(event);
    if (!arrow) return false;
    const keys = [...document.querySelectorAll<HTMLElement>('[data-testid="desk-errands-history"] [data-row-key]')].map((row) => row.dataset.rowKey ?? "");
    const next = stepKey(keys, openId, arrow === "down");
    if (next) onOpen(next);
    return Boolean(next);
  });
  useShortcuts("Заявки · история", [{ keys: ["F"], label: "Поиск по истории" }]);

  // the panel takes the room: the words keep theirs, the state says itself by its word and a circle
  const narrow = Boolean(openId);
  const columns: Column<Errand>[] = [
    { key: "what", title: "Что", sort: (a, b) => a.label.localeCompare(b.label, "ru"), render: (e) => <ErrandWhat errand={e} now={now} catalogue={catalogue} /> },
    {
      key: "state",
      title: "Статус",
      width: narrow ? "minmax(100px,140px)" : "minmax(170px,250px)",
      sort: (a, b) => a.status.localeCompare(b.status),
      render: (e) => <ErrandWord errand={e} taker={director} compact={narrow} />,
    },
    {
      key: "at",
      title: "Когда",
      width: narrow ? "130px" : "148px",
      sort: (a, b) => a.created_at.localeCompare(b.created_at),
      render: (e) => <When className="text-muted">{humanAqtobe(new Date(e.created_at), now)}</When>,
    },
    ...(director
      ? ([
          {
            key: "thanks",
            title: "",
            width: "104px",
            align: "right",
            render: (e) =>
              canThank(e, now, pointsOn) ? (
                <ThankButton errand={e} />
              ) : e.thanked_at ? (
                <span className="errands-thanked" title="Спасибо отправлено">
                  <Heart size={13} strokeWidth={2.25} aria-hidden />
                  спасибо
                </span>
              ) : null,
          },
        ] satisfies Column<Errand>[])
      : []),
  ];

  return (
    <section className="flex min-w-0 flex-col gap-1" data-testid="desk-errands-history">
      <SectionLabel count={whole}>{director ? "История" : "Мои заявки"}</SectionLabel>
      <Toolbar
        end={
          <span className="nums text-[13px] leading-4 text-muted" data-testid="desk-errands-shown">
            {archive.total === null ? " " : left > 0 ? `${rows.length} из ${archive.total}` : archive.total}
          </span>
        }
      >
        <SegmentTabs<Show>
          aria-label="Чем закончилась"
          value={show}
          onChange={setShow}
          items={[
            { value: "all", label: "Все", count: whole },
            ...CLOSED_ERRANDS.map((status) => ({ value: status, label: SHOW_WORD[status], count: counts?.[status] })),
          ]}
        />
        {director ? (
          <Select aria-label="Кто" value={who} onChange={(event) => setWho(event.target.value)} className="w-[164px]" data-testid="desk-errands-who">
            <option value="">Все секретари</option>
            {takers.map(([id, name]) => (
              <option key={id} value={id}>
                {shortName(name)}
              </option>
            ))}
            <option value="nobody">Никто не взял</option>
          </Select>
        ) : null}
        <DateRangeField value={range} onChange={setRange} now={now} />
        <SearchField ref={search} value={query} onChange={setQuery} placeholder="Что просили  ·  F" width={172} aria-label="Поиск по заявкам" />
      </Toolbar>
      {archive.busy && rows.length === 0 ? (
        <SkeletonGroup grow>
          <Bone h={34} />
          <Bone h={34} className="mt-px" />
          <Bone h={34} className="mt-px" />
        </SkeletonGroup>
      ) : load.kind === "failed" ? (
        <LoadFailure what="историю заявок" offline={load.offline} busy={archive.query.isFetching} onRetry={() => void archive.query.refetch()} />
      ) : (
        <DataGrid
          aria-label="Закрытые заявки"
          columns={columns}
          rows={rows}
          rowKey={(e) => e.id}
          selectedKey={openId}
          onSelect={(e) => onOpen(e.id)}
          empty={
            narrowed ? (
              <EmptyState
                title="Таких заявок не нашлось"
                hint="Фильтры — над таблицей"
                action={
                  <Button size="sm" variant="secondary" onClick={reset}>
                    Показать все
                  </Button>
                }
              />
            ) : director ? (
              <EmptyState title="Заявок ещё не было" hint="«Кофе», «Чай», «Не беспокоить» — в один клик сверху" />
            ) : (
              <EmptyState title="Закрытых заявок пока нет" hint="Сюда лягут заявки, которые вы брали" />
            )
          }
        />
      )}
      <LoadNote state={load.kind === "stale" ? load : { kind: "ready" }} failed="" now={now} onRetry={() => void archive.query.refetch()} />
      {left > 0 ? (
        <div className="mt-3 flex justify-center">
          <Button
            variant="secondary"
            size="sm"
            loading={archive.loadingMore}
            onClick={() => void archive.more().catch(() => toast("Не получилось загрузить. Попробуйте ещё раз"))}
            data-testid="desk-errands-more"
          >
            Показать ещё · {left}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
