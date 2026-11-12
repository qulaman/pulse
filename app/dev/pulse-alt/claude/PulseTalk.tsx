"use client";

import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  DISPUTES,
  ETHER,
  EVENTS,
  HEARD,
  NEWS,
  NOW,
  OFFHOURS_NOW,
  QUERY,
  SECRETARY,
  SECRETARY_ACTIONS,
  TASKS,
  UNPARSED,
  at,
  dayLabel,
  hhmm,
  personById,
  type Draft,
  type Errand,
  type StateId,
  type Task,
} from "@/app/dev/pulse-alt/fixtures";

import { Board } from "./Board";
import { Ctx, type Api, type Conv, type Dispute, type Landed, type LandedItem, type Picker, type Rec, type SheetKind, type Toast, type When } from "./ctx";
import { Dock } from "./Dock";
import { Header, TabBar } from "./Chrome";
import { countsOf, dative, hasMessage, moodOf, readPhrase, recipientsOf, sendable, summaryOf, voiceReply, type Reply, type Said } from "./model";
import { Overlays } from "./Overlays";
import { Panels } from "./Panels";
import { CSS } from "./styles";
import { Talk } from "./Talk";

const CONFIRM_STATES: StateId[] = ["confirm", "picker", "offhours"];

function initialConv(initial: StateId): Conv | null {
  if (initial === "parsing") return { id: 1, said: { text: "", voiceSec: 14 }, phase: "saving", reply: null };
  if (CONFIRM_STATES.includes(initial)) return { id: 1, said: { text: HEARD, voiceSec: 14 }, phase: "reply", reply: voiceReply() };
  if (initial === "unparsed") return { id: 1, said: { text: UNPARSED.heard, voiceSec: 3 }, phase: "reply", reply: { kind: "unparsed", line: UNPARSED.line } };
  if (initial === "answer") return { id: 1, said: { text: QUERY.said, voiceSec: 2 }, phase: "reply", reply: { kind: "answer", lines: QUERY.lines, personId: "p-marat" } };
  if (initial === "kept") return { id: 1, said: { text: "", voiceSec: 5 }, phase: "kept", reply: null };
  return null;
}

function initialSheet(initial: StateId): SheetKind | null {
  if (initial === "thread") return "messages";
  if (initial === "actions") return "tasks";
  if (["tasks", "messages", "ether", "calendar", "rating", "person", "secretary"].includes(initial)) return initial as SheetKind;
  return null;
}

/** A pinned phrase (a person was picked first): one task for that person, by id (D-84). */
function pinnedReply(personId: string, sec: number): Reply {
  const drafts: Draft[] = [
    { id: `pin${sec}`, kind: "task", title: "Зайти ко мне после обеда с отчётом по объекту", assigneeId: personId, deadline: at(0, 15, 0), voiceSec: sec },
  ];
  return { kind: "confirm", drafts, summary: summaryOf(drafts) };
}

/** Lanes settle after a move: the director's lanes stay, the rest is «Сообщения» or calm work. */
function relane(task: Task): Task {
  if (["overdue", "declined", "review", "held"].includes(task.lane)) return task;
  return { ...task, lane: hasMessage(task) ? "question" : "work" };
}

let seq = 10;
const uid = (p: string) => `${p}${++seq}`;

