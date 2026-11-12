"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useRef, useState } from "react";

import {
  COMPANY,
  MEETING_NOW,
  QUICK_ANSWERS,
  RATING,
  SECRETARY_ACTIONS,
  SERVICE,
  TIME_REQUEST_KEYS,
  LANE_KEYS,
  dayLabel,
  hhmm,
  minutesAgo,
  personById,
  whenLabel,
  type CalendarEvent,
  type Task,
} from "@/app/dev/pulse-alt/fixtures";

import { ERRAND_WORD } from "./Board";
import { useApi } from "./ctx";
import { Deck, ReceiptRow } from "./Deck";
import { useHold } from "./hold";
import { crewOf, dative, hasMessage, laneNote, lanesOf, plural, spanLabel, todayEvents } from "./model";
import { Avatar, Btn, DOCK_CLEAR, Icon, Mark, Sheet, VoiceClip } from "./ui";

/** The second layer: one sheet per section of the board. */
export function Panels() {
  const api = useApi();
  const c = api.counts;
  const lanes = lanesOf(api.tasks);
  const kind = api.sheet;
  const person = personById(api.personId);
  const titles: Record<string, { title: React.ReactNode; sub?: React.ReactNode }> = {
    tasks: { title: "Задачи", sub: `Ждут решения ${c.attention} · в работе ${c.work}${lanes.held.length ? ` · утром ${lanes.held.length}` : ""}` },
    messages: { title: "Сообщения", sub: c.messages ? `${c.messages} ${plural(c.messages, ["разговор ждёт", "разговора ждут", "разговоров ждут"])} вас` : "Все ответы даны" },
    ether: { title: "Эфир", sub: "Объявления для всей команды" },
    calendar: { title: "Календарь", sub: `Сегодня · ${todayEvents().length} ${plural(todayEvents().length, ["встреча", "встречи", "встреч"])}, завтра · ${api.events.filter((e) => dayLabel(e.startsAt, api.now) === "завтра").length}` },
    rating: { title: "Рейтинг", sub: "Неделя · очки за дело" },
    person: { title: person?.short ?? "", sub: person ? `${person.position}${person.awayUntil ? ` · ${person.awayWhy} до ${dayLabel(person.awayUntil, api.now)}` : ""}` : undefined },
    secretary: { title: "Жанна", sub: api.deskAway ? `Все ушли · до ${hhmm(api.deskAway)}` : "Секретарь · у стола" },
  };
  const t = kind ? titles[kind] : null;
  return (
    <Sheet open={Boolean(kind)} onClose={api.closeSheet} title={t?.title} sub={t?.sub} right={kind === "person" && person ? <Avatar person={person} size={44} /> : undefined}>
      <div className="pc-scroll min-h-0 flex-1" style={{ paddingBottom: DOCK_CLEAR }}>
        {kind === "tasks" ? <Deck /> : null}
        {kind === "messages" ? <Messages /> : null}
        {kind === "ether" ? <Ether /> : null}
        {kind === "calendar" ? <Calendar /> : null}
        {kind === "rating" ? <Rating /> : null}
        {kind === "person" ? <PersonPanel /> : null}
        {kind === "secretary" ? <Secretary /> : null}
        {kind && kind !== "person" && kind !== "secretary" ? <ServiceLines /> : null}
      </div>
    </Sheet>
  );
}

const card = { background: "var(--card)", boxShadow: "var(--sh-1), inset 0 0 0 1px var(--line)" } as const;

// ---- Сообщения: a question answered with one tap (D-142) -----------------------------------------

