"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";

import {
  COMPANY,
  DIRECTOR,
  GREETING,
  NEWS,
  SECRETARY,
  SECRETARY_ACTIONS,
  SECRETARY_MESSAGE,
  SERVICE,
  VISITOR,
  dayLabel,
  hhmm,
  minutesAgo,
  personById,
  type Errand,
} from "@/app/dev/pulse-alt/fixtures";

import { useApi, type LandedItem } from "./ctx";
import { useHold } from "./hold";
import { MOOD_LINE, crewOf, gendered, lanesOf, nextMeeting, plural, spanLabel, todayEvents, verb, type CrewMember } from "./model";
import { Avatar, Btn, Icon, PulseLine } from "./ui";

type NewsItem = (typeof NEWS)[number];

export function Board({ news }: { news: NewsItem | null }) {
  const api = useApi();
  if (api.empty) return <Welcome />;
  // the secretary's notes take the letter's place; awake, the sections take the crew's
  const notes = api.visitor || api.secMessage;
  return (
    <div className="flex h-full flex-col px-5 pt-1">
      <AnimatePresence initial={false}>{api.visitor ? <VisitorCard key="visitor" /> : null}</AnimatePresence>
      <AnimatePresence initial={false}>{api.secMessage ? <MessageCard key="msg" /> : null}</AnimatePresence>
      <Letter news={news} compact={notes} />
      <Index />
      {api.awake || notes ? <div className="min-h-0 flex-1" /> : <Crew />}
      {/* with Жанна's notes on top the desk stays only where the screen is tall enough */}
      {notes ? (
        <div className="flex-none [@media(max-height:820px)]:hidden">
          <Desk />
        </div>
      ) : (
        <Desk />
      )}
    </div>
  );
}

// ---- the assistant's letter: the barometer in words ----------------------------------------------

/** Words that arrive one after another, the way an answer streams in. */
export function Stream({ text, delay = 0, step = 0.028, className, style }: { text: string; delay?: number; step?: number; className?: string; style?: React.CSSProperties }) {
  const words = text.split(" ");
  return (
    <span className={className} style={style}>
      {words.map((w, i) => (
        <motion.span
          key={`${i}-${w}`}
          initial={{ opacity: 0, filter: "blur(3px)" }}
          animate={{ opacity: 1, filter: "blur(0px)" }}
          transition={{ delay: delay + i * step, duration: 0.32 }}
          className="inline"
        >
          {w}
          {i < words.length - 1 ? " " : ""}
        </motion.span>
      ))}
    </span>
  );
}

function useFacts() {
  const api = useApi();
  const lanes = lanesOf(api.tasks);
  const facts: string[] = [];
  const o = lanes.overdue;
  if (o.length === 1) facts.push(`${personById(o[0]!.assigneeId)?.short ?? ""} ${gendered(o[0]!.assigneeId, "просрочил", "просрочила")}`);
  else if (o.length > 1) facts.push(`${o.length} ${plural(o.length, ["просрочка", "просрочки", "просрочек"])}`);
  const d = lanes.declined;
  if (d.length === 1) facts.push(`${personById(d[0]!.assigneeId)?.short ?? ""} ${gendered(d[0]!.assigneeId, "отказался", "отказалась")}`);
  else if (d.length > 1) facts.push(`${d.length} ${plural(d.length, ["отказ", "отказа", "отказов"])}`);
  if (lanes.review.length) facts.push(`${lanes.review.length} на приёмке`);
  if (api.counts.messages) facts.push(`${api.counts.messages} ${plural(api.counts.messages, ["вопрос", "вопроса", "вопросов"])} в сообщениях`);
  return facts;
}

function meetingLine(now: Date): string | null {
  const m = nextMeeting(now);
  if (!m || dayLabel(m.event.startsAt, now) !== "сегодня") return null;
  return `${m.event.title} в ${hhmm(m.event.startsAt)} — через ${spanLabel(m.inMin)}.`;
}

