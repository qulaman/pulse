"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { CheckLine } from "@/components/desk/settings/form";
import { DataGrid, type Column } from "@/components/desk/ui/DataGrid";
import { Dialog } from "@/components/desk/ui/Dialog";
import { Kbd } from "@/components/desk/ui/Kbd";
import { SectionLabel } from "@/components/desk/ui/SectionLabel";
import { Select } from "@/components/desk/ui/Toolbar";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { assignableRoles } from "@/lib/people/access";
import { addInTurn, BULK_MAX, matchRows, parseBulk, personBody, rowsToAdd, type BulkItem, type BulkOutcome, type RosterPerson } from "@/lib/people/bulk";
import { peopleKeys, peopleQuery, ROLE_ABOUT, ROLE_LABEL, type Person, type Role } from "@/lib/people/queries";
import { rosterKey } from "@/lib/people/roster";

import { dropDraft, keepDraft, peekDraft, useLeaveGuard } from "./useLeaveGuard";

const DRAFT_KEY = "bulk";
// examples nobody is called by: a real colleague's name in the field read as already typed
const PLACEHOLDER = "Например:\nИван Петров\tБухгалтер\t+7 700 000 00 01\nАнна Смирнова; Прораб; +7 700 000 00 02\nОлег Ким, Водитель";

type Phase = "edit" | "running" | "done";

/** The kiosk is no person and a list makes no directors: both are the one-person form's, with its question. */
function listRoles(editor: Role): Role[] {
  return assignableRoles(editor, null).filter((role) => role !== "tv" && role !== "director");
}

/** Everybody a row may be, the fired too: bringing one back is a move on their card, not a new login. */
function rosterOf(people: readonly Person[]): RosterPerson[] {
  return people.filter((person) => person.role !== "tv");
}

