"use client";

/**
 * The sheet itself: the big figure (what waits for the director), five key figures in a row
 * (the sections — a tap opens the section in place, below the row), and the stage: the team as a
 * table, the secretary's desk as one line, a visitor when there is one. A panel folds the big
 * figure into the header line and takes the stage.
 */

import { AnimatePresence, motion } from "framer-motion";
import { useRef } from "react";

import { COMPANY, DIRECTOR, EVENTS, GREETING, SECRETARY_MESSAGE, VISITOR, dayLabel, hhmm, minutesAgo, personById } from "@/app/dev/pulse-alt/fixtures";

import { Panels } from "./Panels";
import { MOOD_WORD, g, greeting, nameOf, nextEvent, plural, teamSheet, todayEvents, type TeamCell } from "./model";
import { useStrict, type Panel } from "./Strict";
import { EASE, Figure, Gauge, Glyph, Key, Lbl, Rule, buzz, cx } from "./ui";

export function Board() {
  const s = useStrict();
  // a panel, or someone at the door, folds the big figure into one line
  const compact = s.panel !== null || Boolean(s.visitor) || s.secMessage;
  return (
    <motion.div
      className="absolute inset-0 flex flex-col"
      initial={{ opacity: 0, y: -14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -18, transition: { duration: 0.2, ease: EASE } }}
      transition={{ duration: 0.32, ease: EASE }}
    >
      <Hero compact={compact} />
      <Tiles />
      <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain" data-testid="stage">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={s.panel ?? "home"}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.08 } }}
            transition={{ duration: 0.26, ease: EASE }}
            className="flex min-h-full flex-col"
          >
            {s.panel ? <Panels /> : <Home />}
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ---- the big figure -----------------------------------------------------------------------------

function Hero({ compact }: { compact: boolean }) {
  const s = useStrict();
  const b = s.board;
  const word = MOOD_WORD[b.mood];
  const figColor = b.waiting > 0 ? "var(--cyan)" : "var(--text)";
  const label = s.empty ? "Первый день · шагов сделано" : b.waiting > 0 ? "Ждут вашего решения" : "Всё решено";
  const firstSteps = s.pushOn ? 1 : 0;
  if (compact) {
    return (
      <div className="flex h-[58px] shrink-0 items-center gap-3 px-5" data-testid="hero-compact">
        <motion.button type="button" layoutId="hero-figure" className="flex items-center" onClick={() => s.openPanel(null)} aria-label="Свернуть раздел" transition={{ duration: 0.36, ease: EASE }}>
          <Figure value={b.waiting} className="font-semibold" style={{ fontSize: 42, color: figColor, letterSpacing: "-0.01em", filter: b.waiting ? "drop-shadow(0 0 10px rgba(70,228,255,.55))" : "none" }} />
        </motion.button>
        <div className="flex min-w-0 flex-1 flex-col">
          <Lbl tone="ink">{label}</Lbl>
          <AnimatePresence mode="wait" initial={false}>
            {s.news ? (
              <motion.button key={s.news.id} type="button" className="truncate text-left text-[12.5px] font-medium" style={{ color: "var(--cyan)" }} onClick={() => s.tapNews(s.news!)} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} data-testid="news">
                {s.news.text} ›
              </motion.button>
            ) : (
              <motion.span key="comp" className="truncate text-[12.5px]" style={{ color: "var(--text-2)" }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {composition(s.board).map((r) => `${r.word.toLowerCase()} ${r.n}`).join(" · ") || "ничего не ждёт"}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <Gauge mood={b.mood} word={word} />
      </div>
    );
  }
  const next = nextEvent(EVENTS, s.now);
  const minsToNext = next ? -minutesAgo(next.startsAt, s.now) : null;
  return (
    <section className="relative shrink-0 px-5 pb-4 pt-4" data-testid="hero">
      <div className="flex h-5 items-center justify-between">
        <span className="flex items-center gap-2">
          <span className="block h-1.5 w-1.5 rotate-45" style={{ background: s.empty ? "var(--text-2)" : "var(--cyan)", boxShadow: s.empty ? "none" : "0 0 8px rgba(70,228,255,.9)" }} />
          <Lbl tone="ink">{label}</Lbl>
        </span>
        <Gauge mood={s.empty ? "calm" : b.mood} word={s.empty ? "Спокойно" : word} />
      </div>
      <div className="mt-3 flex items-end gap-5">
        <motion.button
          type="button"
          layoutId="hero-figure"
          data-testid="hero-figure"
          className="-ml-[0.04em] shrink-0 text-left"
          onClick={() => {
            buzz(5);
            s.setAwake(!s.awake);
          }}
          aria-label={`${b.waiting} — показать сводку`}
          transition={{ duration: 0.36, ease: EASE }}
        >
          <span className="holo relative flex items-end" style={{ fontSize: "clamp(112px, min(21.5dvh, 46vw), 196px)", padding: 30, margin: -30, filter: s.empty || !b.waiting ? "drop-shadow(0 0 16px rgba(200,230,255,.22))" : "drop-shadow(0 0 18px rgba(70,228,255,.5)) drop-shadow(0 0 2px rgba(70,228,255,.9))" }}>
            <Figure value={s.empty ? firstSteps : b.waiting} roll className="font-semibold" style={{ color: s.empty ? "var(--text)" : figColor, letterSpacing: "-0.02em", marginTop: "-0.15em", marginBottom: "-0.12em" }} />
            <Ghost value={s.empty ? firstSteps : b.waiting} />
            {s.empty ? (
              <span className="num font-semibold" style={{ fontSize: "0.3em", color: "var(--text-3)", marginLeft: "0.06em", lineHeight: 1 }}>
                /4
              </span>
            ) : null}
          </span>
        </motion.button>
        <div className="min-w-0 flex-1 pb-1" style={{ minHeight: 112 }}>
          <AnimatePresence mode="wait" initial={false}>
            {s.empty ? (
              <motion.p key="empty" className="text-[15px] leading-[1.4]" style={{ color: "var(--text-2)" }} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                В команде пока никого. Четыре шага — и Pulse готов: всё, что скажете, станет задачами.
              </motion.p>
            ) : s.news ? (
              <motion.button
                key={s.news.id}
                type="button"
                data-testid="news"
                className="relative block w-full pb-3 text-left"
                onClick={() => s.tapNews(s.news!)}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.24, ease: EASE }}
              >
                <span className="flex items-center gap-2">
                  <span className="block h-2 w-2 rotate-45" style={{ background: s.news.tone === "info" ? "transparent" : "var(--cyan)", border: s.news.tone === "info" ? "1.5px solid var(--text-3)" : "none", boxShadow: s.news.tone === "info" ? "none" : "0 0 8px rgba(70,228,255,.8)" }} />
                  <Lbl tone="seal">Новое · {hhmm(s.news.at)}</Lbl>
                </span>
                <span className="mt-1.5 block text-[17px] font-medium leading-[1.3] tracking-[-0.01em]">{s.news.text}</span>
                {s.news.taskId ? (
                  <span className="lbl mt-2 block" style={{ color: "var(--cyan-hi)" }}>
                    Открыть переписку ›
                  </span>
                ) : null}
                <motion.span className="absolute bottom-0 left-0 h-px" style={{ background: "var(--cyan)", boxShadow: "0 0 6px rgba(70,228,255,.8)" }} initial={{ width: "100%" }} animate={{ width: "0%" }} transition={{ duration: 9, ease: "linear" }} />
              </motion.button>
            ) : s.awake ? (
              <motion.div key="greet" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22, ease: EASE }} data-testid="greeting">
                <Typed text={s.state0 === "awake" && b.waiting === 8 ? GREETING[0]! : greeting(b, s.now, DIRECTOR.firstName)} />
                {next ? (
                  <motion.p className="mt-2.5 flex gap-2 text-[14px] leading-[1.35]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }}>
                    <span className="mt-[5px] block h-2 w-2 shrink-0 rotate-45" style={{ background: minsToNext !== null && minsToNext <= 15 ? "var(--cyan)" : "var(--text-2)" }} />
                    <span>
                      {next.title} в {hhmm(next.startsAt)} — через {minsToNext} мин
                    </span>
                  </motion.p>
                ) : null}
              </motion.div>
            ) : (
              <motion.div key="comp" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                {composition(b).length === 0 ? (
                  <p className="text-[15px] leading-[1.4]" style={{ color: "var(--text-2)" }}>
                    Решений не ждёт ничего. Команда работает.
                  </p>
                ) : (
                  composition(b).map((r, i) => (
                    <button
                      key={r.word}
                      type="button"
                      className="flex h-[28px] w-full items-center justify-between text-left"
                      style={{ borderBottom: "1px solid var(--line)" }}
                      onClick={() => s.openPanel(r.panel)}
                    >
                      <span className="flex items-center gap-2 text-[14px]" style={{ color: "var(--text-2)" }}>
                        <span className="block h-1 w-1" style={{ background: "var(--cyan)" }} />
                        {r.word}
                      </span>
                      <motion.span initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 + i * 0.06, duration: 0.25, ease: EASE }}>
                        <Figure value={r.n} className="text-[17px] font-semibold" style={{ color: "var(--cyan-hi)", filter: "drop-shadow(0 0 6px rgba(70,228,255,.6))" }} />
                      </motion.span>
                    </button>
                  ))
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}

/**
 * When the big figure changes, a ghost of it slips in slices and splits its colour for a
 * moment over the odometer — once, and never with reduced motion.
 */
function Ghost({ value }: { value: number }) {
  return (
    <span
      key={value}
      aria-hidden
      className="num ghost-in pointer-events-none absolute font-semibold"
      style={{ left: 30, top: 30, color: "rgba(255,51,85,.0)", lineHeight: 1, marginTop: "-0.15em", letterSpacing: "-0.02em", textShadow: "-3px 0 rgba(255,51,85,.85), 3px 0 rgba(70,228,255,.85)", opacity: 0 }}
    >
      {value}
    </span>
  );
}

function composition(b: ReturnType<typeof useStrict>["board"]) {
  const rows: { word: string; n: number; panel: Panel }[] = [
    { word: "Просрочка", n: b.count.overdue, panel: "tasks" },
    { word: "Отказ", n: b.count.declined, panel: "tasks" },
    { word: "Приёмка", n: b.count.review, panel: "tasks" },
    { word: "Сообщения", n: b.count.messages, panel: "messages" },
  ];
  return rows.filter((r) => r.n > 0);
}

/** The greeting comes in word by word, like a telex. */
function Typed({ text }: { text: string }) {
  const words = text.split(" ");
  return (
    <p className="text-[16px] font-medium leading-[1.38] tracking-[-0.005em]">
      {words.map((w, i) => (
        <motion.span key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.035, duration: 0.05 }}>
          {w}
          {i < words.length - 1 ? " " : ""}
        </motion.span>
      ))}
    </p>
  );
}

// ---- five key figures ---------------------------------------------------------------------------

function Tiles() {
  const s = useStrict();
  const b = s.board;
  const today = todayEvents(EVENTS, s.now);
  const next = nextEvent(EVENTS, s.now);
  const mins = next ? -minutesAgo(next.startsAt, s.now) : null;
  const worst = b.count.overdue ? "просрочка" : b.count.declined ? "отказ" : b.count.review ? "приёмка" : "спокойно";
  const lastPost = s.ether[0];
  const dash = s.empty;
  const tiles: { id: Panel; label: string; value: number; sub: string; move: boolean; warn?: boolean }[] = [
    { id: "tasks", label: "Задачи", value: b.deck.length, sub: s.empty ? "нет" : b.deck.length ? worst : "спокойно", move: b.deck.length > 0 },
    { id: "messages", label: "Сообщения", value: b.messages.length, sub: b.messages.length ? `${b.questions} ${plural(b.questions, ["вопрос", "вопроса", "вопросов"])}` : "тихо", move: b.messages.length > 0 },
    { id: "ether", label: "Эфир", value: s.ether.length, sub: lastPost ? `${lastPost.read}/${lastPost.of}` : "пусто", move: false },
    { id: "calendar", label: "Календарь", value: s.empty ? 0 : today.length, sub: s.empty ? "пусто" : next ? (mins !== null && mins <= 15 ? `через ${mins} мин` : `в ${hhmm(next.startsAt)}`) : "дальше завтра", move: false, warn: mins !== null && mins <= 15 },
  ];
  if (COMPANY.pointsEnabled) tiles.push({ id: "rating", label: "Рейтинг", value: s.disputes.length, sub: s.disputes.length ? plural(s.disputes.length, ["спор", "спора", "споров"]) : "без споров", move: s.disputes.length > 0 });
  return (
    <nav className="cut frame glass mx-5 grid shrink-0" style={{ gridTemplateColumns: tiles.length === 5 ? "1.08fr 1.2fr 0.85fr 1.07fr 0.85fr" : `repeat(${tiles.length}, minmax(0, 1fr))` }} data-testid="tiles">
      {tiles.map((t, i) => {
        const active = s.panel === t.id;
        return (
          <button
            key={t.id}
            type="button"
            data-testid={`tile-${t.id}`}
            onClick={() => {
              buzz(5);
              s.openPanel(t.id);
            }}
            className="relative flex h-[78px] min-w-0 flex-col items-start justify-between px-[6px] pb-2 pt-2 text-left"
            style={{ borderLeft: i ? "1px solid var(--line)" : "none", color: "var(--text)" }}
          >
            {active ? (
              <motion.span layoutId="tile-active" className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(70,228,255,.2), rgba(70,228,255,.04))", boxShadow: "inset 0 -2px 0 var(--cyan)" }} transition={{ type: "spring", stiffness: 560, damping: 48 }} />
            ) : null}
            <span className="lbl relative max-w-full truncate" style={{ color: active ? "var(--cyan-hi)" : "var(--text-3)", fontSize: 9, letterSpacing: "0.06em", fontStretch: "75%" }}>
              {t.label}
            </span>
            <span className="relative flex items-center gap-1.5">
              {dash ? (
                <span className="num text-[28px] font-semibold leading-none" style={{ color: "var(--text-3)" }}>
                  —
                </span>
              ) : (
                <Figure value={t.value} roll className="font-semibold" style={{ fontSize: 28, letterSpacing: "-0.01em", color: t.move ? "var(--cyan)" : "var(--text)", filter: t.move ? "drop-shadow(0 0 7px rgba(70,228,255,.55))" : "none" }} />
              )}
            </span>
            <span className="relative max-w-full truncate text-[10.5px] leading-none" style={{ color: active ? "var(--cyan-hi)" : t.warn ? "var(--cyan)" : "var(--text-2)" }}>
              {dash ? "пусто" : t.sub}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

// ---- the home stage -----------------------------------------------------------------------------

function Home() {
  const s = useStrict();
  return (
    <div className="flex flex-1 flex-col pb-3">
      <AnimatePresence initial={false}>
        {s.visitor ? <VisitorCard key="visitor" /> : null}
        {s.secMessage ? <MessageCard key="msg" /> : null}
      </AnimatePresence>
      {s.empty ? <FirstDay /> : <Team />}
      {s.empty ? null : <DeskLine />}
    </div>
  );
}

function Team() {
  const s = useStrict();
  const { cells, free, away } = teamSheet(s.tasks, s.now);
  const moves = cells.filter((c) => c.move).length;
  return (
    <section className="px-5 pt-4" data-testid="team">
      <div className="flex items-baseline justify-between">
        <Lbl tone="ink">Команда</Lbl>
        <span className="lbl">
          {cells.length} с задачами · {moves} ждут вас
        </span>
      </div>
      <div className="cut frame glass mt-2.5 grid grid-cols-3">
        {cells.map((c, i) => (
          <Cell key={c.id} c={c} i={i} count={cells.length} />
        ))}
      </div>
      <div className="mt-2.5 flex flex-wrap items-baseline gap-x-5 gap-y-1">
        {free.length ? (
          <span className="flex items-baseline gap-2">
            <Lbl>{free.length === 1 ? g(free[0]!, "Свободен", "Свободна") : "Свободны"}</Lbl>
            {free.map((id) => (
              <button key={id} type="button" className="text-[13.5px] underline decoration-[var(--line-2)] underline-offset-4" onClick={() => s.pickPerson(id)}>
                {nameOf(id)}
              </button>
            ))}
          </span>
        ) : null}
        {away.map((id) => (
          <span key={id} className="flex items-baseline gap-2">
            <Lbl>Отпуск</Lbl>
            <span className="text-[13.5px]" style={{ color: "var(--text-2)" }}>
              {nameOf(id)} до {dayLabel(awayUntil(id), s.now).replace(/^\S+, /, "")}
            </span>
          </span>
        ))}
      </div>
      <Legend present={new Set(cells.map((c) => c.glyph))} />
    </section>
  );
}

function awayUntil(id: string): string {
  return personById(id)?.awayUntil ?? "";
}

function Cell({ c, i, count }: { c: TeamCell; i: number; count: number }) {
  const s = useStrict();
  const selected = s.personId === c.id;
  return (
    <motion.button
      type="button"
      data-testid={`cell-${c.id}`}
      onClick={() => {
        buzz(5);
        s.pickPerson(selected ? null : c.id);
      }}
      className="relative flex h-[clamp(46px,6.2dvh,52px)] min-w-0 flex-col justify-center gap-[3px] pl-2.5 pr-1.5 text-left"
      style={{
        borderBottom: i < count - (count % 3 || 3) ? "1px solid var(--line)" : "none",
        borderRight: i % 3 !== 2 ? "1px solid var(--line)" : "none",
        background: selected ? "linear-gradient(180deg, rgba(70,228,255,.22), rgba(70,228,255,.06))" : c.move ? "linear-gradient(90deg, rgba(70,228,255,.07), transparent 70%)" : "transparent",
        color: "var(--text)",
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.05 + i * 0.03, duration: 0.2 }}
    >
      {c.move ? <span className="absolute bottom-[6px] left-0 top-[6px] w-[2px]" style={{ background: "var(--cyan)", boxShadow: "0 0 8px rgba(70,228,255,.9)" }} /> : null}
      <span className="flex min-w-0 items-center gap-1.5">
        <Glyph kind={c.glyph} color={selected ? "var(--cyan-hi)" : "var(--text)"} />
        <span className="truncate font-medium tracking-[-0.01em]" style={{ fontSize: "clamp(13.5px, 3.75vw, 14.5px)" }}>
          {c.name}
        </span>
      </span>
      <span className="flex min-w-0 items-center gap-1">
        <span className="lbl truncate" style={{ color: c.move ? "var(--cyan)" : "var(--text-3)", letterSpacing: "0.07em" }}>
          {c.code}
        </span>
        {c.tasks.length > 1 ? (
          <span className="mono ml-auto shrink-0 text-[10px]" style={{ color: "var(--text-3)" }}>
            ×{c.tasks.length}
          </span>
        ) : null}
      </span>
    </motion.button>
  );
}

function Legend({ present }: { present: Set<string> }) {
  const all: [Parameters<typeof Glyph>[0]["kind"], string][] = [
    ["solid", "в работе"],
    ["hatch", "сдано"],
    ["open", "не открыто"],
    ["cross", "отказ"],
    ["dash", "утром"],
  ];
  const items = all.filter(([k]) => present.has(k));
  return (
    <div className="tall-only mt-2.5 flex flex-wrap gap-x-3 gap-y-1" aria-label="Обозначения">
      {items.map(([k, w]) => (
        <span key={k} className="flex items-center gap-1 text-[11px]" style={{ color: "var(--text-3)" }}>
          <Glyph kind={k} size={8} color="var(--text-3)" />
          {w}
        </span>
      ))}
      <span className="flex items-center gap-1 text-[11px]" style={{ color: "var(--text-3)" }}>
        <span className="block h-[9px] w-[2px]" style={{ background: "var(--cyan)", boxShadow: "0 0 6px rgba(70,228,255,.9)" }} />
        ваш ход
      </span>
    </div>
  );
}

// ---- the secretary's desk as one line -----------------------------------------------------------

export function errandWord(status: string, code: string, eta?: number): string {
  switch (status) {
    case "waiting":
      return "ждёт отправки";
    case "asked":
      return "попросили";
    case "seen":
      return "увидела";
    case "doing":
      return code === "coffee" || code === "tea" ? `несёт · ${eta ?? 3} мин` : "делает";
    case "done":
      return "готово";
    default:
      return status;
  }
}

const ICON: Record<string, string> = { coffee: "☕", tea: "🍵", dnd: "🔕", guest: "🤝", security: "🚨", doctor: "🩺", come: "🚪", own: "✎" };

export function errandIcon(code: string) {
  return ICON[code] ?? "•";
}

function DeskLine() {
  const s = useStrict();
  const timer = useRef<number | null>(null);
  const held = useRef(false);
  const startY = useRef(0);
  const shown = s.errands.slice(-2);
  return (
    <section className="mt-auto px-5 pt-4">
      <div
        role="button"
        tabIndex={0}
        data-testid="desk"
        className="cut frame glass tick flex min-h-[64px] cursor-pointer select-none items-stretch pl-3 pr-2"
        style={{ touchAction: "none", WebkitTouchCallout: "none", ["--tick" as string]: "var(--red)" } as React.CSSProperties}
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          held.current = false;
          startY.current = e.clientY;
          timer.current = window.setTimeout(() => {
            held.current = true;
            s.startRec("hold", "secretary");
          }, 450);
        }}
        onPointerMove={(e) => {
          if (held.current) s.armCancel(e.clientY - startY.current < -90);
          else if (Math.abs(e.clientY - startY.current) > 12 && timer.current) {
            window.clearTimeout(timer.current);
            timer.current = null;
          }
        }}
        onPointerUp={() => {
          if (timer.current) window.clearTimeout(timer.current);
          timer.current = null;
          if (held.current) {
            held.current = false;
            if (s.rec?.cancelArmed) s.cancelRec();
            else s.stopRec();
            return;
          }
          s.openPanel("secretary");
        }}
        onPointerCancel={() => {
          if (timer.current) window.clearTimeout(timer.current);
          if (held.current) s.cancelRec();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") s.openPanel("secretary");
        }}
      >
        <div className="flex w-[82px] shrink-0 flex-col justify-center gap-0.5 py-2">
          <Lbl>Секретарь</Lbl>
          <span className="text-[15px] font-medium">{s.secretaryAway ? "Все отошли" : nameOf("s-zhanna")}</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 py-2" style={{ borderLeft: "1px solid var(--line)", paddingLeft: 12 }}>
          {s.secretaryAway ? (
            <span className="text-[13.5px]" style={{ color: "var(--text-2)" }}>
              до {hhmm(s.secretaryAway)} · просьбы дождутся
            </span>
          ) : shown.length === 0 ? (
            <span className="text-[13.5px]" style={{ color: "var(--text-2)" }}>
              На месте · удерживайте, чтобы попросить
            </span>
          ) : (
            shown.map((e) => (
              <span key={e.id} className="flex min-w-0 items-center gap-1.5 text-[13.5px]">
                <span className="w-5 shrink-0 text-center text-[14px]">{errandIcon(e.code)}</span>
                <span className="min-w-0 truncate">
                  {e.label}
                  {e.note ? ` → ${e.note}` : ""}
                </span>
                <span className={cx("lbl ml-auto shrink-0")} style={{ color: e.status === "done" ? "var(--cyan)" : "var(--text-2)" }}>
                  {errandWord(e.status, e.code, e.etaMin)}
                </span>
              </span>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

// ---- interruptions: a visitor, the secretary's words --------------------------------------------

function VisitorCard() {
  const s = useStrict();
  const v = s.visitor!;
  const waits = minutesAgo(VISITOR.since, s.now);
  return (
    <motion.section
      className="cut frame frame-cyan glass mx-5 mt-4"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginTop: 0, transition: { duration: 0.22 } }}
      data-testid="visitor"
    >
      <div className="flex items-center justify-between px-4 pt-3">
        <span className="flex items-center gap-2">
          <span className="block h-2 w-2 rotate-45" style={{ background: "var(--cyan)", boxShadow: "0 0 8px rgba(70,228,255,.9)", animation: "cy-pulse 2s ease-in-out infinite" }} />
          <Lbl tone="seal">К вам посетитель</Lbl>
        </span>
        <span className="text-[13px]" style={{ color: "var(--text-2)" }}>
          ждёт <span className="disp text-[15px] font-semibold" style={{ color: "var(--text)" }}>{waits}</span> мин
        </span>
      </div>
      <div className="px-4 pb-3 pt-1.5">
        <div className="text-[23px] font-semibold leading-tight tracking-[-0.015em]">{VISITOR.name}</div>
        <div className="mt-0.5 text-[14px]" style={{ color: "var(--text-2)" }}>
          {VISITOR.from} · {VISITOR.about}
        </div>
      </div>
      <AnimatePresence mode="wait" initial={false}>
        {v.stage === "ask" ? (
          <motion.div key="ask" className="grid grid-cols-[1.3fr_1fr_1fr]" style={{ borderTop: "1px solid var(--line-2)" }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Key tone="ink" className="h-12" onClick={() => s.visitorMove("in")} testId="visitor-in">
              Пусть заходит
            </Key>
            <Key tone="seg" className="h-12" onClick={() => s.visitorMove("wait")}>
              Подождёт
            </Key>
            <Key tone="seg" className="h-12" onClick={() => s.visitorMove("no")}>
              Не приму
            </Key>
          </motion.div>
        ) : (
          <motion.div key="hosp" style={{ borderTop: "1px solid var(--line-2)" }} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
            <div className="px-4 pt-2.5">
              <Lbl>Гостю — что-нибудь?</Lbl>
            </div>
            <div className="grid grid-cols-3 gap-2 p-3 pt-2">
              {VISITOR.hospitality.map((h) => (
                <Key key={h} tone="line" className="h-11" onClick={() => s.visitorMove(h === "Чай" ? "tea" : "coffee")}>
                  {h === "Чай" ? "🍵" : "☕"} {h}
                </Key>
              ))}
              <Key tone="line" className="h-11" onClick={() => s.visitorMove("nothing")}>
                Ничего
              </Key>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}

function MessageCard() {
  const s = useStrict();
  return (
    <motion.section
      className="cut frame glass mx-5 mt-3 flex items-stretch gap-3 py-2 pr-2"
      style={{ boxShadow: "inset 2px 0 0 var(--text-2)" }}
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginTop: 0, transition: { duration: 0.22 } }}
      data-testid="sec-message"
    >
      <div className="min-w-0 flex-1 py-1 pl-3">
        <Lbl>
          {nameOf("s-zhanna")} · {hhmm(SECRETARY_MESSAGE.at)}
        </Lbl>
        <p className="mt-1 text-[14.5px] leading-[1.38]">{SECRETARY_MESSAGE.text}</p>
      </div>
      <Key tone="line" className="self-center" onClick={() => s.ackMessage()} testId="msg-ok">
        Понятно
      </Key>
    </motion.section>
  );
}

// ---- a new company's first day ------------------------------------------------------------------

function FirstDay() {
  const s = useStrict();
  const steps = [
    { n: "01", text: "Добавьте первого сотрудника", sub: "В команде пока никого — задачам некуда уйти.", key: "Добавить ›", done: false, onClick: () => s.toast("Команда — экран «Профиль → Команда», в прототипе не построен") },
    { n: "02", text: "Включите уведомления", sub: "Иначе не узнаете, когда сдадут задачу.", key: s.pushOn ? "Включены" : "Включить", done: s.pushOn, onClick: () => s.enablePush() },
    { n: "03", text: "Поставьте Pulse на экран «Домой»", sub: "Так работают уведомления на iPhone.", key: "Как?", done: false, onClick: () => s.setSheet({ kind: "service", which: "install" }) },
    { n: "04", text: "Скажите первое распоряжение", sub: "Удерживайте клавишу внизу: «Всем: завтра в 9:00 планёрка».", key: null, done: false, onClick: () => {} },
  ];
  return (
    <section className="px-5 pt-5" data-testid="first-day">
      <div className="flex items-baseline justify-between">
        <Lbl tone="ink">Первый день · 4 шага</Lbl>
        <span className="lbl">займёт пять минут</span>
      </div>
      <Rule strong className="mt-2.5" />
      {steps.map((st, i) => (
        <motion.div key={st.n} className="flex items-center gap-3 py-3" style={{ borderBottom: "1px solid var(--line)" }} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 * i, duration: 0.25, ease: EASE }}>
          <span className="mono w-6 shrink-0 self-start pt-0.5 text-[12px]" style={{ color: st.done ? "var(--cyan)" : "var(--text-3)" }}>
            {st.done ? "✓" : st.n}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-medium" style={{ textDecoration: st.done ? "line-through" : "none", color: st.done ? "var(--text-3)" : "var(--text)" }}>
              {st.text}
            </div>
            <div className="mt-0.5 text-[13px] leading-[1.35]" style={{ color: "var(--text-2)" }}>
              {st.sub}
            </div>
          </div>
          {st.key ? (
            <Key tone={i === 0 ? "ink" : "line"} className="shrink-0" onClick={st.onClick} disabled={st.done}>
              {st.key}
            </Key>
          ) : null}
        </motion.div>
      ))}
      <p className="mt-3 text-[12px]" style={{ color: "var(--text-3)" }}>
        Секретарь, рейтинг и эфир появятся, когда в команде будут люди.
      </p>
    </section>
  );
}
