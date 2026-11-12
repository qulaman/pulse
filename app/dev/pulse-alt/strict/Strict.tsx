"use client";

/**
 * «Терминал директора» — the strict entry of the Pulse home redesign contest, in the genre of a
 * near-future megacorporation's executive device: near-black depth, chamfered glass panels with
 * luminous edges, a cyan hologram of what waits for the director, five key figures, the team on
 * one grid, the secretary's desk as one line — and one red key under the thumb. Hold it and the
 * channel opens; the phrase becomes a numbered order in place; the same key sends it, and a holo
 * seal lands.
 *
 * Everything lives in memory on fixture data; `?state=` only picks the starting point.
 */

import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import {
  COMPANY,
  DISPUTES,
  ETHER,
  HEARD,
  MEETING_NOW,
  NEWS,
  NOW,
  OFFHOURS_NOW,
  QUERY,
  RATING,
  SECRETARY,
  TABS,
  TASKS,
  UNPARSED,
  at,
  hhmm,
  type Draft,
  type Errand,
  type EtherPost,
  type RatingRow,
  type StateId,
  type Task,
} from "@/app/dev/pulse-alt/fixtures";

import { Board } from "./Board";
import { DocView } from "./Docs";
import { cyDisplay, cyMono } from "./fonts";
import {
  ETHER_DRAFT,
  INITIAL_DRAFT,
  computeBoard,
  dative,
  isSendable,
  nameOf,
  parseText,
  pinnedDraft,
  sentSummary,
  type Board as BoardModel,
  type Parsed,
} from "./model";
import { Sheets } from "./Sheets";
import { EASE, Figure, Icon, Lbl, Seal, buzz, cx } from "./ui";

// ---- state shapes -------------------------------------------------------------------------------

export type Panel = "tasks" | "messages" | "ether" | "calendar" | "rating" | "person" | "secretary";

export type Doc =
  | { kind: "parsing"; source: "voice" | "text"; stage: 1 | 2 | 3; result: Parsed; voiceSec: number; slow: boolean }
  | { kind: "confirm"; stamping?: boolean }
  | { kind: "unparsed"; heard: string }
  | { kind: "answer"; said: string; lines: string[]; taskIds: string[] }
  | { kind: "error"; code: "tooShort" | "noMic" | "stt" | "kept"; voiceSec: number }
  | { kind: "text" };

export type RecTarget = "phrase" | "secretary" | "ether";
export type Rec = { started: number; mode: "hold" | "tap"; target: RecTarget; cancelArmed: boolean; pinned: string | null };

export type DraftRef = { draftId: string };
export type TaskRef = { taskId: string; key: string };

export type SheetState =
  | { kind: "thread"; taskId: string; compose?: boolean }
  | { kind: "actions"; taskId: string }
  | { kind: "picker"; target: DraftRef | TaskRef }
  | { kind: "deadline"; target: DraftRef | TaskRef }
  | { kind: "repeat"; draftId: string }
  | { kind: "event"; eventId: string }
  | { kind: "kept" }
  | { kind: "errand"; code: string }
  | { kind: "service"; which: "push" | "install" }
  | null;

type Toast = { id: number; text: string; undo?: () => void };
export type NewsItem = { id: string; text: string; tone: "ok" | "warn" | "info"; taskId?: string; at: string };
type VisitorState = { stage: "ask" | "hospitality" } | null;

export type StrictCtx = {
  state0: StateId;
  now: Date;
  offhours: boolean;
  empty: boolean;
  online: boolean;
  keptCount: number;
  tasks: Task[];
  board: BoardModel;
  ether: EtherPost[];
  rating: RatingRow[];
  disputes: typeof DISPUTES;
  errands: Errand[];
  secretaryAway: string | null;
  dndOffer: boolean;
  visitor: VisitorState;
  secMessage: boolean;
  pushOn: boolean;
  awake: boolean;
  panel: Panel | null;
  personId: string | null;
  doc: Doc | null;
  drafts: Draft[];
  heard: string;
  rec: Rec | null;
  sheet: SheetState;
  news: NewsItem | null;
  tapNews: (n: NewsItem) => void;
  // moves
  setAwake: (v: boolean) => void;
  openPanel: (p: Panel | null) => void;
  pickPerson: (id: string | null) => void;
  setSheet: (s: SheetState) => void;
  toast: (text: string, undo?: () => void) => void;
  act: (taskId: string, key: string) => void;
  answer: (taskId: string, text: string, voiceSec?: number) => void;
  readUnread: (taskId: string) => void;
  setDeadline: (taskId: string, iso: string | null, key: string) => void;
  reassign: (taskId: string, personId: string) => void;
  startRec: (mode: "hold" | "tap", target: RecTarget) => void;
  armCancel: (armed: boolean) => void;
  stopRec: () => void;
  cancelRec: () => void;
  toTapMode: () => void;
  submitText: (text: string) => void;
  openText: (seed?: string) => void;
  textSeed: { n: number; text: string };
  savedDraft: boolean;
  closeDoc: () => void;
  setDrafts: (fn: (d: Draft[]) => Draft[]) => void;
  send: (forceNow: boolean) => void;
  sendErrand: (code: string, note?: string, when?: string) => void;
  thankErrand: (id: string) => void;
  answerDnd: (yes: boolean) => void;
  visitorMove: (move: "in" | "wait" | "no" | "tea" | "coffee" | "nothing") => void;
  ackMessage: () => void;
  resolveDispute: (id: string, drop: boolean) => void;
  enablePush: () => void;
  openDraftLine: () => void;
  makeTask: (text: string) => void;
  reactEther: (postId: string, emoji: string) => void;
};

const Ctx = createContext<StrictCtx | null>(null);

export function useStrict(): StrictCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useStrict outside <Strict>");
  return c;
}

// ---- the starting point of every state ----------------------------------------------------------

function seed(state: StateId, fail: "short" | "nomic" | "stt" | null) {
  const s = {
    awake: false,
    panel: null as Panel | null,
    personId: null as string | null,
    doc: null as Doc | null,
    drafts: [] as Draft[],
    heard: "",
    sheet: null as SheetState,
    rec: null as Rec | null,
    online: true,
    keptCount: 0,
    visitor: null as VisitorState,
    secMessage: false,
    news: null as NewsItem | null,
  };
  const confirm = () => {
    s.drafts = INITIAL_DRAFT.map((d) => ({ ...d }));
    s.heard = HEARD;
    s.doc = { kind: "confirm" };
  };
  switch (state) {
    case "awake":
      s.awake = true;
      break;
    case "news":
      s.news = { ...NEWS[0]!, at: at(0, 10, 40) };
      break;
    case "recording":
      s.rec = { started: 0, mode: "tap", target: "phrase", cancelArmed: false, pinned: null };
      break;
    case "parsing":
      s.heard = HEARD;
      s.doc = { kind: "parsing", source: "voice", stage: 2, result: { kind: "drafts", drafts: INITIAL_DRAFT, heard: HEARD }, voiceSec: 21, slow: true };
      break;
    case "confirm":
    case "offhours":
      confirm();
      break;
    case "picker":
      confirm();
      s.sheet = { kind: "picker", target: { draftId: "d2" } };
      break;
    case "unparsed":
      s.doc = { kind: "unparsed", heard: UNPARSED.heard };
      break;
    case "answer":
      s.doc = { kind: "answer", said: QUERY.said, lines: [...QUERY.lines], taskIds: ["", "t-estimate", "t-pass"] };
      break;
    case "kept":
      if (fail === "short") s.doc = { kind: "error", code: "tooShort", voiceSec: 0 };
      else if (fail === "nomic") s.doc = { kind: "error", code: "noMic", voiceSec: 0 };
      else if (fail === "stt") s.doc = { kind: "error", code: "stt", voiceSec: 12 };
      else {
        s.online = false;
        s.keptCount = 1;
        s.doc = { kind: "error", code: "kept", voiceSec: 12 };
      }
      break;
    case "text":
      s.doc = { kind: "text" };
      break;
    case "tasks":
      s.panel = "tasks";
      break;
    case "messages":
      s.panel = "messages";
      break;
    case "thread":
      s.panel = "messages";
      s.sheet = { kind: "thread", taskId: "t-estimate" };
      break;
    case "actions":
      s.panel = "tasks";
      s.sheet = { kind: "actions", taskId: "t-act" };
      break;
    case "ether":
      s.panel = "ether";
      break;
    case "calendar":
      s.panel = "calendar";
      break;
    case "rating":
      s.panel = "rating";
      break;
    case "person":
      s.panel = "person";
      s.personId = "p-marat";
      break;
    case "secretary":
      s.panel = "secretary";
      break;
    case "visitor":
      s.visitor = { stage: "ask" };
      s.secMessage = true;
      break;
    default:
      break;
  }
  return s;
}

// ---- the root -----------------------------------------------------------------------------------

