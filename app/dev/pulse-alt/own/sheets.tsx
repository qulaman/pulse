"use client";

/**
 * Sheets over the whole screen. Sheets about people (who gets it) are drawn in the sky's light;
 * sheets about the director's own things (a thread, a task's moves, the service lines) in the
 * ground's ink. Closing any of them returns exactly where he was.
 */
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

import {
  ALL_ACTIONS,
  EVENTS,
  PEOPLE,
  QUICK_ANSWERS,
  SERVICE,
  hhmm,
  personById,
  whenLabel,
  type Task,
} from "@/app/dev/pulse-alt/fixtures";

import { DEADLINE_CHOICES, INSTALL_STEPS, REPEAT_CHOICES } from "./data";
import { Timer } from "./key";
import { dative, receiptSteps, type Crew } from "./model";
import { LaneChip } from "./panels";
import type { KeptPhrase } from "./types";
import { C, Clip, Disc, Icon, Key, MONO, Press, Receipt, buzz, type IconName } from "./ui";

// ---- the thread ------------------------------------------------------------------------------------

export function ThreadBody({
  task,
  compose,
  onSend,
  onAnswer,
  onClose,
}: {
  task: Task;
  compose?: string;
  onSend: (taskId: string, text: string, voiceSec?: number) => void;
  onAnswer: (taskId: string, answer: string) => void;
  onClose: () => void;
}) {
  const p = personById(task.assigneeId);
  const [text, setText] = useState(compose ?? "");
  const [rec, setRec] = useState<number | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const holdT = useRef<number | null>(null);
  const len = task.thread.length;
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [len]);
  useEffect(() => {
    if (rec === null) return;
    const t = window.setInterval(() => setRec((s) => (s === null ? s : s + 1)), 1000);
    return () => window.clearInterval(t);
  }, [rec]);
  const stopRec = () => {
    if (rec !== null) {
      onSend(task.id, "Голосовое сообщение", Math.max(2, rec));
      setRec(null);
    }
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-start gap-3 px-4 pb-3 pt-1">
        <Disc initials={p?.initials ?? "?"} look="onInk" size={40} />
        <div className="min-w-0 flex-1">
          <div className="text-[13px]" style={{ color: C.onInk2 }}>
            {p?.short} · {p?.position}
          </div>
          <div className="text-[17px] font-semibold leading-[22px]" style={{ color: C.onInk }}>
            {task.title}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <LaneChip t={task} />
            <span className="text-[12px]" style={{ color: C.onInk3 }}>
              {task.deadline ? whenLabel(task.deadline) : "без срока"}
            </span>
          </div>
          <div className="mt-1.5">
            <Receipt steps={receiptSteps(task)} />
          </div>
        </div>
        <Press onClick={onClose} label="Закрыть" className="-mr-1 grid h-11 w-11 shrink-0 place-items-center rounded-full" style={{ background: C.ink3, color: C.onInk2 }}>
          <Icon name="close" size={18} />
        </Press>
      </div>
      <div className="h-px" style={{ background: C.line }} />
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {task.thread.length === 0 ? (
          <p className="py-8 text-center text-[14px]" style={{ color: C.onInk3 }}>
            Переписки пока нет. Скажите или напишите — {p?.short} увидит в задаче.
          </p>
        ) : null}
        <div className="flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {task.thread.map((m) =>
              m.from === "system" ? (
                <motion.div key={m.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="my-1 text-center text-[12px]" style={{ color: C.onInk3 }}>
                  {m.text} · <span style={MONO}>{hhmm(m.at)}</span>
                </motion.div>
              ) : (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 12, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ type: "spring", stiffness: 420, damping: 30 }}
                  className={`flex max-w-[84%] flex-col ${m.from === "director" ? "items-end self-end" : "items-start self-start"}`}
                >
                  <div
                    className={`rounded-[18px] px-3 py-2 text-[15px] leading-[20px] ${m.from === "director" ? "rounded-br-[6px]" : "rounded-bl-[6px]"}`}
                    style={m.from === "director" ? { background: "#2B3418", color: "#EEF7CF" } : { background: C.ink3, color: C.onInk }}
                  >
                    {m.voiceSec ? (
                      <div className="flex flex-col gap-1.5">
                        <Clip sec={m.voiceSec} seed={m.id.length + m.voiceSec} compact />
                        {m.text && m.text !== "Голосовое сообщение" ? <span className="text-[13.5px] leading-[18px] opacity-80">{m.text}</span> : null}
                      </div>
                    ) : (
                      m.text
                    )}
                  </div>
                  <span className="mt-0.5 px-1 text-[10.5px]" style={{ ...MONO, color: C.onInk3 }}>
                    {hhmm(m.at)}
                  </span>
                </motion.div>
              ),
            )}
          </AnimatePresence>
        </div>
      </div>
      {task.question ? (
        <div className="no-bar flex gap-1.5 overflow-x-auto px-4 pb-2">
          {QUICK_ANSWERS[task.question.kind]
            .filter((a) => a !== "Ответить словами")
            .map((a) => (
              <Key key={a} small kind="quiet" onClick={() => onAnswer(task.id, a)}>
                {a}
              </Key>
            ))}
        </div>
      ) : null}
      <div className="flex items-end gap-2 px-3 pb-3 pt-1">
        <div className="flex min-h-[48px] flex-1 items-center rounded-[24px] px-4" style={{ background: C.ink3 }}>
          {rec !== null ? (
            <span className="flex items-center gap-2 text-[15px]" style={{ color: C.onInk }}>
              <motion.span className="h-2.5 w-2.5 rounded-full" style={{ background: C.lime }} animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1, repeat: Infinity }} />
              Запись <Timer sec={rec} />
            </span>
          ) : (
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && text.trim()) {
                  onSend(task.id, text.trim());
                  setText("");
                }
              }}
              placeholder={p ? `Написать ${dative(p)}…` : "Написать…"}
              className="h-12 w-full bg-transparent text-[16px] outline-none placeholder:text-[#6E7880]"
              style={{ color: C.onInk, caretColor: C.lime, userSelect: "text" }}
            />
          )}
        </div>
        {text.trim() && rec === null ? (
          <Press
            onClick={() => {
              onSend(task.id, text.trim());
              setText("");
            }}
            label="Отправить"
            className="grid h-12 w-12 place-items-center rounded-full"
            style={{ background: C.lime, color: C.limeInk }}
          >
            <Icon name="send" size={20} stroke={2.2} />
          </Press>
        ) : (
          <motion.button
            type="button"
            aria-label={rec !== null ? "Отправить голосовое" : "Удержите — голосовое"}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              if (rec !== null) return;
              holdT.current = window.setTimeout(() => {
                holdT.current = null;
                buzz(10);
                setRec(0);
              }, 200);
            }}
            onPointerUp={() => {
              if (holdT.current) {
                // a tap: start (or stop) by tapping
                window.clearTimeout(holdT.current);
                holdT.current = null;
                if (rec === null) setRec(0);
                else stopRec();
                return;
              }
              stopRec();
            }}
            whileTap={{ scale: 0.92 }}
            className="grid h-12 w-12 place-items-center rounded-full"
            style={{ background: rec !== null ? C.lime : C.ink3, color: rec !== null ? C.limeInk : C.onInk, touchAction: "none" }}
          >
            <Icon name="voice" size={22} />
          </motion.button>
        )}
      </div>
    </div>
  );
}