function Letter({ news, compact = false }: { news: NewsItem | null; compact?: boolean }) {
  const api = useApi();
  const facts = useFacts();
  const meeting = meetingLine(api.now);
  const mood = api.landed ? "happy" : api.mood;
  const hello = DIRECTOR.firstName;

  let head: string;
  let sub: string | null;
  if (api.landed) {
    head = api.landed.line;
    sub = null;
  } else if (api.awake) {
    head = api.pristine
      ? GREETING[0]!
      : api.counts.waiting
        ? `Доброе утро, ${hello}. Ждут вас ${api.counts.waiting}: ${facts.join(", ")}.`
        : `Доброе утро, ${hello}. Всё разобрано — можно выдохнуть.`;
    sub = api.pristine ? GREETING[1]! : meeting;
  } else {
    head = MOOD_LINE[api.mood];
    const f = facts.slice(0, 2).map((x, i) => (i === 0 ? x[0]!.toUpperCase() + x.slice(1) : x));
    const said = f.join(", ");
    sub = compact ? null : [f.length ? (said.endsWith(".") ? said : `${said}.`) : null, meeting].filter(Boolean).join(" ");
  }

  return (
    <section className={`relative flex-none ${compact ? "pt-4 pb-4" : "pt-3 pb-5"}`}>
      <div className="flex h-7 items-center gap-3">
        <motion.button
          type="button"
          onClick={() => api.setAwake(!api.awake)}
          aria-label="Сводка"
          className="pc-press -ml-2 inline-flex h-11 items-center rounded-full px-2"
          animate={news ? { scale: [1, 1.08, 1] } : { scale: 1 }}
          transition={{ duration: 0.5 }}
        >
          <PulseLine mood={mood} width={76} height={24} stroke={1.9} />
        </motion.button>
        <span className="pc-caps" style={{ color: "var(--ink-3)" }}>
          {api.landed ? "отправлено" : mood === "alert" ? "внимательно" : mood === "happy" ? "всё хорошо" : "спокойно"}
        </span>
      </div>
      <AnimatePresence>{news ? <Thought key={news.id} item={news} /> : null}</AnimatePresence>
      <motion.button
        type="button"
        onClick={() => api.setAwake(!api.awake)}
        className="block w-full text-left"
        animate={{ opacity: news ? 0.06 : 1 }}
        transition={{ duration: 0.3 }}
      >
        <div
          key={head}
          className="pc-serif mt-2.5 tracking-[-0.012em]"
          style={{ color: "var(--ink)", fontSize: compact ? 24 : api.awake || api.landed ? 25 : 31, lineHeight: compact ? "30px" : api.awake || api.landed ? "32px" : "37px", textWrap: "pretty" }}
        >
          <Stream text={head} step={api.awake ? 0.03 : 0.04} />
        </div>
        {sub ? (
          <motion.p
            key={sub}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: api.awake ? 0.55 : 0.25, duration: 0.4 }}
            className="mt-2 text-[15px] leading-[21px]"
            style={{ color: "var(--ink-3)", textWrap: "pretty" }}
          >
            {sub}
          </motion.p>
        ) : null}
      </motion.button>
      {api.landed ? <Receipts items={api.landed.items} morning={api.landed.morning} /> : null}
    </section>
  );
}

