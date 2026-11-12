"use client";

import { AnimatePresence, motion } from "motion/react";
import { createContext, useContext, useEffect, useRef, useState } from "react";

import { ERRORS, QUERY, STAGES, hhmm, personById, whenLabel, type Draft } from "@/app/dev/pulse-alt/fixtures";

import { Stream } from "./Board";
import { useApi, type Conv } from "./ctx";
import { KIND_LABEL, sendable, seeded } from "./model";
import { Avatar, Btn, Chip, Icon, Mark, MiniPlay, VoiceClip } from "./ui";

/** The phrase this conversation is about — kept by the layer itself, so it can play its exit. */
const ConvCtx = createContext<Conv | null>(null);
const useConv = (): Conv => useContext(ConvCtx)!;

/** The conversation that takes the stage while a phrase is in hand. */
export function Talk({ conv }: { conv: Conv }) {
  return (
    <ConvCtx.Provider value={conv}>
      <TalkBody />
    </ConvCtx.Provider>
  );
}

function TalkBody() {
  const conv = useConv();
  const scroller = useRef<HTMLDivElement>(null);
  const replyRef = useRef<HTMLDivElement>(null);

  // a long reply opens at its first line, not at the bottom of the cards
  const replyKey = conv.phase === "reply" ? `${conv.id}-${conv.reply?.kind}` : null;
  useEffect(() => {
    if (!replyKey) return;
    const t = setTimeout(() => scroller.current?.scrollTo({ top: 0 }), 30);
    return () => clearTimeout(t);
  }, [replyKey]);

  return (
    <div ref={scroller} className="pc-scroll h-full px-5" style={{ background: "linear-gradient(to bottom, color-mix(in srgb, var(--paper) 0%, transparent) 0%, color-mix(in srgb, var(--paper) 88%, transparent) 30%, var(--paper) 48%)" }}>
      <div className="flex min-h-full flex-col justify-end pt-2 pb-8">
        {conv.said ? <SaidBubble /> : null}
        {["saving", "transcribing", "parsing", "stt"].includes(conv.phase) ? <Stages /> : null}
        <div ref={replyRef}>
          {conv.phase === "reply" || conv.phase === "sending" ? <Reply /> : null}
          {conv.phase === "kept" ? <Kept /> : null}
          {conv.phase === "noMic" ? <NoMic /> : null}
        </div>
      </div>
    </div>
  );
}

// ---- the director's own line --------------------------------------------------------------------

function SaidBubble() {
  const conv = useConv();
  const said = conv.said!;
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(conv.phase === "transcribing" ? 0 : said.text.length);

  // recognition writes the words in as they come
  useEffect(() => {
    if (conv.phase !== "transcribing") return;
    const total = said.text.length;
    const iv = setInterval(() => setShown((n) => Math.min(total, n + Math.max(2, Math.ceil(total / 40)))), 30);
    return () => clearInterval(iv);
  }, [conv.phase, said.text]);

  const text = conv.phase === "saving" || conv.phase === "stt" ? "" : conv.phase === "transcribing" ? said.text.slice(0, shown) : said.text;
  const long = (conv.phase === "reply" || conv.phase === "sending") && text.length > 90;
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 40, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", damping: 24, stiffness: 300 }}
      className="mb-4 ml-auto w-fit max-w-[88%] rounded-[22px] px-3 pt-2.5 pb-3"
      style={{ background: "var(--bubble)", transformOrigin: "100% 100%" }}
    >
      {said.voiceSec ? (
        <div className="flex items-center gap-2">
          <VoiceClip sec={said.voiceSec} seed={said.voiceSec + 3} />
          {conv.phase === "kept" ? (
            <span className="inline-flex items-center gap-1 text-[12.5px]" style={{ color: "var(--ink-3)" }}>
              <Icon name="wifiOff" size={14} /> на телефоне
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[12.5px]" style={{ color: "var(--ink-3)" }}>
              <Icon name="check" size={13} stroke={2} /> сохранено
            </span>
          )}
        </div>
      ) : null}
      {text || conv.phase === "transcribing" ? (
        <p
          className="px-1 pt-2 text-[15.5px] leading-[22px]"
          style={{
            color: "var(--ink)",
            display: long && !open ? "-webkit-box" : "block",
            WebkitLineClamp: long && !open ? 2 : undefined,
            WebkitBoxOrient: "vertical",
            overflow: long && !open ? "hidden" : undefined,
            paddingTop: said.voiceSec ? 8 : 2,
          }}
        >
          {text}
          {conv.phase === "transcribing" && shown < said.text.length ? (
            <span className="pc-anim ml-0.5 inline-block h-[17px] w-[2px] translate-y-[3px]" style={{ background: "var(--clay)", animation: "pc-caret 1s steps(1) infinite" }} />
          ) : null}
        </p>
      ) : conv.phase === "saving" || conv.phase === "stt" ? (
        <div className="space-y-2 px-1 pt-3 pb-1">
          <div className="pc-shimmer h-[10px] w-[220px] rounded-full" style={{ background: "var(--line-2)", opacity: 0.6 }} />
          <div className="pc-shimmer h-[10px] w-[150px] rounded-full" style={{ background: "var(--line-2)", opacity: 0.6 }} />
        </div>
      ) : null}
      {long ? (
        <button type="button" onClick={() => setOpen(!open)} className="mt-1 px-1 text-[13px]" style={{ color: "var(--ink-3)" }}>
          {open ? "свернуть" : "показать всё"}
        </button>
      ) : null}
    </motion.div>
  );
}