/** `POST /api/people` itself: the mutation's own toast would say the same thing once per row. */
async function postPerson(body: ReturnType<typeof personBody> & { client_request_id?: string }): Promise<string> {
  let res: Response;
  try {
    res = await fetch("/api/people", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Нет связи");
  }
  const answer = (await res.json().catch(() => ({}))) as { id?: string; error?: { message_ru?: string } };
  if (!res.ok || !answer.id) throw new Error(answer.error?.message_ru ?? "Не получилось создать");
  return answer.id;
}

/** What a row is up against: where the other person stands, and a word from the one who pasted the list. */
function Match({ row, forced, locked, onForce }: { row: BulkItem; forced: boolean; locked: boolean; onForce: (value: boolean) => void }) {
  const match = row.match;
  if (!match) return null;
  const person = match.kind === "list" ? null : match.person;
  const words = match.kind === "list" ? `Повтор строки ${match.line}` : match.kind === "same" ? (match.person.is_active ? "Уже в команде:" : "Среди ушедших:") : "Похоже на";
  return (
    <span className="flex min-w-0 flex-col gap-0.5" data-testid="bulk-match" data-kind={match.kind}>
      <span className="truncate text-[13px] leading-[18px]" style={{ color: "var(--warn)" }}>
        {words}{" "}
        {person ? (
          <Link href={`/desk/team/${person.id}`} target="_blank" className="underline underline-offset-2">
            {person.full_name}
          </Link>
        ) : null}
      </span>
      {locked ? null : <CheckLine checked={forced} onChange={onForce} label="Всё равно добавить" />}
    </span>
  );
}

/**
 * «Списком» (the launch of a company): lines from Excel or a text become people, with a look at
 * them first. A row that cannot go says why in the table, a row that looks like somebody here
 * stays out until the person says otherwise; what is fixed is fixed in the text, and the table
 * follows. «Добавить» goes through the same `POST /api/people` as the one-person form, one row
 * at a time, the whole company's way in is a code from each card later. The answer to a row may
 * be lost while the person exists: each row keeps its request id for the whole list, so a retry
 * gets the same card back instead of a second one.
 */
export function BulkPeople({ editor, people, onBusy }: { editor: Role; people: readonly Person[]; onBusy: (busy: boolean) => void }) {
  const client = useQueryClient();
  const [text, setText] = useState(() => peekDraft<string>(DRAFT_KEY) ?? "");
  const [role, setRole] = useState<Role>("employee");
  const [forced, setForced] = useState<ReadonlySet<number>>(new Set());
  const [phase, setPhase] = useState<Phase>("edit");
  const [batch, setBatch] = useState<BulkItem[]>([]);
  const [outcomes, setOutcomes] = useState<ReadonlyMap<number, BulkOutcome>>(new Map());
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [leaving, setLeaving] = useState<{ go: () => void } | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  /** line → the row's request id, one for all the tries of this list. */
  const requests = useRef<ReadonlyMap<number, string>>(new Map());
  const passed = useRef(false);

  useEffect(() => dropDraft(DRAFT_KEY), []);
  useEffect(() => field.current?.focus(), []);
  useEffect(() => onBusy(phase === "running"), [onBusy, phase]);

  // the text outlives a trip to the other tab, in this tab's memory like every form of the desk
  const latest = useRef({ text, phase });
  useLayoutEffect(() => {
    latest.current = { text, phase };
  });
  useEffect(
    () => () => {
      if (latest.current.phase === "edit" && latest.current.text.trim()) keepDraft(DRAFT_KEY, latest.current.text);
    },
    [],
  );

  const pasted = useDeferredValue(text);
  const live = useMemo(() => matchRows(parseBulk(pasted), rosterOf(people)), [pasted, people]);
  const failedFirst = useMemo(() => [...batch].sort((a, b) => Number(Boolean(outcomes.get(b.line)?.error)) - Number(Boolean(outcomes.get(a.line)?.error))), [batch, outcomes]);
  const rows = phase === "edit" ? live : phase === "done" ? failedFirst : batch;
  const toAdd = useMemo(() => rowsToAdd(live, forced), [live, forced]);
  const tooMany = live.length > BULK_MAX;
  const withProblems = rows.filter((row) => row.problems.length > 0).length;
  const withMatches = rows.filter((row) => row.match && !forced.has(row.line)).length;
  const dirty = phase === "running" || (phase === "edit" && text.trim() !== "");
  useLeaveGuard(dirty, passed, (go) => setLeaving({ go }));

  const added = batch.filter((row) => outcomes.get(row.line)?.id);
  const failed = batch.filter((row) => outcomes.get(row.line)?.error);
  const missed = failed.map((row) => row.full_name).join(", ");

  const readRoster = () => client.fetchQuery({ ...peopleQuery, staleTime: 0 }).catch(() => null);

  const run = async (list: readonly BulkItem[]) => {
    setProgress({ done: 0, total: list.length });
    await addInTurn(
      list,
      (row) => postPerson({ ...personBody(row, role), client_request_id: requests.current.get(row.line) }),
      (outcome) => {
        setOutcomes((all) => new Map(all).set(outcome.line, outcome));
        setProgress((now) => ({ ...now, done: now.done + 1 }));
      },
    );
    void client.invalidateQueries({ queryKey: peopleKeys.all });
    void client.invalidateQueries({ queryKey: rosterKey });
    setPhase("done");
  };

  const start = async () => {
    if (phase !== "edit" || toAdd.length === 0 || tooMany) return;
    setPhase("running");
    const fresh = await readRoster();
    if (!fresh) {
      toast("Нет связи: список не отправлен");
      setPhase("edit");
      return;
    }
    const checked = matchRows(parseBulk(text), rosterOf(fresh));
    const list = rowsToAdd(checked, forced);
    // somebody came onto the roster while the list lay here: that row asks again, nothing goes
    if (list.length !== toAdd.length) {
      toast("Команда изменилась: проверьте строки ещё раз");
      setPhase("edit");
      return;
    }
    requests.current = new Map(list.map((row) => [row.line, crypto.randomUUID()]));
    setBatch(checked);
    setOutcomes(new Map());
    await run(list);
  };

  const retry = async () => {
    if (phase !== "done" || failed.length === 0) return;
    setPhase("running");
    await run(failed);
  };

  /** Another list; what did not go stays in the field, to fix and send again. */
  const again = () => {
    setText(failed.map((row) => row.raw).join("\n"));
    setForced(new Set());
    setOutcomes(new Map());
    setBatch([]);
    setPhase("edit");
    field.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if ((event.ctrlKey || event.metaKey) && !event.altKey && (event.code === "Enter" || event.code === "NumpadEnter")) {
      event.preventDefault();
      void start();
    }
  };

  /** Every row held back by a likeness goes too: the person has looked and says they are all new. */
  const forceAll = () => setForced(new Set(live.filter((row) => row.problems.length === 0 && row.match).map((row) => row.line)));
  const force = (line: number, value: boolean) =>
    setForced((all) => {
      const next = new Set(all);
      if (value) next.add(line);
      else next.delete(line);
      return next;
    });

  const state = (row: BulkItem) => {
    const outcome = outcomes.get(row.line);
    if (outcome?.id) {
      return (
        <Link href={`/desk/team/${outcome.id}`} className="text-[13px] leading-[18px] text-muted hover:text-text" data-testid="bulk-added">
          В команде →
        </Link>
      );
    }
    if (outcome?.error) {
      return (
        <span className="block text-[13px] leading-[18px] text-danger [overflow-wrap:anywhere]" data-testid="bulk-failed">
          Не добавлено: {outcome.error}
        </span>
      );
    }
    if (row.problems.length > 0) {
      return (
        <span className="block text-[13px] leading-[18px] text-danger [overflow-wrap:anywhere]" data-testid="bulk-problem">
          {row.problems.join(" · ")}
        </span>
      );
    }
    return <Match row={row} forced={forced.has(row.line)} locked={phase !== "edit"} onForce={(value) => force(row.line, value)} />;
  };

  const out = (row: BulkItem) => row.problems.length > 0 || Boolean(row.match && !forced.has(row.line));
  const quiet = (row: BulkItem, value: string) => (
    <span className={`block truncate ${out(row) ? "text-muted" : ""}`} title={value}>
      {value || <span className="text-muted/60">—</span>}
    </span>
  );
  const columns: Column<BulkItem>[] = [
    { key: "line", title: "№", width: "44px", render: (row) => <span className="nums text-muted">{row.line}</span> },
    { key: "name", title: "ФИО", width: "minmax(0,1.3fr)", render: (row) => quiet(row, row.full_name) },
    { key: "position", title: "Должность", width: "minmax(0,1fr)", render: (row) => quiet(row, row.position) },
    { key: "phone", title: "Телефон", width: "156px", render: (row) => <span className={`nums block truncate text-[13px] ${out(row) ? "text-muted" : ""}`}>{row.phone || <span className="text-muted/60">—</span>}</span> },
    { key: "state", title: "", width: "minmax(0,1.3fr)", render: state },
  ];

  const shownCount = phase === "edit" ? toAdd.length : added.length;
  const summary = [
    phase === "edit" ? `Добавлю ${shownCount}` : null,
    withProblems > 0 ? `с ошибкой ${withProblems}` : null,
    withMatches > 0 ? `похожих ${withMatches}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <div className="flex flex-col gap-5" onKeyDown={onKeyDown} data-testid="bulk-people">
      <section className="flex flex-col gap-1.5">
        <label htmlFor="bulk-text" className="desk-label uppercase">
          Строки из Excel или текста
        </label>
        <textarea
          id="bulk-text"
          ref={field}
          rows={7}
          value={text}
          readOnly={phase !== "edit"}
          onChange={(event) => setText(event.target.value)}
          placeholder={PLACEHOLDER}
          spellCheck={false}
          className="field w-full resize-y px-3 py-2 text-[14px] leading-5 text-text outline-none"
          data-testid="bulk-text"
        />
        <p className="text-[12px] leading-4 text-muted">ФИО, должность, телефон. Между ними — табуляция, «;» или «,». Строку с заголовками столбцов пропущу, телефон найду в любом столбце.</p>
      </section>

      <section className="flex items-center gap-3">
        <label htmlFor="bulk-role" className="text-[13px] font-medium leading-5 text-muted">
          Роль всего списка
        </label>
        <Select id="bulk-role" value={role} onChange={(event) => setRole(event.target.value as Role)} disabled={phase !== "edit"} data-testid="bulk-role">
          {listRoles(editor).map((one) => (
            <option key={one} value={one}>
              {ROLE_LABEL[one]}
            </option>
          ))}
        </Select>
        <span className="min-w-0 truncate text-[12px] leading-4 text-muted">{ROLE_ABOUT[role]}</span>
      </section>

      {rows.length > 0 ? (
        <section className="flex flex-col gap-1.5" data-testid="bulk-preview">
          <SectionLabel>{summary || "Список"}</SectionLabel>
          <DataGrid aria-label="Что распознано" columns={columns} rows={rows} rowKey={(row) => String(row.line)} empty={null} />
        </section>
      ) : null}

      <div className="sticky bottom-0 z-[2] flex flex-wrap items-center gap-3 border-t border-[var(--text)] bg-bg py-2.5" data-testid="bulk-bar">
        {phase === "edit" ? (
          <>
            <Button size="sm" onClick={() => void start()} disabled={toAdd.length === 0 || tooMany} data-testid="bulk-add">
              Добавить {toAdd.length}
            </Button>
            {withMatches > 0 && !tooMany ? (
              <Button size="sm" variant="secondary" onClick={forceAll} data-testid="bulk-force-all">
                Добавить и похожих
              </Button>
            ) : null}
            {tooMany ? (
              <span className="text-[13px] leading-[18px] text-danger" data-testid="bulk-too-many">
                В одном списке до {BULK_MAX} строк, здесь {live.length}
              </span>
            ) : toAdd.length === 0 && live.length > 0 ? (
              // a grey button never stands without its reason
              <span className="text-[12px] leading-4 text-muted" data-testid="bulk-why-none">
                {withMatches > 0
                  ? "Все строки похожи на людей в команде: отметьте «Всё равно добавить» у новых — или «Добавить и похожих»"
                  : "Исправьте строки с ошибкой — они отмечены красным"}
              </span>
            ) : toAdd.length > 0 ? (
              <span className="text-[12px] leading-4 text-muted">
                <Kbd>Ctrl Enter</Kbd> добавить · вход каждому — кодом с его карточки
              </span>
            ) : null}
          </>
        ) : phase === "running" ? (
          <>
            <span className="nums text-[14px] leading-5" role="status" data-testid="bulk-progress">
              Добавляю {Math.min(progress.done + 1, Math.max(progress.total, 1))} из {progress.total}
            </span>
            <span aria-hidden className="h-0.5 min-w-[120px] flex-1 bg-border">
              <span className="block h-full bg-[var(--text)]" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
            </span>
          </>
        ) : (
          <>
            <p className="min-w-0 max-w-full truncate text-[14px] leading-5" role="status" title={missed || undefined} data-testid="bulk-result">
              {failed.length > 0 ? `Добавлено ${added.length} из ${added.length + failed.length}, не добавились: ${missed}` : `Добавлено ${added.length}`}
            </p>
            {failed.length > 0 ? (
              <Button size="sm" onClick={() => void retry()} data-testid="bulk-retry">
                Повторить {failed.length}
              </Button>
            ) : added[0] ? (
              <Link href={`/desk/team/${outcomes.get(added[0].line)?.id}`} prefetch className="btn-primary inline-flex h-9 items-center px-3 text-[13px] leading-4" data-testid="bulk-login">
                Выдать вход
              </Link>
            ) : null}
            <Button size="sm" variant="ghost" onClick={again} data-testid="bulk-again">
              {failed.length > 0 ? "Исправить строки" : "Ещё список"}
            </Button>
          </>
        )}
      </div>

      <Dialog open={leaving !== null} onClose={() => setLeaving(null)} title={phase === "running" ? "Список ещё добавляется" : "Уйти без добавления?"} width="sm">
        <div className="flex flex-col gap-3">
          <p className="text-[14px] leading-5 text-muted">
            {phase === "running" ? "Строки идут по одной и дойдут, пока открыта вкладка, но итога вы не увидите." : "Никого из списка ещё нет в команде. Текст останется здесь, пока открыта вкладка."}
          </p>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setLeaving(null)} data-autofocus data-testid="bulk-stay">
              Остаться
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                passed.current = true;
                leaving?.go();
                setLeaving(null);
              }}
              data-testid="bulk-leave"
            >
              Уйти
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