/** «отправлено → увидел 10:41» ticking in for the people a batch landed on (principle 8). */
function Receipts({ items, morning }: { items: LandedItem[]; morning: boolean }) {
  const api = useApi();
  const [seen, setSeen] = useState<string[]>([]);
  useEffect(() => {
    if (morning) return;
    const ts = items.map((it, i) => setTimeout(() => setSeen((s) => [...s, `${it.id}${it.kind}`]), 1300 + i * 800));
    return () => ts.forEach(clearTimeout);
  }, [items, morning]);
  const t = hhmm(new Date(api.now.getTime() + 60_000).toISOString());
  return (
    <div className="mt-3 flex flex-wrap gap-x-1.5 gap-y-1.5">
      {items.map((it, i) => {
        const p = personById(it.id);
        const ok = seen.includes(`${it.id}${it.kind}`);
        const word = morning
          ? "утром"
          : it.kind === "recurrence"
            ? it.note
            : it.kind === "points"
              ? ok
                ? `${it.note} · ${verb(it.id, "увидел")}`
                : it.note
              : ok
                ? `${verb(it.id, "увидел")} ${t}`
                : "отправлено";
        return (
          <motion.span
            key={`${it.id}${it.kind}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 + i * 0.08 }}
            className="inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12.5px]"
            style={{ background: ok ? "var(--olive-soft)" : "var(--oat)", color: "var(--ink-2)", transition: "background-color .4s" }}
          >
            {ok ? (
              <Icon name="check" size={12} stroke={2.4} style={{ color: "var(--olive-ink)" }} />
            ) : (
              <span className="h-1.5 w-1.5 rounded-full" style={{ boxShadow: "inset 0 0 0 1.2px var(--ink-3)" }} />
            )}
            <span style={{ color: "var(--ink)" }}>{p?.short}</span>
            <span style={{ color: ok ? "var(--olive-ink)" : "var(--ink-3)" }}>{word}</span>
          </motion.span>
        );
      })}
    </div>
  );
}

/** A thought over the line: what just changed on the board (D-65). It drains away in ~9 s. */
function Thought({ item }: { item: NewsItem }) {
  const api = useApi();
  const tone = item.tone === "ok" ? "var(--olive)" : item.tone === "warn" ? "var(--clay)" : "var(--slate)";
  const open = () => {
    if (item.taskId) api.openThread(item.taskId);
    else if (item.id === "n4") api.openSheet("secretary");
    else api.openSheet("ether");
  };
  return (
    <motion.button
      type="button"
      onClick={open}
      initial={{ opacity: 0, y: 8, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.97, transition: { duration: 0.3 } }}
      transition={{ type: "spring", damping: 20, stiffness: 260 }}
      className="absolute top-[52px] right-0 left-0 z-10 rounded-[20px] text-left"
      style={{ background: "var(--card)", boxShadow: "var(--sh-2), inset 0 0 0 1px var(--line)", transformOrigin: "12% 0%" }}
    >
      {/* the tail of the thought leading up to the line */}
      <span className="absolute -top-[9px] left-9 h-3 w-3 rounded-full" style={{ background: "var(--card)", boxShadow: "var(--sh-1), inset 0 0 0 1px var(--line)" }} />
      <div className="flex items-start gap-3 px-4 pt-3.5 pb-3.5">
        <span className="mt-[7px] h-2 w-2 flex-none rounded-full" style={{ background: tone }} />
        <span className="pc-serif min-w-0 flex-1 text-[19px] leading-[25px]" style={{ color: "var(--ink)" }}>
          {item.text}
        </span>
        <span className="mt-0.5 inline-flex flex-none items-center gap-0.5 text-[13px]" style={{ color: "var(--ink-3)" }}>
          {item.taskId ? "Открыть" : "Смотреть"}
          <Icon name="right" size={14} />
        </span>
      </div>
      <span className="absolute inset-x-5 bottom-0 h-[2px] overflow-hidden rounded-full">
        <span className="pc-anim block h-full w-full origin-left" style={{ background: tone, opacity: 0.55, animation: "pc-drain 9s linear forwards" }} />
      </span>
    </motion.button>
  );
}

// ---- the index: five numbers at a glance; awake, they speak a line each ----------------------------

type Section = { id: "tasks" | "messages" | "ether" | "calendar" | "rating"; label: string; n: number; tone: string; icon: string; gist: string; warn?: string };

function useSections(): Section[] {
  const api = useApi();
  const c = api.counts;
  const lanes = lanesOf(api.tasks);
  const today = todayEvents().filter((e) => new Date(e.endsAt).getTime() > api.now.getTime());
  const next = nextMeeting(api.now);
  const soon = next && next.inMin <= 15 && dayLabel(next.event.startsAt, api.now) === "сегодня" ? `через ${next.inMin} мин` : undefined;
  const firstQ = api.tasks.find((t) => t.question);
  const lastPost = api.ether[0];
  const taskGist = [
    lanes.overdue.length ? (lanes.overdue.length === 1 ? "просрочка" : `${lanes.overdue.length} просрочки`) : null,
    lanes.declined.length ? (lanes.declined.length === 1 ? "отказ" : `${lanes.declined.length} отказа`) : null,
    lanes.review.length ? `${lanes.review.length} на приёмке` : null,
    lanes.work.length ? `${lanes.work.length} в работе` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const list: Section[] = [
    {
      id: "tasks",
      label: "Задачи",
      n: c.tasks,
      icon: "tasks",
      tone: c.overdue || c.declined ? "var(--clay-ink)" : c.review ? "var(--olive-ink)" : "var(--ink)",
      gist: taskGist || (c.work ? `${c.work} в работе, всё спокойно` : "пока пусто"),
    },
    {
      id: "messages",
      label: "Сообщения",
      n: c.messages,
      icon: "chat",
      tone: c.messages ? "var(--slate-ink)" : "var(--ink)",
      gist: firstQ ? `${personById(firstQ.assigneeId)?.short}: «${firstQ.question?.text}»` : c.messages ? "есть непрочитанное" : "все ответы даны",
    },
    {
      id: "ether",
      label: "Эфир",
      n: api.ether.length,
      icon: "megaphone",
      tone: "var(--ink)",
      gist: lastPost ? `прочитали ${lastPost.read} из ${lastPost.of} · «${lastPost.text.split(".")[0]}»` : "объявлений нет",
    },
    {
      id: "calendar",
      label: "Календарь",
      n: today.length,
      icon: "calendar",
      tone: soon ? "var(--clay-ink)" : "var(--ink)",
      warn: soon,
      gist: next
        ? dayLabel(next.event.startsAt, api.now) === "сегодня"
          ? `через ${spanLabel(next.inMin)} · ${next.event.title}`
          : `${dayLabel(next.event.startsAt, api.now)} в ${hhmm(next.event.startsAt)} · ${next.event.title}`
        : "встреч нет",
    },
  ];
  if (COMPANY.pointsEnabled) {
    const d = api.disputes[0];
    list.push({
      id: "rating",
      label: "Рейтинг",
      n: api.disputes.length,
      icon: "trophy",
      tone: api.disputes.length ? "var(--clay-ink)" : "var(--ink)",
      gist: d ? `${personById(d.personId)?.short} оспаривает ${d.amount}` : "споров нет · неделя идёт",
    });
  }
  return list;
}

function Index() {
  const api = useApi();
  const sections = useSections();
  return (
    <motion.div layout className="flex-none overflow-hidden rounded-[22px]" style={{ background: "var(--card)", boxShadow: "var(--sh-1), inset 0 0 0 1px var(--line)" }} transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}>
      <AnimatePresence initial={false} mode="wait">
        {api.awake ? (
          <motion.ul key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            {sections.map((s, i) => (
              <motion.li key={s.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 + i * 0.06 }}>
                <button
                  type="button"
                  onClick={() => api.openSheet(s.id)}
                  className="pc-press flex min-h-[54px] w-full items-center gap-3 px-4 text-left"
                  style={{ borderTop: i ? "1px solid var(--line)" : "none" }}
                >
                  <Icon name={s.icon} size={20} style={{ color: "var(--ink-3)" }} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] leading-[19px] font-medium" style={{ color: "var(--ink)" }}>
                      {s.label}
                    </span>
                    <span className="block truncate text-[13px] leading-[17px]" style={{ color: s.warn ? "var(--clay-ink)" : "var(--ink-3)" }}>
                      {s.gist}
                    </span>
                  </span>
                  <span className="pc-serif pc-num text-[22px]" style={{ color: s.n ? s.tone : "var(--ink-4)" }}>
                    {s.n}
                  </span>
                  <Icon name="right" size={16} style={{ color: "var(--ink-4)" }} />
                </button>
              </motion.li>
            ))}
          </motion.ul>
        ) : (
          <motion.div key="row" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="flex">
            {sections.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => api.openSheet(s.id)}
                className="pc-press relative flex h-[78px] min-w-0 flex-auto flex-col items-center justify-center gap-0.5 px-1"
                style={{ borderLeft: i ? "1px solid var(--line)" : "none" }}
                aria-label={`${s.label}: ${s.n}`}
              >
                <motion.span key={s.n} initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="pc-serif pc-num text-[30px] leading-[34px]" style={{ color: s.n ? s.tone : "var(--ink-4)" }}>
                  {s.n}
                </motion.span>
                <span className="text-[11.5px] leading-[14px] whitespace-nowrap" style={{ color: s.warn ? "var(--clay-ink)" : "var(--ink-3)", letterSpacing: "-0.005em" }}>
                  {s.warn ?? s.label}
                </span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ---- the crew at a glance ------------------------------------------------------------------------

const STAGE_LOOK: Record<CrewMember["stage"], { bg: string; fg: string; border: string }> = {
  overdue: { bg: "var(--clay-soft)", fg: "var(--clay-ink)", border: "transparent" },
  declined: { bg: "var(--clay-soft)", fg: "var(--clay-ink)", border: "transparent" },
  question: { bg: "var(--slate-soft)", fg: "var(--slate-ink)", border: "transparent" },
  review: { bg: "var(--olive-soft)", fg: "var(--olive-ink)", border: "transparent" },
  work: { bg: "var(--card)", fg: "var(--ink-2)", border: "var(--line-2)" },
  unseen: { bg: "transparent", fg: "var(--ink-3)", border: "var(--ink-4)" },
  held: { bg: "color-mix(in srgb, var(--oat) 60%, transparent)", fg: "var(--ink-4)", border: "var(--line-2)" },
};

/** «Your move» rings in the colour of the stage: watchful clay, a question in slate, приёмка in olive. */
const RING: Partial<Record<CrewMember["stage"], string>> = { overdue: "var(--clay)", declined: "var(--clay)", question: "var(--slate)", review: "var(--olive)" };

export function CrewDot({ m, size, popped, onTap }: { m: CrewMember; size: number; popped: boolean; onTap: () => void }) {
  const look = STAGE_LOOK[m.stage];
  const dashed = m.stage === "unseen" || m.stage === "held";
  return (
    <button type="button" onClick={onTap} className="pc-press relative flex flex-col items-center gap-1.5" style={{ width: size + 18 }} aria-label={`${m.person.short}: ${m.tasks.length} ${plural(m.tasks.length, ["задача", "задачи", "задач"])}`}>
      <motion.span className="relative inline-flex" animate={popped ? { scale: [1, 1.18, 0.96, 1] } : { scale: 1 }} transition={{ duration: 0.6 }}>
        {m.move ? <span className="absolute -inset-[4px] rounded-full" style={{ boxShadow: `0 0 0 1.6px ${RING[m.stage] ?? "var(--clay)"}` }} /> : null}
        {popped ? (
          <motion.span className="absolute inset-0 rounded-full" style={{ boxShadow: "0 0 0 2px var(--olive)" }} initial={{ scale: 1, opacity: 0.8 }} animate={{ scale: 1.9, opacity: 0 }} transition={{ duration: 0.9 }} />
        ) : null}
        <span
          className="inline-flex items-center justify-center rounded-full font-medium"
          style={{ width: size, height: size, background: look.bg, color: look.fg, border: `1.3px ${dashed ? "dashed" : "solid"} ${look.border}`, fontSize: Math.round(size * 0.33) }}
        >
          {m.person.initials}
        </span>
        {m.badge ? (
          <span
            className="absolute -top-1.5 -right-1.5 inline-flex h-[18px] w-[18px] items-center justify-center rounded-full text-[10.5px] font-semibold"
            style={{ background: m.badge === "declined" ? "var(--clay)" : "var(--slate)", color: "#fff", boxShadow: "0 0 0 2px var(--paper)" }}
          >
            {m.badge === "declined" ? <Icon name="x" size={10} stroke={2.6} /> : "?"}
          </span>
        ) : null}
      </motion.span>
      <span className="max-w-full truncate text-[12px] leading-[15px]" style={{ color: m.stage === "unseen" || m.stage === "held" ? "var(--ink-3)" : "var(--ink-2)" }}>
        {m.person.short}
      </span>
    </button>
  );
}

function Crew() {
  const api = useApi();
  const { busy, free, away } = crewOf(api.tasks);
  const quiet = [
    ...free.map((p) => ({ p, line: verb(p.id, "свободен").replace("свободена", "свободна") })),
    ...away.map((p) => ({ p, line: `${p.awayWhy ?? "нет на месте"} до ${p.awayUntil ? dayLabel(p.awayUntil, api.now).replace(/^\S+, /, "") : ""}` })),
  ];
  return (
    <section className="mt-6 flex min-h-0 flex-1 flex-col">
      <div className="mb-3 flex flex-none items-baseline justify-between">
        <span className="pc-caps" style={{ color: "var(--ink-3)" }}>
          Команда
        </span>
        <span className="text-[12.5px]" style={{ color: "var(--ink-3)" }}>
          {busy.length} в работе · ваш ход у {busy.filter((m) => m.move).length}
        </span>
      </div>
      <div
        className="pc-scroll -mx-2 min-h-0 flex-1 px-1 pt-1 pb-3"
        style={{ WebkitMaskImage: "linear-gradient(to bottom, #000 calc(100% - 22px), transparent)", maskImage: "linear-gradient(to bottom, #000 calc(100% - 22px), transparent)" }}
      >
        <div className="grid grid-cols-5 justify-items-center gap-y-3.5">
          {busy.map((m) => (
            <CrewDot key={m.person.id} m={m} size={50} popped={api.pops.includes(m.person.id)} onTap={() => api.openSheet("person", m.person.id)} />
          ))}
        </div>
        {quiet.length ? (
          <p className="mt-4 px-1 text-[13px] leading-[20px]" style={{ color: "var(--ink-3)" }}>
            {quiet.map(({ p, line }, i) => (
              <span key={p.id}>
                {i ? <span style={{ color: "var(--ink-4)" }}> · </span> : null}
                <button type="button" onClick={() => api.openSheet("person", p.id)} className="pc-press inline py-1.5" style={{ color: "var(--ink-2)" }}>
                  {p.short}
                </button>{" "}
                {line}
              </span>
            ))}
          </p>
        ) : null}
      </div>
    </section>
  );
}

// ---- the secretary's desk -------------------------------------------------------------------------

export const ERRAND_WORD: Record<Errand["status"], string> = { waiting: "ждёт сети", asked: "отправлено", seen: "увидела", doing: "делает", done: "готово" };

export function errandLine(e: Errand): string {
  const icon = SECRETARY_ACTIONS.find((a) => a.code === e.code)?.icon ?? "🎙";
  const status = e.status === "doing" && (e.code === "coffee" || e.code === "tea") ? "несёт" : ERRAND_WORD[e.status];
  return `${icon} ${e.label}${e.note ? ` → ${e.note}` : ""} — ${status}${e.status === "doing" && e.etaMin ? ` · ${e.etaMin} мин` : ""}`;
}

function Desk() {
  const api = useApi();
  const zhanna = personById(SECRETARY.personId);
  const hold = useHold({
    delay: 450,
    onTap: () => api.openSheet("secretary"),
    onHoldStart: () => api.holdStart(true),
    onHoldMove: api.holdMove,
    onHoldEnd: api.holdEnd,
    onHoldCancel: api.holdCancel,
  });
  const away = api.deskAway;
  const live = api.errands.filter((e) => e.status !== "done").slice(-2);
  return (
    <div
      {...hold}
      role="button"
      tabIndex={0}
      aria-label="Секретарь: тап — просьбы, удержание — сказать своими словами"
      className="pc-press mt-3 mb-3 flex flex-none touch-none items-center gap-3 rounded-[20px] px-3.5 py-3"
      style={{ background: "var(--card)", boxShadow: "var(--sh-1), inset 0 0 0 1px var(--line)" }}
    >
      <span className="relative">
        <Avatar person={zhanna} size={40} />
        <span className="absolute right-0 bottom-0 h-2.5 w-2.5 rounded-full" style={{ background: away ? "var(--ink-4)" : "var(--olive)", boxShadow: "0 0 0 2px var(--card)" }} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="text-[15px] font-medium" style={{ color: "var(--ink)" }}>
            {zhanna?.short}
          </span>
          <span className="text-[12.5px]" style={{ color: "var(--ink-3)" }}>
            {away ? `все ушли · до ${hhmm(away)}` : "у стола"}
          </span>
        </span>
        <span className="block truncate text-[13px] leading-[18px]" style={{ color: "var(--ink-2)" }}>
          {live.length ? live.map(errandLine).join("   ") : "Просьб нет · удержите, чтобы сказать своими словами"}
        </span>
      </span>
      <Icon name="right" size={16} style={{ color: "var(--ink-4)" }} />
    </div>
  );
}

// ---- the secretary's notes on the board: a visitor and her words (D-96, D-116) ------------------

function NoteFrame({ children, since }: { children: React.ReactNode; since: string }) {
  const zhanna = personById(SECRETARY.personId);
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -10, height: 0 }}
      animate={{ opacity: 1, y: 0, height: "auto" }}
      exit={{ opacity: 0, height: 0, marginTop: 0, transition: { duration: 0.28 } }}
      className="-mx-3 flex-none overflow-hidden px-3 pb-1"
    >
      <div className="mt-2 rounded-[20px] px-4 pt-3 pb-3.5" style={{ background: "var(--card)", boxShadow: "var(--sh-1), 0 8px 22px -14px rgba(20,20,19,.2), inset 0 0 0 1px var(--line)" }}>
        <div className="mb-1.5 flex items-center gap-2 text-[12.5px]" style={{ color: "var(--ink-3)" }}>
          <Avatar person={zhanna} size={22} />
          <span style={{ color: "var(--ink-2)" }}>{zhanna?.short}</span>
          <span>· {since}</span>
        </div>
        {children}
      </div>
    </motion.div>
  );
}

function VisitorCard() {
  const api = useApi();
  const [extras, setExtras] = useState<string[]>([]);
  const wait = minutesAgo(VISITOR.since, api.now);
  return (
    <NoteFrame since={`ждёт ${spanLabel(wait)}`}>
      <p className="text-[16px] leading-[22px]" style={{ color: "var(--ink)" }}>
        К вам посетитель: <b className="font-semibold">{VISITOR.name}</b>, {VISITOR.from}, {VISITOR.about}.
      </p>
      <div className="mt-2.5 flex items-center gap-1.5">
        <span className="mr-1 text-[12.5px]" style={{ color: "var(--ink-3)" }}>
          Гостю:
        </span>
        {VISITOR.hospitality.map((h) => {
          const on = extras.includes(h);
          return (
            <button
              key={h}
              type="button"
              onClick={() => setExtras((x) => (on ? x.filter((y) => y !== h) : [...x, h]))}
              className="pc-press inline-flex h-8 items-center gap-1 rounded-full px-3 text-[13px]"
              style={{ background: on ? "var(--olive-soft)" : "var(--oat)", color: on ? "var(--olive-ink)" : "var(--ink-2)" }}
              aria-pressed={on}
            >
              {on ? <Icon name="check" size={13} stroke={2.2} /> : h === "Чай" ? "🍵" : "☕"} {h}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex gap-1.5">
        <Btn kind="primary" className="min-w-0 flex-auto" onClick={() => api.visitorAnswer("Пусть заходит", extras)} style={{ paddingInline: 6, fontSize: 14 }}>
          Пусть заходит
        </Btn>
        <Btn kind="quiet" className="min-w-0 flex-auto" onClick={() => api.visitorAnswer("Подождёт", [])} style={{ paddingInline: 6, fontSize: 14 }}>
          Подождёт
        </Btn>
        <Btn kind="quiet" className="min-w-0 flex-auto" onClick={() => api.visitorAnswer("Не приму", [])} style={{ paddingInline: 6, fontSize: 14, color: "var(--ink-3)" }}>
          Не приму
        </Btn>
      </div>
    </NoteFrame>
  );
}

function MessageCard() {
  const api = useApi();
  return (
    <NoteFrame since={hhmm(SECRETARY_MESSAGE.at)}>
      <div className="flex items-end gap-3">
        <p className="min-w-0 flex-1 text-[15.5px] leading-[21px]" style={{ color: "var(--ink)" }}>
          {SECRETARY_MESSAGE.text}
        </p>
        <Btn kind="quiet" size="sm" onClick={api.messageSeen} className="mb-0.5">
          Понятно
        </Btn>
      </div>
    </NoteFrame>
  );
}

// ---- a first day: no team yet (empty) ---------------------------------------------------------------

function Welcome() {
  const api = useApi();
  const steps = [
    { key: "noTeam" as const, title: "Первый сотрудник", text: "Имя и телефон — войдёт по коду и увидит задачи.", action: "Добавить", done: false },
    { key: "push" as const, title: "Уведомления", text: "Выключены — не узнаете, когда сдадут задачу.", action: SERVICE.push.action, done: api.service.push },
    { key: "install" as const, title: "Экран «Домой»", text: "Pulse откроется одним касанием, придут пуши.", action: SERVICE.install.action, done: false },
  ];
  const tries = ["Айгуль, отчёт по продажам к пятнице", "Всем: завтра планёрка в 9:00", "Напомни позвонить в банк в 15:00"];
  return (
    <div className="pc-scroll h-full px-5 pt-3 pb-6">
      <div className="flex h-7 items-center gap-3">
        <PulseLine mood="calm" width={76} height={24} />
        <span className="pc-caps" style={{ color: "var(--ink-3)" }}>
          первый день
        </span>
      </div>
      <div className="pc-serif mt-3 text-[29px] leading-[35px] tracking-[-0.012em]" style={{ color: "var(--ink)" }}>
        <Stream text={`Добро пожаловать, ${DIRECTOR.firstName}.`} />
      </div>
      <p className="mt-2 text-[15px] leading-[21px]" style={{ color: "var(--ink-3)" }}>
        Здесь вы говорите — а команда получает задачи, объявления и очки. Три шага, и можно начинать.
      </p>
      <ol className="mt-4 overflow-hidden rounded-[22px]" style={{ background: "var(--card)", boxShadow: "var(--sh-1), inset 0 0 0 1px var(--line)" }}>
        {steps.map((s, i) => (
          <li key={s.key} className="flex items-start gap-3 px-4 py-3" style={{ borderTop: i ? "1px solid var(--line)" : "none" }}>
            <span
              className="pc-serif mt-0.5 inline-flex h-7 w-7 flex-none items-center justify-center rounded-full text-[15px]"
              style={{ background: s.done ? "var(--olive-soft)" : "var(--oat)", color: s.done ? "var(--olive-ink)" : "var(--ink-2)" }}
            >
              {s.done ? <Icon name="check" size={14} stroke={2.2} /> : i + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15.5px] leading-[20px] font-medium" style={{ color: s.done ? "var(--ink-3)" : "var(--ink)", textDecoration: s.done ? "line-through" : "none" }}>
                {s.title}
              </span>
              <span className="mt-0.5 block text-[13px] leading-[18px]" style={{ color: "var(--ink-3)" }}>
                {s.text}
              </span>
            </span>
            {!s.done ? (
              <Btn kind={i === 0 ? "primary" : "quiet"} size="sm" onClick={() => api.serviceDo(s.key)} className="mt-0.5">
                {s.action}
              </Btn>
            ) : null}
          </li>
        ))}
      </ol>
      <div className="pc-caps mt-5 mb-2" style={{ color: "var(--ink-3)" }}>
        Попробуйте сказать
      </div>
      <div className="flex flex-col items-start gap-2">
        {tries.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => api.setTyping(true, t)}
            className="pc-press inline-flex min-h-[40px] items-center gap-2 rounded-[14px] px-3.5 py-2 text-left text-[14.5px]"
            style={{ background: "var(--oat)", color: "var(--ink-2)" }}
          >
            <span className="pc-serif" style={{ color: "var(--ink-3)" }}>
              «
            </span>
            {t}
            <span className="pc-serif" style={{ color: "var(--ink-3)" }}>
              »
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