// ---- the pipeline, spoken as it goes ------------------------------------------------------------

function Stages() {
  const conv = useConv();
  const phase = conv.phase;
  const voice = Boolean(conv.said?.voiceSec);
  const order = ["saving", "transcribing", "parsing"];
  const steps = STAGES.filter((s) => s.id !== "recording").map((s) => ({ ...s, key: s.id === "uploading" ? "saving" : s.id }));
  const visible = voice ? steps : steps.filter((s) => s.key === "parsing");
  const idx = phase === "stt" ? 1 : order.indexOf(phase);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-start gap-3">
      <Mark think />
      <div className="min-w-0 flex-1 pt-0.5">
        {phase === "stt" ? (
          <p className="pc-serif mb-2 text-[18px] leading-[25px]" style={{ color: "var(--ink)" }}>
            {ERRORS.stt}
          </p>
        ) : null}
        <ol className="flex flex-col gap-1.5">
          {visible.map((s) => {
            const i = order.indexOf(s.key);
            const done = i < idx;
            const active = i === idx && phase !== "stt";
            return (
              <li key={s.key} className="flex h-6 items-center gap-2 text-[15px]">
                <span className="inline-flex w-4 justify-center" style={{ color: done ? "var(--olive)" : "var(--ink-4)" }}>
                  {done ? <Icon name="check" size={15} stroke={2.2} /> : <span className="h-1.5 w-1.5 rounded-full" style={{ background: active ? "var(--clay)" : "var(--line-2)" }} />}
                </span>
                <span className={active ? "pc-shimmer" : ""} style={{ color: active ? undefined : done ? "var(--ink-3)" : "var(--ink-4)" }}>
                  {s.label}
                  {active ? "…" : ""}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </motion.div>
  );
}

// ---- the assistant's reply ---------------------------------------------------------------------------

function Said({ children, think = false }: { children: React.ReactNode; think?: boolean }) {
  const api = useApi();
  return (
    <div className="flex items-start gap-3">
      <Mark mood={api.mood === "alert" ? "calm" : api.mood} think={think} />
      <div className="pc-serif min-w-0 flex-1 pt-px text-[19px] leading-[27px] tracking-[-0.005em]" style={{ color: "var(--ink)", textWrap: "pretty" }}>
        {children}
      </div>
    </div>
  );
}

function Reply() {
  const api = useApi();
  const reply = useConv().reply!;
  if (reply.kind === "answer") return <Answer lines={reply.lines} personId={reply.personId} />;
  if (reply.kind === "unparsed") {
    return (
      <>
        <Said>
          <Stream text={reply.line} />
        </Said>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }} className="mt-4 ml-10 flex flex-wrap gap-2">
          <Btn kind="primary" icon="pencil" onClick={api.fixText}>
            Исправить текст
          </Btn>
          <Btn kind="quiet" onClick={api.unparsedToTask}>
            Сделать задачей
          </Btn>
          <Btn kind="ghost" onClick={api.closeConv}>
            Закрыть
          </Btn>
        </motion.div>
      </>
    );
  }
  return <Confirm summary={reply.summary} />;
}

function Answer({ lines, personId }: { lines: string[]; personId: string | null }) {
  const api = useApi();
  const fromQuery = lines === QUERY.lines;
  const [first, ...rest] = lines;
  const titled = (line: string) => {
    const m = /^«([^»]+)»(.*)$/.exec(line);
    if (!m) return line;
    const quoted = m[1] ?? "";
    const words = quoted.split(" ").filter((w) => w.length > 4);
    const task = api.tasks.find(
      (t) => (!personId || t.assigneeId === personId) && (t.title.toLowerCase().includes(quoted.toLowerCase()) || words.some((w) => t.title.includes(w))),
    );
    return (
      <>
        <button type="button" onClick={() => task && api.openThread(task.id)} className="underline decoration-1 underline-offset-[4px]" style={{ textDecorationColor: "var(--clay)" }}>
          «{quoted}»
        </button>
        {m[2]}
      </>
    );
  };
  return (
    <>
      <Said>
        <Stream text={first ?? ""} />
      </Said>
      <ul className="mt-3 ml-10 flex flex-col gap-2.5">
        {rest.map((l, i) => (
          <motion.li key={l} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 + i * 0.18 }} className="pc-serif flex gap-2 text-[17.5px] leading-[25px]" style={{ color: "var(--ink-2)" }}>
            <span style={{ color: "var(--ink-4)" }}>—</span>
            <span>{titled(l)}</span>
          </motion.li>
        ))}
      </ul>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }} className="mt-4 ml-10 flex flex-wrap gap-2">
        {personId ? (
          <Btn kind="quiet" icon="person" onClick={() => api.openSheet("person", personId)}>
            Задачи {personById(personId)?.short === "Марат" ? "Марата" : personById(personId)?.short}
          </Btn>
        ) : null}
        {!fromQuery ? (
          <Btn kind="quiet" onClick={api.unparsedToTask}>
            Сделать задачей
          </Btn>
        ) : null}
        <Btn kind="ghost" onClick={api.closeConv}>
          Закрыть
        </Btn>
      </motion.div>
    </>
  );
}