export function Strict({ initial, fail, away }: { initial: StateId; fail: "short" | "nomic" | "stt" | null; away: boolean }) {
  const s0 = useMemo(() => seed(initial, fail), [initial, fail]);
  const empty = initial === "empty";
  const offhours = initial === "offhours";
  const now = offhours ? OFFHOURS_NOW : NOW;

  const [tasks, setTasks] = useState<Task[]>(() => (empty ? [] : TASKS.map((t) => ({ ...t, thread: [...t.thread] }))));
  const [ether, setEther] = useState<EtherPost[]>(() => (empty ? [] : ETHER.map((e) => ({ ...e }))));
  const [rating, setRating] = useState<RatingRow[]>(() => (empty ? [] : RATING.map((r) => ({ ...r }))));
  const [disputes, setDisputes] = useState(() => (empty ? [] : [...DISPUTES]));
  const [errands, setErrands] = useState<Errand[]>(() => (empty ? [] : SECRETARY.errands.map((e) => ({ ...e }))));
  const [dndOffer, setDndOffer] = useState(!empty);
  const [visitor, setVisitor] = useState<VisitorState>(s0.visitor);
  const [secMessage, setSecMessage] = useState(s0.secMessage);
  const [pushOn, setPushOn] = useState(false);
  const [awake, setAwake] = useState(s0.awake);
  const [panel, setPanel] = useState<Panel | null>(s0.panel);
  const [personId, setPersonId] = useState<string | null>(s0.personId);
  const [doc, setDoc] = useState<Doc | null>(s0.doc);
  const [drafts, setDraftsState] = useState<Draft[]>(s0.drafts);
  const [heard, setHeard] = useState(s0.heard);
  const [rec, setRec] = useState<Rec | null>(s0.rec);
  const [sheet, setSheet] = useState<SheetState>(s0.sheet);
  const [online, setOnline] = useState(s0.online);
  const [keptCount, setKeptCount] = useState(s0.keptCount);
  const [toastState, setToastState] = useState<Toast | null>(null);
  const [news, setNews] = useState<NewsItem | null>(s0.news);
  const [seal, setSeal] = useState<{ id: number; count: number; caption: string; word: string } | null>(null);
  const [savedDraft, setSavedDraft] = useState(!empty);
  const [textSeed, setTextSeed] = useState({ n: 0, text: "" });

  const secretaryAway = away ? at(0, 14, 0) : null;
  const board = useMemo(() => computeBoard(tasks), [tasks]);

  const recRef = useRef<Rec | null>(rec);
  const timers = useRef<number[]>([]);
  const later = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timers.current.push(id);
    return id;
  }, []);
  useEffect(() => {
    const list = timers.current;
    return () => list.forEach((id) => window.clearTimeout(id));
  }, []);

  const setRecBoth = useCallback((r: Rec | null) => {
    recRef.current = r;
    setRec(r);
  }, []);

  // the recording state starts with the clock already running (no finger on the glass)
  useEffect(() => {
    if (initial !== "recording") return;
    const r: Rec = { started: performance.now() - 7200, mode: "tap", target: "phrase", cancelArmed: false, pinned: null };
    later(() => setRecBoth(r), 0);
  }, [initial, later, setRecBoth]);

  // ---- toasts: one at a time; a new one commits the old ----
  const toastSeq = useRef(0);
  const toast = useCallback((text: string, undo?: () => void) => {
    toastSeq.current += 1;
    const id = toastSeq.current;
    setToastState({ id, text, undo });
    later(() => setToastState((t) => (t?.id === id ? null : t)), undo ? 5000 : 2600);
  }, [later]);

  // ---- news as a telex line: a change pops up, fades after ~9 s ----
  const newsSeq = useRef(0);
  const pushNews = useCallback((item: Omit<NewsItem, "at" | "id"> & { id?: string }) => {
    newsSeq.current += 1;
    const id = item.id ?? `live-${newsSeq.current}`;
    setNews({ ...item, id, at: now.toISOString() });
    later(() => setNews((n) => (n?.id === id ? null : n)), 9000);
  }, [later, now]);

  useEffect(() => {
    if (initial !== "news") return;
    // the first thought is already up; the next ones follow while the screen is watched
    later(() => setNews((n) => (n?.id === "n1" ? null : n)), 9000);
    NEWS.slice(1, 3).forEach((n, i) => later(() => pushNews({ ...n }), 10_500 + i * 10_500));
  }, [initial, later, pushNews]);

  // ---- tasks: the director's keys ----
  const patchTask = useCallback((id: string, fn: (t: Task) => Task | null) => {
    setTasks((list) => list.flatMap((t) => (t.id === id ? (fn(t) ? [fn(t)!] : []) : [t])));
  }, []);

  const sysLine = useCallback((text: string) => ({ id: `s-${Math.random().toString(36).slice(2, 8)}`, from: "system" as const, text, at: now.toISOString() }), [now]);

  const act = useCallback(
    (taskId: string, key: string) => {
      const t = tasks.find((x) => x.id === taskId);
      if (!t) return;
      const who = t.assigneeId;
      const snap = tasks;
      const restore = () => setTasks(snap);
      switch (key) {
        case "Открыть":
        case "Ответить":
          setSheet({ kind: "thread", taskId, compose: key === "Ответить" });
          return;
        case "Срок":
        case "Другой срок":
          setSheet({ kind: "deadline", target: { taskId, key } });
          return;
        case "Переназначить":
        case "Передать":
          setSheet({ kind: "picker", target: { taskId, key } });
          return;
        case "Принять":
          patchTask(taskId, () => null);
          toast(`Принято · ${t.title}`, restore);
          buzz([8, 40, 8]);
          return;
        case "Настоять":
          patchTask(taskId, (x) => ({ ...x, status: "sent", lane: "work", decline: undefined, receipt: { sentAt: now.toISOString(), seenAt: null, acceptedAt: null }, thread: [...x.thread, sysLine("Директор настоял — задача отправлена снова")] }));
          toast(`Настояли · ${dative(who)} снова`, restore);
          return;
        case "Отозвать":
          patchTask(taskId, () => null);
          toast(`Отозвано · ${t.title}`, restore);
          return;
        case "Удалить":
          patchTask(taskId, () => null);
          toast(`Удалено · ${t.title}`, restore);
          return;
        case "Отменить":
          patchTask(taskId, () => null);
          toast(`Задача отменена · ${nameOf(who)} узнает`);
          return;
        case "Напомнить":
          patchTask(taskId, (x) => ({ ...x, thread: [...x.thread, sysLine(`Напоминание ушло ${dative(who)}`)] }));
          toast(`Напомнил ${dative(who)}`);
          return;
        case "Доработать":
          patchTask(taskId, (x) => ({ ...x, status: "rework", lane: "work", report: undefined, thread: [...x.thread, sysLine("Возвращено на доработку")] }));
          toast(`На доработку · ${nameOf(who)}`);
          return;
        case "Отправить сейчас":
          patchTask(taskId, (x) => ({ ...x, status: "sent", lane: "work", receipt: { sentAt: now.toISOString(), seenAt: null, acceptedAt: null } }));
          toast(`Отправил ${dative(who)} сейчас`);
          return;
        case "Согласовать":
          patchTask(taskId, (x) => ({ ...x, lane: "work", deadline: x.timeRequest?.proposed ?? x.deadline, timeRequest: undefined, thread: [...x.thread, sysLine(`Срок перенесён на ${hhmm(x.timeRequest?.proposed ?? now.toISOString())} завтра`)] }));
          toast(`Срок согласован · ${nameOf(who)}`);
          return;
        case "Оставить прежний":
          patchTask(taskId, (x) => ({ ...x, lane: "work", timeRequest: undefined, thread: [...x.thread, sysLine("Срок оставлен прежним")] }));
          toast(`Срок прежний · ${nameOf(who)} узнает`);
          return;
        case "Выдать снова":
          toast(`Выдал снова · ${dative(who)}`);
          return;
        default:
          toast(key);
      }
    },
    [now, patchTask, sysLine, tasks, toast],
  );

  const answer = useCallback(
    (taskId: string, text: string, voiceSec?: number) => {
      const t = tasks.find((x) => x.id === taskId);
      patchTask(taskId, (x) => ({
        ...x,
        lane: x.lane === "question" ? "work" : x.lane,
        question: undefined,
        unread: undefined,
        thread: [...x.thread, { id: `m-${Math.random().toString(36).slice(2, 8)}`, from: "director", text, at: now.toISOString(), voiceSec }],
      }));
      if (t) toast(`Ответ ушёл ${dative(t.assigneeId)}`);
    },
    [now, patchTask, tasks, toast],
  );

  const readUnread = useCallback(
    (taskId: string) => {
      patchTask(taskId, (x) => ({ ...x, lane: x.question || x.timeRequest ? x.lane : "work", unread: undefined }));
      toast("Прочитано");
    },
    [patchTask, toast],
  );

  const setDeadline = useCallback(
    (taskId: string, iso: string | null, key: string) => {
      const t = tasks.find((x) => x.id === taskId);
      patchTask(taskId, (x) => ({
        ...x,
        deadline: iso,
        lane: x.lane === "overdue" || (key === "Другой срок" && x.lane === "question") ? "work" : x.lane,
        timeRequest: key === "Другой срок" ? undefined : x.timeRequest,
        thread: [...x.thread, sysLine(iso ? `Новый срок: ${hhmm(iso)}` : "Срок снят")],
      }));
      if (t) toast(`Новый срок · ${nameOf(t.assigneeId)}`);
    },
    [patchTask, sysLine, tasks, toast],
  );

  const reassign = useCallback(
    (taskId: string, pid: string) => {
      patchTask(taskId, (x) => ({
        ...x,
        assigneeId: pid,
        status: "sent",
        lane: "work",
        decline: undefined,
        receipt: { sentAt: now.toISOString(), seenAt: null, acceptedAt: null },
        thread: [...x.thread, sysLine(`Передано: ${nameOf(pid)}`)],
      }));
      toast(`Передал ${dative(pid)}`);
    },
    [now, patchTask, sysLine, toast],
  );

  // ---- the voice pipeline ----
  const pipeline = useCallback(
    (source: "voice" | "text", result: Parsed, voiceSec: number, slow = false) => {
      setPanel((p) => (p === "person" ? p : null));
      setSheet(null);
      setAwake(false);
      setDoc({ kind: "parsing", source, stage: source === "voice" ? 1 : 3, result, voiceSec, slow });
    },
    [],
  );

  // walk the stages with timers; the result lands when the last one ends
  const docStage = doc?.kind === "parsing" ? doc.stage : 0;
  useEffect(() => {
    if (doc?.kind !== "parsing") return;
    const f = doc.slow ? 1.7 : 1;
    const ms = (doc.stage === 1 ? 700 : doc.stage === 2 ? 1150 : 1250) * f;
    const id = later(() => {
      setDoc((d) => {
        if (d?.kind !== "parsing") return d;
        if (d.stage < 3) return { ...d, stage: (d.stage + 1) as 2 | 3 };
        const r = d.result;
        if (r.kind === "drafts") {
          setDraftsState(r.drafts.map((x) => ({ ...x })));
          setHeard(r.heard);
          return { kind: "confirm" };
        }
        if (r.kind === "unparsed") return { kind: "unparsed", heard: r.heard };
        return { kind: "answer", said: r.said, lines: r.lines, taskIds: r.taskIds };
      });
    }, ms);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docStage, doc?.kind, later]);

  const startRec = useCallback(
    (mode: "hold" | "tap", target: RecTarget) => {
      if (recRef.current) return;
      buzz(12);
      setSheet(null);
      setRecBoth({ started: performance.now(), mode, target, cancelArmed: false, pinned: target === "phrase" ? personId : null });
    },
    [personId, setRecBoth],
  );

  const armCancel = useCallback((armed: boolean) => {
    const r = recRef.current;
    if (!r || r.cancelArmed === armed) return;
    if (armed) buzz(10);
    setRecBoth({ ...r, cancelArmed: armed });
  }, [setRecBoth]);

  const cancelRec = useCallback(() => {
    setRecBoth(null);
    toast("Запись отменена");
  }, [setRecBoth, toast]);

  const toTapMode = useCallback(() => {
    const r = recRef.current;
    if (r) setRecBoth({ ...r, mode: "tap" });
  }, [setRecBoth]);

  const stopRec = useCallback(() => {
    const r = recRef.current;
    if (!r) return;
    const sec = Math.max(1, Math.round((performance.now() - r.started) / 1000));
    setRecBoth(null);
    buzz(8);
    const tooShort = performance.now() - r.started < 1000;
    if (tooShort) {
      setPanel((p) => (p === "person" ? p : null));
      setDoc({ kind: "error", code: "tooShort", voiceSec: 0 });
      later(() => setDoc((d) => (d?.kind === "error" && d.code === "tooShort" ? null : d)), 3400);
      return;
    }
    if (r.target === "secretary") {
      const id = `er-${Date.now()}`;
      setErrands((list) => [...list, { id, code: "own", label: "Своими словами", note: "Принесите воды в переговорную на троих", status: online ? "asked" : "waiting", at: now.toISOString(), by: "s-zhanna" }]);
      toast(online ? "Просьба ушла Жанне" : "Просьба ждёт сети — уйдёт сама");
      if (online) later(() => setErrands((list) => list.map((e) => (e.id === id ? { ...e, status: "seen" } : e))), 2600);
      return;
    }
    if (!online) {
      setPanel(null);
      setKeptCount((n) => n + 1);
      setDoc({ kind: "error", code: "kept", voiceSec: sec });
      return;
    }
    const drafts0 = r.target === "ether" ? ETHER_DRAFT : r.pinned ? pinnedDraft(r.pinned, sec) : INITIAL_DRAFT;
    const first = drafts0[0];
    const heard0 = r.target === "ether" ? "Всем: завтрашняя планёрка переносится на десять." : r.pinned && first?.kind === "task" ? `${nameOf(r.pinned)}, ${first.title.toLowerCase()} — до шести.` : HEARD;
    pipeline("voice", { kind: "drafts", drafts: drafts0, heard: heard0 }, sec);
  }, [later, now, online, pipeline, setRecBoth, toast]);

  const submitText = useCallback(
    (text: string) => {
      const res = parseText(text, personId, tasks, now);
      pipeline("text", res, 0);
    },
    [now, personId, pipeline, tasks],
  );

  const openText = useCallback((seed?: string) => {
    setSheet(null);
    setTextSeed((t) => ({ n: t.n + 1, text: seed ?? "" }));
    setDoc({ kind: "text" });
  }, []);

  // the drafts go a beat later, so the leaving document does not flash empty
  const closeDoc = useCallback(() => {
    setDoc(null);
    later(() => setDraftsState([]), 380);
  }, [later]);

  const setDrafts = useCallback((fn: (d: Draft[]) => Draft[]) => setDraftsState(fn), []);

  // ---- send: data first, then the throw and the seal ----
  const send = useCallback(
    (forceNow: boolean) => {
      const going = drafts.filter(isSendable);
      if (going.length === 0) {
        const first = drafts.find((d) => d.kind === "task" && !d.assigneeId);
        if (first) setSheet({ kind: "picker", target: { draftId: first.id } });
        return;
      }
      const scheduled = offhours && !forceNow;
      const iso = now.toISOString();
      const fresh: Task[] = [];
      for (const d of going) {
        if (d.kind === "task" && d.assigneeId) {
          fresh.push({
            id: `new-${d.id}-${Date.now()}`,
            title: d.title,
            assigneeId: d.assigneeId,
            status: scheduled ? "scheduled" : "sent",
            lane: scheduled ? "held" : "work",
            deadline: d.deadline,
            createdAt: iso,
            receipt: { sentAt: scheduled ? null : iso, seenAt: null, acceptedAt: null },
            voiceSec: d.voiceSec,
            thread: d.voiceSec ? [{ id: "m1", from: "director", text: d.title, at: iso, voiceSec: d.voiceSec }] : [],
          });
        }
        if (d.kind === "recurrence") {
          fresh.push({
            id: `new-${d.id}-${Date.now()}`,
            title: `${d.title} · ${d.rule}`,
            assigneeId: d.assigneeId,
            status: "scheduled",
            lane: "held",
            deadline: d.firstAt,
            createdAt: iso,
            receipt: { sentAt: null, seenAt: null, acceptedAt: null },
            thread: [],
          });
        }
      }
      setTasks((list) => [...list, ...fresh]);
      const ann = going.filter((d): d is Extract<Draft, { kind: "announcement" }> => d.kind === "announcement");
      if (ann.length) setEther((list) => [...ann.map((a) => ({ id: `e-${a.id}`, text: a.text, at: iso, read: 0, of: a.reach })), ...list]);
      const pts = going.filter((d): d is Extract<Draft, { kind: "points" }> => d.kind === "points");
      if (pts.length)
        setRating((list) =>
          list
            .map((r) => ({ ...r, points: r.points + pts.filter((p) => p.personId === r.personId).reduce((s, p) => s + p.amount, 0) }))
            .sort((a, b) => b.points - a.points)
            .map((r, i) => ({ ...r, delta: r.delta + (r.place - (i + 1)), place: i + 1 })),
        );
      setSavedDraft(false);
      buzz([10, 60, 18]);
      setDoc({ kind: "confirm", stamping: true });
      later(() => {
        setDoc((d) => (d?.kind === "confirm" && d.stamping ? null : d));
        later(() => setDraftsState((list) => (list === drafts ? [] : list)), 380);
        setSeal({ id: Date.now(), count: going.length, caption: `${scheduled ? "Уйдёт утром в 08:00: " : ""}${sentSummary(going)}`, word: scheduled ? "Утром 08:00" : "Отправлено" });
        if (personId) setPersonId(null);
      }, 520);
      later(() => setSeal(null), 2900);
    },
    [drafts, later, now, offhours, personId],
  );

  // ---- the secretary ----
  const sendErrand = useCallback(
    (code: string, note?: string, whenWord?: string) => {
      const id = `er-${Date.now()}`;
      const label = { coffee: "Кофе", tea: "Чай", dnd: "Не беспокоить", guest: "Пригласи гостя", security: "Охрана", doctor: "Врач", come: "Зайди ко мне" }[code] ?? code;
      const waiting = !online || Boolean(secretaryAway);
      setErrands((list) => [...list, { id, code, label, note: [note, whenWord].filter(Boolean).join(" · ") || undefined, status: waiting ? "waiting" : "asked", at: now.toISOString(), by: "s-zhanna" }]);
      buzz([14, 30, 14]);
      toast(!online ? `«${label}» ждёт сети — уйдёт сама` : secretaryAway ? `«${label}» дождётся Жанну` : `«${label}» — Жанне`);
      if (!waiting) {
        later(() => setErrands((l) => l.map((e) => (e.id === id ? { ...e, status: "seen" } : e))), 2200);
        later(() => setErrands((l) => l.map((e) => (e.id === id ? { ...e, status: "doing", etaMin: 4 } : e))), 5200);
      }
    },
    [later, now, online, secretaryAway, toast],
  );

  // the coffee in hand arrives while the director watches — then «Спасибо» is possible
  useEffect(() => {
    if (empty) return;
    later(() => setErrands((l) => l.map((e) => (e.id === "er1" ? { ...e, status: "done" } : e))), 14_000);
  }, [empty, later]);

  const thankErrand = useCallback((id: string) => {
    setErrands((l) => l.filter((e) => e.id !== id));
    toast("Спасибо Жанне · +1 очко");
  }, [toast]);

  const answerDnd = useCallback((yes: boolean) => {
    setDndOffer(false);
    if (yes) {
      setErrands((l) => [...l, { id: `dnd-${Date.now()}`, code: "dnd", label: "Не беспокоить", note: `до ${hhmm(MEETING_NOW.endsAt)}`, status: "asked", at: now.toISOString(), by: "s-zhanna" }]);
      toast(`Не беспокоить до ${hhmm(MEETING_NOW.endsAt)} — Жанне`);
    }
  }, [now, toast]);

  const visitorMove = useCallback((move: "in" | "wait" | "no" | "tea" | "coffee" | "nothing") => {
    if (move === "in") {
      setVisitor({ stage: "hospitality" });
      return;
    }
    setVisitor(null);
    const words = { wait: "Сергей Ли подождёт", no: "Жанна скажет: не примете", tea: "Пусть заходит · гостю чай", coffee: "Пусть заходит · гостю кофе", nothing: "Пусть заходит" } as const;
    toast(words[move]);
  }, [toast]);

  const ackMessage = useCallback(() => setSecMessage(false), []);

  const resolveDispute = useCallback((id: string, drop: boolean) => {
    const d = disputes.find((x) => x.id === id);
    setDisputes((l) => l.filter((x) => x.id !== id));
    if (d) toast(drop ? `Штраф снят · ${nameOf(d.personId)} +10` : `Штраф оставлен · ${nameOf(d.personId)} узнает`);
  }, [disputes, toast]);

  const enablePush = useCallback(() => {
    setPushOn(true);
    toast("Уведомления включены");
  }, [toast]);

  const openDraftLine = useCallback(() => {
    setPanel(null);
    setDraftsState([
      { id: "x1", kind: "note", text: "Подумать о втором складе в Хромтау" },
      { id: "x2", kind: "reminder", text: "Позвонить Серику насчёт техники", at: at(0, 15, 0) },
    ]);
    setHeard("Заметка: подумать о втором складе в Хромтау. И напомни мне в три позвонить Серику насчёт техники.");
    setSavedDraft(false);
    setDoc({ kind: "confirm" });
  }, []);

  const makeTask = useCallback((text: string) => {
    setDraftsState([{ id: `mk-${Date.now()}`, kind: "task", title: text, assigneeId: null, candidates: ["p-marat", "p-aigul"], deadline: at(0, 18, 0) }]);
    setHeard(text);
    setDoc({ kind: "confirm" });
  }, []);

  const reactEther = useCallback((postId: string, emoji: string) => {
    setEther((list) =>
      list.map((p) => {
        if (p.id !== postId) return p;
        const rs = p.reactions ?? [];
        const has = rs.find((r) => r.emoji === emoji);
        return { ...p, reactions: has ? rs.map((r) => (r.emoji === emoji ? { ...r, count: r.count + 1 } : r)) : [...rs, { emoji, count: 1 }] };
      }),
    );
    buzz(6);
  }, []);

  // ---- no network: the phrase waits on the phone and goes by itself when the net is back ----
  useEffect(() => {
    if (online) return;
    const id = later(() => {
      setOnline(true);
      setKeptCount(0);
      setDoc((d) => {
        if (d?.kind === "error" && d.code === "kept") return { kind: "parsing", source: "voice", stage: 2, result: { kind: "drafts", drafts: INITIAL_DRAFT, heard: HEARD }, voiceSec: d.voiceSec, slow: false };
        return d;
      });
      pushNews({ text: "Сеть вернулась — фраза ушла в разбор", tone: "info" });
    }, 16_000);
    return () => window.clearTimeout(id);
  }, [later, online, pushNews]);

  // an STT failure retries by itself (the voice is kept)
  useEffect(() => {
    if (doc?.kind !== "error" || doc.code !== "stt") return;
    const id = later(() => setDoc((d) => (d?.kind === "error" && d.code === "stt" ? { kind: "parsing", source: "voice", stage: 2, result: { kind: "drafts", drafts: INITIAL_DRAFT, heard: HEARD }, voiceSec: 12, slow: false } : d)), 5200);
    return () => window.clearTimeout(id);
  }, [doc, later]);

  const openPanel = useCallback((p: Panel | null) => {
    setDoc((d) => (d?.kind === "text" ? null : d));
    setPanel((cur) => (cur === p ? null : p));
    if (p !== "person") setPersonId(null);
    setAwake(false);
  }, []);

  const pickPerson = useCallback((id: string | null) => {
    setPersonId(id);
    setPanel(id ? "person" : null);
  }, []);

  const value: StrictCtx = {
    state0: initial,
    now,
    offhours,
    empty,
    online,
    keptCount,
    tasks,
    board,
    ether,
    rating,
    disputes,
    errands,
    secretaryAway,
    dndOffer,
    visitor,
    secMessage,
    pushOn,
    awake,
    panel,
    personId,
    doc,
    drafts,
    heard,
    rec,
    sheet,
    news,
    tapNews: (n: NewsItem) => {
      setNews(null);
      if (n.taskId) setSheet({ kind: "thread", taskId: n.taskId });
    },
    setAwake,
    openPanel,
    pickPerson,
    setSheet,
    toast,
    act,
    answer,
    readUnread,
    setDeadline,
    reassign,
    startRec,
    armCancel,
    stopRec,
    cancelRec,
    toTapMode,
    submitText,
    openText,
    textSeed,
    savedDraft,
    closeDoc,
    setDrafts,
    send,
    sendErrand,
    thankErrand,
    answerDnd,
    visitorMove,
    ackMessage,
    resolveDispute,
    enablePush,
    openDraftLine,
    makeTask,
    reactEther,
  };

  const live = liveState({ initial, rec, doc, sheet, panel, visitor, secMessage, news, awake, empty, offhours });

  return (
    <Ctx.Provider value={value}>
      <MotionConfig reducedMotion="user">
        <div
          data-strict=""
          data-state={live}
          className={cx(cyDisplay.variable, cyMono.variable, "fixed inset-0 flex flex-col overflow-hidden")}
          style={{ paddingTop: "env(safe-area-inset-top)" }}
        >
          <style>{CSS}</style>
          <Header />
          <main className="relative min-h-0 flex-1">
            <AnimatePresence initial={false}>
              {doc ? <DocView key="doc" doc={doc} /> : <Board key="board" />}
            </AnimatePresence>
            <AnimatePresence>{rec ? <Flood key="flood" rec={rec} /> : null}</AnimatePresence>
            <AnimatePresence>
              {seal ? (
                <motion.div key={seal.id} className="pointer-events-none absolute inset-0 z-20 grid place-items-center" style={{ background: "color-mix(in srgb, var(--bg) 94%, transparent)" }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                  <Seal count={seal.count} time={hhmm(now.toISOString())} caption={seal.caption} word={seal.word} />
                </motion.div>
              ) : null}
            </AnimatePresence>
            <ToastLine toast={toastState} onUndo={() => {
              toastState?.undo?.();
              setToastState(null);
              buzz(6);
            }} />
          </main>
          <KeyBar />
          <TabBar onNote={(label) => toast(`«${label}» — отдельный экран, в этом прототипе не построен`)} onHome={() => {
            setSheet(null);
            setPanel(null);
            setPersonId(null);
            if (doc?.kind === "text" || doc?.kind === "answer" || doc?.kind === "unparsed" || doc?.kind === "error") setDoc(null);
          }} />
          <Sheets />
        </div>
      </MotionConfig>
    </Ctx.Provider>
  );
}