function Messages() {
  const api = useApi();
  const [done, setDone] = useState<Record<string, string>>({});
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  // a question blocks work, a time request is a decision, unread words can wait a minute;
  // the order is taken once, so an answered card fades where it stood
  const [order] = useState(() =>
    api.tasks
      .filter(hasMessage)
      .sort((a, b) => rank(a) - rank(b) || msgAt(b).localeCompare(msgAt(a)))
      .map((t) => t.id),
  );
  const place = (t: Task) => (order.includes(t.id) ? order.indexOf(t.id) : order.length + rank(t));
  const list = api.tasks.filter((t) => hasMessage(t) || done[t.id]).sort((a, b) => place(a) - place(b));

  const finish = (task: Task, line: string, run: () => void) => {
    setDone((d) => ({ ...d, [task.id]: line }));
    run();
    timers.current.push(
      setTimeout(
        () =>
          setDone((d) => {
            const next = { ...d };
            delete next[task.id];
            return next;
          }),
        1600,
      ),
    );
  };

  if (!list.length) {
    return (
      <div className="flex items-start gap-3 px-5 pt-6">
        <Mark mood="happy" />
        <p className="pc-serif text-[19px] leading-[27px]" style={{ color: "var(--ink)" }}>
          Все ответы даны. Новый вопрос появится здесь и мыслью на Пульсе.
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3 px-4 pt-1">
      <AnimatePresence initial={false}>
        {list.map((task) => {
          const who = personById(task.assigneeId);
          const answered = done[task.id];
          return (
            <motion.li key={task.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0, marginTop: -12, transition: { duration: 0.28 } }} className="overflow-hidden">
              <div className="rounded-[22px] px-4 pt-3.5 pb-3.5" style={card}>
                <div className="flex items-center gap-2.5">
                  <Avatar person={who} size={32} tone="slate" />
                  <div className="min-w-0 flex-1 leading-tight">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-[15px] font-medium" style={{ color: "var(--ink)" }}>
                        {who?.short}
                      </span>
                      <span className="text-[12.5px]" style={{ color: "var(--ink-3)" }}>
                        {hhmm(answered ? api.now.toISOString() : msgAt(task))}
                      </span>
                    </div>
                    <div className="truncate text-[12.5px]" style={{ color: "var(--ink-3)" }}>
                      {task.title}
                    </div>
                  </div>
                  <button type="button" onClick={() => api.openThread(task.id, true)} className="pc-press -mr-1.5 inline-flex h-10 items-center gap-0.5 rounded-full px-2.5 text-[13.5px] font-medium" style={{ color: "var(--ink-2)" }}>
                    Ответить <Icon name="right" size={14} />
                  </button>
                </div>
                {answered ? (
                  <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mt-3 flex items-center gap-2 text-[14.5px]" style={{ color: "var(--olive-ink)" }}>
                    <Icon name="check" size={16} stroke={2.2} /> {answered}
                  </motion.div>
                ) : (
                  <MessageBody task={task} onDone={(line, run) => finish(task, line, run)} />
                )}
              </div>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}

const rank = (t: Task) => (t.question ? 0 : t.timeRequest ? 1 : 2);

function msgAt(t: Task): string {
  return t.question?.at ?? t.timeRequest?.at ?? t.unread?.at ?? t.createdAt;
}

function MessageBody({ task, onDone }: { task: Task; onDone: (line: string, run: () => void) => void }) {
  const api = useApi();
  const who = personById(task.assigneeId);
  if (task.timeRequest) {
    const tr = task.timeRequest;
    return (
      <>
        <div className="pc-serif mt-3 text-[18px] leading-[25px]" style={{ color: "var(--ink)" }}>
          Просит перенести на {whenLabel(tr.proposed, api.now)}
        </div>
        <div className="mt-1 text-[14px] leading-[19px]" style={{ color: "var(--ink-3)" }}>
          «{tr.why}» · сейчас срок {task.deadline ? whenLabel(task.deadline, api.now) : "не задан"}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {TIME_REQUEST_KEYS.map((k, i) => (
            <Btn
              key={k}
              kind={i === 0 ? "primary" : "quiet"}
              size="sm"
              onClick={() => (k === "Другой срок" ? api.act(task.id, k) : onDone(k === "Согласовать" ? `Согласовали: ${whenLabel(tr.proposed, api.now)}` : "Срок оставлен прежним", () => api.act(task.id, k)))}
            >
              {k}
            </Btn>
          ))}
        </div>
      </>
    );
  }
  if (task.question) {
    const q = task.question;
    return (
      <>
        <div className="pc-serif mt-3 text-[19px] leading-[26px]" style={{ color: "var(--ink)" }}>
          «{q.text}»
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {QUICK_ANSWERS[q.kind].map((a, i) => (
            <Btn
              key={a}
              kind={i === 0 ? "primary" : "quiet"}
              size="sm"
              onClick={() => {
                if (a === "Ответить словами") api.openThread(task.id, true);
                else onDone(`Ответили ${dative(who)}: «${a}»`, () => api.answer(task.id, a));
              }}
            >
              {a}
            </Btn>
          ))}
        </div>
      </>
    );
  }
  if (task.unread) {
    return (
      <>
        <div className="pc-serif mt-3 text-[19px] leading-[26px]" style={{ color: "var(--ink)" }}>
          «{task.unread.text}»
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Btn kind="primary" size="sm" onClick={() => onDone("Прочитано", () => api.act(task.id, "Прочитал"))}>
            Прочитал
          </Btn>
          <Btn kind="quiet" size="sm" onClick={() => api.openThread(task.id, true)}>
            Ответить
          </Btn>
        </div>
      </>
    );
  }
  return null;
}

// ---- Эфир ----------------------------------------------------------------------------------------

function Ether() {
  const api = useApi();
  return (
    <div className="flex flex-col gap-3 px-4 pt-1">
      <div className="flex items-center gap-3 rounded-[22px] px-4 py-3" style={{ background: "var(--oat)" }}>
        <Icon name="megaphone" size={20} style={{ color: "var(--ink-2)" }} />
        <span className="min-w-0 flex-1 text-[14px] leading-[19px]" style={{ color: "var(--ink-2)" }}>
          Новое — скажите <span className="pc-serif text-[15.5px] whitespace-nowrap italic">«всем: …»</span> или напишите строкой
        </span>
        <Btn kind="quiet" size="sm" onClick={() => api.setTyping(true, "Всем: ")}>
          Написать
        </Btn>
      </div>
      {api.ether.length === 0 ? (
        <p className="pc-serif px-1 pt-2 text-[18px]" style={{ color: "var(--ink-3)" }}>
          Объявлений пока нет.
        </p>
      ) : null}
      {api.ether.map((p) => (
        <motion.article key={p.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-[22px] px-4 pt-3.5 pb-3.5" style={card}>
          <div className="flex items-center gap-2 text-[12.5px]" style={{ color: "var(--ink-3)" }}>
            <span>{whenLabel(p.at, api.now)}</span>
            <span className="flex-1" />
            {p.voiceSec ? <VoiceClip sec={p.voiceSec} seed={p.voiceSec + 11} compact /> : null}
          </div>
          <p className="pc-serif mt-2 text-[18px] leading-[25px]" style={{ color: "var(--ink)", textWrap: "pretty" }}>
            {p.text}
          </p>
          <div className="mt-3 flex items-center gap-3">
            <div className="h-[5px] flex-1 overflow-hidden rounded-full" style={{ background: "var(--oat)" }}>
              <motion.div className="h-full rounded-full" initial={{ width: 0 }} animate={{ width: `${(p.read / p.of) * 100}%` }} transition={{ duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }} style={{ background: p.read === p.of ? "var(--olive)" : "var(--slate)" }} />
            </div>
            <span className="pc-num text-[13px]" style={{ color: "var(--ink-2)" }}>
              {p.read === 0 ? "отправлено" : `прочитали ${p.read} из ${p.of}`}
            </span>
          </div>
          {p.reactions && p.reactions.length ? (
            <div className="mt-2.5 flex gap-1.5">
              {p.reactions.map((r) => (
                <span key={r.emoji} className="inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[13px]" style={{ background: "var(--oat)", color: "var(--ink-2)" }}>
                  {r.emoji} <span className="pc-num">{r.count}</span>
                </span>
              ))}
            </div>
          ) : null}
        </motion.article>
      ))}
    </div>
  );
}

// ---- Календарь -----------------------------------------------------------------------------------

export function answersOf(e: CalendarEvent) {
  const yes = e.people.filter((p) => p.answer === "yes").length;
  const no = e.people.filter((p) => p.answer === "no").length;
  const none = e.people.filter((p) => p.answer === "none").length;
  return { yes, no, none };
}

export function AnswerFaces({ e, size = 26 }: { e: CalendarEvent; size?: number }) {
  const shown = e.people.slice(0, 5);
  return (
    <span className="inline-flex items-center gap-[3px]">
      {shown.map((p) => (
        <span key={p.id} className="relative">
          <Avatar person={personById(p.id)} size={size} tone={p.answer === "yes" ? "olive" : p.answer === "no" ? "clay" : "plain"} style={{ opacity: p.answer === "none" ? 0.75 : 1 }} />
        </span>
      ))}
      {e.people.length > shown.length ? (
        <span className="ml-1.5 text-[12.5px]" style={{ color: "var(--ink-3)" }}>
          +{e.people.length - shown.length}
        </span>
      ) : null}
    </span>
  );
}

function EventRow({ e }: { e: CalendarEvent }) {
  const api = useApi();
  const inMin = Math.round((new Date(e.startsAt).getTime() - api.now.getTime()) / 60_000);
  const today = dayLabel(e.startsAt, api.now) === "сегодня";
  const soon = today && inMin > 0 && inMin <= 60;
  const a = answersOf(e);
  return (
    <button type="button" onClick={() => api.setEvent(e.id)} className="pc-press flex w-full items-stretch gap-3.5 text-left">
      <div className="w-[52px] flex-none pt-3 text-right">
        <div className="pc-serif pc-num text-[20px] leading-[24px]" style={{ color: "var(--ink)" }}>
          {hhmm(e.startsAt)}
        </div>
        <div className="pc-num text-[12px]" style={{ color: "var(--ink-4)" }}>
          {hhmm(e.endsAt)}
        </div>
      </div>
      <div className="min-w-0 flex-1 rounded-[20px] px-4 py-3" style={{ ...card, boxShadow: soon ? "var(--sh-2), inset 0 0 0 1.5px color-mix(in srgb, var(--clay) 55%, transparent)" : card.boxShadow }}>
        {soon ? (
          <div className="pc-caps mb-1" style={{ color: inMin <= 15 ? "var(--clay-ink)" : "var(--ink-3)" }}>
            через {spanLabel(inMin)}
          </div>
        ) : null}
        <div className="text-[15.5px] leading-[20px] font-medium" style={{ color: "var(--ink)" }}>
          {e.title}
        </div>
        <div className="mt-0.5 flex items-center gap-1 text-[13px]" style={{ color: "var(--ink-3)" }}>
          <Icon name="pin" size={13} /> {e.place}
        </div>
        <div className="mt-2 flex items-center gap-2.5">
          <AnswerFaces e={e} size={24} />
          <span className="text-[12.5px]" style={{ color: "var(--ink-3)" }}>
            {[a.yes ? `${a.yes} да` : null, a.no ? `${a.no} нет` : null, a.none ? `${a.none} ${plural(a.none, ["молчит", "молчат", "молчат"])}` : null].filter(Boolean).join(" · ")}
          </span>
        </div>
      </div>
    </button>
  );
}

function Calendar() {
  const api = useApi();
  const today = api.events.filter((e) => dayLabel(e.startsAt, api.now) === "сегодня");
  const tomorrow = api.events.filter((e) => dayLabel(e.startsAt, api.now) === "завтра");
  return (
    <div className="flex flex-col gap-2.5 px-4 pt-1">
      {today.length === 0 ? (
        <p className="pc-serif px-1 text-[18px]" style={{ color: "var(--ink-3)" }}>
          Сегодня встреч нет.
        </p>
      ) : null}
      {today.map((e) => (
        <EventRow key={e.id} e={e} />
      ))}
      {tomorrow.length ? (
        <div className="pc-caps mt-4 mb-0.5 pl-[66px]" style={{ color: "var(--ink-3)" }}>
          Завтра
        </div>
      ) : null}
      {tomorrow.map((e) => (
        <EventRow key={e.id} e={e} />
      ))}
    </div>
  );
}

// ---- Рейтинг -----------------------------------------------------------------------------------

function Rating() {
  const api = useApi();
  const d = api.disputes[0];
  return (
    <div className="flex flex-col gap-3 px-4 pt-1">
      <AnimatePresence initial={false}>
        {d ? (
          <motion.div key={d.id} layout exit={{ opacity: 0, height: 0, transition: { duration: 0.25 } }} className="overflow-hidden">
            <div className="rounded-[22px] px-4 pt-3.5 pb-3.5" style={card}>
              <div className="pc-caps" style={{ color: "var(--clay-ink)" }}>
                Спор · ждёт вас
              </div>
              <div className="mt-2 flex items-center gap-2.5">
                <Avatar person={personById(d.personId)} size={32} tone="clay" />
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="text-[15px] font-medium" style={{ color: "var(--ink)" }}>
                    {personById(d.personId)?.short} оспаривает штраф
                  </div>
                  <div className="text-[12.5px]" style={{ color: "var(--ink-3)" }}>
                    {d.reason} · {hhmm(d.at)}
                  </div>
                </div>
                <span className="pc-serif pc-num text-[24px]" style={{ color: "var(--clay-ink)" }}>
                  {d.amount}
                </span>
              </div>
              <p className="pc-serif mt-2.5 text-[17.5px] leading-[24px] italic" style={{ color: "var(--ink-2)" }}>
                «{d.plea}»
              </p>
              <div className="mt-3 flex gap-2">
                {d.keys.map((k, i) => (
                  <Btn key={k} kind={i === 0 ? "primary" : "quiet"} className="flex-1" onClick={() => api.resolveDispute(d.id, k)}>
                    {k}
                  </Btn>
                ))}
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <ol className="overflow-hidden rounded-[22px]" style={card}>
        {RATING.map((r, i) => {
          const p = personById(r.personId);
          return (
            <motion.li key={r.personId} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} className="flex min-h-[56px] items-center gap-3 px-4" style={{ borderTop: i ? "1px solid var(--line)" : "none" }}>
              <span className="pc-serif pc-num w-5 text-center text-[20px]" style={{ color: i === 0 ? "var(--clay-ink)" : "var(--ink-3)" }}>
                {r.place}
              </span>
              <Avatar person={p} size={32} tone={i === 0 ? "clay" : "plain"} />
              <span className="min-w-0 flex-1 text-[15px]" style={{ color: "var(--ink)" }}>
                {p?.short}
              </span>
              <span className="inline-flex w-9 items-center justify-end gap-0.5 text-[12.5px]" style={{ color: r.delta > 0 ? "var(--olive-ink)" : r.delta < 0 ? "var(--clay-ink)" : "var(--ink-4)" }}>
                {r.delta > 0 ? `▲${r.delta}` : r.delta < 0 ? `▼${-r.delta}` : "—"}
              </span>
              <span className="pc-serif pc-num w-10 text-right text-[19px]" style={{ color: "var(--ink)" }}>
                {r.points}
              </span>
            </motion.li>
          );
        })}
      </ol>
      {!COMPANY.pointsEnabled ? null : (
        <p className="px-1 text-[12.5px]" style={{ color: "var(--ink-4)" }}>
          Очки дают голосом: «плюс пять Ерлану за быстрый заказ».
        </p>
      )}
    </div>
  );
}

// ---- a person: their tasks and the director's keys; the composer is pinned to them (D-84) ---------

function PersonPanel() {
  const api = useApi();
  const person = personById(api.personId);
  if (!person) return null;
  const mine = api.tasks.filter((t) => t.assigneeId === person.id);
  const member = crewOf(api.tasks).busy.find((m) => m.person.id === person.id);
  return (
    <div className="flex flex-col gap-3 px-4 pt-1">
      <div className="flex items-start gap-3 rounded-[22px] px-4 py-3.5" style={{ background: "var(--oat)" }}>
        <Mark mood="calm" />
        <p className="pc-serif min-w-0 flex-1 text-[17.5px] leading-[25px]" style={{ color: "var(--ink)" }}>
          {person.awayUntil
            ? `${person.short} ${person.awayWhy} до ${dayLabel(person.awayUntil, api.now)}. Задача дождётся возвращения.`
            : mine.length === 0
              ? `${person.short} сейчас без задач. Удержите микрофон внизу — задача уйдёт ${dative(person)}.`
              : `${mine.length} ${plural(mine.length, ["задача", "задачи", "задач"])}${member?.move ? ", есть ваш ход" : ", всё идёт своим ходом"}. Удержите микрофон — новая уйдёт ${dative(person)}.`}
        </p>
      </div>
      {mine.map((t) => {
        const note = laneNote(t);
        const keys = t.question || t.timeRequest || t.unread ? ["Ответить"] : LANE_KEYS[t.lane];
        return (
          <div key={t.id} className="rounded-[22px] px-4 pt-3 pb-3.5" style={card}>
            <button type="button" onClick={() => api.openThread(t.id)} className="block w-full text-left">
              <div className="pc-caps" style={{ color: note.tone === "clay" ? "var(--clay-ink)" : note.tone === "olive" ? "var(--olive-ink)" : note.tone === "slate" ? "var(--slate-ink)" : "var(--ink-3)" }}>
                {note.label}
              </div>
              <div className="pc-serif mt-1 text-[18.5px] leading-[24px]" style={{ color: "var(--ink)" }}>
                {t.title}
              </div>
              {t.question || t.unread ? (
                <div className="mt-1 text-[14px] leading-[19px]" style={{ color: "var(--ink-2)" }}>
                  «{t.question?.text ?? t.unread?.text}»
                </div>
              ) : null}
              <div className="mt-1.5 text-[13px]" style={{ color: "var(--ink-3)" }}>
                {t.deadline ? `срок ${whenLabel(t.deadline, api.now)}` : "без срока"}
              </div>
            </button>
            <div className="mt-2">
              <ReceiptRow task={t} />
            </div>
            <div className="mt-3 flex gap-2">
              {keys.slice(0, 2).map((k, i) => (
                <Btn key={k} kind={i === 0 ? "primary" : "quiet"} size="sm" onClick={() => api.act(t.id, k)}>
                  {k}
                </Btn>
              ))}
              <span className="flex-1" />
              <Btn kind="ghost" size="sm" onClick={() => api.openActions(t.id)} style={{ paddingInline: 10 }}>
                Ещё
              </Btn>
            </div>
          </div>
        );
      })}
      <Btn kind="quiet" icon="type" onClick={() => api.setTyping(true)} className="self-start">
        Написать задачу строкой
      </Btn>
    </div>
  );
}

// ---- the secretary's keys: hold 2 s — sends; a short tap — a note and a time (D-101) ---------------

function Secretary() {
  const api = useApi();
  const [open, setOpen] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [when, setWhen] = useState("Сейчас");
  const action = SECRETARY_ACTIONS.find((a) => a.code === open);
  const speak = useHold({ delay: 260, onHoldStart: () => api.holdStart(true), onHoldMove: api.holdMove, onHoldEnd: api.holdEnd, onHoldCancel: api.holdCancel, onTap: () => api.toast("Удержите и скажите своими словами") });
  const meetingEnd = hhmm(MEETING_NOW.endsAt);
  return (
    <div className="flex flex-col gap-3 px-4 pt-1">
      {api.deskAway ? (
        <div className="flex items-start gap-3 rounded-[22px] px-4 py-3.5" style={{ background: "var(--oat)" }}>
          <Mark mood="calm" />
          <p className="pc-serif min-w-0 flex-1 text-[17.5px] leading-[25px]" style={{ color: "var(--ink)" }}>
            В приёмной никого до {hhmm(api.deskAway)}. Просьбы дождутся — Жанна увидит их, как вернётся.
          </p>
        </div>
      ) : null}
      <AnimatePresence initial={false}>
        {api.meetingOffer === "ask" ? (
          <motion.div key="offer" exit={{ opacity: 0, height: 0, transition: { duration: 0.25 } }} className="overflow-hidden">
            <div className="rounded-[22px] px-4 py-3.5" style={{ background: "var(--oat)" }}>
              <div className="flex items-start gap-3">
                <Mark mood="calm" />
                <p className="pc-serif min-w-0 flex-1 text-[17.5px] leading-[25px]" style={{ color: "var(--ink)" }}>
                  Вы на совещании с инвестором до {meetingEnd}. Попросить Жанну никого не пускать?
                </p>
              </div>
              <div className="mt-3 flex gap-2">
                <Btn kind="primary" size="sm" className="flex-1" onClick={() => api.answerMeeting(true)}>
                  🔕 Не беспокоить до {meetingEnd}
                </Btn>
                <Btn kind="quiet" size="sm" onClick={() => api.answerMeeting(false)}>
                  Не нужно
                </Btn>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {api.errands.length ? (
        <ul className="overflow-hidden rounded-[22px]" style={card}>
          {api.errands.map((e, i) => {
            const a = SECRETARY_ACTIONS.find((x) => x.code === e.code);
            const steps = ["asked", "seen", "doing", "done"];
            const at = steps.indexOf(e.status);
            return (
              <li key={e.id} className="flex min-h-[58px] items-center gap-3 px-4 py-2.5" style={{ borderTop: i ? "1px solid var(--line)" : "none" }}>
                <span className="text-[22px]">{a?.icon ?? "🎙"}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] leading-[19px]" style={{ color: "var(--ink)" }}>
                    {e.label}
                    {e.note ? <span style={{ color: "var(--ink-3)" }}> → {e.note}</span> : null}
                  </span>
                  <span className="mt-1 flex items-center gap-1">
                    {steps.slice(0, 3).map((s, k) => (
                      <span key={s} className="h-[3px] w-5 rounded-full" style={{ background: e.status === "waiting" ? "var(--line-2)" : k <= at ? "var(--olive)" : "var(--line-2)" }} />
                    ))}
                    <span className="ml-1.5 text-[12.5px]" style={{ color: e.status === "waiting" ? "var(--ink-3)" : "var(--olive-ink)" }}>
                      {e.status === "doing" && (e.code === "coffee" || e.code === "tea") ? "несёт" : ERRAND_WORD[e.status]}
                      {e.status === "doing" && e.etaMin ? ` · ${e.etaMin} мин` : ""} · {minutesAgo(e.at, api.now) <= 0 ? "только что" : `${spanLabel(minutesAgo(e.at, api.now))} назад`}
                    </span>
                  </span>
                </span>
                {e.status === "done" && COMPANY.pointsEnabled ? (
                  <Btn kind="quiet" size="sm" onClick={() => api.thank(e.id)}>
                    Спасибо
                  </Btn>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className="grid grid-cols-4 gap-2">
        {SECRETARY_ACTIONS.map((a) => (
          <ErrandKey key={a.code} code={a.code} label={a.label} icon={a.icon} active={open === a.code} onTap={() => setOpen(open === a.code ? null : a.code)} onSend={() => api.errand(a.code)} />
        ))}
        <button
          type="button"
          {...speak}
          className="pc-press flex h-[84px] touch-none flex-col items-center justify-center gap-1.5 rounded-[18px] text-[12px] leading-[14px]"
          style={{ background: "var(--clay-soft)", color: "var(--clay-ink)" }}
        >
          <Icon name="mic" size={22} />
          Своими словами
        </button>
      </div>
      <p className="px-1 text-center text-[12.5px]" style={{ color: "var(--ink-3)" }}>
        Удержите 2 секунды — отправится. Коротко — примечание и время.
      </p>

      <AnimatePresence initial={false}>
        {action ? (
          <motion.div key={action.code} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="rounded-[22px] px-4 py-3.5" style={card}>
              <div className="text-[15px] font-medium" style={{ color: "var(--ink)" }}>
                {action.icon} {action.label}
              </div>
              <input
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder={action.code === "come" ? "Кого позвать?" : "Примечание: кому, сколько"}
                className="mt-2.5 h-11 w-full rounded-[12px] px-3 text-[15px] outline-none"
                style={{ background: "var(--oat)", color: "var(--ink)" }}
              />
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {["Сейчас", "Через 10 мин", "К 12:00"].map((w) => (
                  <button key={w} type="button" onClick={() => setWhen(w)} className="pc-press inline-flex h-9 items-center rounded-full px-3 text-[13.5px]" style={{ background: when === w ? "var(--btn)" : "var(--oat)", color: when === w ? "var(--on-btn)" : "var(--ink-2)" }}>
                    {w}
                  </button>
                ))}
              </div>
              <Btn
                kind="primary"
                className="mt-3 w-full"
                onClick={() => {
                  api.errand(action.code, noteText.trim() || undefined, when === "Сейчас" ? undefined : when.toLowerCase());
                  setOpen(null);
                  setNoteText("");
                  setWhen("Сейчас");
                }}
              >
                Попросить Жанну
              </Btn>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function ErrandKey({ code, label, icon, active, onTap, onSend }: { code: string; label: string; icon: string; active: boolean; onTap: () => void; onSend: () => void }) {
  const [filling, setFilling] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const downAt = useRef(0);
  const sent = useRef(false);
  return (
    <button
      type="button"
      data-code={code}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture?.(e.pointerId);
        downAt.current = e.timeStamp;
        sent.current = false;
        setFilling(true);
        timer.current = setTimeout(() => {
          sent.current = true;
          setFilling(false);
          onSend();
        }, 2000);
      }}
      onPointerUp={(e) => {
        if (timer.current) clearTimeout(timer.current);
        setFilling(false);
        if (!sent.current && e.timeStamp - downAt.current < 350) onTap();
      }}
      onPointerCancel={() => {
        if (timer.current) clearTimeout(timer.current);
        setFilling(false);
      }}
      onContextMenu={(e) => e.preventDefault()}
      className="pc-press relative flex h-[84px] touch-none flex-col items-center justify-center gap-1.5 overflow-hidden rounded-[18px] text-[12px] leading-[14px]"
      style={{ ...card, boxShadow: active ? "inset 0 0 0 1.5px var(--ink-2)" : card.boxShadow, color: "var(--ink-2)", WebkitTouchCallout: "none" }}
    >
      <span className="absolute inset-x-0 bottom-0 h-full origin-bottom" style={{ background: "var(--olive-soft)", transform: filling ? "scaleY(1)" : "scaleY(0)", transition: filling ? "transform 2s linear" : "transform .2s" }} />
      <span className="relative text-[24px] leading-none">{icon}</span>
      <span className="relative px-1 text-center">{label}</span>
    </button>
  );
}

// ---- service lines: only here, after a tap (D-139) --------------------------------------------------

function ServiceLines() {
  const api = useApi();
  const lines = [
    !api.service.push ? { key: "push" as const, icon: "bell", text: SERVICE.push.text, action: SERVICE.push.action } : null,
    !api.service.install ? { key: "install" as const, icon: "share", text: SERVICE.install.text, action: SERVICE.install.action } : null,
    api.service.draft ? { key: "draft" as const, icon: "note", text: SERVICE.draft.text, action: SERVICE.draft.action } : null,
    api.empty ? { key: "noTeam" as const, icon: "people", text: SERVICE.noTeam.text, action: SERVICE.noTeam.action } : null,
  ].filter((x): x is NonNullable<typeof x> => Boolean(x));
  if (!lines.length) return null;
  return (
    <div className="mt-7 px-4">
      <div className="pc-caps mb-2 px-1" style={{ color: "var(--ink-4)" }}>
        Служебное
      </div>
      <ul className="overflow-hidden rounded-[20px]" style={{ background: "var(--paper-2)", boxShadow: "inset 0 0 0 1px var(--line)" }}>
        {lines.map((l, i) => (
          <li key={l.key} className="flex items-center gap-3 px-3.5 py-2.5" style={{ borderTop: i ? "1px solid var(--line)" : "none" }}>
            <Icon name={l.icon} size={18} style={{ color: "var(--ink-3)" }} />
            <span className="min-w-0 flex-1 text-[13px] leading-[18px]" style={{ color: "var(--ink-2)" }}>
              {l.text}
            </span>
            <button type="button" onClick={() => api.serviceDo(l.key)} className="pc-press inline-flex h-10 flex-none items-center px-1.5 text-[13.5px] font-medium" style={{ color: "var(--ink)" }}>
              {l.action}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
