"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { DELIVERY_WINDOW, PEOPLE, SERVICE, STAGES, personById } from "@/app/dev/pulse-alt/fixtures";

import { useApi, type Rec, type Toast } from "./ctx";
import { useHold } from "./hold";
import { seeded, sendable } from "./model";
import { Avatar, Icon } from "./ui";

/**
 * The bottom of the screen, under the thumb: the one composer (hold the mic — speak; tap the
 * line — type), which grows into the listening card, and turns into the send bar while a phrase
 * waits for the director's tap (D-36).
 */
export function Dock({ hint, toast, onToastDone }: { hint: string | null; toast: Toast | null; onToastDone: () => void }) {
  const api = useApi();
  const conv = api.conv;
  const confirming = conv && (conv.phase === "reply" || conv.phase === "sending") && conv.reply?.kind === "confirm";
  return (
    <div className="relative z-30 flex-none px-3 pt-1 pb-2.5">
      {/* the dock stands on paper; a soft fade lets the stage (or a sheet) slip under it */}
      <div className="pointer-events-none absolute inset-x-0 -top-7 bottom-0 -z-10" style={{ background: "linear-gradient(to bottom, color-mix(in srgb, var(--paper) 0%, transparent), var(--paper) 30px)" }} />
      <ToastLine toast={toast} onDone={onToastDone} />
      <Above hint={hint} />
      {confirming ? <SendBar /> : <Composer />}
    </div>
  );
}

// ---- above the composer: one quiet line at a time ------------------------------------------------