// ---- every move of a task -------------------------------------------------------------------------

const ACTION_ICON: Record<string, IconName> = {
  Открыть: "arrowUpRight",
  Ответить: "chat",
  Срок: "clock",
  Напомнить: "bell",
  Передать: "swap",
  Отозвать: "undo",
  Удалить: "trash",
  "Выдать снова": "repeat",
};

export function ActionsBody({ task, onPick }: { task: Task; onPick: (action: string) => void }) {
  const p = personById(task.assigneeId);
  return (
    <div className="px-2 pb-3">
      <div className="px-3 pb-2">
        <div className="text-[12.5px]" style={{ color: C.onInk3 }}>
          Все действия · {p?.short}
        </div>
        <div className="text-[17px] font-semibold leading-[22px]" style={{ color: C.onInk }}>
          {task.title}
        </div>
      </div>
      {ALL_ACTIONS.map((a, i) => {
        const quiet = a === "Отозвать" || a === "Удалить";
        return (
          <motion.button
            key={a}
            type="button"
            onClick={() => onPick(a)}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.025 }}
            whileTap={{ scale: 0.98, backgroundColor: "rgba(255,255,255,.06)" }}
            className="flex h-[52px] w-full items-center gap-3.5 rounded-2xl px-3 text-left text-[16px]"
            style={{ color: quiet ? "#CFC6FF" : C.onInk }}
          >
            <span className="grid h-9 w-9 place-items-center rounded-full" style={{ background: C.ink3 }}>
              <Icon name={ACTION_ICON[a] ?? "chev"} size={18} />
            </span>
            {a}
            {a === "Отозвать" || a === "Удалить" ? (
              <span className="ml-auto text-[12px]" style={{ color: C.onInk3 }}>
                5 с на отмену
              </span>
            ) : null}
          </motion.button>
        );
      })}
    </div>
  );
}

