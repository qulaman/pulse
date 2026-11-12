"use client";

/**
 * Everything that comes up over the sheet: a task's thread, «Все действия», «Кому?», the
 * deadline and repeat pickers, an event, the phrases kept on the phone, an errand's note, the
 * install hint. Each closes back to exactly where the director was.
 */

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";

import {
  ALL_ACTIONS,
  EVENTS,
  LANE_KEYS,
  QUICK_ANSWERS,
  SECRETARY_ACTIONS,
  UNDOABLE,
  at,
  dayLabel,
  hhmm,
  personById,
  type Draft,
} from "@/app/dev/pulse-alt/fixtures";

import { ANSWER_WORD, EMPLOYEES, LANE_WORD, dative, g, isAway, messageKind, nameOf, receiptSteps, when } from "./model";
import { useStrict, type DraftRef, type TaskRef } from "./Strict";
import { EASE, Figure, Icon, Key, Lbl, ReceiptTrack, Segmented, Sheet, VoiceClip, buzz, cx } from "./ui";

export function Sheets() {
  const s = useStrict();
  const sh = s.sheet;
  const close = () => s.setSheet(null);
  return (
    <>
      <ThreadSheet open={sh?.kind === "thread"} taskId={sh?.kind === "thread" ? sh.taskId : ""} compose={sh?.kind === "thread" ? Boolean(sh.compose) : false} onClose={close} />
      <ActionsSheet open={sh?.kind === "actions"} taskId={sh?.kind === "actions" ? sh.taskId : ""} onClose={close} />
      <PickerSheet open={sh?.kind === "picker"} target={sh?.kind === "picker" ? sh.target : null} onClose={close} />
      <DeadlineSheet open={sh?.kind === "deadline"} target={sh?.kind === "deadline" ? sh.target : null} onClose={close} />
      <RepeatSheet open={sh?.kind === "repeat"} draftId={sh?.kind === "repeat" ? sh.draftId : ""} onClose={close} />
      <EventSheet open={sh?.kind === "event"} eventId={sh?.kind === "event" ? sh.eventId : ""} onClose={close} />
      <KeptSheet open={sh?.kind === "kept"} onClose={close} />
      <ErrandSheet open={sh?.kind === "errand"} code={sh?.kind === "errand" ? sh.code : ""} onClose={close} />
      <InstallSheet open={sh?.kind === "service"} onClose={close} />
    </>
  );
}

// ---- the thread ---------------------------------------------------------------------------------

