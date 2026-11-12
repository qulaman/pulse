"use client";

import { AnimatePresence, motion, useMotionValue, useTransform, type PanInfo } from "motion/react";
import { useRef, useState } from "react";

import { LANE_KEYS, at, dayLabel, hhmm, personById, whenLabel, type Task } from "@/app/dev/pulse-alt/fixtures";

import { useApi } from "./ctx";
import { deckOf, laneNote, lanesOf, receiptOf, seeded, verb } from "./model";
import { Avatar, Btn, Icon, MiniPlay } from "./ui";

const CLOSING = "__closing";

type Dir = "up" | "down" | "next" | "prev";

const TONE_INK: Record<string, string> = { clay: "var(--clay-ink)", olive: "var(--olive-ink)", slate: "var(--slate-ink)", ink: "var(--ink-3)" };

/**
 * The attention deck: overdue → declined → review, then one closing card with the calm work and
 * the morning. Swipe up — the lane's main key, down — later, sideways — browse, tap — the
 * thread, long press or «⋯» — every move.
 */
export function Deck() {
  const api = useApi();
  const attention = deckOf(api.tasks);
  const [order, setOrder] = useState<string[]>(() => attention.map((t) => t.id));
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState<Dir>("next");

  const ids = [...order.filter((id) => attention.some((t) => t.id === id)), ...attention.filter((t) => !order.includes(t.id)).map((t) => t.id), CLOSING];
  const i = Math.min(index, ids.length - 1);
  const topId = ids[i]!;
  const top = attention.find((t) => t.id === topId) ?? null;
  const keys = top ? LANE_KEYS[top.lane] : [];

  const main = (task: Task) => {
    const key = LANE_KEYS[task.lane][0];
    if (!key) return;
    setDir("up");
    api.act(task.id, key);
  };
  const later = (task: Task) => {
    setDir("down");
    setOrder([...ids.filter((x) => x !== task.id && x !== CLOSING), task.id]);
  };
  const browse = (d: 1 | -1) => {
    const n = i + d;
    if (n < 0 || n >= ids.length) return;
    setDir(d > 0 ? "next" : "prev");
    setIndex(n);
  };

  const visible = ids.slice(i, i + 3);

  return (
    <div className="flex flex-col">
      <div className="relative mx-5" style={{ height: "clamp(350px, calc(100dvh - 420px), 400px)" }}>
        <AnimatePresence initial={false} custom={dir}>
          {visible
            .map((id, depth) => ({ id, depth }))
            .reverse()
            .map(({ id, depth }) => (
              <DeckCard
                key={id}
                depth={depth}
                dir={dir}
                task={attention.find((t) => t.id === id) ?? null}
                onMain={main}
                onLater={later}
                onBrowse={browse}
              />
            ))}
        </AnimatePresence>
      </div>

      {/* where you are in the deck */}
      <div className="mt-7 flex items-center justify-center gap-1.5" aria-label={`${i + 1} из ${ids.length}`}>
        {ids.map((id, k) => {
          const t = attention.find((x) => x.id === id);
          const tone = t ? TONE_INK[laneNote(t).tone] : "var(--ink-4)";
          return (
            <button key={id} type="button" onClick={() => browse((k - i) as 1 | -1)} aria-label={`Карточка ${k + 1}`} className="inline-flex h-6 items-center px-0.5">
              <motion.span className="block h-[6px] rounded-full" animate={{ width: k === i ? 20 : 6, opacity: k === i ? 1 : 0.45 }} style={{ background: tone }} />
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex min-h-[44px] justify-center gap-2 px-5">
        {top ? (
          keys.map((key, k) => (
            <Btn key={key} kind={k === 0 ? "primary" : "quiet"} onClick={() => (k === 0 ? main(top) : api.act(top.id, key))} className={k === 0 ? "flex-[1.3]" : "flex-1"} style={{ paddingInline: 10 }}>
              {key}
            </Btn>
          ))
        ) : (
          <Btn kind="quiet" onClick={() => api.note("«Задачи» — отдельный экран, в этот прототип не входит")}>
            Все задачи
          </Btn>
        )}
      </div>
      <p className="mt-2.5 text-center text-[12px]" style={{ color: "var(--ink-4)" }}>
        {top ? `↑ ${keys[0]} · ↓ позже · ←→ листать · удержать — ещё` : "← листать назад"}
      </p>
    </div>
  );
}

function DeckCard({
  task,
  depth,
  dir,
  onMain,
  onLater,
  onBrowse,
}: {
  task: Task | null;
  depth: number;
  dir: Dir;
  onMain: (t: Task) => void;
  onLater: (t: Task) => void;
  onBrowse: (d: 1 | -1) => void;
}) {
  const api = useApi();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-220, 0, 220], [-9, 0, 9]);
  const upHint = useTransform(y, [-130, -30, 0], [1, 0, 0]);
  const downHint = useTransform(y, [0, 30, 130], [0, 0, 1]);
  const press = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longFired = useRef(false);
  const top = depth === 0;
  const mainKey = task ? LANE_KEYS[task.lane][0] : null;

  const end = (_: unknown, info: PanInfo) => {
    if (!task) {
      if (info.offset.x > 90) onBrowse(-1);
      return;
    }
    if (info.offset.y < -100 || info.velocity.y < -800) onMain(task);
    else if (info.offset.y > 100 || info.velocity.y > 800) onLater(task);
    else if (info.offset.x < -90) onBrowse(1);
    else if (info.offset.x > 90) onBrowse(-1);
  };

  const exit = (d: Dir) =>
    d === "up"
      ? { y: -560, opacity: 0, rotate: -5, transition: { duration: 0.42, ease: [0.4, 0, 0.8, 0.4] as const } }
      : d === "down"
        ? { y: 420, opacity: 0, scale: 0.9, transition: { duration: 0.38 } }
        : d === "next"
          ? { x: -460, opacity: 0, rotate: -12, transition: { duration: 0.34 } }
          : { opacity: 0, scale: 0.85, y: 30, transition: { duration: 0.25 } };

  return (
    <motion.div
      custom={dir}
      variants={{ exit }}
      initial={dir === "prev" && top ? { x: -460, rotate: -12, opacity: 0 } : { opacity: 0, y: 46, scale: 0.86 }}
      animate={{ opacity: depth > 2 ? 0 : 1, y: depth * 10, scale: 1 - depth * 0.05, x: 0, rotate: 0 }}
      exit="exit"
      transition={{ type: "spring", damping: 28, stiffness: 320 }}
      className="absolute inset-0 touch-none"
      style={{ zIndex: 10 - depth, transformOrigin: "50% 100%", pointerEvents: top ? "auto" : "none" }}
    >
      <motion.div
        drag={top}
        dragSnapToOrigin
        dragElastic={0.55}
        style={{ x, y, rotate }}
        onDragStart={() => {
          if (press.current) clearTimeout(press.current);
        }}
        onDragEnd={end}
        onPointerDown={() => {
          longFired.current = false;
          if (!task || !top) return;
          press.current = setTimeout(() => {
            longFired.current = true;
            try {
              navigator.vibrate?.(10);
            } catch {
              /* no vibration */
            }
            api.openActions(task.id);
          }, 520);
        }}
        onPointerUp={() => {
          if (press.current) clearTimeout(press.current);
        }}
        onTap={() => {
          if (longFired.current || !task) return;
          api.openThread(task.id);
        }}
        className="relative h-full overflow-hidden rounded-[26px]"
        data-deck-card={top ? "top" : undefined}
        whileTap={top ? { scale: 0.99 } : undefined}
      >
        <div
          className="absolute inset-0 rounded-[26px]"
          style={{
            background: depth === 0 ? "var(--card)" : "color-mix(in srgb, var(--card) 72%, var(--oat))",
            boxShadow: depth === 0 ? "var(--sh-2), inset 0 0 0 1px var(--line)" : "var(--sh-1), inset 0 0 0 1px var(--line)",
          }}
        />
        <motion.div className="relative h-full" initial={false} animate={{ opacity: depth <= 1 ? 1 : 0 }} transition={{ duration: 0.25 }}>
          {task ? <CardBody task={task} /> : <ClosingCard />}
        </motion.div>
      </motion.div>
        {top && task && mainKey ? (
          <>
            <motion.div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex h-16 items-start justify-center pt-3" style={{ opacity: upHint }}>
              <span className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13.5px] font-medium" style={{ background: "var(--btn)", color: "var(--on-btn)" }}>
                <Icon name="up" size={15} stroke={2} /> {mainKey}
              </span>
            </motion.div>
            <motion.div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex h-16 items-end justify-center pb-3" style={{ opacity: downHint }}>
              <span className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13.5px] font-medium" style={{ background: "var(--oat)", color: "var(--ink-2)" }}>
                <Icon name="down" size={15} stroke={2} /> Позже
              </span>
            </motion.div>
          </>
        ) : null}
    </motion.div>
  );
}