function Kept() {
  const api = useApi();
  return (
    <>
      <Said>
        <Stream text={ERRORS.kept} />
      </Said>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="mt-4 ml-10 flex flex-wrap gap-2">
        <Btn kind="primary" onClick={api.closeConv}>
          Хорошо
        </Btn>
        <Btn kind="ghost" icon="again" onClick={api.reconnect}>
          Сеть появилась
        </Btn>
      </motion.div>
    </>
  );
}

function NoMic() {
  const api = useApi();
  return (
    <>
      <Said>
        <Stream text={ERRORS.noMic} />
      </Said>
      <div className="mt-4 ml-10 flex flex-wrap gap-2">
        <Btn
          kind="primary"
          icon="type"
          onClick={() => {
            api.closeConv();
            api.setTyping(true);
          }}
        >
          Написать строкой
        </Btn>
        <Btn kind="ghost" onClick={api.closeConv}>
          Понятно
        </Btn>
      </div>
    </>
  );
}

// ---- the confirmation in place: one card per entity (D-60) ------------------------------------------

function Confirm({ summary }: { summary: string }) {
  const api = useApi();
  const sending = useConv().phase === "sending";
  const live = api.drafts;
  return (
    <>
      <Said>
        <Stream text={summary} />
      </Said>
      {api.offhours ? (
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="mt-2 ml-10 text-[14px] leading-[20px]" style={{ color: "var(--ink-3)" }}>
          Уже {hhmm(api.now.toISOString())} — разошлю утром в 8:00, чтобы никого не будить.
        </motion.p>
      ) : null}
      <div className="mt-4 flex flex-col gap-2.5">
        <AnimatePresence initial={true}>
          {live.map((d, i) => {
            const gone = api.removed.includes(d.id);
            const fly = sending && !gone && sendable(d);
            return (
              <motion.div
                key={d.id}
                layout
                initial={{ opacity: 0, y: 18 }}
                animate={
                  fly
                    ? { opacity: 0, y: -560, x: (seeded(i + 4) - 0.5) * 90, rotate: (seeded(i + 9) - 0.5) * 14, scale: 0.8, transition: { duration: 0.62, delay: i * 0.05, ease: [0.5, 0, 0.75, 0] } }
                    : { opacity: 1, y: 0, x: 0, rotate: 0, scale: 1, transition: { delay: 0.15 + i * 0.07, type: "spring", damping: 26, stiffness: 300 } }
                }
                exit={{ opacity: 0, height: 0, transition: { duration: 0.2 } }}
              >
                {gone ? <Removed d={d} /> : <DraftCard d={d} />}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
      <p className="mt-4 mb-2 text-center text-[12.5px]" style={{ color: "var(--ink-4)" }}>
        Тап по тексту — правка · ничего не уйдёт без вашего «Отправить»
      </p>
    </>
  );
}

function Removed({ d }: { d: Draft }) {
  const api = useApi();
  return (
    <div className="flex h-11 items-center justify-between rounded-[16px] px-4 text-[13.5px]" style={{ border: "1.3px dashed var(--line-2)", color: "var(--ink-3)" }}>
      <span className="truncate">Убрано: {KIND_LABEL[d.kind].toLowerCase()}</span>
      <button type="button" onClick={() => api.restoreDraft(d.id)} className="pc-press inline-flex h-11 items-center gap-1 pl-3 font-medium" style={{ color: "var(--ink)" }}>
        <Icon name="undo" size={15} /> Вернуть
      </button>
    </div>
  );
}

const KIND_ICON: Record<Draft["kind"], string> = { task: "tasks", announcement: "megaphone", points: "trophy", event: "calendar", recurrence: "repeat", note: "note", reminder: "remind" };

function Editable({ value, onSave, size = 18 }: { value: string; onSave: (v: string) => void; size?: number }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  if (editing) {
    return (
      <textarea
        autoFocus
        value={draft}
        rows={2}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false);
          if (draft.trim()) onSave(draft.trim());
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLTextAreaElement).blur();
          }
        }}
        className="pc-serif w-full resize-none rounded-[10px] px-2 py-1 outline-none"
        style={{ fontSize: size, lineHeight: `${size + 6}px`, background: "var(--oat)", color: "var(--ink)", marginLeft: -8, width: "calc(100% + 8px)" }}
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      className="pc-serif block w-full text-left"
      style={{ fontSize: size, lineHeight: `${size + 6}px`, color: "var(--ink)", textWrap: "pretty" }}
    >
      {value}
    </button>
  );
}