function ThreadSheet({ open, taskId, compose, onClose }: { open: boolean; taskId: string; compose: boolean; onClose: () => void }) {
  const s = useStrict();
  const t = s.tasks.find((x) => x.id === taskId);
  const p = personById(t?.assigneeId);
  const kind = t ? messageKind(t) : null;
  return (
    <Sheet
      open={open && Boolean(t)}
      onClose={onClose}
      tall
      testId="thread"
      label={
        <span className="flex items-center gap-2">
          <Lbl tone="ink">{p?.short}</Lbl>
          <Lbl>· {p?.position}</Lbl>
          {t ? <Lbl tone={["overdue", "declined", "question", "review"].includes(t.lane) ? "seal" : "dim"}>· {kind === "time" ? "просит срок" : kind === "unread" ? "написал" : LANE_WORD[t.lane].toLowerCase()}</Lbl> : null}
        </span>
      }
      title={t?.title}
      footer={t ? <Composer key={t.id} taskId={t.id} autoFocus={compose} quick={t.question ? QUICK_ANSWERS[t.question.kind] : null} /> : null}
    >
      {t ? (
        <div className="px-5 pb-4 pt-3">
          <div className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1">
            <Lbl>Срок</Lbl>
            <span className="text-[14px]">{t.deadline ? when(t.deadline, s.now) : "без срока"}</span>
          </div>
          <div className="mt-3">
            <ReceiptTrack steps={receiptSteps(t)} compact />
          </div>
          <div className="mt-4" style={{ borderTop: "1px solid var(--line-2)" }}>
            {t.thread.length === 0 ? (
              <p className="py-5 text-center text-[13.5px]" style={{ color: "var(--text-3)" }}>
                Переписки пока нет.
              </p>
            ) : null}
            <AnimatePresence initial={false}>
              {t.thread.map((m) =>
                m.from === "system" ? (
                  <motion.div key={m.id} className="flex items-center gap-2 py-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <span className="h-px flex-1" style={{ background: "var(--line)" }} />
                    <span className="lbl" style={{ color: "var(--text-3)" }}>
                      {hhmm(m.at)} · {m.text}
                    </span>
                    <span className="h-px flex-1" style={{ background: "var(--line)" }} />
                  </motion.div>
                ) : (
                  <motion.div key={m.id} className={cx("flex py-2", m.from === "director" ? "justify-end" : "justify-start")} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: EASE }}>
                    <div
                      className="max-w-[86%] px-3.5 py-2.5"
                      style={
                        m.from === "director"
                          ? { background: "linear-gradient(180deg, rgba(255,51,85,.2), rgba(255,51,85,.06))", boxShadow: "inset 0 0 0 1px rgba(255,51,85,.55)", color: "var(--text)" }
                          : { background: "rgba(255,255,255,.04)", boxShadow: "inset 0 0 0 1px var(--line-2)", color: "var(--text)" }
                      }
                    >
                      <div className="mb-1 flex items-center justify-between gap-4">
                        <span className="lbl" style={{ color: m.from === "director" ? "var(--red-hi)" : "var(--text-3)" }}>
                          {m.from === "director" ? "Вы" : p?.short}
                        </span>
                        <span className="mono text-[11px]" style={{ color: "var(--text-3)" }}>
                          {hhmm(m.at)}
                        </span>
                      </div>
                      {m.voiceSec ? <VoiceClip sec={m.voiceSec} /> : null}
                      <p className="text-[15px] leading-[1.38]">{m.text}</p>
                    </div>
                  </motion.div>
                ),
              )}
            </AnimatePresence>
          </div>
        </div>
      ) : null}
    </Sheet>
  );
}

function Composer({ taskId, autoFocus, quick }: { taskId: string; autoFocus: boolean; quick: string[] | null }) {
  const s = useStrict();
  const [text, setText] = useState("");
  const [recAt, setRecAt] = useState<number | null>(null);
  const [sec, setSec] = useState(0);
  useEffect(() => {
    if (recAt === null) return;
    const id = window.setInterval(() => setSec(Math.floor((performance.now() - recAt) / 1000)), 200);
    return () => window.clearInterval(id);
  }, [recAt]);
  return (
    <div>
      {quick ? (
        <Segmented className="-mt-1 mb-2.5">
          {quick
            .filter((q) => q !== "Ответить словами")
            .map((q, i) => (
              <Key key={q} tone={i === 0 ? "ink" : "seg"} className="h-11 px-1.5 text-[13px] leading-tight" onClick={() => s.answer(taskId, q)}>
                {q}
              </Key>
            ))}
        </Segmented>
      ) : null}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          s.answer(taskId, text.trim());
          setText("");
        }}
      >
        <label className={cx("cut cut-s frame flex h-12 min-w-0 flex-1 items-center px-3", recAt !== null ? "frame-red" : "frame-cyan")} style={{ background: recAt !== null ? "linear-gradient(180deg, #FF4766, #C91D40)" : "rgba(255,255,255,.04)", color: recAt !== null ? "#fff" : "var(--text)" }}>
          {recAt !== null ? (
            <span className="flex w-full items-center gap-2 text-[15px]">
              <span className="block h-2.5 w-2.5" style={{ background: "#fff", animation: "strict-blink 1s steps(1) infinite" }} />
              Запись · <Figure value={`0:${String(sec).padStart(2, "0")}`} /> — отпустите
            </span>
          ) : (
            <input data-testid="composer" autoFocus={autoFocus} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ответить текстом" className="min-w-0 flex-1 bg-transparent text-[16px] outline-none" enterKeyHint="send" />
          )}
        </label>
        {text.trim() ? (
          <button type="submit" className="cut cut-s frame frame-cyan grid h-12 w-12 shrink-0 place-items-center" style={{ background: "rgba(70,228,255,.2)", color: "var(--cyan-hi)" }} aria-label="Отправить">
            <Icon name="send" size={18} />
          </button>
        ) : (
          <button
            type="button"
            className="cut cut-s frame frame-red grid h-12 w-12 shrink-0 select-none place-items-center"
            style={{ background: recAt !== null ? "#FF3355" : "rgba(255,51,85,.18)", color: recAt !== null ? "#fff" : "var(--red-hi)", touchAction: "none", boxShadow: recAt !== null ? "0 0 18px rgba(255,51,85,.6)" : "none" }}
            aria-label="Удерживайте — голосовое"
            onContextMenu={(e) => e.preventDefault()}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              buzz(10);
              setSec(0);
              setRecAt(performance.now());
            }}
            onPointerUp={() => {
              if (recAt === null) return;
              const d = Math.max(1, Math.round((performance.now() - recAt) / 1000));
              setRecAt(null);
              if (performance.now() - recAt < 600) {
                s.toast("Удерживайте, пока говорите");
                return;
              }
              s.answer(taskId, "Голосовое сообщение", d);
            }}
            onPointerCancel={() => setRecAt(null)}
          >
            <Icon name="mic" size={18} />
          </button>
        )}
      </form>
    </div>
  );
}