function liveState(x: {
  initial: StateId;
  rec: Rec | null;
  doc: Doc | null;
  sheet: SheetState;
  panel: Panel | null;
  visitor: VisitorState;
  secMessage: boolean;
  news: NewsItem | null;
  awake: boolean;
  empty: boolean;
  offhours: boolean;
}): string {
  if (x.rec) return "recording";
  if (x.sheet?.kind === "thread") return "thread";
  if (x.sheet?.kind === "actions") return "actions";
  if (x.sheet?.kind === "picker" && "draftId" in x.sheet.target) return "picker";
  if (x.doc) {
    if (x.doc.kind === "parsing") return "parsing";
    if (x.doc.kind === "confirm") return x.offhours ? "offhours" : "confirm";
    if (x.doc.kind === "error") return "kept";
    return x.doc.kind;
  }
  if (x.panel) return x.panel;
  if (x.empty) return "empty";
  if (x.visitor || x.secMessage) return "visitor";
  if (x.news) return "news";
  if (x.awake) return "awake";
  return "idle";
}

// ---- header: the brand slot, the date, the telex line -----------------------------------------

const WEEKDAY = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

function Header() {
  const s = useStrict();
  const wall = new Date(s.now.getTime() + 5 * 3_600_000);
  const date = `${WEEKDAY[wall.getUTCDay()]} ${String(wall.getUTCDate()).padStart(2, "0")}.${String(wall.getUTCMonth() + 1).padStart(2, "0")}`;
  // news shows inside the board; with a document open it takes this line for its 9 seconds
  const news = s.doc ? s.news : null;
  return (
    <header className="relative z-30 shrink-0 px-5">
      <div className="flex h-[52px] items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="cut cut-s frame frame-red disp glow-r grid h-[30px] w-[30px] place-items-center text-[15px] font-bold" style={{ background: "rgba(255,51,85,.14)", color: "#FFD6DD", fontStretch: "80%" }}>
            {COMPANY.initials}
          </span>
          <span className="flex flex-col">
            <span className="disp text-[15px] font-semibold uppercase leading-none tracking-[0.16em]" style={{ fontStretch: "85%" }}>
              {COMPANY.name}
            </span>
            <span className="mono mt-1 text-[9px] uppercase leading-none" style={{ color: "var(--text-3)" }}>
              Пульс · директор
            </span>
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          {!s.online ? (
            <span className="flex items-center gap-1.5" data-testid="offline">
              <span className="block h-2 w-2 rotate-45" style={{ border: "1.5px solid var(--text-2)" }} />
              <Lbl tone="ink">Нет сети</Lbl>
            </span>
          ) : (
            <span className="block h-1.5 w-1.5" style={{ background: "var(--cyan)", boxShadow: "0 0 8px rgba(70,228,255,.9)", animation: "cy-pulse 2.4s ease-in-out infinite" }} aria-label="В сети" />
          )}
          <span className="mono text-[11px] uppercase" style={{ color: "var(--text-2)" }}>
            {date}
          </span>
          <span className="disp text-[19px] font-semibold leading-none" style={{ fontStretch: "78%" }}>
            {hhmm(s.now.toISOString())}
          </span>
        </div>
      </div>
      <div className="relative h-px" style={{ background: "linear-gradient(90deg, rgba(255,51,85,.95), rgba(255,51,85,.25) 24%, rgba(150,215,255,.16) 58%, rgba(70,228,255,.75))" }}>
        {[0, 25, 50, 75, 100].map((p) => (
          <span key={p} className="absolute top-0 block h-[4px] w-px" style={{ left: `${p}%`, background: p === 0 ? "var(--red)" : p === 100 ? "var(--cyan)" : "rgba(150,215,255,.4)" }} />
        ))}
      </div>
      <AnimatePresence>
        {s.keptCount > 0 && !s.rec ? (
          <motion.button
            key="kept"
            type="button"
            className="flex w-full items-center gap-2.5 overflow-hidden text-left"
            style={{ borderBottom: "1px solid rgba(255,51,85,.45)" }}
            initial={{ height: 0 }}
            animate={{ height: 42 }}
            exit={{ height: 0 }}
            transition={{ duration: 0.25, ease: EASE }}
            onClick={() => s.setSheet({ kind: "kept" })}
            data-testid="kept-pill"
          >
            <span className="block h-2.5 w-2.5 shrink-0 rotate-45" style={{ border: "1.5px dashed var(--red-hi)" }} />
            <span className="flex-1 truncate text-[13px] font-medium">{s.keptCount === 1 ? "1 фраза ждёт сети" : `${s.keptCount} фразы ждут сети`}</span>
            <Lbl tone="seal">Показать ›</Lbl>
          </motion.button>
        ) : news && !s.rec ? (
          <motion.button
            key={news.id}
            type="button"
            data-testid="news"
            className="glass bd-blur absolute inset-x-5 top-[53px] flex h-11 items-center gap-2.5 overflow-hidden px-2 text-left"
            style={{ borderBottom: "1px solid var(--line-2)" }}
            initial={{ clipPath: "inset(0 0 100% 0)" }}
            animate={{ clipPath: "inset(0 0 0% 0)" }}
            exit={{ opacity: 0, transition: { duration: 0.6 } }}
            transition={{ duration: 0.28, ease: EASE }}
            onClick={() => s.tapNews(news)}
          >
            <span className="block h-2 w-2 shrink-0 rotate-45" style={{ background: news.tone === "info" ? "transparent" : "var(--cyan)", border: news.tone === "info" ? "1.5px solid var(--text-3)" : "none" }} />
            <span className="mono shrink-0 text-[11px]" style={{ color: "var(--text-3)" }}>
              {hhmm(news.at)}
            </span>
            <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{news.text}</span>
            {news.taskId ? <Lbl tone="seal">Открыть ›</Lbl> : null}
            <motion.span
              className="absolute bottom-[-1px] left-0 h-px"
              style={{ background: "var(--cyan)", originX: 0 }}
              initial={{ width: "100%" }}
              animate={{ width: "0%" }}
              transition={{ duration: 9, ease: "linear" }}
            />
          </motion.button>
        ) : null}
      </AnimatePresence>
    </header>
  );
}

