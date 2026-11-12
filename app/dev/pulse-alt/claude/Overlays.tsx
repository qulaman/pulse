"use client";

import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { ALL_ACTIONS, PEOPLE, QUICK_ANSWERS, UNDOABLE, at, hhmm, personById, whenLabel, type Draft, type Message } from "@/app/dev/pulse-alt/fixtures";

import { useApi } from "./ctx";
import { ReceiptRow } from "./Deck";
import { useHold } from "./hold";
import { dative, laneNote } from "./model";
import { AnswerFaces, answersOf } from "./Panels";
import { Avatar, Btn, Icon, Sheet, VoiceClip } from "./ui";

export function Overlays() {
  return (
    <>
      <Thread />
      <Actions />
      <Picker />
      <WhenSheet />
      <RepeatSheet />
      <EventSheet />
      <InstallSheet />
    </>
  );
}

// ---- the thread, over everything; closing returns exactly where you were (D-64) ----------------

function Thread() {
  const api = useApi();
  const task = api.tasks.find((t) => t.id === api.thread) ?? null;
  const who = personById(task?.assigneeId);
  return (
    <Sheet
      open={Boolean(api.thread)}
      onClose={api.closeThread}
      level="over"
      title={<span className="text-[22px] leading-[28px]">{task?.title ?? "Задача закрыта"}</span>}
      sub={
        task ? (
          <span className="inline-flex items-center gap-1.5">
            <Avatar person={who} size={20} /> {who?.short} · {laneNote(task).label.toLowerCase()} · {task.deadline ? `до ${whenLabel(task.deadline, api.now)}` : "без срока"}
          </span>
        ) : null
      }
    >
      {task ? <ThreadBody key={task.id} taskId={task.id} /> : null}
    </Sheet>
  );
}