// ---- every move a task allows -------------------------------------------------------------------

const HINT: Record<string, string> = {
  Открыть: "переписка и голос",
  Ответить: "текстом или голосом",
  Срок: "новый срок — задача уйдёт из просрочки",
  Напомнить: "ещё один пуш, без шума",
  Передать: "другому человеку",
  Переназначить: "другому человеку",
  Отозвать: "задача исчезнет у сотрудника",
  Удалить: "насовсем",
  "Выдать снова": "та же задача, свежий срок",
  Принять: "задача закрыта",
  Доработать: "вернуть с замечанием",
  Настоять: "отказ не принят — задача снова у него",
  Отменить: "задача больше не нужна",
  "Отправить сейчас": "не ждать утра",
};

function ActionsSheet({ open, taskId, onClose }: { open: boolean; taskId: string; onClose: () => void }) {
  const s = useStrict();
  const t = s.tasks.find((x) => x.id === taskId);
  const lane = t ? LANE_KEYS[t.lane] : [];
  const list = [...lane, ...ALL_ACTIONS.filter((a) => !lane.includes(a))];
  return (
    <Sheet open={open && Boolean(t)} onClose={onClose} testId="actions" label={<span className="flex items-center gap-2"><Lbl tone="ink">Все действия</Lbl><Lbl>· {nameOf(t?.assigneeId)}</Lbl></span>} title={t?.title}>
      <ul className="px-5 pb-4">
        {list.map((k, i) => (
          <li key={k}>
            <button
              type="button"
              data-testid={`action-${k}`}
              className="flex min-h-[54px] w-full items-center gap-3 text-left"
              style={{ borderBottom: "1px solid var(--line)" }}
              onClick={() => {
                onClose();
                if (t) window.setTimeout(() => s.act(t.id, k), 0);
              }}
            >
              <span className="mono w-5 text-[11px]" style={{ color: "var(--text-3)" }}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="flex-1">
                <span className={cx("block text-[16.5px]", i < lane.length ? "font-semibold" : "font-medium")}>{k}</span>
                <span className="block text-[12.5px]" style={{ color: "var(--text-3)" }}>
                  {HINT[k] ?? ""}
                </span>
              </span>
              {UNDOABLE.has(k) ? <Lbl>5 с на отмену</Lbl> : i === 0 ? <Lbl tone="seal">главное</Lbl> : null}
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

// ---- «Кому?» ------------------------------------------------------------------------------------

function PickerSheet({ open, target, onClose }: { open: boolean; target: DraftRef | TaskRef | null; onClose: () => void }) {
  const s = useStrict();
  const [q, setQ] = useState("");
  const draft = target && "draftId" in target ? s.drafts.find((d) => d.id === target.draftId) : undefined;
  const task = target && "taskId" in target ? s.tasks.find((t) => t.id === target.taskId) : undefined;
  const candidates = draft?.kind === "task" ? (draft.candidates ?? []) : task?.decline?.suggestion ? ["p-erlanb"] : [];
  const heard = draft?.kind === "task" ? draft.heardName : undefined;
  const filter = (id: string) => !q || nameOf(id).toLowerCase().includes(q.toLowerCase()) || (personById(id)?.position.toLowerCase().includes(q.toLowerCase()) ?? false);
  const rest = EMPLOYEES.map((p) => p.id).filter((id) => !candidates.includes(id) && id !== task?.assigneeId && filter(id));
  const pick = (id: string) => {
    buzz([6, 30, 10]);
    if (draft) s.setDrafts((list) => list.map((d) => (d.id === draft.id && d.kind === "task" ? ({ ...d, assigneeId: id, heardName: undefined } as Draft) : d)));
    if (task) s.reassign(task.id, id);
    setQ("");
    onClose();
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      tall
      testId="picker"
      label={<span className="flex items-center gap-2"><Lbl tone="seal">Кому?</Lbl>{heard ? <Lbl>· слышал «{heard}»</Lbl> : task ? <Lbl>· вместо {nameOf(task.assigneeId)}</Lbl> : null}</span>}
      title={draft?.kind === "task" ? draft.title : task?.title}
    >
      <div className="px-5 pb-5 pt-3">
        <label className="cut cut-s frame frame-cyan flex h-12 items-center gap-2 px-3" style={{ background: "rgba(255,255,255,.04)" }}>
          <span className="lbl">Найти</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="имя или должность" className="min-w-0 flex-1 bg-transparent text-[16px] outline-none" />
        </label>
        {candidates.filter(filter).length ? (
          <>
            <div className="mt-4">
              <Lbl tone="seal">{heard ? `Похоже на «${heard}»` : "Предлагает сам сотрудник"}</Lbl>
            </div>
            <div className="mt-1.5" style={{ borderTop: "1px solid rgba(70,228,255,.6)" }}>
              {candidates.filter(filter).map((id) => (
                <PersonRow key={id} id={id} strong onPick={pick} />
              ))}
            </div>
          </>
        ) : null}
        <div className="mt-5">
          <Lbl tone="ink">Вся команда</Lbl>
        </div>
        <div className="mt-1.5" style={{ borderTop: "1px solid var(--line-2)" }}>
          {rest.map((id) => (
            <PersonRow key={id} id={id} onPick={pick} />
          ))}
        </div>
      </div>
    </Sheet>
  );
}

function PersonRow({ id, strong, onPick }: { id: string; strong?: boolean; onPick: (id: string) => void }) {
  const s = useStrict();
  const p = personById(id)!;
  const load = s.tasks.filter((t) => t.assigneeId === id).length;
  const away = isAway(id, s.now);
  return (
    <button type="button" data-testid={`pick-${id}`} className={cx("flex w-full items-center gap-3 text-left", strong ? "min-h-[64px]" : "min-h-[54px]")} style={{ borderBottom: "1px solid var(--line)" }} onClick={() => onPick(id)}>
      <span className="grid h-9 w-9 shrink-0 place-items-center text-[12.5px] font-semibold" style={{ background: strong ? "rgba(70,228,255,.18)" : away ? "transparent" : "rgba(255,255,255,.05)", color: strong ? "var(--cyan-hi)" : away ? "var(--text-3)" : "var(--text)", boxShadow: strong ? "inset 0 0 0 1px rgba(70,228,255,.8), 0 0 12px rgba(70,228,255,.25)" : away ? "none" : "inset 0 0 0 1px var(--line-2)", border: away ? "1.5px dashed var(--text-3)" : "none", fontFamily: "var(--display)", fontStretch: "82%" }}>
        {p.initials}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cx("block", strong ? "text-[17px] font-semibold" : "text-[15.5px] font-medium")}>{p.short === p.fullName.split(" ")[0] ? p.fullName : `${p.fullName}`}</span>
        <span className="block text-[12.5px]" style={{ color: "var(--text-3)" }}>
          {p.position}
          {away && p.awayUntil ? ` · ${p.awayWhy} до ${dayLabel(p.awayUntil, s.now).replace(/^\S+, /, "")}` : ""}
        </span>
      </span>
      <span className="shrink-0 text-[12px]" style={{ color: "var(--text-3)" }}>
        {load ? `${load} в работе` : g(id, "свободен", "свободна")}
      </span>
    </button>
  );
}

// ---- deadline & repeat --------------------------------------------------------------------------

function DeadlineSheet({ open, target, onClose }: { open: boolean; target: DraftRef | TaskRef | null; onClose: () => void }) {
  const s = useStrict();
  const options: { label: string; iso: string | null }[] = [
    { label: "Сегодня 18:00", iso: at(0, 18, 0) },
    { label: "Завтра 12:00", iso: at(1, 12, 0) },
    { label: "Завтра 18:00", iso: at(1, 18, 0) },
    { label: "Через 3 дня, 18:00", iso: at(3, 18, 0) },
    { label: "Без срока", iso: null },
  ];
  const draft = target && "draftId" in target ? s.drafts.find((d) => d.id === target.draftId) : undefined;
  const task = target && "taskId" in target ? s.tasks.find((t) => t.id === target.taskId) : undefined;
  const current = draft?.kind === "task" ? draft.deadline : task?.deadline ?? null;
  return (
    <Sheet open={open} onClose={onClose} testId="deadline" label={<Lbl tone="ink">Срок</Lbl>} title={draft?.kind === "task" ? draft.title : task?.title}>
      <div className="px-5 pb-5">
        {task?.timeRequest ? (
          <p className="pt-3 text-[13.5px]" style={{ color: "var(--text-2)" }}>
            {nameOf(task.assigneeId)} просит: {when(task.timeRequest.proposed, s.now)}
          </p>
        ) : null}
        {options.map((o) => {
          const on = (o.iso ?? "") === (current ?? "");
          return (
            <button
              key={o.label}
              type="button"
              className="flex min-h-[54px] w-full items-center justify-between text-left"
              style={{ borderBottom: "1px solid var(--line)" }}
              onClick={() => {
                buzz(6);
                if (draft) s.setDrafts((list) => list.map((d) => (d.id === draft.id && d.kind === "task" ? { ...d, deadline: o.iso } : d)));
                if (task && target && "taskId" in target) s.setDeadline(task.id, o.iso, target.key);
                onClose();
              }}
            >
              <span className={cx("text-[16.5px]", on ? "font-semibold" : "font-medium")}>{o.label}</span>
              {o.iso ? <span className="mono text-[12px]" style={{ color: "var(--text-3)" }}>{dayLabel(o.iso, s.now)} {hhmm(o.iso)}</span> : null}
              {on ? <span className="ml-3 block h-2.5 w-2.5 rotate-45" style={{ background: "var(--cyan)", boxShadow: "0 0 8px rgba(70,228,255,.9)" }} /> : null}
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}

const REPEATS = ["Без повтора", "Каждый день в 9:00", "По будням в 9:00", "Каждый понедельник в 9:00", "Раз в месяц, 1-го числа"];

function RepeatSheet({ open, draftId, onClose }: { open: boolean; draftId: string; onClose: () => void }) {
  const s = useStrict();
  const d = s.drafts.find((x) => x.id === draftId);
  const current = d?.kind === "task" ? (d.repeat ?? "Без повтора") : "";
  return (
    <Sheet open={open} onClose={onClose} testId="repeat" label={<Lbl tone="ink">Повтор</Lbl>} title={d?.kind === "task" ? d.title : ""}>
      <div className="px-5 pb-5">
        {REPEATS.map((r) => (
          <button
            key={r}
            type="button"
            className="flex min-h-[54px] w-full items-center justify-between text-left"
            style={{ borderBottom: "1px solid var(--line)" }}
            onClick={() => {
              buzz(6);
              s.setDrafts((list) => list.map((x) => (x.id === draftId && x.kind === "task" ? { ...x, repeat: r === "Без повтора" ? undefined : r.toLowerCase() } : x)));
              onClose();
            }}
          >
            <span className={cx("text-[16.5px]", current.toLowerCase() === r.toLowerCase() ? "font-semibold" : "font-medium")}>{r}</span>
            {current.toLowerCase() === r.toLowerCase() ? <span className="block h-2.5 w-2.5 rotate-45" style={{ background: "var(--cyan)", boxShadow: "0 0 8px rgba(70,228,255,.9)" }} /> : null}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

// ---- an event -----------------------------------------------------------------------------------

function EventSheet({ open, eventId, onClose }: { open: boolean; eventId: string; onClose: () => void }) {
  const s = useStrict();
  const e = EVENTS.find((x) => x.id === eventId);
  return (
    <Sheet open={open && Boolean(e)} onClose={onClose} testId="event" label={<span className="flex items-center gap-2"><Lbl tone="ink">Встреча</Lbl>{e ? <Lbl>· {dayLabel(e.startsAt, s.now)}</Lbl> : null}</span>} title={e?.title}>
      {e ? (
        <div className="px-5 pb-5 pt-3">
          <div className="flex items-end gap-3">
            <span className="num text-[44px] font-semibold leading-none">{hhmm(e.startsAt)}</span>
            <span className="pb-1 text-[15px]" style={{ color: "var(--text-2)" }}>
              до {hhmm(e.endsAt)} · {e.place}
            </span>
          </div>
          <div className="mt-5 flex items-center justify-between">
            <Lbl tone="ink">Ответы</Lbl>
            <Lbl>
              {e.people.filter((p) => p.answer !== "none").length} из {e.people.length} ответили
            </Lbl>
          </div>
          <div className="mt-1.5" style={{ borderTop: "1px solid var(--line-2)" }}>
            {e.people.map((p) => (
              <div key={p.id} className="flex min-h-[48px] items-center gap-3" style={{ borderBottom: "1px solid var(--line)" }}>
                <span className="block h-2.5 w-2.5 shrink-0 rotate-45" style={{ background: p.answer === "yes" ? "var(--cyan)" : "transparent", border: p.answer === "no" ? "1.5px solid var(--text-2)" : p.answer === "none" ? "1.5px dashed var(--text-3)" : "none", boxShadow: p.answer === "yes" ? "0 0 6px rgba(70,228,255,.8)" : "none" }} />
                <span className="flex-1 text-[15.5px]">{nameOf(p.id)}</span>
                <span className="text-[13px]" style={{ color: p.answer === "none" ? "var(--text-3)" : "var(--text-2)" }}>
                  {p.answer === "none" ? (isAway(p.id, s.now) ? "в отпуске" : "не ответил") : ANSWER_WORD[p.answer]}
                </span>
              </div>
            ))}
          </div>
          {e.people.some((p) => p.answer === "none") ? (
            <div className="mt-4">
              <Key
                tone="line"
                onClick={() => {
                  onClose();
                  s.toast("Напомнил тем, кто не ответил");
                }}
              >
                Напомнить не ответившим
              </Key>
            </div>
          ) : null}
        </div>
      ) : null}
    </Sheet>
  );
}

// ---- phrases kept on the phone ------------------------------------------------------------------

function KeptSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useStrict();
  return (
    <Sheet open={open} onClose={onClose} testId="kept" label={<Lbl tone="ink">На телефоне</Lbl>} title={s.keptCount === 1 ? "1 фраза ждёт сети" : `${s.keptCount} фразы ждут сети`}>
      <div className="px-5 pb-5 pt-3">
        <div className="p-3" style={{ border: "1.5px dashed rgba(255,129,151,.6)", background: "rgba(255,51,85,.05)" }}>
          <div className="flex items-center justify-between">
            <Lbl tone="ink">Голос · {hhmm(s.now.toISOString())}</Lbl>
            <Lbl>ждёт сети</Lbl>
          </div>
          <VoiceClip sec={12} wide />
        </div>
        <p className="mt-3 text-[13.5px] leading-[1.45]" style={{ color: "var(--text-2)" }}>
          Запись не потеряется. Как только появится связь, фраза уйдёт в разбор сама — и ляжет карточками на Пульсе.
        </p>
      </div>
    </Sheet>
  );
}

// ---- an errand with a note and a time -----------------------------------------------------------

function ErrandSheet({ open, code, onClose }: { open: boolean; code: string; onClose: () => void }) {
  const s = useStrict();
  const a = SECRETARY_ACTIONS.find((x) => x.code === code);
  const [note, setNote] = useState("");
  const [time, setTime] = useState("Сейчас");
  return (
    <Sheet
      open={open && Boolean(a)}
      onClose={onClose}
      testId="errand"
      label={<span className="flex items-center gap-2"><Lbl tone="ink">Просьба</Lbl><Lbl>· {dative("s-zhanna")}</Lbl></span>}
      title={a ? `${a.icon} ${a.label}` : ""}
      footer={
        <Key
          tone="ink"
          className="h-12 w-full"
          onClick={() => {
            s.sendErrand(code, note.trim() || undefined, time === "Сейчас" ? undefined : time.toLowerCase());
            setNote("");
            setTime("Сейчас");
            onClose();
          }}
        >
          Отправить {dative("s-zhanna")}
        </Key>
      }
    >
      <div className="px-5 pb-4 pt-3">
        <Lbl>Примечание</Lbl>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={code === "come" ? "кого позвать — например, Олег" : "например: на двоих, без сахара"} className="cut cut-s mt-1.5 h-12 w-full px-3 text-[16px] outline-none" style={{ boxShadow: "inset 0 0 0 1px rgba(70,228,255,.5)", background: "rgba(255,255,255,.04)" }} />
        <div className="mt-4">
          <Lbl>Когда</Lbl>
        </div>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          {["Сейчас", "Через 10 мин", "К 11:00", "После встречи"].map((w) => (
            <button key={w} type="button" className="h-11 text-[14px] font-medium" style={{ boxShadow: `inset 0 0 0 1px ${time === w ? "rgba(70,228,255,.8)" : "var(--line-2)"}`, background: time === w ? "rgba(70,228,255,.16)" : "rgba(255,255,255,.03)", color: time === w ? "var(--cyan-hi)" : "var(--text)" }} onClick={() => setTime(w)}>
              {w}
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  );
}

// ---- install hint -------------------------------------------------------------------------------

function InstallSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} testId="install" label={<Lbl tone="ink">Служебное</Lbl>} title="Pulse на экране «Домой»">
      <div className="px-5 pb-5 pt-2">
        {["Откройте Pulse в Safari", "Нажмите «Поделиться» внизу экрана", "Выберите «На экран “Домой”»", "Запускайте Pulse с иконки — так приходят уведомления"].map((st, i) => (
          <div key={st} className="flex min-h-[52px] items-center gap-3" style={{ borderBottom: "1px solid var(--line)" }}>
            <span className="mono w-5 text-[11px]" style={{ color: "var(--text-3)" }}>
              0{i + 1}
            </span>
            <span className="text-[15.5px]">{st}</span>
          </div>
        ))}
        <p className="mt-3 text-[12.5px]" style={{ color: "var(--text-3)" }}>
          Подсказка не повторяется, пока вы её не попросите.
        </p>
      </div>
    </Sheet>
  );
}