// ---- recording: the stage becomes an open red channel -------------------------------------------

function Flood({ rec }: { rec: Rec }) {
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState<number[]>(() => Array.from({ length: 34 }, (_, i) => 0.2 + 0.15 * Math.sin(i)));
  useEffect(() => {
    const id = window.setInterval(() => {
      setElapsed(rec.started ? Math.max(0, performance.now() - rec.started) : 0);
      setLevels((prev) => [...prev.slice(1), Math.min(1, Math.max(0.08, 0.15 + Math.random() * 0.85 * (Math.random() > 0.25 ? 1 : 0.3)))]);
    }, 90);
    return () => window.clearInterval(id);
  }, [rec.started]);
  const sec = Math.floor(elapsed / 1000);
  const time = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
  const whom = rec.target === "secretary" ? "Просьба Жанне — своими словами" : rec.target === "ether" ? "Объявление в Эфир — «Всем: …»" : rec.pinned ? `Задача ${dative(rec.pinned)}` : "Распоряжение — всё одной фразой";
  const hot = !rec.cancelArmed;
  return (
    <motion.div
      data-testid="flood"
      className="absolute inset-0 z-30 flex flex-col overflow-hidden px-5 pb-5 pt-4"
      style={{
        background: hot
          ? "radial-gradient(120% 62% at 50% 106%, rgba(255,51,85,.42), rgba(255,51,85,0) 70%), linear-gradient(180deg, #0B0508, #1A060C)"
          : "radial-gradient(120% 62% at 50% 106%, rgba(120,130,150,.22), rgba(0,0,0,0) 70%), linear-gradient(180deg, #0B0C10, #12141A)",
        color: "#FFF1F3",
        transition: "background .2s",
      }}
      initial={{ clipPath: "inset(100% 0 0 0)" }}
      animate={{ clipPath: "inset(0% 0 0 0)" }}
      exit={{ clipPath: "inset(100% 0 0 0)", transition: { duration: 0.24, ease: EASE } }}
      transition={{ duration: 0.3, ease: EASE }}
    >
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2">
          <span className="block h-2.5 w-2.5 rotate-45" style={{ background: hot ? "var(--red)" : "var(--text-2)", boxShadow: hot ? "0 0 10px rgba(255,51,85,1)" : "none", animation: "strict-blink 1s steps(1) infinite" }} />
          <Lbl tone="paper">{hot ? "Канал открыт · запись" : "Отмена"}</Lbl>
        </span>
        <span className="lbl" style={{ color: "rgba(255,225,230,.7)" }}>
          {rec.mode === "hold" ? "Удерживайте" : "Нажмите клавишу — готово"}
        </span>
      </div>
      <div className="mt-3 h-px w-full" style={{ background: "linear-gradient(90deg, rgba(255,51,85,.9), rgba(255,51,85,.15))" }} />
      <span className="mt-3 text-[15px] font-medium" style={{ color: "rgba(255,240,243,.95)" }}>
        {whom}
      </span>
      <div className="mt-4 grid w-full grid-cols-3" style={{ borderTop: "1px solid rgba(255,129,151,.3)" }}>
        {(rec.target === "secretary" ? ["что", "кому", "когда"] : rec.pinned ? ["что сделать", "к какому сроку", "детали"] : ["кому", "что", "к какому сроку"]).map((w, i) => (
          <span key={w} className="mono pt-2 text-[11px] uppercase" style={{ color: "rgba(255,200,210,.7)", paddingLeft: i ? 10 : 0, borderLeft: i ? "1px solid rgba(255,129,151,.22)" : "none" }}>
            {w}
          </span>
        ))}
      </div>
      <span className="mt-2 self-start text-[12.5px]" style={{ color: "rgba(255,215,222,.72)" }}>
        {rec.target === "phrase" && !rec.pinned ? "Можно несколько дел подряд — разложу по пунктам." : "Скажите как есть — разберу сам."}
      </span>
      {rec.mode === "hold" ? (
        <div className="mt-5 flex flex-col items-center">
          <motion.span animate={{ y: rec.cancelArmed ? -6 : 0 }} className="lbl" style={{ color: "#FFE3E8" }}>
            {rec.cancelArmed ? "Отпустите — отменю" : "↑ Проведите вверх — отменить"}
          </motion.span>
          <div className="mt-3 h-0 w-full" style={{ borderTop: "1px dashed rgba(255,129,151,.6)" }} />
        </div>
      ) : (
        <div className="mt-5 h-[34px]" />
      )}
      <div className="relative flex flex-1 flex-col items-center justify-center">
        {/* a slow ring turns behind the clock while the channel is open */}
        <svg className="pointer-events-none absolute" width="270" height="270" viewBox="0 0 270 270" aria-hidden style={{ opacity: hot ? 1 : 0.35 }}>
          <g style={{ transformOrigin: "135px 135px", animation: "cy-spin 12s linear infinite" }}>
            <circle cx="135" cy="135" r="128" fill="none" stroke="rgba(255,51,85,.55)" strokeWidth="1.2" strokeDasharray="60 14 6 14" />
          </g>
          <g style={{ transformOrigin: "135px 135px", animation: "cy-spin-back 20s linear infinite" }}>
            <circle cx="135" cy="135" r="114" fill="none" stroke="rgba(255,129,151,.28)" strokeWidth="1" strokeDasharray="2 6" />
          </g>
        </svg>
        <span className="holo" style={{ padding: 28, margin: -28, filter: hot ? "drop-shadow(0 0 16px rgba(255,51,85,.8))" : "none" }}>
          <Figure value={time} fast className="font-semibold" style={{ fontSize: "clamp(96px, 30vw, 132px)", letterSpacing: "-0.02em", color: "#FFF0F3" }} />
        </span>
        <span className="lbl mt-3" style={{ color: "rgba(255,215,222,.75)" }}>
          {sec < 1 ? "Слушаю" : "Слушаю · запись хранится до разбора"}
        </span>
      </div>
      <div className="flex h-[64px] items-center gap-[3px]" aria-hidden>
        {levels.map((l, i) => (
          <span
            key={i}
            className="block flex-1"
            style={{
              height: `${Math.max(4, Math.round(l * 15) * 4)}px`,
              background: hot ? "linear-gradient(180deg, #FFB0BE, #FF3355 55%, #FFB0BE)" : "var(--text-3)",
              opacity: 0.3 + (i / levels.length) * 0.7,
              boxShadow: hot && i > levels.length - 6 ? "0 0 8px rgba(255,51,85,.8)" : "none",
            }}
          />
        ))}
      </div>
    </motion.div>
  );
}