function DraftCard({ d }: { d: Draft }) {
  const api = useApi();
  const tone = d.kind === "points" ? "var(--olive-ink)" : "var(--ink-3)";
  const voice = d.kind === "task" ? d.voiceSec : undefined;
  return (
    <div className="rounded-[20px] px-4 pt-3 pb-3.5" style={{ background: "var(--card)", boxShadow: "var(--sh-1), inset 0 0 0 1px var(--line)" }}>
      <div className="mb-1 flex h-7 items-center gap-1.5" style={{ color: tone }}>
        <Icon name={KIND_ICON[d.kind]} size={15} />
        <span className="pc-caps">{KIND_LABEL[d.kind]}</span>
        <span className="flex-1" />
        {voice ? <MiniPlay sec={voice} /> : null}
        <button type="button" aria-label="Убрать" onClick={() => api.removeDraft(d.id)} className="pc-press -my-2 -mr-2.5 inline-flex h-11 w-11 items-center justify-center rounded-full" style={{ color: "var(--ink-4)" }}>
          <Icon name="x" size={16} stroke={1.8} />
        </button>
      </div>
      <DraftBody d={d} />
    </div>
  );
}

const meta = "mt-2 text-[13.5px] leading-[19px]";

function DraftBody({ d }: { d: Draft }) {
  const api = useApi();
  switch (d.kind) {
    case "task": {
      const who = personById(d.assigneeId);
      return (
        <>
          <Editable value={d.title} onSave={(title) => api.editDraft(d.id, { title })} />
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {who ? (
              <Chip onClick={() => api.setPicker({ for: "draft", id: d.id })} style={{ paddingLeft: 4 }}>
                <span className="inline-flex items-center gap-1.5">
                  <Avatar person={who} size={24} style={{ background: "var(--card)" }} /> {who.short}
                </span>
              </Chip>
            ) : (
              <motion.span animate={{ scale: [1, 1.05, 1] }} transition={{ repeat: 2, duration: 0.8, delay: 0.9 }} className="inline-flex">
                <Chip tone="clay" dashed icon="person" onClick={() => api.setPicker({ for: "draft", id: d.id })}>
                  Кому?
                </Chip>
              </motion.span>
            )}
            <Chip icon="clock" onClick={() => api.setWhen({ for: "draft", id: d.id })}>
              {d.deadline ? whenLabel(d.deadline, api.now) : "Без срока"}
            </Chip>
            <Chip icon="repeat" onClick={() => api.setRepeat(d.id)} style={d.repeat ? undefined : { paddingInline: 9 }}>
              {d.repeat ?? ""}
            </Chip>
          </div>
          {!who && d.heardName ? (
            <div className={meta} style={{ color: "var(--clay-ink)" }}>
              Услышал «{d.heardName}» — такого имени нет, уточните.
            </div>
          ) : null}
        </>
      );
    }
    case "announcement":
      return (
        <>
          <Editable value={d.text} onSave={(text) => api.editDraft(d.id, { text })} />
          <div className={meta} style={{ color: "var(--ink-3)" }}>
            {d.audience} · {d.reach} человек · в Эфир и пушем
          </div>
        </>
      );
    case "points": {
      const who = personById(d.personId);
      return (
        <div className="flex items-center gap-3">
          <span className="pc-serif pc-num text-[34px] leading-[38px]" style={{ color: "var(--olive-ink)" }}>
            +{d.amount}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-[15px] font-medium" style={{ color: "var(--ink)" }}>
              <Avatar person={who} size={22} tone="olive" /> {who?.short}
            </div>
            <div className="pc-serif mt-0.5 text-[16px] leading-[21px]" style={{ color: "var(--ink-2)" }}>
              {d.reason}
            </div>
          </div>
        </div>
      );
    }
    case "event":
      return (
        <>
          <Editable value={d.title} onSave={(title) => api.editDraft(d.id, { title })} />
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <Chip icon="clock">{whenLabel(d.startsAt, api.now)}</Chip>
            {d.place ? <Chip icon="pin">{d.place}</Chip> : null}
          </div>
          <div className={`${meta} flex items-center gap-2`} style={{ color: "var(--ink-3)" }}>
            <Icon name="people" size={15} />
            {d.peopleIds.map((id) => personById(id)?.short).join(", ")}
          </div>
        </>
      );
    case "recurrence": {
      const who = personById(d.assigneeId);
      return (
        <>
          <Editable value={d.title} onSave={(title) => api.editDraft(d.id, { title })} />
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <Chip style={{ paddingLeft: 4 }}>
              <span className="inline-flex items-center gap-1.5">
                <Avatar person={who} size={24} style={{ background: "var(--card)" }} /> {who?.short}
              </span>
            </Chip>
            <Chip icon="repeat" tone="slate">
              {d.rule}
            </Chip>
          </div>
          <div className={meta} style={{ color: "var(--ink-3)" }}>
            Первый раз — {whenLabel(d.firstAt, api.now)}
          </div>
        </>
      );
    }
    case "note":
      return (
        <>
          <Editable value={d.text} onSave={(text) => api.editDraft(d.id, { text })} />
          <div className={meta} style={{ color: "var(--ink-3)" }}>
            В «Заметки» · видите только вы
          </div>
        </>
      );
    case "reminder":
      return (
        <>
          <Editable value={d.text} onSave={(text) => api.editDraft(d.id, { text })} />
          <div className="mt-2.5">
            <Chip icon="bell">{whenLabel(d.at, api.now)}</Chip>
          </div>
        </>
      );
  }
}