export function ReceiptRow({ task }: { task: Task }) {
  const { steps, quiet } = receiptOf(task);
  if (!steps.length) return <span className="text-[13px]" style={{ color: "var(--ink-3)" }}>{quiet}</span>;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12.5px] leading-[17px]" style={{ color: "var(--ink-3)" }}>
      {steps
        .filter((s) => s.done)
        .map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1 whitespace-nowrap">
            <Icon name="check" size={12} stroke={2.2} style={{ color: "var(--olive)" }} />
            {s.label} {s.time}
          </span>
        ))}
      {quiet ? (
        <span className="inline-flex items-center gap-1 whitespace-nowrap">
          <span className="h-1.5 w-1.5 rounded-full" style={{ boxShadow: "inset 0 0 0 1.2px var(--ink-4)" }} />
          {quiet}
        </span>
      ) : null}
    </div>
  );
}

function CardBody({ task }: { task: Task }) {
  const api = useApi();
  const who = personById(task.assigneeId);
  const note = laneNote(task);
  return (
    <div className="pc-scroll relative flex h-full flex-col px-5 pt-4 pb-4">
      <div className="flex items-center gap-2">
        <span className="pc-caps" style={{ color: TONE_INK[note.tone] }}>
          {note.label}
        </span>
        <span className="flex-1" />
        {task.voiceSec ? (
          <span onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
            <MiniPlay sec={task.voiceSec} />
          </span>
        ) : null}
        <button
          type="button"
          aria-label="Все действия"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            api.openActions(task.id);
          }}
          className="pc-press -my-2 -mr-2.5 inline-flex h-11 w-11 items-center justify-center rounded-full"
          style={{ color: "var(--ink-3)" }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <circle cx="6" cy="12" r="1.6" />
            <circle cx="12" cy="12" r="1.6" />
            <circle cx="18" cy="12" r="1.6" />
          </svg>
        </button>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <Avatar person={who} size={28} tone={note.tone === "ink" ? "plain" : (note.tone as "clay" | "olive" | "slate")} />
        <span className="min-w-0 truncate text-[14.5px]" style={{ color: "var(--ink)" }}>
          <span className="font-medium">{who?.short}</span>
          <span style={{ color: "var(--ink-3)" }}> · {who?.position}</span>
        </span>
      </div>
      <div className="pc-serif mt-2.5 text-[22px] leading-[28px] tracking-[-0.01em]" style={{ color: "var(--ink)", textWrap: "pretty" }}>
        {task.title}
      </div>
      <div className="mt-1.5 flex items-center gap-1.5 text-[13.5px]" style={{ color: task.lane === "overdue" ? "var(--clay-ink)" : "var(--ink-3)" }}>
        <Icon name="clock" size={14} />
        {task.deadline ? `срок ${whenLabel(task.deadline, api.now)}` : "без срока"}
      </div>

      {task.lane === "overdue" && task.deadline ? (
        <div className="mt-3.5 flex flex-wrap items-center gap-1.5 rounded-[16px] py-2 pr-2 pl-3.5" style={{ background: "var(--clay-soft)" }}>
          <span className="mr-auto text-[13.5px]" style={{ color: "var(--clay-ink)" }}>
            Продлить
          </span>
          <div className="flex gap-1.5">
            {[
              { label: "До 12:00", iso: at(0, 12) },
              { label: "До 18:00", iso: at(0, 18) },
              { label: "Завтра", iso: at(1, 12) },
            ].map((o) => (
              <button
                key={o.label}
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  api.setDeadline(task.id, o.iso, o.label === "Завтра" ? "завтра к 12:00" : `сегодня к ${hhmm(o.iso)}`);
                }}
                className="pc-press inline-flex h-9 items-center rounded-full px-3 text-[13px] font-medium"
                style={{ background: "var(--card)", color: "var(--ink)" }}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {task.decline ? (
        <div className="mt-3.5 rounded-[16px] px-3.5 py-3" style={{ background: "var(--clay-soft)" }}>
          <div className="pc-serif text-[17px] leading-[23px] italic" style={{ color: "var(--ink)" }}>
            «{task.decline.reason}»
          </div>
          {task.decline.suggestion ? (
            <div className="mt-2 flex items-center gap-2">
              <span className="min-w-0 flex-1 text-[13.5px] leading-[18px]" style={{ color: "var(--ink-2)" }}>
                {task.decline.suggestion}
              </span>
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  api.reassign(task.id, "p-erlanb");
                }}
                className="pc-press inline-flex h-9 flex-none items-center gap-1 rounded-full px-3 text-[13px] font-medium"
                style={{ background: "var(--card)", color: "var(--ink)" }}
              >
                <Icon name="pass" size={14} /> Ерлану Б.
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {task.report ? (
        <div className="mt-3.5">
          {task.report.partial ? (
            <span className="mb-2 inline-flex h-6 items-center rounded-full px-2.5 text-[12px] font-medium" style={{ background: "var(--clay-soft)", color: "var(--clay-ink)" }}>
              Сделано не всё
            </span>
          ) : null}
          <div className="pc-serif text-[17px] leading-[23px]" style={{ color: "var(--ink-2)" }}>
            «{task.report.text}»
          </div>
          <div className="mt-2.5 flex gap-2">
            {Array.from({ length: task.report.photos ?? 0 }, (_, k) => (
              <span
                key={k}
                className="inline-flex h-[58px] w-[58px] items-center justify-center rounded-[12px]"
                style={{
                  background: `linear-gradient(${120 + k * 40}deg, color-mix(in srgb, #D4A27F ${30 + seeded(k + 2) * 30}%, var(--oat)), color-mix(in srgb, var(--olive) ${18 + k * 6}%, var(--oat)))`,
                  color: "var(--ink-3)",
                }}
              >
                <Icon name="image" size={18} />
              </span>
            ))}
            <span className="self-end pb-0.5 text-[12.5px]" style={{ color: "var(--ink-3)" }}>
              {verb(task.assigneeId, "сдал")} в {hhmm(task.report.at)}
            </span>
          </div>
        </div>
      ) : null}

      <div className="flex-1" />
      <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--line)" }}>
        <ReceiptRow task={task} />
      </div>
    </div>
  );
}

function ClosingCard() {
  const api = useApi();
  const lanes = lanesOf(api.tasks);
  return (
    <div
      className="pc-scroll relative h-full px-5 pt-4 pb-6"
      onPointerDownCapture={(e) => e.stopPropagation()}
      style={{ WebkitMaskImage: "linear-gradient(to bottom, #000 calc(100% - 28px), transparent)", maskImage: "linear-gradient(to bottom, #000 calc(100% - 28px), transparent)" }}
    >
      <span className="pc-caps" style={{ color: "var(--slate-ink)" }}>
        В работе: {lanes.work.length}
      </span>
      <div className="pc-serif mt-1.5 text-[21px] leading-[27px]" style={{ color: "var(--ink)" }}>
        Остальное идёт своим ходом
      </div>
      <ul className="mt-3 flex flex-col">
        {lanes.work.map((t, k) => {
          const who = personById(t.assigneeId);
          const r = receiptOf(t);
          return (
            <li key={t.id} style={{ borderTop: k ? "1px solid var(--line)" : "none" }}>
              <button type="button" onClick={() => api.openThread(t.id)} className="pc-press flex w-full items-start gap-2.5 py-2.5 text-left">
                <Avatar person={who} size={28} tone={r.quiet ? "plain" : "slate"} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[14.5px] leading-[19px]" style={{ color: "var(--ink)" }}>
                    {t.title}
                  </span>
                  <span className="block text-[12.5px] leading-[17px]" style={{ color: "var(--ink-3)" }}>
                    {who?.short} · {r.quiet ?? (t.status === "rework" ? "на доработке" : `${verb(t.assigneeId, "принял")}`)}
                    {t.deadline ? ` · до ${dayLabel(t.deadline, api.now) === "сегодня" ? hhmm(t.deadline) : dayLabel(t.deadline, api.now)}` : ""}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {lanes.held.length ? (
        <>
          <div className="pc-caps mt-3 mb-1" style={{ color: "var(--ink-3)" }}>
            Утром в 8:00
          </div>
          {lanes.held.map((t) => {
            const who = personById(t.assigneeId);
            return (
              <div key={t.id} className="rounded-[16px] px-3 py-2.5" style={{ border: "1.3px dashed var(--line-2)" }}>
                <div className="flex items-center gap-2 text-[14px]" style={{ color: "var(--ink-2)" }}>
                  <Avatar person={who} size={24} style={{ opacity: 0.7 }} />
                  <span className="min-w-0 flex-1 truncate">{t.title}</span>
                </div>
                <div className="mt-2 flex gap-2">
                  <Btn kind="quiet" size="sm" onClick={() => api.act(t.id, "Отправить сейчас")}>
                    Отправить сейчас
                  </Btn>
                  <Btn kind="ghost" size="sm" onClick={() => api.act(t.id, "Удалить")}>
                    Удалить
                  </Btn>
                </div>
              </div>
            );
          })}
        </>
      ) : null}
    </div>
  );
}