// ---- the key bar: one key under the thumb -------------------------------------------------------

function KeyBar() {
  const s = useStrict();
  const confirm = s.doc?.kind === "confirm" && !s.doc.stamping ? s.doc : null;
  const parsing = s.doc?.kind === "parsing";
  const text = s.doc?.kind === "text";
  const recording = Boolean(s.rec);
  return (
    <div className="relative z-30 shrink-0 px-5 pb-3 pt-3" style={{ background: recording ? (s.rec?.cancelArmed ? "rgba(14,16,22,.97)" : "rgba(10,4,7,.97)") : "transparent", transition: "background-color .18s" }}>
      {text ? <TextLine key={s.textSeed.n} /> : confirm ? <SendKey /> : <RecordKey disabled={parsing} />}
    </div>
  );
}

function RecordKey({ disabled }: { disabled: boolean }) {
  const s = useStrict();
  const startY = useRef(0);
  const downAt = useRef(0);
  const tapDown = useRef(false);
  const rec = s.rec;
  const pinned = s.personId && s.panel === "person" ? s.personId : null;
  const label = rec
    ? rec.mode === "tap"
      ? "Нажмите — готово"
      : rec.cancelArmed
        ? "Отпустите — отменю"
        : "Отпустите — разберу"
    : disabled
      ? "Разбираю фразу…"
      : pinned
        ? `Задача ${dative(pinned)}`
        : "Удерживайте и говорите";
  const sub = rec ? null : disabled ? null : pinned ? "удерживайте или нажмите" : "или нажмите";
  const live = rec && !rec.cancelArmed;
  return (
    <div className="flex gap-2">
      <button
        type="button"
        data-testid="record-key"
        disabled={disabled}
        aria-label={label}
        className={cx("cut frame relative flex h-[60px] min-w-0 flex-1 select-none items-center gap-3 pl-3.5 pr-3 text-left", disabled ? "frame-dim" : "frame-red")}
        style={{
          touchAction: "none",
          background: live
            ? "linear-gradient(180deg, #FF4766, #D41F43)"
            : rec
              ? "rgba(255,255,255,.06)"
              : disabled
                ? "linear-gradient(180deg, rgba(40,46,60,.7), rgba(20,24,32,.8))"
                : "linear-gradient(180deg, rgba(255,51,85,.26), rgba(255,51,85,.08))",
          color: live ? "#fff" : disabled ? "var(--text-2)" : "var(--text)",
          boxShadow: live ? "0 0 26px rgba(255,51,85,.55)" : "none",
          transition: "background .15s, color .15s, transform .08s, box-shadow .15s",
          WebkitUserSelect: "none",
          WebkitTouchCallout: "none",
        }}
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={(e) => {
          if (disabled) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          startY.current = e.clientY;
          downAt.current = performance.now();
          if (s.rec?.mode === "tap") {
            tapDown.current = true;
            return;
          }
          tapDown.current = false;
          s.startRec("hold", "phrase");
        }}
        onPointerMove={(e) => {
          if (!s.rec || s.rec.mode !== "hold") return;
          s.armCancel(e.clientY - startY.current < -90);
        }}
        onPointerUp={() => {
          if (tapDown.current) {
            tapDown.current = false;
            s.stopRec();
            return;
          }
          if (!s.rec) return;
          const held = performance.now() - downAt.current;
          if (held < 320) {
            s.toTapMode();
            return;
          }
          if (s.rec.cancelArmed) s.cancelRec();
          else s.stopRec();
        }}
        onPointerCancel={() => {
          if (s.rec?.mode === "hold") s.cancelRec();
        }}
      >
        <span className="relative grid h-8 w-8 shrink-0 place-items-center" style={{ border: `1px solid ${live ? "rgba(255,255,255,.8)" : disabled ? "var(--line-2)" : "rgba(255,51,85,.8)"}` }}>
          <span
            className="block h-3 w-3 rotate-45"
            style={{
              background: live ? "#fff" : disabled ? "var(--cyan)" : "var(--red)",
              boxShadow: live ? "0 0 10px #fff" : disabled ? "0 0 8px rgba(70,228,255,.8)" : "0 0 10px rgba(255,51,85,.95)",
              animation: rec || disabled ? "strict-blink 1s steps(1) infinite" : undefined,
            }}
          />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-semibold tracking-[-0.005em]" style={{ fontSize: "clamp(14.5px, 4.1vw, 16.5px)" }}>
            {label}
          </span>
          {sub ? (
            <span className="lbl mt-0.5 truncate" style={{ color: "var(--red-hi)" }}>
              {sub}
            </span>
          ) : null}
        </span>
        {disabled ? (
          <motion.span className="absolute bottom-0 left-0 z-[3] h-[2px]" style={{ background: "var(--cyan)", boxShadow: "0 0 10px rgba(70,228,255,.9)" }} initial={{ width: "0%" }} animate={{ width: "100%" }} transition={{ duration: 3.2, ease: "linear" }} />
        ) : null}
      </button>
      {rec ? (
        <button type="button" className="cut cut-s frame frame-red grid h-[60px] w-[58px] shrink-0 place-items-center" style={{ color: "#FFE3E8", background: "rgba(255,51,85,.08)" }} onClick={() => s.cancelRec()} aria-label="Отменить запись">
          <Icon name="close" />
        </button>
      ) : (
        <button
          type="button"
          data-testid={pinned ? undefined : "text-key"}
          className="cut cut-s frame glass flex h-[60px] w-[58px] shrink-0 flex-col items-center justify-center gap-1"
          onClick={() => s.openText()}
          aria-label={pinned ? `Строкой — ${dative(pinned)}` : "Строкой"}
          disabled={disabled}
          style={{ color: "var(--cyan-hi)" }}
        >
          <Icon name="text" size={18} />
          <span className="lbl" style={{ fontSize: 8.5, color: "var(--text-2)" }}>
            Строкой
          </span>
        </button>
      )}
    </div>
  );
}