function Bubble({ m, personId }: { m: Message; personId: string }) {
  if (m.from === "system") {
    return (
      <div className="my-1 text-center text-[12.5px]" style={{ color: "var(--ink-3)" }}>
        {m.text} · {hhmm(m.at)}
      </div>
    );
  }
  const mine = m.from === "director";
  return (
    <motion.div initial={{ opacity: 0, y: 10, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} className={`flex items-end gap-2 ${mine ? "justify-end" : ""}`}>
      {!mine ? <Avatar person={personById(personId)} size={28} /> : null}
      <div
        className="max-w-[82%] rounded-[20px] px-3.5 py-2.5"
        style={{
          background: mine ? "var(--bubble)" : "var(--card)",
          boxShadow: mine ? "none" : "inset 0 0 0 1px var(--line)",
          borderBottomRightRadius: mine ? 6 : 20,
          borderBottomLeftRadius: mine ? 20 : 6,
        }}
      >
        {m.voiceSec ? (
          <div className="mb-1.5 -ml-1">
            <VoiceClip sec={m.voiceSec} seed={m.voiceSec + 5} compact />
          </div>
        ) : null}
        {m.text ? (
          <p className="text-[15px] leading-[21px]" style={{ color: "var(--ink)" }}>
            {m.text}
          </p>
        ) : null}
        <div className="mt-0.5 text-right text-[11px]" style={{ color: "var(--ink-4)" }}>
          {hhmm(m.at)}
        </div>
      </div>
    </motion.div>
  );
}

function ThreadBody({ taskId }: { taskId: string }) {
  const api = useApi();
  const task = api.tasks.find((t) => t.id === taskId)!;
  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const [recSec, setRecSec] = useState(0);
  const startAt = useRef(0);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const count = task.thread.length;

  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight, behavior: "smooth" });
  }, [count]);
  useEffect(() => {
    if (!api.threadFocus) return;
    const t = setTimeout(() => input.current?.focus(), 350);
    return () => clearTimeout(t);
  }, [api.threadFocus]);
  useEffect(() => {
    if (!recording) return;
    const iv = setInterval(() => setRecSec(Math.floor((performance.now() - startAt.current) / 1000)), 200);
    return () => clearInterval(iv);
  }, [recording]);

  const hold = useHold({
    delay: 160,
    onHoldStart: () => {
      startAt.current = performance.now();
      setRecSec(0);
      setRecording(true);
    },
    onHoldEnd: () => {
      const sec = Math.round((performance.now() - startAt.current) / 1000);
      setRecording(false);
      if (sec >= 1) api.answer(task.id, "", sec);
    },
    onHoldCancel: () => setRecording(false),
    onTap: () => api.toast("Удержите, чтобы сказать голосом"),
  });

  const send = () => {
    const line = text.trim();
    if (!line) return;
    api.answer(task.id, line);
    setText("");
  };

  const q = task.question;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-5 pb-2">
        <ReceiptRow task={task} />
      </div>
      <div ref={box} className="pc-scroll flex min-h-0 flex-1 flex-col gap-2.5 px-4 pt-2 pb-3" style={{ borderTop: "1px solid var(--line)" }}>
        <div className="flex-1" />
        {task.thread.length === 0 ? (
          <p className="pc-serif py-6 text-center text-[17px]" style={{ color: "var(--ink-3)" }}>
            Переписки пока нет.
          </p>
        ) : null}
        {task.thread.map((m) => (
          <Bubble key={m.id} m={m} personId={task.assigneeId} />
        ))}
      </div>
      <div className="flex-none px-3 pt-2" style={{ paddingBottom: "max(env(safe-area-inset-bottom), 10px)", borderTop: "1px solid var(--line)" }}>
        {q ? (
          <div className="pc-xscroll -mx-3 mb-2 flex gap-1.5 px-3">
            {QUICK_ANSWERS[q.kind]
              .filter((a) => a !== "Ответить словами")
              .map((a) => (
                <Btn key={a} kind="quiet" size="sm" onClick={() => api.answer(task.id, a)} className="flex-none">
                  {a}
                </Btn>
              ))}
          </div>
        ) : null}
        <div className="flex items-center gap-1.5 rounded-[26px] py-1.5 pr-1.5 pl-4" style={{ background: "var(--card)", boxShadow: "var(--sh-1), inset 0 0 0 1px var(--line)" }}>
          {recording ? (
            <span className="flex h-11 min-w-0 flex-1 items-center gap-2 text-[15px]" style={{ color: "var(--ink-2)" }}>
              <span className="pc-anim h-2 w-2 rounded-full" style={{ background: "var(--clay)", animation: "pc-dot 1.2s infinite" }} />
              Голосом {personById(task.assigneeId)?.short} · 0:{String(recSec).padStart(2, "0")}
            </span>
          ) : (
            <form
              className="min-w-0 flex-1"
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
            >
              <input ref={input} value={text} onChange={(e) => setText(e.target.value)} placeholder={`Ответить ${dative(personById(task.assigneeId))}…`} className="h-11 w-full bg-transparent text-[16px] outline-none" style={{ color: "var(--ink)" }} />
            </form>
          )}
          {text.trim() ? (
            <button type="button" onClick={send} aria-label="Отправить" className="pc-press inline-flex h-11 w-11 items-center justify-center rounded-full" style={{ background: "var(--btn)", color: "var(--on-btn)" }}>
              <Icon name="up" size={20} stroke={2} />
            </button>
          ) : (
            <button type="button" {...hold} aria-label="Удержите и говорите" className="relative inline-flex h-11 w-11 touch-none items-center justify-center rounded-full" style={{ background: "var(--clay)", color: "#fff" }}>
              {recording ? <span className="pc-anim absolute inset-0 rounded-full" style={{ background: "var(--clay)", animation: "pc-halo 1.4s ease-out infinite" }} /> : null}
              <Icon name="mic" size={21} stroke={1.9} style={{ position: "relative" }} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- «Все действия» -----------------------------------------------------------------------------

const ACTION_ICON: Record<string, string> = { Открыть: "open", Ответить: "chat", Срок: "clock", Напомнить: "remind", Передать: "pass", Отозвать: "revoke", Удалить: "trash", "Выдать снова": "again" };

function Actions() {
  const api = useApi();
  const task = api.tasks.find((t) => t.id === api.actions) ?? null;
  const who = personById(task?.assigneeId);
  return (
    <Sheet open={Boolean(api.actions)} onClose={() => api.openActions(null)} level="modal" title={<span className="text-[21px] leading-[27px]">{task?.title}</span>} sub={task ? `${who?.short} · ${laneNote(task).label.toLowerCase()}` : undefined}>
      <ul className="px-3 pb-[max(env(safe-area-inset-bottom),14px)]">
        {ALL_ACTIONS.map((a, i) => {
          const danger = a === "Отозвать" || a === "Удалить";
          return (
            <motion.li key={a} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.04 * i }}>
              <button
                type="button"
                onClick={() => {
                  if (!task) return;
                  const keep = a === "Срок" || a === "Передать";
                  if (!keep) api.openActions(null);
                  api.act(task.id, a);
                  if (keep) api.openActions(null);
                }}
                className="pc-press flex min-h-[52px] w-full items-center gap-3.5 rounded-[14px] px-3 text-left text-[16px]"
                style={{ color: danger ? "var(--clay-ink)" : "var(--ink)" }}
              >
                <Icon name={ACTION_ICON[a] ?? "right"} size={20} style={{ color: danger ? "var(--clay-ink)" : "var(--ink-3)" }} />
                <span className="flex-1">{a}</span>
                {UNDOABLE.has(a) ? (
                  <span className="text-[12px]" style={{ color: "var(--ink-4)" }}>
                    5 с на отмену
                  </span>
                ) : null}
              </button>
            </motion.li>
          );
        })}
      </ul>
    </Sheet>
  );
}

