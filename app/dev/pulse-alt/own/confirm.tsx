"use client";

/**
 * The phrase in the director's hand: «Понял так: …», one card per entity, each editable in
 * place (text, «Кому?», срок, повтор, «×»). Above, the folded sky shows who will receive what —
 * the «?» disc waits for «Кому?». Nothing leaves until the one key is tapped (D-36).
 */
import { AnimatePresence, motion } from "framer-motion";
import { useState, type ReactNode } from "react";

import { COMPANY, personById, whenLabel, type Draft } from "@/app/dev/pulse-alt/fixtures";

import { plural } from "./model";
import type { DraftItem } from "./types";
import { C, Clip, Disc, Icon, MONO, Press, type IconName } from "./ui";

// ---- summary and recipients ----------------------------------------------------------------------

export function summaryOf(drafts: Draft[]): string {
  const n = (k: Draft["kind"]) => drafts.filter((d) => d.kind === k).length;
  const parts: string[] = [];
  const tasks = n("task");
  if (tasks) parts.push(tasks === 1 ? "задача" : `${tasks} ${plural(tasks, ["задача", "задачи", "задач"])}`);
  if (n("announcement")) parts.push("объявление");
  for (const d of drafts) if (d.kind === "points") parts.push(`+${d.amount} ${plural(d.amount, ["очко", "очка", "очков"])}`);
  if (n("event")) parts.push(n("event") === 1 ? "встреча" : `${n("event")} встречи`);
  if (n("recurrence")) parts.push("повтор");
  if (n("note")) parts.push("заметка");
  if (n("reminder")) parts.push("напоминание");
  if (!parts.length) return "Понял так: пусто.";
  return `Понял так: ${parts.join(", ")}.`;
}

export const sendable = (d: Draft) => d.kind !== "task" || !!d.assigneeId;

export type Token = { key: string; kind: "person" | "all" | "unknown" | "me"; personId?: string; label: string; initials: string; draftIds: string[] };

/** Who receives the batch, in order: people, «?» for a task without an assignee, «Все», «Вы». */
export function tokensOf(drafts: Draft[]): Token[] {
  const map = new Map<string, Token>();
  const add = (key: string, t: Omit<Token, "draftIds" | "key">, draftId: string) => {
    const cur = map.get(key);
    if (cur) cur.draftIds.push(draftId);
    else map.set(key, { key, ...t, draftIds: [draftId] });
  };
  const person = (id: string, draftId: string) => {
    const p = personById(id);
    if (p) add(id, { kind: "person", personId: id, label: p.short, initials: p.initials }, draftId);
  };
  for (const d of drafts) {
    switch (d.kind) {
      case "task":
        if (d.assigneeId) person(d.assigneeId, d.id);
        else add(`?${d.id}`, { kind: "unknown", label: "Кому?", initials: "?" }, d.id);
        break;
      case "announcement":
        add("all", { kind: "all", label: `Все ${d.reach}`, initials: "∞" }, d.id);
        break;
      case "points":
        person(d.personId, d.id);
        break;
      case "event":
        d.peopleIds.forEach((id) => person(id, d.id));
        break;
      case "recurrence":
        person(d.assigneeId, d.id);
        break;
      case "note":
      case "reminder":
        add("me", { kind: "me", label: "Вам", initials: "Вы" }, d.id);
        break;
    }
  }
  return [...map.values()];
}

/** The folded sky during confirmation: who will receive the batch. */
export function Recipients({ tokens, night, onToken, pulses }: { tokens: Token[]; night: boolean; onToken: (t: Token) => void; pulses: Record<string, number> }) {
  return (
    <div className="flex h-full items-start justify-center gap-1 px-3 pt-2">
      <AnimatePresence initial={false} mode="popLayout">
        {tokens.slice(0, 8).map((t) => (
          <motion.button
            layout
            key={t.key}
            type="button"
            data-token={t.key}
            onClick={() => onToken(t)}
            className="relative flex min-w-0 max-w-[54px] flex-1 flex-col items-center gap-1"
            initial={{ opacity: 0, y: -10, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.6 }}
            transition={{ type: "spring", stiffness: 420, damping: 30 }}
            whileTap={{ scale: 0.9 }}
          >
            {t.kind === "unknown" ? (
              <motion.span className="grid h-[34px] w-[34px] place-items-center rounded-full text-[15px] font-bold" style={{ background: C.lime, color: C.limeInk }} animate={{ scale: [1, 1.08, 1] }} transition={{ duration: 1.6, repeat: Infinity }}>
                ?
              </motion.span>
            ) : t.kind === "all" ? (
              <span className="grid h-[34px] w-[34px] place-items-center rounded-full" style={{ background: night ? "rgba(255,255,255,.14)" : "#FFFFFF", color: night ? "#E7ECF3" : C.onSky, boxShadow: "inset 0 0 0 1px rgba(16,20,24,.06)" }}>
                <Icon name="broadcast" size={17} />
              </span>
            ) : t.kind === "me" ? (
              <Disc initials="Вы" look="secretary" size={34} />
            ) : (
              <Disc initials={t.initials} look="work" size={34} night={night} />
            )}
            <span className="max-w-full truncate text-[10.5px] font-semibold leading-3" style={{ color: night ? "#C9D2E0" : C.onSky2 }}>
              {t.label}
            </span>
            <TokenBurst n={pulses[t.key] ?? 0} />
          </motion.button>
        ))}
      </AnimatePresence>
      {tokens.length > 8 ? (
        <span className="grid h-[34px] w-[34px] place-items-center rounded-full text-[11px] font-semibold" style={{ background: "rgba(255,255,255,.5)", color: C.onSky2 }}>
          +{tokens.length - 8}
        </span>
      ) : null}
    </div>
  );
}