function Above({ hint }: { hint: string | null }) {
  const api = useApi();
  let content: React.ReactNode = null;
  let key = "none";
  if (hint) {
    key = `hint-${hint}`;
    content = (
      <p className="pc-serif px-2 pb-2 text-[16px] leading-[22px]" style={{ color: "var(--ink-2)" }}>
        {hint}
      </p>
    );
  } else if (api.typing) {
    key = "pins";
    content = <PinRow />;
  } else if (api.kept > 0 && !api.conv) {
    key = "kept";
    content = (
      <div className="flex justify-center pb-2">
        <button
          type="button"
          onClick={api.showKept}
          className="pc-press inline-flex h-9 items-center gap-2 rounded-full pr-3 pl-3 text-[13.5px]"
          style={{ background: "var(--card)", boxShadow: "var(--sh-1), inset 0 0 0 1px var(--line)", color: "var(--ink-2)" }}
        >
          <Icon name="wifiOff" size={15} />
          {api.kept === 1 ? SERVICE.keptPhrase.text : `${api.kept} фразы ждут сети`}
          <span className="font-medium" style={{ color: "var(--ink)" }}>
            {SERVICE.keptPhrase.action}
          </span>
        </button>
      </div>
    );
  }
  return (
    <AnimatePresence initial={false} mode="popLayout">
      {content ? (
        <motion.div key={key} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4, transition: { duration: 0.15 } }}>
          {content}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function PinRow() {
  const api = useApi();
  const people = PEOPLE.filter((p) => !p.awayUntil);
  return (
    <div className="pb-2.5">
      <p className="pc-serif px-2 pb-2 text-[16px] leading-[22px]" style={{ color: "var(--ink-2)" }}>
        Одной строкой — разберу так же, как голос.
      </p>
      <div className="pc-xscroll -mx-3 flex gap-1.5 px-3">
        <span className="inline-flex h-9 flex-none items-center pr-1 pl-2 text-[13px]" style={{ color: "var(--ink-3)" }}>
          Кому:
        </span>
        {api.empty ? (
          <span className="inline-flex h-9 items-center text-[13px]" style={{ color: "var(--ink-4)" }}>
            в команде пока никого
          </span>
        ) : (
          people.map((p) => {
            const on = api.pin === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => api.setPin(on ? null : p.id)}
                className="pc-press inline-flex h-9 flex-none items-center gap-1.5 rounded-full pr-3 pl-1 text-[13.5px]"
                style={{ background: on ? "var(--btn)" : "var(--card)", color: on ? "var(--on-btn)" : "var(--ink-2)", boxShadow: on ? "none" : "inset 0 0 0 1px var(--line)" }}
              >
                <Avatar person={p} size={26} style={on ? { background: "rgba(255,255,255,.16)", color: "inherit" } : undefined} />
                {p.short}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

// ---- the composer --------------------------------------------------------------------------------

function Composer() {
  const api = useApi();
  const rec = api.rec;
  const busy = api.conv && ["saving", "transcribing", "parsing", "stt", "sending"].includes(api.conv.phase);
  const input = useRef<HTMLInputElement>(null);
  const hold = useHold({
    delay: 170,
    onTap: api.tapMic,
    onHoldStart: () => api.holdStart(false),
    onHoldMove: api.holdMove,
    onHoldEnd: api.holdEnd,
    onHoldCancel: api.holdCancel,
  });

  useEffect(() => {
    if (api.typing) input.current?.focus();
  }, [api.typing]);

  const pinned = personById(api.pin);
  const stage = api.conv ? STAGES.find((s) => (api.conv!.phase === "saving" ? s.id === "uploading" : api.conv!.phase === "transcribing" || api.conv!.phase === "stt" ? s.id === "transcribing" : s.id === "parsing")) : null;
  const placeholder = busy
    ? `${stage?.label ?? "Разбираю"}…`
    : api.typing
      ? pinned
        ? "Что и к какому сроку"
        : "Кому, что и к какому сроку"
      : api.conv
        ? "Скажите ещё или напишите…"
        : pinned
          ? "скажите задачу"
          : "Удержите и скажите…";

  const showSend = api.typing && api.text.trim().length > 0;
  const cancel = rec?.cancel ?? false;

  return (
    <motion.div
      layout
      transition={{ type: "spring", damping: 30, stiffness: 380 }}
      className="relative overflow-hidden rounded-[28px]"
      style={{
        background: cancel ? "var(--clay-soft)" : "var(--card)",
        boxShadow: rec ? "var(--sh-2), inset 0 0 0 1px var(--line)" : "var(--sh-1), 0 6px 22px -14px rgba(20,20,19,.25), inset 0 0 0 1px var(--line)",
        transition: "background-color .2s",
      }}
    >
      <AnimatePresence initial={false}>{rec ? <Listening key="listening" rec={rec} /> : null}</AnimatePresence>
      <div className="flex items-center gap-1.5 py-1.5 pr-1.5 pl-1.5">
        {api.typing ? (
          <button type="button" aria-label="Закрыть ввод" onClick={() => api.setTyping(false)} className="pc-press inline-flex h-11 w-9 flex-none items-center justify-center rounded-full" style={{ color: "var(--ink-3)" }}>
            <Icon name="down" size={20} />
          </button>
        ) : null}
        {pinned && !rec && !busy ? (
          <motion.span
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="ml-1 inline-flex h-9 flex-none items-center gap-1 rounded-full pl-1 text-[14px] font-medium"
            style={{ background: "var(--oat)", color: "var(--ink)" }}
          >
            <Avatar person={pinned} size={28} />
            <span className="max-w-[92px] truncate pl-0.5">{pinned.short}</span>
            <button type="button" aria-label="Открепить" onClick={() => api.setPin(null)} className="-ml-0.5 inline-flex h-9 w-8 items-center justify-center rounded-full" style={{ color: "var(--ink-3)" }}>
              <Icon name="x" size={13} stroke={2.2} />
            </button>
          </motion.span>
        ) : null}
        {rec ? (
          <div className="flex h-12 min-w-0 flex-1 items-center pl-3 text-[14.5px]" style={{ color: cancel ? "var(--clay-ink)" : "var(--ink-3)" }}>
            {cancel ? "Отпустите — отменю" : rec.mode === "tap" ? "Нажмите ■, когда закончите" : rec.forDesk ? "Отпустите — уйдёт Жанне · ↑ отмена" : "Отпустите — разберу · ↑ отмена"}
          </div>
        ) : api.typing ? (
          <form
            className="min-w-0 flex-1"
            onSubmit={(e) => {
              e.preventDefault();
              api.submitText();
            }}
          >
            <input
              ref={input}
              value={api.text}
              onChange={(e) => api.setText(e.target.value)}
              placeholder={placeholder}
              enterKeyHint="send"
              className="h-12 w-full bg-transparent text-[16px] outline-none"
              style={{ color: "var(--ink)" }}
            />
          </form>
        ) : (
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => api.setTyping(true)}
            className={`flex h-12 min-w-0 flex-1 items-center gap-2 text-left text-[15.5px] ${pinned ? "pl-2" : "pl-3.5"}`}
            style={{ color: "var(--ink-3)" }}
          >
            <span className={`truncate ${busy ? "pc-shimmer" : ""}`}>{placeholder}</span>
          </button>
        )}
        {showSend ? (
          <motion.button
            key="send"
            type="button"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            onClick={api.submitText}
            aria-label="Разобрать"
            className="pc-press inline-flex h-12 w-12 flex-none items-center justify-center rounded-full"
            style={{ background: "var(--btn)", color: "var(--on-btn)" }}
          >
            <Icon name="up" size={21} stroke={2} />
          </motion.button>
        ) : (
          <MicButton hold={hold} busy={Boolean(busy)} />
        )}
      </div>
    </motion.div>
  );
}

function MicButton({ hold, busy }: { hold: ReturnType<typeof useHold>; busy: boolean }) {
  const api = useApi();
  const rec = api.rec;
  const tapMode = rec?.mode === "tap";
  return (
    <button
      type="button"
      {...(busy ? {} : hold)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          api.tapMic();
        }
      }}
      aria-label={rec ? "Закончить запись" : "Удержите и говорите"}
      className="relative inline-flex h-12 w-12 flex-none touch-none items-center justify-center rounded-full disabled:opacity-40"
      disabled={busy}
      style={{ background: rec?.cancel ? "var(--ink-3)" : "var(--clay)", color: "#fff", WebkitUserSelect: "none", userSelect: "none", WebkitTouchCallout: "none", transition: "background-color .2s" }}
    >
      {rec && !rec.cancel ? (
        <>
          <span className="pc-anim absolute inset-0 rounded-full" style={{ background: "var(--clay)", opacity: 0.5, animation: "pc-halo 1.6s ease-out infinite" }} />
        </>
      ) : null}
      <motion.span className="relative inline-flex" animate={{ scale: rec ? 1.08 : 1 }}>
        {tapMode ? <span className="h-[15px] w-[15px] rounded-[4px]" style={{ background: "#fff" }} /> : rec?.cancel ? <Icon name="x" size={22} stroke={2.2} /> : <Icon name="mic" size={23} stroke={1.9} />}
      </motion.span>
    </button>
  );
}

/** The card that grows over the composer while the director speaks. */
function Listening({ rec }: { rec: Rec }) {
  const api = useApi();
  const offset = rec.offset ?? 0;
  const [ms, setMs] = useState(offset);
  const [levels, setLevels] = useState<number[]>(() => Array.from({ length: 40 }, (_, i) => 0.12 + seeded(i) * 0.1));
  const t0 = useRef(0);
  useEffect(() => {
    t0.current = performance.now() - offset;
    let k = 0;
    const iv = setInterval(() => {
      k += 1;
      setMs(performance.now() - t0.current);
      // a voice: syllables over a breath, never a flat line
      const v = Math.max(0.1, Math.min(1, 0.25 + 0.55 * Math.abs(Math.sin(k / 3.1)) * (0.5 + Math.random() * 0.7)));
      setLevels((l) => [...l.slice(1), v]);
    }, 80);
    return () => clearInterval(iv);
  }, [offset]);
  const pinned = personById(api.pin);
  const forWhom = rec.forDesk ? "Для Жанны" : pinned ? `Для ${pinned.short === "Марат" ? "Марата" : pinned.short}` : "Слушаю";
  const sec = Math.floor(ms / 1000);
  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0, transition: { duration: 0.18 } }}
      transition={{ type: "spring", damping: 28, stiffness: 340 }}
      className="overflow-hidden"
    >
      <div className="px-5 pt-4">
        <div className="flex items-center gap-2">
          <span className="pc-anim h-2 w-2 rounded-full" style={{ background: rec.cancel ? "var(--ink-4)" : "var(--clay)", animation: "pc-dot 1.2s ease-in-out infinite" }} />
          <span className="text-[14px] font-medium" style={{ color: rec.cancel ? "var(--clay-ink)" : "var(--ink-2)" }}>
            {rec.cancel ? "Отменить запись" : forWhom}
          </span>
          <span className="flex-1" />
          <span className="pc-serif pc-num text-[24px] leading-[28px]" style={{ color: "var(--ink)" }}>
            {Math.floor(sec / 60)}:{String(sec % 60).padStart(2, "0")}
          </span>
        </div>
        <div className="mt-3 flex h-[52px] items-center justify-between gap-[3px]" aria-hidden>
          {levels.map((v, i) => (
            <span
              key={i}
              className="w-[3px] flex-1 rounded-full"
              style={{
                height: `${Math.round(6 + v * 46 * (0.55 + 0.45 * Math.sin((i / levels.length) * Math.PI)))}px`,
                background: rec.cancel ? "var(--ink-4)" : i > levels.length - 6 ? "var(--clay)" : "var(--ink-2)",
                opacity: 0.35 + (i / levels.length) * 0.65,
                transition: "height 90ms linear",
              }}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}

// ---- the send bar: one tap sends the batch ---------------------------------------------------------

function SendBar() {
  const api = useApi();
  const live = api.drafts.filter((d) => !api.removed.includes(d.id));
  const ready = live.filter(sendable).length;
  const total = live.length;
  const sending = api.conv?.phase === "sending";
  const none = ready === 0;
  const label = none ? "Указать, кому" : api.offhours ? `Отправлю утром в ${DELIVERY_WINDOW.from}` : ready === total ? `Отправить ${ready === 1 ? "" : ready}`.trim() : `Отправить ${ready} из ${total}`;
  return (
    <div className="relative">
      {api.offhours && !none ? (
        <div className="flex items-center justify-center gap-1 pb-2 text-[13.5px]" style={{ color: "var(--ink-3)" }}>
          вне окна {DELIVERY_WINDOW.from}–{DELIVERY_WINDOW.to} ·
          <button type="button" onClick={() => api.send(false)} className="pc-press inline-flex h-8 items-center font-medium underline decoration-1 underline-offset-[3px]" style={{ color: "var(--ink)" }}>
            отправить сейчас
          </button>
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={api.closeConv}
          aria-label="Закрыть черновик"
          className="pc-press inline-flex h-[56px] w-[56px] flex-none items-center justify-center rounded-full"
          style={{ background: "var(--card)", boxShadow: "inset 0 0 0 1px var(--line-2)", color: "var(--ink-2)" }}
        >
          <Icon name="x" size={20} stroke={1.8} />
        </button>
        <motion.button
          type="button"
          disabled={sending || total === 0}
          onClick={() => (none ? api.send(false) : api.send(api.offhours))}
          whileTap={{ scale: 0.97 }}
          className="relative inline-flex h-[56px] min-w-0 flex-1 items-center justify-center gap-2 overflow-hidden rounded-full text-[16.5px] font-medium"
          style={{ background: none ? "var(--btn)" : "var(--clay)", color: none ? "var(--on-btn)" : "#fff", boxShadow: none ? "none" : "0 10px 24px -12px color-mix(in srgb, var(--clay) 80%, transparent)" }}
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span key={label} initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -14, opacity: 0 }} className="inline-flex items-center gap-2 truncate">
              {label}
              {none ? <Icon name="person" size={18} /> : api.offhours ? <Icon name="clock" size={18} /> : <Icon name="up" size={19} stroke={2} />}
            </motion.span>
          </AnimatePresence>
        </motion.button>
      </div>
      {sending ? <Burst /> : null}
    </div>
  );
}

/** A small celebration over the send: paper flecks in the palette, gone in a second. */
function Burst() {
  const colors = ["var(--clay)", "var(--olive)", "var(--slate)", "#D4A27F", "var(--ink-4)"];
  return (
    <div className="pointer-events-none absolute top-1/2 left-[60%] h-0 w-0" aria-hidden>
      {Array.from({ length: 22 }, (_, i) => {
        const a = (i / 22) * Math.PI * 2 + seeded(i) * 0.4;
        const r = 70 + seeded(i + 40) * 90;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r * 0.7 - 70;
        return (
          <motion.span
            key={i}
            className="absolute block rounded-[2px]"
            style={{ width: 5 + (i % 3) * 2, height: 9 + (i % 2) * 3, background: colors[i % colors.length], left: -3, top: -5 }}
            initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 0.6 }}
            animate={{ x, y: [0, y, y + 90], opacity: [1, 1, 0], rotate: seeded(i + 7) * 540 - 270, scale: 1 }}
            transition={{ duration: 1.1, ease: [0.15, 0.7, 0.4, 1], times: [0, 0.55, 1] }}
          />
        );
      })}
    </div>
  );
}

// ---- the undo toast (D-139): five seconds to change your mind -----------------------------------------

function ToastLine({ toast, onDone }: { toast: Toast | null; onDone: () => void }) {
  return (
    <div className="pointer-events-none absolute inset-x-3 bottom-full mb-2 flex justify-center">
      <AnimatePresence>
        {toast ? (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, transition: { duration: 0.18 } }}
            transition={{ type: "spring", damping: 24, stiffness: 340 }}
            className="pointer-events-auto relative flex min-h-[48px] w-full max-w-[440px] items-center gap-3 overflow-hidden rounded-[18px] pr-1.5 pl-4"
            style={{ background: "var(--btn)", color: "var(--on-btn)", boxShadow: "var(--sh-2)" }}
            role="status"
          >
            <span className="min-w-0 flex-1 py-2.5 text-[14.5px] leading-[19px]">{toast.text}</span>
            {toast.undo ? (
              <button
                type="button"
                onClick={() => {
                  toast.undo?.();
                  onDone();
                }}
                className="pc-press inline-flex h-10 flex-none items-center gap-1.5 rounded-[12px] px-3 text-[14.5px] font-medium"
                style={{ color: "var(--clay)" }}
              >
                <Icon name="undo" size={16} /> Отменить
              </button>
            ) : null}
            {toast.undo ? <span className="pc-anim absolute bottom-0 left-0 h-[2.5px] w-full origin-left" style={{ background: "var(--clay)", animation: "pc-drain 5s linear forwards" }} /> : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