function SendKey() {
  const s = useStrict();
  const total = s.drafts.length;
  const ready = s.drafts.filter(isSendable).length;
  const blocked = total - ready;
  const label = s.offhours ? `Отправлю утром в 08:00` : `Отправить ${ready} из ${total}`;
  const sub = s.offhours ? `${ready} из ${total} · ночью никого не будим` : blocked ? `${blocked} без адресата — не уйдёт` : "допуск: директор · всё готово";
  return (
    <div className="flex gap-2">
      <motion.button
        type="button"
        data-testid="send-key"
        className="cut frame frame-red relative flex h-[60px] min-w-0 flex-1 items-center gap-3 px-3.5 text-left"
        style={{ background: "linear-gradient(180deg, #FF4766, #C91D40)", color: "#fff", boxShadow: "0 0 24px rgba(255,51,85,.35)" }}
        whileTap={{ y: 1, filter: "brightness(1.18)" }}
        transition={{ duration: 0.08 }}
        onClick={() => s.send(false)}
        disabled={total === 0}
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center" style={{ border: "1px solid rgba(255,255,255,.75)" }}>
          <Icon name="send" size={17} />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-semibold" style={{ fontSize: "clamp(14.5px, 4.1vw, 16.5px)" }}>
            {s.offhours ? (
              label
            ) : (
              <>
                Отправить <Figure value={ready} /> из {total}
              </>
            )}
          </span>
          <span className="lbl mt-0.5 truncate" style={{ color: "rgba(255,235,239,.85)" }}>
            {sub}
          </span>
        </span>
      </motion.button>
      <button type="button" className="cut cut-s frame glass flex h-[60px] w-[58px] shrink-0 flex-col items-center justify-center gap-1" onClick={() => s.closeDoc()} aria-label="Закрыть черновик" style={{ color: "var(--text)" }}>
        <Icon name="close" size={18} />
        <span className="lbl" style={{ fontSize: 8.5, color: "var(--text-2)" }}>
          Закрыть
        </span>
      </button>
    </div>
  );
}