function TokenBurst({ n }: { n: number }) {
  return (
    <AnimatePresence>
      {n > 0 ? (
        <motion.span
          key={n}
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 h-[34px] w-[34px] -translate-x-1/2 rounded-full"
          style={{ boxShadow: `0 0 0 3px ${C.lime}` }}
          initial={{ scale: 0.9, opacity: 1 }}
          animate={{ scale: 2, opacity: 0 }}
          transition={{ duration: 0.75, ease: [0.2, 0.7, 0.2, 1] }}
        />
      ) : null}
    </AnimatePresence>
  );
}

// ---- the cards ------------------------------------------------------------------------------------

const KIND: Record<Draft["kind"], { icon: IconName; label: string }> = {
  task: { icon: "task", label: "Задача" },
  announcement: { icon: "broadcast", label: "Объявление" },
  points: { icon: "trophy", label: "Очки" },
  event: { icon: "calendar", label: "Встреча" },
  recurrence: { icon: "repeat", label: "Повтор" },
  note: { icon: "note", label: "Заметка" },
  reminder: { icon: "bell", label: "Напоминание" },
};

export function ConfirmList({
  sent,
  drafts,
  heard,
  heardSec,
  onEdit,
  onRemove,
  onWho,
  onDeadline,
  onRepeat,
  onClose,
  night,
}: {
  sent: number;
  drafts: DraftItem[];
  heard: string;
  heardSec: number;
  onEdit: (id: string, text: string) => void;
  onRemove: (id: string) => void;
  onWho: (id: string) => void;
  onDeadline: (id: string) => void;
  onRepeat: (id: string) => void;
  onClose: () => void;
  night: boolean;
}) {
  const [open, setOpen] = useState(false);
  const missing = drafts.filter((d) => !sendable(d)).length;
  if (!drafts.length && sent) {
    // the batch is in the air: the data is already written, the flight plays over it
    return (
      <div className="flex flex-col items-center px-6 pb-6 pt-10 text-center">
        <motion.span className="grid h-16 w-16 place-items-center rounded-full" style={{ background: C.lime, color: C.limeInk }} initial={{ scale: 0.3, rotate: -40 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 520, damping: 16 }}>
          <Icon name="check" size={32} stroke={2.6} />
        </motion.span>
        <motion.p className="mt-4 text-[22px] font-semibold" style={{ color: C.onInk }} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
          {night ? `Утром уйдёт ${sent}` : `Ушло ${sent}`}
        </motion.p>
        <p className="mt-1 text-[14px]" style={{ color: C.onInk2 }}>
          {night ? "Держу до 08:00." : "Летит к людям — смотрите наверх."}
        </p>
      </div>
    );
  }
  return (
    <div className="px-4 pb-3 pt-4">
      <div className="flex items-start gap-2">
        <motion.p
          key={summaryOf(drafts)}
          className="min-w-0 flex-1 pt-1 text-[19px] font-semibold leading-[25px] tracking-[-0.01em]"
          style={{ color: C.onInk }}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          {summaryOf(drafts)}
        </motion.p>
        <Press onClick={onClose} label="Закрыть черновик" className="-mr-1.5 grid h-11 w-11 shrink-0 place-items-center rounded-full" style={{ background: C.ink3, color: C.onInk2 }}>
          <Icon name="close" size={18} />
        </Press>
      </div>
      {heard ? (
        <button type="button" onClick={() => setOpen((v) => !v)} className="mt-2 flex w-full items-start gap-2 text-left">
          <span className="mt-[1px] shrink-0 text-[12px] font-semibold uppercase tracking-[0.08em]" style={{ color: C.onInk3 }}>
            Слышал
          </span>
          <span className={`text-[13px] leading-[18px] ${open ? "" : "line-clamp-2"}`} style={{ color: C.onInk2 }}>
            «{heard}»
          </span>
        </button>
      ) : null}
      {heard && open ? (
        <div className="mt-2">
          <Clip sec={heardSec} seed={5} />
        </div>
      ) : null}
      {night ? (
        <div className="mt-3 flex items-center gap-2 rounded-2xl px-3 py-2.5 text-[13px] leading-[18px]" style={{ background: "rgba(167,151,255,.12)", color: "#D6CEFF" }}>
          <Icon name="moon" size={16} />
          <span>Сейчас 21:30 — вне окна доставки 08:00–21:00. Люди получат утром.</span>
        </div>
      ) : null}
      <div className="mt-3 flex flex-col gap-2.5">
        <AnimatePresence initial={false}>
          {drafts.map((d, i) => (
            <motion.div
              key={d.id}
              layout
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0, transition: { type: "spring", stiffness: 380, damping: 32, delay: Math.min(i, 6) * 0.045 } }}
              exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.18 } }}
            >
              <DraftCard d={d} onEdit={onEdit} onRemove={onRemove} onWho={onWho} onDeadline={onDeadline} onRepeat={onRepeat} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      {missing ? (
        <p className="mt-3 text-center text-[12.5px]" style={{ color: C.onInk3 }}>
          {missing === 1 ? "Одна задача ждёт «Кому?» — без исполнителя она не уйдёт." : `${missing} задачи ждут «Кому?».`}
        </p>
      ) : null}
    </div>
  );
}