// ---- who gets it: the people picker (light — it is about the team) -----------------------------------------

export function PickerBody({
  title,
  heard,
  candidates,
  crew,
  current,
  onPick,
}: {
  title: string;
  heard?: string;
  candidates: string[];
  crew: Crew[];
  current?: string | null;
  onPick: (id: string) => void;
}) {
  const rest = PEOPLE.filter((p) => p.role === "employee" && !candidates.includes(p.id));
  const status = (id: string) => crew.find((c) => c.id === id);
  const row = (id: string, strong = false) => {
    const p = personById(id)!;
    const s = status(id);
    const load = s ? s.tasks.filter((t) => t.lane !== "held").length : 0;
    return (
      <motion.button
        key={id}
        type="button"
        onClick={() => {
          buzz(10);
          onPick(id);
        }}
        whileTap={{ scale: 0.98 }}
        className="flex w-full items-center gap-3 rounded-[18px] px-3 text-left"
        style={{ minHeight: strong ? 64 : 54, background: strong ? "#FFFFFF" : "transparent", boxShadow: strong ? "0 6px 18px -10px rgba(40,60,80,.35)" : "none" }}
      >
        <Disc initials={p.initials} look={s?.altitude === "heavy" ? "heavy" : s?.altitude === "away" ? "away" : "work"} size={strong ? 42 : 36} />
        <span className="min-w-0 flex-1 leading-[18px]">
          <span className="block text-[15.5px] font-semibold" style={{ color: C.onSky }}>
            {p.short}
          </span>
          <span className="block truncate text-[12.5px]" style={{ color: C.onSky3 }}>
            {p.position}
            {p.awayUntil ? ` · ${s?.reason ?? "нет на месте"}` : load ? ` · задач: ${load}` : " · свободен"}
          </span>
        </span>
        {current === id ? <Icon name="check" size={20} style={{ color: C.limeDeep }} /> : strong && heard ? (
          <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: "rgba(16,20,24,.06)", color: C.onSky2 }}>
            похоже
          </span>
        ) : null}
      </motion.button>
    );
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-4 pb-2">
        <div className="text-[12.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: C.onSky3 }}>
          Кому
        </div>
        <div className="text-[18px] font-semibold leading-[23px]" style={{ color: C.onSky }}>
          {title}
        </div>
        {heard ? (
          <div className="mt-1 text-[13px]" style={{ color: C.onSky2 }}>
            Слышал «{heard}» — такого человека нет. Похоже на:
          </div>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {candidates.length ? (
          <div className="flex flex-col gap-1.5 px-1 pb-2">
            {candidates.map((id) => row(id, true))}
          </div>
        ) : null}
        <div className="px-3 pb-1 pt-2 text-[11.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: C.onSky3 }}>
          Вся команда
        </div>
        {rest.map((p) => row(p.id))}
      </div>
    </div>
  );
}

// ---- deadline and repeat -----------------------------------------------------------------------------------