export function PulseTalk({ initial, fail, away = false }: { initial: StateId; fail: string | null; away?: boolean }) {
  const empty = initial === "empty";
  const offhours = initial === "offhours";
  const now = offhours ? OFFHOURS_NOW : NOW;

  // ---- the board's data, in memory -----------------------------------------------------------
  const [tasks, setTasks] = useState<Task[]>(() => (empty ? [] : TASKS.map((t) => ({ ...t, thread: [...t.thread] }))));
  const [ether, setEther] = useState(() => (empty ? [] : ETHER.map((p) => ({ ...p, reactions: p.reactions ? p.reactions.map((r) => ({ ...r })) : [] }))));
  const [events] = useState(() => (empty ? [] : EVENTS));
  const [disputes, setDisputes] = useState<Dispute[]>(() => (empty ? [] : DISPUTES.map((d) => ({ ...d }))));
  const [errands, setErrands] = useState<Errand[]>(() => (empty ? [] : SECRETARY.errands.map((e) => ({ ...e }))));
  const [pristine, setPristine] = useState(true);

  // ---- the phrase in hand ------------------------------------------------------------------------
  const [conv, setConv] = useState<Conv | null>(() => initialConv(initial));
  const [drafts, setDrafts] = useState<Draft[]>(() => (CONFIRM_STATES.includes(initial) ? voiceReply().drafts : []));
  const [removed, setRemoved] = useState<string[]>([]);
  const [rec, setRec] = useState<Rec | null>(() => (initial === "recording" ? { mode: "tap", cancel: false, forDesk: false, offset: 4200 } : null));
  const [typing, setTypingState] = useState(initial === "text");
  const [text, setText] = useState("");
  const [pin, setPin] = useState<string | null>(initial === "person" ? "p-marat" : null);
  const [hint, setHint] = useState<string | null>(null);

  // ---- the board's moods and visitors ----------------------------------------------------------
  const [awake, setAwake] = useState(initial === "awake");
  const [landed, setLanded] = useState<Landed | null>(null);
  const [pops, setPops] = useState<string[]>([]);
  const [offline, setOffline] = useState(initial === "kept" || fail === "net");
  const [kept, setKept] = useState(initial === "kept" ? 1 : 0);
  const [visitor, setVisitor] = useState(initial === "visitor");
  const [secMessage, setSecMessage] = useState(initial === "visitor");
  const [meetingOffer, setMeetingOffer] = useState<"ask" | "done" | "no">(initial === "secretary" ? "ask" : "no");
  const [service, setService] = useState({ push: false, install: false, draft: !empty });
  const [dnd, setDnd] = useState(false);
  const deskAway = away ? at(0, 14, 0) : SECRETARY.awayUntil;
  const [news, setNews] = useState<(typeof NEWS)[number] | null>(null);

  // ---- layers ---------------------------------------------------------------------------------------
  const [sheet, setSheet] = useState<SheetKind | null>(() => initialSheet(initial));
  const [personId, setPersonId] = useState<string | null>(initial === "person" ? "p-marat" : null);
  const [thread, setThread] = useState<string | null>(initial === "thread" ? "t-estimate" : null);
  const [threadFocus, setThreadFocus] = useState(false);
  const [actions, setActions] = useState<string | null>(initial === "actions" ? "t-act" : null);
  const [picker, setPicker] = useState<Picker | null>(initial === "picker" ? { for: "draft", id: "d2" } : null);
  const [when, setWhen] = useState<When | null>(null);
  const [repeat, setRepeat] = useState<string | null>(null);
  const [event, setEvent] = useState<string | null>(null);
  const [install, setInstall] = useState(false);
  const [toastState, setToastState] = useState<Toast | null>(null);

  // ---- timers -----------------------------------------------------------------------------------------
  const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const later = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(() => {
      timers.current.delete(t);
      fn();
    }, ms);
    timers.current.add(t);
    return t;
  }, []);
  useEffect(() => {
    const set = timers.current;
    return () => set.forEach((t) => clearTimeout(t));
  }, []);

  const convSeq = useRef(1);
  const recStart = useRef(0);
  const recRef = useRef<Rec | null>(rec);
  useEffect(() => {
    recRef.current = rec;
  }, [rec]);

  const counts = useMemo(() => countsOf(tasks), [tasks]);
  const mood = useMemo(() => moodOf(tasks), [tasks]);

  const vibrate = (ms: number | number[]) => {
    try {
      navigator.vibrate?.(ms);
    } catch {
      /* not every phone vibrates */
    }
  };

  // ---- toasts ---------------------------------------------------------------------------------------
  const toastSeq = useRef(0);
  const toast = useCallback(
    (text: string, undo?: () => void) => {
      const id = ++toastSeq.current;
      setToastState({ id, text, undo });
      later(() => setToastState((t) => (t?.id === id ? null : t)), undo ? 5000 : 2600);
    },
    [later],
  );
  const note = useCallback((text: string) => toast(text), [toast]);

  // ---- the pipeline: save → recognise → parse; the voice is kept first (principle 5) ---------------
  const runPipeline = useCallback(
    (said: Said, voice: boolean, outcome: Reply | "stt") => {
      const id = ++convSeq.current;
      setPristine(false);
      setAwake(false);
      setRemoved([]);
      setSheet(null);
      if (offline) {
        setConv({ id, said: voice ? { text: "", voiceSec: said.voiceSec } : said, phase: "kept", reply: null });
        setKept((k) => k + 1);
        return;
      }
      const step = (patch: Partial<Conv>) => setConv((c) => (c && c.id === id ? { ...c, ...patch } : c));
      const land = (reply: Reply) => {
        if (reply.kind === "confirm") setDrafts(reply.drafts);
        step({ phase: "reply", reply, said });
        vibrate(8);
      };
      const final: Reply = outcome === "stt" ? voiceReply() : outcome;
      if (!voice) {
        setConv({ id, said, phase: "parsing", reply: null });
        later(() => land(final), 1200);
        return;
      }
      setConv({ id, said: { text: "", voiceSec: said.voiceSec }, phase: "saving", reply: null });
      if (outcome === "stt") {
        later(() => step({ phase: "stt" }), 800);
        later(() => step({ phase: "transcribing", said }), 3400);
        later(() => step({ phase: "parsing" }), 4900);
        later(() => land(final), 6200);
        return;
      }
      later(() => step({ phase: "transcribing", said }), 800);
      later(() => step({ phase: "parsing" }), 2300);
      later(() => land(final), 3600);
    },
    [later, offline],
  );

  // ?state=parsing starts mid-flight
  useEffect(() => {
    if (initial !== "parsing") return;
    const said = { text: HEARD, voiceSec: 14 };
    const a = setTimeout(() => setConv((c) => (c ? { ...c, phase: "transcribing", said } : c)), 900);
    const b = setTimeout(() => setConv((c) => (c ? { ...c, phase: "parsing" } : c)), 2600);
    const d = setTimeout(() => {
      setDrafts(voiceReply().drafts);
      setConv((c) => (c ? { ...c, phase: "reply", reply: voiceReply(), said } : c));
    }, 4200);
    return () => [a, b, d].forEach(clearTimeout);
  }, [initial]);

  // the coffee on its way arrives: the errand is done and «Спасибо» becomes possible
  useEffect(() => {
    const t = setTimeout(() => setErrands((list) => list.map((e) => (e.id === "er1" ? { ...e, status: "done" } : e))), 12000);
    return () => clearTimeout(t);
  }, []);

  // ?state=recording: the tap-mode recording has been running since the screen opened
  useEffect(() => {
    if (initial === "recording") recStart.current = performance.now() - 4200;
  }, [initial]);

  // ---- speaking ------------------------------------------------------------------------------------
  const finishRecording = useCallback(
    (ms: number, forDesk: boolean) => {
      const sec = Math.max(1, Math.round(ms / 1000));
      if (forDesk) {
        const id = uid("er");
        setErrands((list) => [...list, { id, code: "voice", label: "Голосом", note: `${sec} с`, status: offline ? "waiting" : "asked", at: now.toISOString(), by: SECRETARY.personId }]);
        toast(offline ? "Просьба Жанне ждёт сети — уйдёт сама" : `Жанне: голосовая просьба · 0:${String(sec).padStart(2, "0")}`);
        if (!offline) later(() => setErrands((list) => list.map((e) => (e.id === id ? { ...e, status: "seen" } : e))), 2200);
        return;
      }
      if (pin) runPipeline({ text: "Зайди ко мне после обеда с отчётом по объекту", voiceSec: sec }, true, pinnedReply(pin, sec));
      else runPipeline({ text: HEARD, voiceSec: sec }, true, fail === "stt" ? "stt" : voiceReply());
    },
    [fail, later, now, offline, pin, runPipeline, toast],
  );

  const flash = useCallback(
    (line: string) => {
      setHint(line);
      later(() => setHint((h) => (h === line ? null : h)), 2800);
    },
    [later],
  );

  const holdStart = useCallback(
    (forDesk = false) => {
      if (fail === "mic") {
        setConv({ id: ++convSeq.current, said: null, phase: "noMic", reply: null });
        return;
      }
      recStart.current = performance.now();
      setTypingState(false);
      setAwake(false);
      setRec({ mode: "hold", cancel: false, forDesk });
      vibrate(12);
    },
    [fail],
  );
  const holdMove = useCallback((dy: number) => {
    const armed = dy > 84;
    if (recRef.current && recRef.current.cancel !== armed) setRec((r) => (r ? { ...r, cancel: armed } : r));
  }, []);
  const holdEnd = useCallback(() => {
    const r = recRef.current;
    if (!r) return;
    const ms = performance.now() - recStart.current;
    setRec(null);
    if (r.cancel) return flash("Отменил — ничего не ушло.");
    if (ms < 900) return flash("Слишком коротко. Удержи и скажи ещё раз.");
    finishRecording(ms, r.forDesk);
  }, [finishRecording, flash]);
  const holdCancel = useCallback(() => setRec(null), []);
  const tapMic = useCallback(() => {
    const r = recRef.current;
    if (r && r.mode === "tap") {
      const ms = performance.now() - recStart.current;
      setRec(null);
      if (ms < 900) return flash("Слишком коротко. Скажи ещё раз.");
      finishRecording(ms, r.forDesk);
      return;
    }
    if (fail === "mic") {
      setConv({ id: ++convSeq.current, said: null, phase: "noMic", reply: null });
      return;
    }
    recStart.current = performance.now();
    setTypingState(false);
    setRec({ mode: "tap", cancel: false, forDesk: false });
    vibrate(12);
  }, [fail, finishRecording, flash]);

  const setTyping = useCallback((v: boolean, prefill?: string) => {
    setTypingState(v);
    if (prefill !== undefined) setText(prefill);
    if (v) {
      setAwake(false);
      setSheet((k) => (k === "person" ? k : null));
    }
  }, []);

  const submitText = useCallback(() => {
    const line = text.trim();
    if (!line) return;
    setText("");
    setTypingState(false);
    runPipeline({ text: line, voiceSec: null }, false, readPhrase(line, pin));
  }, [pin, runPipeline, text]);

  // ---- the confirmation ----------------------------------------------------------------------------
  const closeConv = useCallback(() => {
    setConv(null);
    setDrafts([]);
    setRemoved([]);
    setPicker(null);
  }, []);

  const editDraft = useCallback((id: string, patch: Partial<Draft>) => {
    setDrafts((list) => list.map((d) => (d.id === id ? ({ ...d, ...patch } as Draft) : d)));
  }, []);
  const removeDraft = useCallback((id: string) => setRemoved((r) => [...r, id]), []);
  const restoreDraft = useCallback((id: string) => setRemoved((r) => r.filter((x) => x !== id)), []);

  const send = useCallback(
    (morning: boolean) => {
      const live = drafts.filter((d) => !removed.includes(d.id));
      const go = live.filter(sendable);
      const left = live.filter((d) => !sendable(d));
      if (go.length === 0) {
        const first = left[0];
        if (first) setPicker({ for: "draft", id: first.id });
        return;
      }
      vibrate([10, 40, 18]);
      setConv((c) => (c ? { ...c, phase: "sending" } : c));
      const stamp = now.toISOString();
      later(() => {
        // the data is written at once; the flight only plays over it (principle 1a)
        setTasks((list) => {
          const fresh: Task[] = [];
          for (const d of go) {
            if (d.kind === "task" && d.assigneeId) {
              fresh.push({
                id: uid("t"),
                title: d.title,
                assigneeId: d.assigneeId,
                status: morning ? "scheduled" : "sent",
                lane: morning ? "held" : "work",
                deadline: d.deadline,
                createdAt: stamp,
                receipt: { sentAt: morning ? null : stamp, seenAt: null, acceptedAt: null },
                voiceSec: d.voiceSec,
                thread: [{ id: uid("m"), from: "director", text: d.title, at: stamp, voiceSec: d.voiceSec }],
              });
            }
            if (d.kind === "recurrence") {
              fresh.push({
                id: uid("t"),
                title: `${d.title} · ${d.rule}`,
                assigneeId: d.assigneeId,
                status: "scheduled",
                lane: "held",
                deadline: d.firstAt,
                createdAt: stamp,
                receipt: { sentAt: null, seenAt: null, acceptedAt: null },
                thread: [],
              });
            }
          }
          return [...list, ...fresh];
        });
        const ann = go.filter((d): d is Extract<Draft, { kind: "announcement" }> => d.kind === "announcement");
        if (ann.length) setEther((list) => [...ann.map((a) => ({ id: uid("e"), text: a.text, at: stamp, read: 0, of: a.reach, reactions: [] })), ...list]);
        const ids = recipientsOf(go);
        const said = summaryOf(go).replace("Понял так: ", "").replace(/\.$/, "");
        if (left.length) {
          const leftover = left[0]!;
          setDrafts(left);
          setRemoved([]);
          setConv((c) =>
            c
              ? {
                  ...c,
                  phase: "reply",
                  reply: {
                    kind: "confirm",
                    drafts: left,
                    summary: `${morning ? "Отправлю утром" : "Разослал"}: ${said}. Осталась одна — кому отдать «${leftover.kind === "task" ? leftover.title : ""}»?`,
                  },
                }
              : c,
          );
        } else {
          setConv(null);
          setDrafts([]);
          setRemoved([]);
          const items: LandedItem[] = [];
          for (const d of go) {
            if (d.kind === "task" && d.assigneeId && !items.some((x) => x.id === d.assigneeId)) items.push({ id: d.assigneeId, kind: "task" });
            if (d.kind === "points") items.push({ id: d.personId, kind: "points", note: `+${d.amount}` });
            if (d.kind === "recurrence") items.push({ id: d.assigneeId, kind: "recurrence", note: `с ${dayLabel(d.firstAt, now).replace(/,.*/, "")}` });
          }
          setLanded({ line: morning ? `Отправлю утром в 8:00: ${said}.` : `Разослал: ${said}.`, items, morning });
          later(() => setLanded(null), 11000);
        }
        setPops(ids);
        later(() => setPops([]), 2400);
        setPin(null);
      }, 760);
    },
    [drafts, later, now, removed],
  );

  const unparsedToTask = useCallback(() => {
    const id = ++convSeq.current;
    const d: Draft[] = [{ id: uid("d"), kind: "task", title: UNPARSED.heard.replace(/…/g, "").replace(/\s+/g, " "), assigneeId: null, deadline: null, voiceSec: 3 }];
    setDrafts(d);
    setConv((c) => ({ id, said: c?.said ?? null, phase: "reply", reply: { kind: "confirm", drafts: d, summary: "Сделал задачей. Кому её отдать?" } }));
  }, []);

  const fixText = useCallback(() => {
    const heard = conv?.said?.text ?? "";
    setConv(null);
    setTyping(true, heard);
  }, [conv, setTyping]);

  const reconnect = useCallback(() => {
    setOffline(false);
    setKept(0);
    const said = { text: "Олегу до обеда проверить интернет на складе", voiceSec: 5 };
    const id = ++convSeq.current;
    const d: Draft[] = [{ id: uid("d"), kind: "task", title: "Проверить интернет на складе", assigneeId: "p-oleg", deadline: at(0, 13, 0), voiceSec: 5 }];
    setConv({ id, said: { text: "", voiceSec: 5 }, phase: "transcribing", reply: null });
    later(() => setConv((c) => (c && c.id === id ? { ...c, said } : c)), 50);
    later(() => setConv((c) => (c && c.id === id ? { ...c, phase: "parsing" } : c)), 1500);
    later(() => {
      setDrafts(d);
      setConv((c) => (c && c.id === id ? { ...c, phase: "reply", said, reply: { kind: "confirm", drafts: d, summary: "Сеть вернулась. Понял так: задача." } } : c));
    }, 2700);
  }, [later]);

  // ---- the director's keys on tasks ------------------------------------------------------------
  const replaceTask = useCallback((id: string, fn: (t: Task) => Task | null) => {
    setPristine(false);
    setTasks((list) =>
      list.flatMap((t) => {
        if (t.id !== id) return [t];
        const next = fn(t);
        return next ? [next] : [];
      }),
    );
  }, []);

  const restore = useCallback((prev: Task, index: number) => {
    setTasks((list) => {
      if (list.some((t) => t.id === prev.id)) return list.map((t) => (t.id === prev.id ? prev : t));
      const next = [...list];
      next.splice(Math.min(index, next.length), 0, prev);
      return next;
    });
  }, []);

  const act = useCallback(
    (taskId: string, key: string) => {
      const index = tasks.findIndex((t) => t.id === taskId);
      const prev = tasks[index];
      if (!prev) return;
      const who = personById(prev.assigneeId);
      const stamp = now.toISOString();
      const sys = (text: string) => ({ id: uid("m"), from: "system" as const, text, at: stamp });
      const undo = () => restore(prev, index);
      switch (key) {
        case "Принять":
          replaceTask(taskId, () => null);
          toast(`Принято: «${prev.title}»`, undo);
          vibrate([8, 30, 12]);
          return;
        case "Доработать":
          replaceTask(taskId, (t) => ({ ...t, status: "rework", lane: "work", report: undefined, thread: [...t.thread, sys("Вернули на доработку")] }));
          toast(`Вернул на доработку — ${who?.short ?? ""} увидит сразу`);
          return;
        case "Настоять":
          replaceTask(taskId, (t) => relane({ ...t, status: "sent", lane: "work", decline: undefined, receipt: { sentAt: stamp, seenAt: null, acceptedAt: null }, thread: [...t.thread, sys("Директор настаивает")] }));
          toast(`Настоял — ${who?.short ?? ""} получит задачу снова`, undo);
          return;
        case "Отозвать":
          replaceTask(taskId, () => null);
          toast(`Отозвал «${prev.title}»`, undo);
          return;
        case "Удалить":
          replaceTask(taskId, () => null);
          toast(`Удалил «${prev.title}»`, undo);
          return;
        case "Отменить":
          replaceTask(taskId, () => null);
          toast(`Отменил «${prev.title}»`);
          return;
        case "Переназначить":
        case "Передать":
          setPicker({ for: "task", id: taskId, verb: key });
          return;
        case "Срок":
        case "Другой срок":
          setWhen({ for: "task", id: taskId });
          return;
        case "Напомнить":
          replaceTask(taskId, (t) => ({ ...t, thread: [...t.thread, sys(`Напомнили · ${hhmm(stamp)}`)] }));
          toast(`Напомнил: ${who?.short ?? ""} получит пуш`);
          return;
        case "Ответить":
        case "Открыть":
          setThread(taskId);
          setThreadFocus(key === "Ответить");
          setActions(null);
          return;
        case "Отправить сейчас":
          replaceTask(taskId, (t) => ({ ...t, status: "sent", lane: "work", receipt: { sentAt: stamp, seenAt: null, acceptedAt: null } }));
          toast(`Отправил ${dative(who)} сейчас`);
          return;
        case "Выдать снова":
          setTasks((list) => [...list, { ...prev, id: uid("t"), status: "sent", lane: "work", report: undefined, decline: undefined, question: undefined, timeRequest: undefined, unread: undefined, receipt: { sentAt: stamp, seenAt: null, acceptedAt: null }, thread: [] }]);
          toast(`Выдал снова: «${prev.title}»`);
          return;
        case "Согласовать":
          replaceTask(taskId, (t) => relane({ ...t, deadline: t.timeRequest?.proposed ?? t.deadline, timeRequest: undefined, thread: [...t.thread, sys("Новый срок согласован")] }));
          toast(`Согласовал новый срок — ${who?.short ?? ""} увидит сразу`);
          return;
        case "Оставить прежний":
          replaceTask(taskId, (t) => relane({ ...t, timeRequest: undefined, thread: [...t.thread, sys("Срок оставлен прежним")] }));
          toast("Срок оставлен прежним");
          return;
        case "Прочитал":
          replaceTask(taskId, (t) => relane({ ...t, unread: undefined }));
          return;
        default:
          toast(key);
      }
    },
    [now, replaceTask, restore, tasks, toast],
  );

  const answer = useCallback(
    (taskId: string, line: string, voiceSec?: number) => {
      const stamp = now.toISOString();
      replaceTask(taskId, (t) =>
        relane({ ...t, question: undefined, unread: undefined, thread: [...t.thread, { id: uid("m"), from: "director", text: line, at: stamp, voiceSec }] }),
      );
      vibrate(8);
    },
    [now, replaceTask],
  );

  const setDeadline = useCallback(
    (taskId: string, iso: string, label: string) => {
      replaceTask(taskId, (t) =>
        relane({ ...t, deadline: iso, timeRequest: undefined, lane: t.lane === "overdue" ? "work" : t.lane, thread: [...t.thread, { id: uid("m"), from: "system", text: `Новый срок: ${label}`, at: now.toISOString() }] }),
      );
      toast(`Новый срок: ${label}`);
    },
    [now, replaceTask, toast],
  );

  const reassign = useCallback(
    (taskId: string, to: string) => {
      const stamp = now.toISOString();
      replaceTask(taskId, (t) =>
        relane({ ...t, assigneeId: to, status: "sent", lane: "work", decline: undefined, receipt: { sentAt: stamp, seenAt: null, acceptedAt: null }, thread: [...t.thread, { id: uid("m"), from: "system", text: `Передано: ${personById(to)?.short ?? ""}`, at: stamp }] }),
      );
      toast(`Передал ${dative(personById(to))} — отправлено`);
      setPops([to]);
      later(() => setPops([]), 2000);
    },
    [later, now, replaceTask, toast],
  );

  // ---- the rest of the board ------------------------------------------------------------------
  const react = useCallback((postId: string, emoji: string) => {
    setEther((list) =>
      list.map((p) => {
        if (p.id !== postId) return p;
        const rs = p.reactions ?? [];
        const has = rs.find((r) => r.emoji === emoji);
        return { ...p, reactions: has ? rs.map((r) => (r.emoji === emoji ? { ...r, count: r.count + 1 } : r)) : [...rs, { emoji, count: 1 }] };
      }),
    );
  }, []);

  const resolveDispute = useCallback(
    (id: string, key: string) => {
      const d = disputes.find((x) => x.id === id);
      setDisputes((list) => list.filter((x) => x.id !== id));
      if (d) toast(key === "Снять штраф" ? `Штраф снят — ${personById(d.personId)?.short ?? ""} вернутся 10 очков` : "Штраф оставлен");
    },
    [disputes, toast],
  );

  const errand = useCallback(
    (code: string, extra?: string, whenLabel?: string) => {
      const action = SECRETARY_ACTIONS.find((a) => a.code === code);
      if (!action) return;
      const id = uid("er");
      const status = offline ? "waiting" : "asked";
      setErrands((list) => [...list, { id, code, label: action.label, note: [extra, whenLabel].filter(Boolean).join(" · ") || undefined, status, at: now.toISOString(), by: SECRETARY.personId }]);
      if (code === "dnd") setDnd(true);
      vibrate([10, 30, 10]);
      toast(offline ? `«${action.label}» ждёт сети — уйдёт сама` : `Жанне: ${action.icon} ${action.label}${whenLabel ? ` · ${whenLabel}` : ""}`);
      if (!offline) {
        later(() => setErrands((list) => list.map((e) => (e.id === id ? { ...e, status: "seen" } : e))), 1800);
        later(() => setErrands((list) => list.map((e) => (e.id === id ? { ...e, status: "doing", etaMin: 5 } : e))), 4200);
        later(() => setErrands((list) => list.map((e) => (e.id === id ? { ...e, status: "done" } : e))), 11000);
      }
    },
    [later, now, offline, toast],
  );

  const thank = useCallback(
    (id: string) => {
      setErrands((list) => list.filter((e) => e.id !== id));
      toast("Спасибо отправлено · Жанне +1 очко");
    },
    [toast],
  );

  const visitorAnswer = useCallback(
    (key: string, extras: string[]) => {
      setVisitor(false);
      if (key === "Пусть заходит" && extras.length) {
        setErrands((list) => [...list, ...extras.map((x) => ({ id: uid("er"), code: x === "Чай" ? "tea" : "coffee", label: `${x} гостю`, status: "asked" as const, at: now.toISOString(), by: SECRETARY.personId }))]);
      }
      toast(key === "Пусть заходит" ? `Жанна проводит гостя${extras.length ? ` · ${extras.join(" и ").toLowerCase()} гостю` : ""}` : key === "Подождёт" ? "Жанна попросит подождать" : "Жанна вежливо откажет");
    },
    [now, toast],
  );

  const answerMeeting = useCallback(
    (yes: boolean) => {
      setMeetingOffer("done");
      if (yes) {
        setDnd(true);
        toast("🔕 Не беспокоить до 12:00 — Жанна знает");
      }
    },
    [toast],
  );

  const serviceDo = useCallback(
    (key: "push" | "install" | "draft" | "noTeam") => {
      if (key === "push") {
        setService((s) => ({ ...s, push: true }));
        toast("Уведомления включены");
      } else if (key === "install") setInstall(true);
      else if (key === "draft") {
        setService((s) => ({ ...s, draft: false }));
        setSheet(null);
        const id = ++convSeq.current;
        const d = voiceReply().drafts.slice(0, 2);
        setDrafts(d);
        setConv({ id, said: { text: "Марату к пятнице подготовить график работ по объекту на Абая. Айгерим оплатить счёт за цемент сегодня.", voiceSec: 7 }, phase: "reply", reply: { kind: "confirm", drafts: d, summary: "Черновик с утра: 2 задачи. Отправить?" } });
      } else toast("Команда — отдельный экран, в прототип не входит");
    },
    [toast],
  );

  // ---- news as a thought (D-65): one passes, fades in ~9 s ---------------------------------------
  const calm = !conv && !rec && !typing && !sheet && !thread && !empty && !landed;
  const newsIdx = useRef(0);
  useEffect(() => {
    if (!calm) return;
    const ts: ReturnType<typeof setTimeout>[] = [];
    let iv: ReturnType<typeof setInterval> | null = null;
    const show = () => {
      const item = NEWS[newsIdx.current % NEWS.length]!;
      newsIdx.current += 1;
      setNews(item);
      ts.push(setTimeout(() => setNews((n) => (n?.id === item.id ? null : n)), 9000));
    };
    const first = initial === "news" && newsIdx.current === 0 ? 350 : 9000;
    ts.push(
      setTimeout(() => {
        show();
        iv = setInterval(show, 20000);
      }, first),
    );
    return () => {
      ts.forEach(clearTimeout);
      if (iv) clearInterval(iv);
    };
  }, [calm, initial]);

  // a phone brought back from the pocket: the greeting (D-89)
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") setAwake(true);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const shownNews = calm ? news : null;

  // ---- which of the contest's states the screen is in ----------------------------------------
  const reply = conv?.reply ?? null;
  const current: StateId = picker
    ? "picker"
    : actions
      ? "actions"
      : thread
        ? "thread"
        : rec
          ? "recording"
          : conv
            ? conv.phase === "kept"
              ? "kept"
              : conv.phase === "reply" && reply
                ? reply.kind === "confirm"
                  ? offhours
                    ? "offhours"
                    : "confirm"
                  : reply.kind === "answer"
                    ? "answer"
                    : "unparsed"
                : conv.phase === "sending"
                  ? offhours
                    ? "offhours"
                    : "confirm"
                  : conv.phase === "noMic"
                    ? "unparsed"
                    : "parsing"
            : typing
              ? "text"
              : sheet
                ? sheet
                : empty
                  ? "empty"
                  : offline && kept > 0
                    ? "kept"
                    : visitor || secMessage
                      ? "visitor"
                      : shownNews
                        ? "news"
                        : awake
                          ? "awake"
                          : "idle";

  const api: Api = {
    initial,
    now,
    offhours,
    empty,
    mood,
    counts,
    pristine,
    tasks,
    ether,
    events,
    disputes,
    errands,
    drafts,
    conv,
    rec,
    typing,
    text,
    pin,
    awake,
    landed,
    offline,
    kept,
    visitor,
    secMessage,
    meetingOffer,
    service,
    dnd,
    deskAway,
    sheet,
    personId,
    thread,
    threadFocus,
    actions,
    picker,
    when,
    repeat,
    event,
    install,
    pops,
    setAwake,
    openSheet: (kind, pid) => {
      setSheet(kind);
      setAwake(false);
      if (kind === "person" && pid) {
        setPersonId(pid);
        setPin(pid);
      }
    },
    closeSheet: () => {
      if (sheet === "person") setPin(null);
      setSheet(null);
    },
    openThread: (id, focus = false) => {
      setThread(id);
      setThreadFocus(focus);
    },
    closeThread: () => setThread(null),
    openActions: setActions,
    setPicker,
    setWhen,
    setRepeat,
    setEvent,
    setInstall,
    holdStart,
    holdMove,
    holdEnd,
    holdCancel,
    tapMic,
    setTyping,
    setText,
    submitText,
    setPin,
    closeConv,
    editDraft,
    removeDraft,
    restoreDraft,
    removed,
    send,
    unparsedToTask,
    fixText,
    reconnect,
    showKept: () => setConv({ id: ++convSeq.current, said: { text: "", voiceSec: 5 }, phase: "kept", reply: null }),
    act,
    answer,
    setDeadline,
    reassign,
    react,
    resolveDispute,
    errand,
    thank,
    visitorAnswer,
    messageSeen: () => setSecMessage(false),
    answerMeeting,
    serviceDo,
    toast,
    note,
  };

  return (
    <Ctx.Provider value={api}>
      <MotionConfig reducedMotion="user">
        <div
          data-pc
          data-state={current}
          className="fixed inset-0 overflow-hidden select-none"
          style={{ background: "var(--paper)", color: "var(--ink)", fontFamily: "var(--pc-sans), system-ui, sans-serif", fontSize: 15, lineHeight: "21px" }}
        >
          <style>{CSS}</style>
          <Sky mood={empty ? "calm" : landed ? "happy" : mood} />
          <div className="relative mx-auto flex h-full max-w-[480px] flex-col" style={{ paddingTop: "env(safe-area-inset-top)" }}>
            <Header />
            <main className="relative min-h-0 flex-1">
              {/* the board never leaves: a phrase in hand plays in front of it, the board steps back */}
              <motion.div
                className="absolute inset-0"
                initial={false}
                animate={{
                  opacity: conv ? 0.14 : rec || typing ? 0.28 : 1,
                  scale: conv || rec ? 0.985 : 1,
                  filter: conv || rec || typing ? "blur(2px)" : "blur(0px)",
                }}
                transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
                style={{ pointerEvents: conv || rec ? "none" : "auto", transformOrigin: "50% 0%" }}
                aria-hidden={conv ? true : undefined}
              >
                <Board news={shownNews} />
              </motion.div>
              <AnimatePresence>
                {conv ? (
                  <motion.div
                    key={`talk${conv.id}`}
                    className="absolute inset-0"
                    initial={{ opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: conv.phase === "sending" ? -12 : 16, transition: { duration: 0.24 } }}
                    transition={{ type: "spring", damping: 30, stiffness: 300 }}
                  >
                    <Talk conv={conv} />
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </main>
            <Dock hint={hint} toast={toastState} onToastDone={() => setToastState(null)} />
            <TabBar />
          </div>
          <Panels />
          <Overlays />
        </div>
      </MotionConfig>
    </Ctx.Provider>
  );
}

/** The barometer you feel before you read: a warm haze from above — clay when watchful, olive when glad. */
function Sky({ mood }: { mood: "alert" | "calm" | "happy" }) {
  const layer = (m: string, color: string) => (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 h-[420px]"
      style={{
        background: `radial-gradient(120% 100% at 50% -20%, ${color}, transparent 70%)`,
        opacity: mood === m ? 1 : 0,
        transition: "opacity 1.4s ease",
      }}
    />
  );
  return (
    <>
      {layer("alert", "color-mix(in srgb, var(--clay) 13%, transparent)")}
      {layer("calm", "color-mix(in srgb, var(--oat) 90%, transparent)")}
      {layer("happy", "color-mix(in srgb, var(--olive) 14%, transparent)")}
    </>
  );
}