// ---- «Кому?»: candidates first (heard «Айгерим») --------------------------------------------------

function Picker() {
  const api = useApi();
  const p = api.picker;
  const [q, setQ] = useState("");
  const draft = p?.for === "draft" ? (api.drafts.find((d) => d.id === p.id) as Extract<Draft, { kind: "task" }> | undefined) : undefined;
  const task = p?.for === "task" ? api.tasks.find((t) => t.id === p.id) : undefined;
  const candidates = draft?.candidates ?? (task?.decline?.suggestion ? ["p-erlanb"] : []);
  const exclude = task?.assigneeId;
  const all = PEOPLE.filter((x) => x.id !== exclude && !candidates.includes(x.id) && x.short.toLowerCase().includes(q.trim().toLowerCase()));
  const pick = (id: string) => {
    if (!p) return;
    if (p.for === "draft") api.editDraft(p.id, { assigneeId: id } as Partial<Draft>);
    else api.reassign(p.id, id);
    setQ("");
    api.setPicker(null);
  };
  return (
    <Sheet
      open={Boolean(p)}
      onClose={() => api.setPicker(null)}
      level="modal"
      height="80%"
      title={p?.for === "task" ? (p.verb === "Переназначить" ? "Переназначить" : "Передать") : "Кому?"}
      sub={draft ? `«${draft.title}»` : task ? `«${task.title}»` : undefined}
    >
      <div className="pc-scroll min-h-0 flex-1 px-4 pb-[max(env(safe-area-inset-bottom),16px)]">
        {candidates.length ? (
          <>
            <div className="mb-2 flex items-start gap-2 px-1 text-[14px] leading-[19px]" style={{ color: "var(--ink-3)" }}>
              {draft?.heardName ? (
                <span>
                  Услышал <span className="pc-serif text-[16px] italic" style={{ color: "var(--ink)" }}>«{draft.heardName}»</span>. Похоже на:
                </span>
              ) : (
                <span>Предлагает {personById(task?.assigneeId)?.short}:</span>
              )}
            </div>
            <ul className="mb-4 overflow-hidden rounded-[20px]" style={{ background: "var(--card)", boxShadow: "var(--sh-1), inset 0 0 0 1.5px color-mix(in srgb, var(--clay) 40%, var(--line))" }}>
              {candidates.map((id, i) => {
                const x = personById(id);
                return (
                  <li key={id} style={{ borderTop: i ? "1px solid var(--line)" : "none" }}>
                    <button type="button" onClick={() => pick(id)} className="pc-press flex min-h-[60px] w-full items-center gap-3 px-4 text-left">
                      <Avatar person={x} size={38} tone="clay" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[16px] font-medium" style={{ color: "var(--ink)" }}>
                          {x?.short}
                        </span>
                        <span className="block text-[13px]" style={{ color: "var(--ink-3)" }}>
                          {x?.position}
                        </span>
                      </span>
                      <Icon name="right" size={16} style={{ color: "var(--ink-4)" }} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        ) : null}
        <label className="mb-2 flex h-11 items-center gap-2 rounded-[14px] px-3" style={{ background: "var(--oat)" }}>
          <Icon name="search" size={17} style={{ color: "var(--ink-3)" }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти по имени" className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none" style={{ color: "var(--ink)" }} />
        </label>
        <ul>
          {all.map((x) => (
            <li key={x.id}>
              <button type="button" onClick={() => pick(x.id)} className="pc-press flex min-h-[52px] w-full items-center gap-3 rounded-[14px] px-2 text-left">
                <Avatar person={x} size={34} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px]" style={{ color: "var(--ink)" }}>
                    {x.short}
                  </span>
                  <span className="block text-[12.5px]" style={{ color: "var(--ink-3)" }}>
                    {x.position}
                    {x.awayUntil ? ` · ${x.awayWhy}` : ""}
                  </span>
                </span>
              </button>
            </li>
          ))}
          {api.empty ? (
            <li className="px-2 py-4 text-[14px]" style={{ color: "var(--ink-3)" }}>
              В команде пока никого.{" "}
              <button type="button" className="font-medium underline" style={{ color: "var(--ink)" }} onClick={() => api.serviceDo("noTeam")}>
                Добавить ›
              </button>
            </li>
          ) : null}
        </ul>
      </div>
    </Sheet>
  );
}

// ---- the deadline and the repeat ---------------------------------------------------------------------

function OptionList({ options, onPick, current }: { options: { label: string; hint?: string; value: string }[]; onPick: (o: { label: string; value: string }) => void; current?: string }) {
  return (
    <ul className="px-3 pb-[max(env(safe-area-inset-bottom),14px)]">
      {options.map((o) => (
        <li key={o.label}>
          <button type="button" onClick={() => onPick(o)} className="pc-press flex min-h-[52px] w-full items-center gap-3 rounded-[14px] px-3 text-left">
            <span className="flex-1 text-[16px]" style={{ color: "var(--ink)" }}>
              {o.label}
            </span>
            {o.hint ? (
              <span className="text-[13px]" style={{ color: "var(--ink-3)" }}>
                {o.hint}
              </span>
            ) : null}
            {current === o.value ? <Icon name="check" size={18} stroke={2.2} style={{ color: "var(--clay)" }} /> : null}
          </button>
        </li>
      ))}
    </ul>
  );
}

function WhenSheet() {
  const api = useApi();
  const w = api.when;
  const options = [
    { label: "Сегодня к 18:00", value: at(0, 18) },
    { label: "Завтра к 12:00", value: at(1, 12) },
    { label: "Завтра к 18:00", value: at(1, 18) },
    { label: "В пятницу к 18:00", value: at(4, 18) },
    { label: "Через неделю", value: at(7, 18) },
    { label: "Без срока", value: "" },
  ].map((o) => ({ ...o, hint: o.value ? whenLabel(o.value, api.now) : undefined }));
  const draft = w?.for === "draft" ? api.drafts.find((d) => d.id === w.id) : undefined;
  const task = w?.for === "task" ? api.tasks.find((t) => t.id === w.id) : undefined;
  const current = draft && draft.kind === "task" ? (draft.deadline ?? "") : (task?.deadline ?? undefined);
  return (
    <Sheet open={Boolean(w)} onClose={() => api.setWhen(null)} level="modal" title="Срок" sub={draft && draft.kind === "task" ? `«${draft.title}»` : task ? `«${task.title}»` : undefined}>
      <OptionList
        options={options}
        current={current}
        onPick={(o) => {
          if (!w) return;
          if (w.for === "draft") api.editDraft(w.id, { deadline: o.value || null } as Partial<Draft>);
          else api.setDeadline(w.id, o.value || at(7, 18), o.label.toLowerCase());
          api.setWhen(null);
        }}
      />
    </Sheet>
  );
}

function RepeatSheet() {
  const api = useApi();
  const draft = api.drafts.find((d) => d.id === api.repeat);
  const options = ["Без повтора", "Каждый день", "По будням", "Каждый понедельник", "Каждую неделю", "Каждый месяц"].map((l) => ({ label: l, value: l }));
  return (
    <Sheet open={Boolean(api.repeat)} onClose={() => api.setRepeat(null)} level="modal" title="Повтор" sub={draft && draft.kind === "task" ? `«${draft.title}»` : undefined}>
      <OptionList
        options={options}
        current={draft && draft.kind === "task" ? (draft.repeat ?? "Без повтора") : undefined}
        onPick={(o) => {
          if (api.repeat) api.editDraft(api.repeat, { repeat: o.value === "Без повтора" ? undefined : o.value.toLowerCase() } as Partial<Draft>);
          api.setRepeat(null);
        }}
      />
    </Sheet>
  );
}

// ---- an event ------------------------------------------------------------------------------------

function EventSheet() {
  const api = useApi();
  const e = api.events.find((x) => x.id === api.event);
  const groups = e
    ? ([
        ["Придут", e.people.filter((p) => p.answer === "yes")],
        ["Не придут", e.people.filter((p) => p.answer === "no")],
        ["Не ответили", e.people.filter((p) => p.answer === "none")],
      ] as const)
    : [];
  return (
    <Sheet open={Boolean(e)} onClose={() => api.setEvent(null)} level="modal" height="72%" title={e?.title} sub={e ? `${whenLabel(e.startsAt, api.now)}–${hhmm(e.endsAt)} · ${e.place}` : undefined}>
      {e ? (
        <div className="pc-scroll min-h-0 flex-1 px-5 pb-[max(env(safe-area-inset-bottom),16px)]">
          <div className="mb-3">
            <AnswerFaces e={e} size={30} />
          </div>
          {groups.map(([label, list]) =>
            list.length ? (
              <div key={label} className="mb-3">
                <div className="pc-caps mb-1.5" style={{ color: "var(--ink-3)" }}>
                  {label} · {list.length}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {list.map((p) => (
                    <span key={p.id} className="inline-flex h-8 items-center gap-1.5 rounded-full pr-3 pl-1 text-[13.5px]" style={{ background: "var(--oat)", color: "var(--ink-2)" }}>
                      <Avatar person={personById(p.id)} size={24} tone={p.answer === "yes" ? "olive" : p.answer === "no" ? "clay" : "plain"} />
                      {personById(p.id)?.short}
                    </span>
                  ))}
                </div>
              </div>
            ) : null,
          )}
          {answersOf(e).none ? (
            <Btn kind="primary" icon="remind" className="mt-2 w-full" onClick={() => {
              api.toast(`Напомнил ${answersOf(e).none} — ответят «приду / не приду»`);
              api.setEvent(null);
            }}>
              Напомнить молчащим
            </Btn>
          ) : null}
        </div>
      ) : null}
    </Sheet>
  );
}

function InstallSheet() {
  const api = useApi();
  const steps = ["Нажмите «Поделиться» внизу Safari", "Выберите «На экран „Домой“»", "Откройте Pulse с экрана — уведомления заработают"];
  return (
    <Sheet open={api.install} onClose={() => api.setInstall(false)} level="modal" title="На экран «Домой»" sub="Три касания, один раз">
      <ol className="px-5 pb-[max(env(safe-area-inset-bottom),16px)]">
        {steps.map((s, i) => (
          <li key={s} className="flex items-center gap-3.5 py-2.5">
            <span className="pc-serif inline-flex h-8 w-8 flex-none items-center justify-center rounded-full text-[16px]" style={{ background: "var(--oat)", color: "var(--ink-2)" }}>
              {i + 1}
            </span>
            <span className="text-[15.5px]" style={{ color: "var(--ink)" }}>
              {s}
            </span>
          </li>
        ))}
        <Btn kind="primary" className="mt-3 w-full" onClick={() => api.setInstall(false)}>
          Понятно
        </Btn>
      </ol>
    </Sheet>
  );
}