export function ChoiceBody({ title, sub, choices, current, onPick }: { title: string; sub?: string; choices: { label: string; value: string; note?: string }[]; current?: string | null; onPick: (value: string) => void }) {
  return (
    <div className="px-2 pb-4">
      <div className="px-3 pb-2">
        <div className="text-[18px] font-semibold" style={{ color: C.onInk }}>
          {title}
        </div>
        {sub ? (
          <div className="text-[13px]" style={{ color: C.onInk2 }}>
            {sub}
          </div>
        ) : null}
      </div>
      {choices.map((c) => (
        <motion.button key={c.value} type="button" onClick={() => onPick(c.value)} whileTap={{ scale: 0.98 }} className="flex h-[52px] w-full items-center gap-3 rounded-2xl px-3 text-left text-[16px]" style={{ color: C.onInk }}>
          <span className="flex-1">{c.label}</span>
          {c.note ? (
            <span className="text-[12px]" style={{ ...MONO, color: C.onInk3 }}>
              {c.note}
            </span>
          ) : null}
          {current === c.value ? <Icon name="check" size={18} style={{ color: C.lime }} /> : null}
        </motion.button>
      ))}
    </div>
  );
}

export const deadlineChoices = () => DEADLINE_CHOICES.map((d) => ({ label: d.label, value: d.iso, note: whenLabel(d.iso) }));
export const repeatChoices = () => REPEAT_CHOICES.map((r) => ({ label: r, value: r }));

// ---- an event ---------------------------------------------------------------------------------------------