function TextLine() {
  const s = useStrict();
  const [value, setValue] = useState(s.textSeed.text);
  const pinned = s.personId && s.panel === "person" ? s.personId : null;
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) s.submitText(value);
      }}
    >
      <label className="cut frame frame-cyan glass flex h-[60px] min-w-0 flex-1 items-center gap-2 px-3">
        {pinned ? (
          <span className="lbl shrink-0 px-1.5 py-1" style={{ background: "var(--cyan-tint)", color: "var(--cyan-hi)", boxShadow: "inset 0 0 0 1px rgba(70,228,255,.5)" }}>
            {nameOf(pinned)}
          </span>
        ) : null}
        <input
          data-testid="text-input"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={pinned ? "что сделать — одной строкой" : "Одной строкой — как сказали бы"}
          className="min-w-0 flex-1 bg-transparent text-[16px] outline-none"
          enterKeyHint="send"
        />
      </label>
      <button
        type="submit"
        data-testid="text-send"
        disabled={!value.trim()}
        className={cx("cut cut-s frame grid h-[60px] w-[58px] shrink-0 place-items-center", value.trim() ? "frame-cyan" : "frame-dim")}
        style={{ background: value.trim() ? "rgba(70,228,255,.2)" : "rgba(255,255,255,.03)", color: value.trim() ? "var(--cyan-hi)" : "var(--text-3)" }}
        aria-label="Разобрать"
      >
        <Icon name="send" />
      </button>
    </form>
  );
}

// ---- the toast line: glass, a countdown that runs out ------------------------------------------