function DraftCard({
  d,
  onEdit,
  onRemove,
  onWho,
  onDeadline,
  onRepeat,
}: {
  d: DraftItem;
  onEdit: (id: string, text: string) => void;
  onRemove: (id: string) => void;
  onWho: (id: string) => void;
  onDeadline: (id: string) => void;
  onRepeat: (id: string) => void;
}) {
  const k = KIND[d.kind];
  const needs = !sendable(d);
  return (
    <div
      data-draft-id={d.id}
      className="relative rounded-[20px] p-3.5 pr-2"
      style={{
        background: C.ink2,
        boxShadow: needs ? `inset 0 0 0 1.5px ${C.lime}` : "inset 0 1px 0 rgba(255,255,255,.04)",
      }}
    >
      <div className="flex h-7 items-center gap-1.5 pr-11 text-[11.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: C.onInk3 }}>
        <Icon name={k.icon} size={15} />
        <span className="flex-1">{k.label}</span>
        {d.kind === "task" && d.voiceSec ? (
          <span className="normal-case tracking-normal">
            <Clip sec={d.voiceSec} seed={d.id.length + d.title.length} compact tiny />
          </span>
        ) : null}
      </div>
      <Press onClick={() => onRemove(d.id)} label="Убрать" className="absolute right-1 top-1 grid h-11 w-11 place-items-center rounded-full" style={{ color: C.onInk3 }}>
        <Icon name="close" size={18} />
      </Press>
      <div className="mt-1.5 pr-2">
        {d.kind === "points" ? (
          <div className="flex items-baseline gap-2.5">
            <span className="text-[30px] leading-[34px]" style={{ ...MONO, color: C.lime }}>
              +{d.amount}
            </span>
            <span className="text-[15px] font-medium leading-5" style={{ color: C.onInk }}>
              {personById(d.personId)?.short} — {d.reason}
            </span>
          </div>
        ) : (
          <EditableText value={textOf(d)} onSave={(t) => onEdit(d.id, t)} />
        )}
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {d.kind === "task" ? (
          <>
            {d.assigneeId ? (
              <PersonChip id={d.assigneeId} onClick={() => onWho(d.id)} />
            ) : (
              <Press onClick={() => onWho(d.id)} className="inline-flex h-9 items-center gap-1.5 rounded-full pl-2 pr-3 text-[13px] font-semibold" style={{ background: C.lime, color: C.limeInk }}>
                <Icon name="user" size={16} />
                Кому?
                {d.heardName ? <span className="font-medium opacity-70">слышал «{d.heardName}»</span> : null}
              </Press>
            )}
            <Chip icon="clock" onClick={() => onDeadline(d.id)}>
              {d.deadline ? whenLabel(d.deadline) : "Срок"}
            </Chip>
            {d.repeat ? (
              <Chip icon="repeat" onClick={() => onRepeat(d.id)}>
                {d.repeat}
              </Chip>
            ) : (
              <Press onClick={() => onRepeat(d.id)} label="Повтор" className="relative grid h-9 w-9 place-items-center rounded-full before:absolute before:-inset-1 before:content-['']" style={{ background: C.ink3, color: C.onInk3 }}>
                <Icon name="repeat" size={16} />
              </Press>
            )}
          </>
        ) : null}
        {d.kind === "announcement" ? (
          <Chip icon="people">
            {d.audience} · {d.reach} {plural(d.reach, ["человек", "человека", "человек"])}
          </Chip>
        ) : null}
        {d.kind === "event" ? (
          <>
            <Chip icon="clock">{whenLabel(d.startsAt)}</Chip>
            {d.place ? <Chip icon="place">{d.place}</Chip> : null}
            <span className="ml-0.5 flex items-center">
              {d.peopleIds.map((id, i) => {
                const p = personById(id);
                return p ? <Disc key={id} initials={p.initials} look="onInk" size={28} style={{ marginLeft: i ? -6 : 0, boxShadow: `0 0 0 2px ${C.ink2}` }} /> : null;
              })}
              <span className="ml-2 text-[12.5px]" style={{ color: C.onInk2 }}>
                {d.peopleIds.map((id) => personById(id)?.short).join(", ")}
              </span>
            </span>
          </>
        ) : null}
        {d.kind === "recurrence" ? (
          <>
            <PersonChip id={d.assigneeId} />
            <Chip icon="repeat">{d.rule}</Chip>
            <span className="text-[12px]" style={{ color: C.onInk3 }}>
              первый раз {whenLabel(d.firstAt)}
            </span>
          </>
        ) : null}
        {d.kind === "note" ? <Chip icon="note">Вам в заметки</Chip> : null}
        {d.kind === "reminder" ? (
          <>
            <Chip icon="bell">{whenLabel(d.at)}</Chip>
            <span className="text-[12px]" style={{ color: C.onInk3 }}>
              напомню вам
            </span>
          </>
        ) : null}
        {d.kind === "points" ? (
          <span className="text-[12px]" style={{ color: C.onInk3 }}>
            {COMPANY.pointsEnabled ? "увидит в рейтинге и ленте" : ""}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function textOf(d: Draft): string {
  switch (d.kind) {
    case "task":
    case "event":
    case "recurrence":
      return d.title;
    case "announcement":
    case "note":
    case "reminder":
      return d.text;
    case "points":
      return d.reason;
  }
}

/** Tap the text — edit it in place; Enter or a tap outside keeps it. */
function EditableText({ value, onSave }: { value: string; onSave: (t: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  if (editing) {
    return (
      <textarea
        autoFocus
        value={text}
        rows={2}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          setEditing(false);
          if (text.trim() && text !== value) onSave(text.trim());
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLTextAreaElement).blur();
          }
        }}
        className="w-full resize-none rounded-xl px-2 py-1.5 text-[16px] font-medium leading-[21px] outline-none"
        style={{ background: C.ink3, color: C.onInk, caretColor: C.lime, userSelect: "text" }}
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => {
        setText(value);
        setEditing(true);
      }}
      className="w-full text-left text-[16px] font-medium leading-[21px]"
      style={{ color: C.onInk }}
    >
      {value}
    </button>
  );
}

export function Chip({ icon, children, onClick, quiet = false }: { icon?: IconName; children: ReactNode; onClick?: () => void; quiet?: boolean }) {
  const inner = (
    <>
      {icon ? <Icon name={icon} size={15} /> : null}
      <span className="truncate">{children}</span>
    </>
  );
  const cls = "relative inline-flex h-9 max-w-full items-center gap-1.5 rounded-full px-3 text-[13px] font-medium before:absolute before:inset-x-0 before:-inset-y-1 before:content-['']";
  const style = { background: C.ink3, color: quiet ? C.onInk3 : C.onInk };
  if (!onClick)
    return (
      <span className={cls} style={style}>
        {inner}
      </span>
    );
  return (
    <Press onClick={onClick} className={cls} style={style}>
      {inner}
    </Press>
  );
}

function PersonChip({ id, onClick }: { id: string; onClick?: () => void }) {
  const p = personById(id);
  if (!p) return null;
  const inner = (
    <>
      <Disc initials={p.initials} look="onInk" size={26} style={{ background: "#3A4148" }} />
      <span>{p.short}</span>
    </>
  );
  const cls = "relative inline-flex h-9 items-center gap-1.5 rounded-full pl-1 pr-3 text-[13px] font-semibold before:absolute before:inset-x-0 before:-inset-y-1 before:content-['']";
  if (!onClick)
    return (
      <span className={cls} style={{ background: C.ink3, color: C.onInk }}>
        {inner}
      </span>
    );
  return (
    <Press onClick={onClick} className={cls} style={{ background: C.ink3, color: C.onInk }}>
      {inner}
    </Press>
  );
}