export function EventBody({ eventId, onRemind }: { eventId: string; onRemind: () => void }) {
  const e = EVENTS.find((x) => x.id === eventId);
  if (!e) return null;
  const groups = [
    { key: "yes", label: "Придут", tone: C.mint },
    { key: "none", label: "Не ответили", tone: C.onInk3 },
    { key: "no", label: "Не смогут", tone: C.lav },
  ] as const;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-4 pb-3">
        <div className="text-[13px]" style={{ ...MONO, color: C.onInk2 }}>
          {whenLabel(e.startsAt)}–{hhmm(e.endsAt)}
        </div>
        <div className="mt-0.5 text-[20px] font-semibold leading-[25px]" style={{ color: C.onInk }}>
          {e.title}
        </div>
        <div className="mt-1 flex items-center gap-1 text-[13.5px]" style={{ color: C.onInk2 }}>
          <Icon name="place" size={14} /> {e.place}
          {e.remindMin ? <span> · напомню за {e.remindMin} мин</span> : null}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4">
        {groups.map((g) => {
          const ppl = e.people.filter((x) => x.answer === g.key);
          if (!ppl.length) return null;
          return (
            <div key={g.key} className="mb-3">
              <div className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: g.tone }}>
                {g.label} · {ppl.length}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ppl.map(({ id }) => {
                  const p = personById(id);
                  return p ? (
                    <span key={id} className="inline-flex h-9 items-center gap-1.5 rounded-full pl-1 pr-3 text-[13.5px]" style={{ background: C.ink3, color: C.onInk }}>
                      <Disc initials={p.initials} look="onInk" size={28} style={{ background: "#3A4148" }} />
                      {p.short}
                      {p.awayUntil ? <span style={{ color: C.onInk3 }}>· в отпуске</span> : null}
                    </span>
                  ) : null;
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="px-4 pb-4 pt-2">
        <Key kind="primary" className="w-full" onClick={onRemind}>
          <Icon name="bell" size={17} /> Напомнить тем, кто не ответил
        </Key>
      </div>
    </div>
  );
}

// ---- service lines: only after the director's tap --------------------------------------------------------

export function ServiceBody({
  lines,
  kept,
  onPush,
  onDraft,
  onKept,
  onTeam,
  onInstalled,
}: {
  lines: { push: boolean; install: boolean; draft: boolean; team: boolean };
  onInstalled: () => void;
  kept: number;
  onPush: () => void;
  onDraft: () => void;
  onKept: () => void;
  onTeam: () => void;
}) {
  const [how, setHow] = useState(false);
  const line = (icon: IconName, text: string, action: string, onClick: () => void) => (
    <div key={text} className="flex items-center gap-3 rounded-[18px] p-3" style={{ background: C.ink3 }}>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ background: C.ink4, color: C.onInk }}>
        <Icon name={icon} size={18} />
      </span>
      <span className="min-w-0 flex-1 text-[14px] leading-[19px]" style={{ color: C.onInk }}>
        {text}
      </span>
      <Key small kind="light" onClick={onClick}>
        {action}
      </Key>
    </div>
  );
  const none = !lines.push && !lines.install && !lines.draft && !lines.team && !kept;
  return (
    <div className="flex flex-col gap-2 px-4 pb-5">
      <div className="pb-1 text-[18px] font-semibold" style={{ color: C.onInk }}>
        Служебное
      </div>
      {none ? (
        <p className="py-4 text-[14px]" style={{ color: C.onInk2 }}>
          Всё в порядке: уведомления включены, черновиков нет.
        </p>
      ) : null}
      {lines.team ? line("people", SERVICE.noTeam.text, SERVICE.noTeam.action, onTeam) : null}
      {lines.push ? line("bellOff", SERVICE.push.text, SERVICE.push.action, onPush) : null}
      {lines.install ? (
        <div className="rounded-[18px]" style={{ background: C.ink3 }}>
          <div className="flex items-center gap-3 p-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ background: C.ink4, color: C.onInk }}>
              <Icon name="home" size={18} />
            </span>
            <span className="min-w-0 flex-1 text-[14px] leading-[19px]" style={{ color: C.onInk }}>
              {SERVICE.install.text}
            </span>
            <Key small kind="light" onClick={() => setHow((v) => !v)}>
              {SERVICE.install.action}
            </Key>
          </div>
          <AnimatePresence initial={false}>
            {how ? (
              <motion.ol initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden px-4 pb-3">
                {INSTALL_STEPS.map((s, i) => (
                  <li key={s} className="flex gap-2 py-1 text-[13.5px]" style={{ color: C.onInk2 }}>
                    <span style={{ ...MONO, color: C.lime }}>{i + 1}</span> {s}
                  </li>
                ))}
                <li className="pt-1.5">
                  <Key small kind="ghost" onClick={onInstalled}>
                    Готово, стоит на экране
                  </Key>
                </li>
              </motion.ol>
            ) : null}
          </AnimatePresence>
        </div>
      ) : null}
      {lines.draft ? line("draft", SERVICE.draft.text, SERVICE.draft.action, onDraft) : null}
      {kept ? line("offline", `${kept} ${kept === 1 ? "фраза ждёт" : "фразы ждут"} сети`, SERVICE.keptPhrase.action, onKept) : null}
    </div>
  );
}

export function KeptBody({ items }: { items: KeptPhrase[] }) {
  return (
    <div className="px-4 pb-5">
      <div className="text-[18px] font-semibold" style={{ color: C.onInk }}>
        Ждёт сети
      </div>
      <p className="mt-0.5 text-[13px] leading-[18px]" style={{ color: C.onInk2 }}>
        Всё сохранено на телефоне и уйдёт само, как только появится сеть. Ничего не нужно повторять.
      </p>
      <div className="mt-3 flex flex-col gap-2">
        {items.map((k) => (
          <div key={k.id} className="rounded-[18px] p-3" style={{ background: C.ink3 }}>
            <div className="flex items-center gap-2 text-[12px]" style={{ color: C.onInk3 }}>
              <Icon name={k.kind === "voice" ? "voice" : "cup"} size={14} />
              {k.kind === "voice" ? "Фраза" : "Просьба Жанне"} · <span style={MONO}>{hhmm(k.at)}</span>
              <span className="ml-auto inline-flex items-center gap-1" style={{ color: C.amber }}>
                <motion.span className="h-1.5 w-1.5 rounded-full" style={{ background: C.amber }} animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.6, repeat: Infinity }} />
                ждёт сети
              </span>
            </div>
            <p className="mt-1.5 line-clamp-3 text-[14px] leading-[19px]" style={{ color: C.onInk }}>
              «{k.text}»
            </p>
            {k.kind === "voice" ? (
              <div className="mt-2">
                <Clip sec={k.sec} seed={9} compact />
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