function ToastLine({ toast, onUndo }: { toast: Toast | null; onUndo: () => void }) {
  return (
    <div className="pointer-events-none absolute inset-x-5 bottom-3 z-30">
      <AnimatePresence mode="popLayout">
        {toast ? (
          <motion.div
            key={toast.id}
            data-testid="toast"
            className="cut frame bd-blur pointer-events-auto relative flex min-h-[50px] items-center gap-3 overflow-hidden pl-4 pr-1"
            style={{ background: "linear-gradient(180deg, rgba(26,32,44,.92), rgba(12,15,22,.95))", color: "var(--text)" }}
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 10, opacity: 0, transition: { duration: 0.16 } }}
            transition={{ duration: 0.22, ease: EASE }}
          >
            <span className="block h-2 w-2 shrink-0 rotate-45" style={{ background: "var(--cyan)", boxShadow: "0 0 8px rgba(70,228,255,.8)" }} />
            <span className="min-w-0 flex-1 truncate text-[14px]">{toast.text}</span>
            {toast.undo ? (
              <button type="button" data-testid="undo" className="flex h-11 shrink-0 items-center gap-2 px-3" onClick={onUndo}>
                <UndoCount />
                <span className="lbl" style={{ color: "var(--cyan-hi)" }}>
                  Отменить
                </span>
              </button>
            ) : null}
            {toast.undo ? (
              <motion.span className="absolute bottom-0 left-0 z-[3] h-[2px]" style={{ background: "var(--cyan)", boxShadow: "0 0 8px rgba(70,228,255,.9)" }} initial={{ width: "100%" }} animate={{ width: "0%" }} transition={{ duration: 5, ease: "linear" }} />
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function UndoCount() {
  const [n, setN] = useState(5);
  useEffect(() => {
    const id = window.setInterval(() => setN((x) => Math.max(0, x - 1)), 1000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <span className="disp grid h-6 w-6 place-items-center text-[13px] font-semibold" style={{ boxShadow: "inset 0 0 0 1px rgba(70,228,255,.6)", color: "var(--cyan-hi)" }}>
      <Figure value={n} />
    </span>
  );
}

// ---- the tab bar --------------------------------------------------------------------------------

const TAB_ICON: Record<string, "pulse" | "tasks" | "calendar" | "notes" | "screen" | "profile"> = {
  pulse: "pulse",
  sent: "tasks",
  calendar: "calendar",
  notes: "notes",
  screen: "screen",
  profile: "profile",
};

function TabBar({ onNote, onHome }: { onNote: (label: string) => void; onHome: () => void }) {
  const s = useStrict();
  return (
    <nav className="relative z-30 shrink-0 px-2" style={{ background: "linear-gradient(180deg, rgba(12,15,21,.85), rgba(6,7,10,.98))", paddingBottom: "env(safe-area-inset-bottom)" }}>
      <span className="absolute inset-x-0 top-0 block h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(150,215,255,.35) 20%, rgba(150,215,255,.35) 80%, transparent)" }} />
      <div className="grid grid-cols-6">
        {TABS.map((tab) => {
          const active = tab.id === "pulse";
          const badge = tab.id === "pulse" ? s.board.waiting : 0;
          return (
            <button
              key={tab.id}
              type="button"
              className="relative flex h-[56px] flex-col items-center justify-center gap-1"
              style={{ color: active ? "var(--text)" : "var(--text-3)" }}
              onClick={() => (active ? onHome() : onNote(tab.label))}
            >
              {active ? <span className="absolute left-4 right-4 top-0 h-[2px]" style={{ background: "var(--cyan)", boxShadow: "0 0 10px rgba(70,228,255,.9)" }} /> : null}
              <span className="relative" style={{ color: active ? "var(--cyan-hi)" : undefined, filter: active ? "drop-shadow(0 0 6px rgba(70,228,255,.6))" : undefined }}>
                <Icon name={TAB_ICON[tab.id]!} size={21} />
                {badge > 0 ? (
                  <span className="cut cut-s disp absolute -right-3.5 -top-1.5 grid h-[16px] min-w-[18px] place-items-center px-[4px] text-[10.5px] font-bold" style={{ background: "var(--cyan)", color: "#02141B", "--c": "4px" } as React.CSSProperties}>
                    <Figure value={badge} />
                  </span>
                ) : null}
              </span>
              <span className="text-[10.5px] font-medium tracking-[0.01em]">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

// ---- tokens & classes ---------------------------------------------------------------------------

const CSS = `
[data-strict]{
  --bg:#07080C; --bg-2:#121620; --glass:rgba(15,19,27,.82); --glass-2:rgba(25,31,43,.9);
  --text:#E8EDF4; --text-2:#A9B3C3; --text-3:#7F899B;
  --line:rgba(150,205,255,.12); --line-2:rgba(150,205,255,.24);
  --cyan:#46E4FF; --cyan-hi:#A6F3FF; --cyan-tint:rgba(70,228,255,.09);
  --red:#FF3355; --red-hi:#FF8197; --red-tint:rgba(255,51,85,.12);
  --display:var(--font-cy-display), var(--font-body), system-ui, sans-serif;
  --mono:var(--font-cy-mono), ui-monospace, monospace;
  background:
    radial-gradient(760px 460px at -12% -6%, rgba(255,51,85,.16), transparent 62%),
    radial-gradient(720px 620px at 118% 108%, rgba(70,228,255,.11), transparent 62%),
    linear-gradient(180deg, #08090D 0%, #06070A 100%);
  color:var(--text);
  font-family:var(--font-body), system-ui, sans-serif;
  -webkit-font-smoothing:antialiased; font-synthesis:none;
}
/* the corporate grid under everything, fading towards the bottom */
[data-strict]::before{
  content:""; position:absolute; inset:0; pointer-events:none;
  background-image:linear-gradient(rgba(140,200,255,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(140,200,255,.05) 1px, transparent 1px);
  background-size:28px 28px; background-position:-1px -1px;
  -webkit-mask-image:linear-gradient(180deg, #000 0%, rgba(0,0,0,.35) 55%, transparent 100%);
          mask-image:linear-gradient(180deg, #000 0%, rgba(0,0,0,.35) 55%, transparent 100%);
}
/* the glass of the device: static scanlines and grain, painted once */
[data-strict]::after{
  content:""; position:absolute; inset:0; pointer-events:none; z-index:60;
  background-image:repeating-linear-gradient(180deg, rgba(0,0,0,.22) 0 1px, transparent 1px 3px), url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .55 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>");
  opacity:.16;
}
[data-strict] *{ -webkit-tap-highlight-color:transparent; }
[data-strict] .lbl{ font-family:var(--display); font-stretch:82%; font-weight:600; font-size:10.5px; line-height:1.25; letter-spacing:.14em; text-transform:uppercase; }
[data-strict] .num{ font-family:var(--display); font-variant-numeric:tabular-nums lining-nums; font-stretch:75%; }
[data-strict] .disp{ font-family:var(--display); }
[data-strict] .mono{ font-family:var(--mono); font-stretch:82%; font-variant-numeric:tabular-nums; letter-spacing:-.01em; }
[data-strict] .glow-c{ text-shadow:0 0 12px rgba(70,228,255,.5); }
[data-strict] .glow-r{ text-shadow:0 0 12px rgba(255,51,85,.55); }
/* chamfered corners: top-right and bottom-left cut */
[data-strict] .cut{ --c:10px; clip-path:polygon(0 0, calc(100% - var(--c)) 0, 100% var(--c), 100% 100%, var(--c) 100%, 0 calc(100% - var(--c))); }
[data-strict] .cut-s{ --c:6px; }
[data-strict] .cut-l{ --c:16px; }
/* a luminous 1 px frame that follows the chamfer */
/* in the components layer, so Tailwind's absolute/fixed still win on a framed element */
@layer components{ [data-strict] .frame{ position:relative; } [data-strict] .holo{ position:relative; } }
[data-strict] .frame::before{
  content:""; position:absolute; inset:0; pointer-events:none; z-index:2;
  background:var(--frame, linear-gradient(135deg, rgba(130,225,255,.6), rgba(130,225,255,.14) 32%, rgba(130,225,255,.07) 64%, rgba(130,225,255,.38)));
  clip-path:polygon(0 0, calc(100% - var(--c,0px)) 0, 100% var(--c,0px), 100% 100%, var(--c,0px) 100%, 0 calc(100% - var(--c,0px)), 0 0,
    1px 1px, 1px calc(100% - var(--c,0px) - .41px), calc(var(--c,0px) + .41px) calc(100% - 1px), calc(100% - 1px) calc(100% - 1px), calc(100% - 1px) calc(var(--c,0px) + .41px), calc(100% - var(--c,0px) - .41px) 1px, 1px 1px);
}
[data-strict] .frame-red{ --frame:linear-gradient(135deg, rgba(255,51,85,1), rgba(255,51,85,.45) 35%, rgba(255,51,85,.28) 65%, rgba(255,51,85,.85)); }
[data-strict] .frame-cyan{ --frame:linear-gradient(135deg, rgba(70,228,255,1), rgba(70,228,255,.5) 40%, rgba(70,228,255,.35) 60%, rgba(70,228,255,.9)); }
[data-strict] .frame-dim{ --frame:rgba(150,205,255,.2); }
/* a HUD bracket on the top-left corner */
[data-strict] .tick::after{
  content:""; position:absolute; left:0; top:0; width:12px; height:12px; pointer-events:none; z-index:3;
  border-left:1.5px solid var(--tick, var(--cyan)); border-top:1.5px solid var(--tick, var(--cyan));
}
[data-strict] .glass{ background:linear-gradient(180deg, rgba(28,34,46,.78), rgba(14,18,26,.86)); }
[data-strict] .glass-red{ background:linear-gradient(180deg, rgba(255,51,85,.2), rgba(255,51,85,.07)); }
[data-strict] .glass-cyan{ background:linear-gradient(180deg, rgba(70,228,255,.16), rgba(70,228,255,.05)); }
[data-strict] .bd-blur{ -webkit-backdrop-filter:blur(16px) saturate(140%); backdrop-filter:blur(16px) saturate(140%); }
/* hologram: the figure itself is striped by a mask — no box around it */
[data-strict] .holo{ -webkit-mask-image:repeating-linear-gradient(180deg, #000 0 3px, rgba(0,0,0,.42) 3px 4px); mask-image:repeating-linear-gradient(180deg, #000 0 3px, rgba(0,0,0,.42) 3px 4px); }
[data-strict] .key{ display:inline-flex; align-items:center; justify-content:center; gap:8px; min-height:44px; padding:0 14px; font-size:14px; font-weight:500; line-height:1.15; transition:transform .08s, background-color .12s, color .12s, box-shadow .12s; user-select:none; text-align:center; }
[data-strict] .key:active:not(:disabled){ transform:translateY(1px); }
[data-strict] .key-ink{ background:rgba(70,228,255,.12); color:var(--cyan-hi); box-shadow:inset 0 0 0 1px rgba(70,228,255,.7); text-shadow:0 0 10px rgba(70,228,255,.35); }
[data-strict] .key-ink:active:not(:disabled){ background:var(--cyan); color:#02141B; text-shadow:none; }
[data-strict] .key-line{ background:rgba(255,255,255,.03); color:var(--text); box-shadow:inset 0 0 0 1px var(--line-2); }
[data-strict] .key-line:active:not(:disabled){ background:rgba(70,228,255,.14); color:var(--cyan-hi); }
[data-strict] .key-seal{ background:rgba(255,51,85,.16); color:#FFE5EA; box-shadow:inset 0 0 0 1px rgba(255,51,85,.85); }
[data-strict] .key-seal:active:not(:disabled){ background:var(--red); color:#fff; }
[data-strict] .key-paper{ background:#fff; color:var(--bg); }
[data-strict] .key-seg{ color:var(--text); background:rgba(255,255,255,.02); box-shadow:inset 1px 0 0 var(--line-2); }
[data-strict] .key-seg:active:not(:disabled){ background:rgba(70,228,255,.16); color:var(--cyan-hi); }
[data-strict] .key-ghost{ color:var(--cyan-hi); padding:0 4px; text-decoration:underline; text-underline-offset:4px; text-decoration-thickness:1px; text-decoration-color:rgba(70,228,255,.5); }
[data-strict] .key:disabled{ opacity:.35; }
[data-strict] input, [data-strict] textarea{ color:var(--text); caret-color:var(--cyan); }
[data-strict] input::placeholder, [data-strict] textarea::placeholder{ color:var(--text-3); }
[data-strict] ::-webkit-scrollbar{ width:0; height:0; }
@media (max-height: 800px){ [data-strict] .tall-only{ display:none; } }
@keyframes strict-blink{ 0%{opacity:1} 50%{opacity:.2} 100%{opacity:1} }
@keyframes cy-pulse{ 0%,100%{opacity:1} 50%{opacity:.35} }
@keyframes cy-spin{ to{ transform:rotate(360deg); } }
@keyframes cy-spin-back{ to{ transform:rotate(-360deg); } }
/* a short digital glitch: the layer slips in slices and splits its colour, once */
@keyframes cy-glitch{
  0%{ clip-path:inset(0 0 62% 0); transform:translate(3px,0); filter:drop-shadow(-2px 0 rgba(255,51,85,.9)) drop-shadow(2px 0 rgba(70,228,255,.9)); }
  18%{ clip-path:inset(38% 0 30% 0); transform:translate(-4px,0); }
  36%{ clip-path:inset(72% 0 0 0); transform:translate(2px,0); }
  54%{ clip-path:inset(12% 0 50% 0); transform:translate(-1px,0); }
  72%{ clip-path:inset(0 0 0 0); transform:none; filter:drop-shadow(-1px 0 rgba(255,51,85,.6)) drop-shadow(1px 0 rgba(70,228,255,.6)); }
  100%{ clip-path:inset(0 0 0 0); transform:none; filter:none; }
}
[data-strict] .glitch-in{ animation:cy-glitch .42s steps(1,end) 1; }
@keyframes cy-ghost{
  0%{ opacity:1; clip-path:inset(0 0 60% 0); transform:translateX(5px); }
  16%{ clip-path:inset(42% 0 22% 0); transform:translateX(-6px); }
  32%{ clip-path:inset(72% 0 4% 0); transform:translateX(3px); }
  48%{ clip-path:inset(14% 0 56% 0); transform:translateX(-2px); }
  64%{ opacity:.55; clip-path:inset(0 0 0 0); transform:none; }
  100%{ opacity:0; }
}
[data-strict] .ghost-in{ animation:cy-ghost .55s steps(1,end) 1 forwards; }
@media (prefers-reduced-motion: reduce){ [data-strict] *{ animation:none !important; transition-duration:0s !important; } [data-strict] .scan{ display:none !important; } }
`;

export type { ReactNode };
