"use client";

/**
 * «Чей ход» — the director's Пульс as one vertical field. The sky (top) is the team, arranged
 * by whose move it is; the ground (bottom, under the thumb) is the director's side: the
 * assistant's one line of words, what waits for him, and the one key. Depth rises from the
 * ground by a tap; the sky folds into a band and never disappears.
 */
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";

import {
  COMPANY,
  DIRECTOR,
  DISPUTES,
  DRAFT,
  DRAFT_EXTRA,
  ERRORS,
  ETHER,
  EVENTS,
  GREETING,
  HEARD,
  NEWS,
  NOW,
  OFFHOURS_NOW,
  minutesAgo,
  QUERY,
  REACTIONS,
  SECRETARY,
  SECRETARY_ACTIONS,
  SECRETARY_MESSAGE,
  TABS,
  TASKS,
  UNPARSED,
  VISITOR,
  hhmm,
  personById,
  type Errand,
  type EtherPost,
  type Message,
  type StateId,
  type Task,
} from "@/app/dev/pulse-alt/fixtures";

import { ConfirmList, Recipients, sendable, summaryOf, tokensOf, type Token } from "./confirm";
import { ALL_SAY, ERRAND_SAY, KEPT_PHRASE, PINNED_FALLBACK, PINNED_SAY } from "./data";
import { SideKey, Timer, VoiceKey } from "./key";
import {
  countsOf,
  crewOf,
  dative,
  deckTasks,
  firstName,
  heavyOrder,
  messageTasks,
  minutesUntil,
  moodOf,
  movesPhrase,
  nextEvent,
  plural,
  verb,
  type Crew,
} from "./model";
import {
  CalendarPanel,
  Ether,
  Messages,
  PanelHeader,
  PersonPanel,
  RatingPanel,
  SecretaryPanel,
  SecretaryWords,
  Sections,
  TasksDeck,
  VisitorCard,
  type SectionId,
} from "./panels";
import { ActionsBody, ChoiceBody, EventBody, KeptBody, PickerBody, ServiceBody, ThreadBody, deadlineChoices, repeatChoices } from "./sheets";
import { BandMore, People, SHELF_TAB_W, SkyBackdrop, layoutBand, layoutFull, shelfTopOf } from "./sky";
import type { Comet, DraftItem, Failure, Flash, KeptPhrase, Layer, Outcome, Pin, SheetT } from "./types";
import { C, Clip, Disc, Icon, Key, MONO, Press, Sheet, Toast, buzz, useReduced, type ToastData } from "./ui";

export type { Failure } from "./types";

const FULL_LAYERS = new Set<Layer>(["confirm", "tasks", "messages", "ether", "calendar", "rating", "person", "secretary"]);
const BAND_H = 76;
const NOW_ISO = NOW.toISOString();

// ---- sizes -------------------------------------------------------------------------------------------

function useBox<T extends HTMLElement>(): [(el: T | null) => void, { w: number; h: number }] {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const ro = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: T | null) => {
    ro.current?.disconnect();
    if (!el) return;
    const obs = new ResizeObserver(() => setBox({ w: el.offsetWidth, h: el.offsetHeight }));
    obs.observe(el);
    ro.current = obs;
  }, []);
  return [ref, box];
}

/** The voice's level at a tick — deterministic, with breaths between words. */
function levelAt(t: number): number {
  const pause = Math.sin(t * 0.11) > 0.82 ? 0.15 : 1;
  return Math.min(1, (0.12 + 0.88 * Math.abs(Math.sin(t * 0.9) * Math.sin(t * 0.37 + 1) * Math.cos(t * 0.13))) * pause);
}

// ---- the initial picture per ?state= ------------------------------------------------------------------

type Init = {
  layer: Layer;
  sheets: SheetT[];
  drafts: DraftItem[];
  heard: string;
  awake: boolean;
  news: number | null;
  visitor: boolean;
  secMessage: boolean;
  online: boolean;
  kept: KeptPhrase[];
  night: boolean;
  personId: string | null;
  failure: Failure | null;
  empty: boolean;
  dndOffer: boolean;
  stage: number;
  words: number;
  outcome: Outcome;
  tapMode: boolean;
  recBase: number;
};

function initFor(state: StateId, fail: Failure | null): Init {
  const base: Init = {
    layer: "home",
    sheets: [],
    drafts: [],
    heard: "",
    awake: false,
    news: null,
    visitor: false,
    secMessage: false,
    online: true,
    kept: [],
    night: false,
    personId: null,
    failure: null,
    empty: false,
    dndOffer: false,
    stage: 0,
    words: 0,
    outcome: "draft",
    tapMode: false,
    recBase: 0,
  };
  const confirm = { layer: "confirm" as Layer, drafts: DRAFT as DraftItem[], heard: HEARD };
  if (fail && fail !== "kept") return { ...base, layer: "failure", failure: fail, heard: fail === "stt" ? "" : base.heard };
  switch (state) {
    case "awake":
      return { ...base, awake: true };
    case "news":
      return { ...base, news: 0 };
    case "recording":
      return { ...base, layer: "recording", tapMode: true, recBase: 3 };
    case "parsing":
      return { ...base, layer: "parsing", stage: 1, words: 9, heard: HEARD };
    case "confirm":
      return { ...base, ...confirm };
    case "picker":
      return { ...base, ...confirm, sheets: [{ kind: "picker", target: { draftId: "d2" } }] };
    case "offhours":
      return { ...base, ...confirm, night: true };
    case "unparsed":
      return { ...base, layer: "unparsed", heard: UNPARSED.heard };
    case "answer":
      return { ...base, layer: "answer", heard: QUERY.said };
    case "kept":
      return { ...base, layer: "failure", failure: "kept", online: false, kept: [KEPT_PHRASE] };
    case "text":
      return { ...base, layer: "text" };
    case "tasks":
      return { ...base, layer: "tasks" };
    case "messages":
      return { ...base, layer: "messages" };
    case "thread":
      return { ...base, layer: "messages", sheets: [{ kind: "thread", taskId: "t-estimate" }] };
    case "actions":
      return { ...base, layer: "tasks", sheets: [{ kind: "actions", taskId: "t-act" }] };
    case "ether":
      return { ...base, layer: "ether" };
    case "calendar":
      return { ...base, layer: "calendar" };
    case "rating":
      return { ...base, layer: "rating" };
    case "person":
      return { ...base, layer: "person", personId: "p-marat" };
    case "secretary":
      return { ...base, layer: "secretary", dndOffer: true };
    case "visitor":
      return { ...base, visitor: true, secMessage: true };
    case "empty":
      return { ...base, empty: true };
    default:
      return base;
  }
}

// ---- the screen -----------------------------------------------------------------------------------------

export function Pulse({ initial, fail, secretaryAway }: { initial: StateId; fail: Failure | null; secretaryAway: boolean }) {
  const reduce = useReduced();
  const [init] = useState(() => initFor(initial, fail));

  // data
  const [tasks, setTasks] = useState<Task[]>(() => (init.empty ? [] : TASKS.map((t) => ({ ...t, thread: [...t.thread] }))));
  const [ether, setEther] = useState<EtherPost[]>(() => (init.empty ? [] : ETHER));
  const [disputes, setDisputes] = useState(() => (init.empty ? [] : DISPUTES));
  const [errands, setErrands] = useState<Errand[]>(() => (init.empty ? [] : SECRETARY.errands));
  const [visitor, setVisitor] = useState(init.visitor);
  const [secMessage, setSecMessage] = useState(init.secMessage);
  const [online, setOnline] = useState(init.online);
  const [kept, setKept] = useState<KeptPhrase[]>(init.kept);
  const [pushOn, setPushOn] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [draftSaved, setDraftSaved] = useState(!init.empty);
  const [dndOffer, setDndOffer] = useState(init.dndOffer);
  const [dndOn, setDndOn] = useState(false);
  const empty = init.empty;
  const night = init.night;
  const now = night ? OFFHOURS_NOW : NOW;

  // what the ground shows
  const [layer, setLayer] = useState<Layer>(init.layer);
  const [returnTo, setReturnTo] = useState<Layer>("home");
  const [sheets, setSheets] = useState<SheetT[]>(init.sheets);
  const [drafts, setDrafts] = useState<DraftItem[]>(init.drafts);
  const [heard, setHeard] = useState(init.heard);
  const [awake, setAwake] = useState(init.awake);
  const [news, setNews] = useState<number | null>(init.news);
  const [live, setLive] = useState<{ id: string; text: string; tone: "ok" | "warn" | "info"; who: string | null; taskId?: string } | null>(null);
  const [sent, setSent] = useState(0);
  // who the batch flies to — kept on screen until it has landed
  const [flightTokens, setFlightTokens] = useState<Token[] | null>(null);
  const [deckWho, setDeckWho] = useState<string | null>(null);
  const [personId, setPersonId] = useState<string | null>(init.personId);
  const [failure, setFailure] = useState<Failure | null>(init.failure);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [toast, setToast] = useState<ToastData | null>(null);
  const [text, setText] = useState("");
  const [textPin, setTextPin] = useState<Pin>(null);

  // the voice pipeline
  const [tapMode, setTapMode] = useState(init.tapMode);
  const [recTick, setRecTick] = useState(init.recBase * 10);
  const [recPin, setRecPin] = useState<Pin>(null);
  const [stage, setStage] = useState(init.stage);
  const [words, setWords] = useState(init.words);
  const [outcome, setOutcome] = useState<Outcome>(init.outcome);
  const [armed, setArmed] = useState(false);

  // motion
  const [pulses, setPulses] = useState<Record<string, number>>({});
  const [drops, setDrops] = useState<Record<string, number>>(() => (init.news === 0 ? { "p-erlanb": 1 } : ({} as Record<string, number>)));
  const [comets, setComets] = useState<Comet[]>([]);
  const [celebrate, setCelebrate] = useState(0);

  // sizes
  const rootRef = useRef<HTMLDivElement>(null);
  const [mainRef, main] = useBox<HTMLDivElement>();
  const [headRef, head] = useBox<HTMLDivElement>();
  const [contentRef, content] = useBox<HTMLDivElement>();
  const [keyRef, keyBox] = useBox<HTMLDivElement>();
  const [tabRef, tab] = useBox<HTMLElement>();

  // the keyboard: the whole field lives above it, the tab bar steps aside
  const [kb, setKb] = useState<{ h: number; top: number } | null>(null);
  useEffect(() => {
    const v = window.visualViewport;
    if (!v) return;
    const on = () => setKb(v.height < window.innerHeight - 90 ? { h: v.height, top: v.offsetTop } : null);
    v.addEventListener("resize", on);
    v.addEventListener("scroll", on);
    return () => {
      v.removeEventListener("resize", on);
      v.removeEventListener("scroll", on);
    };
  }, []);

  // timers die with the screen
  const timers = useRef(new Set<number>());
  const later = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
  }, []);
  useEffect(() => {
    const set = timers.current;
    return () => set.forEach((id) => window.clearTimeout(id));
  }, []);

  // ---- toasts ----
  const toastId = useRef(1);
  const showToast = (t: string, undo?: () => void, extra?: ReactNode) => {
    toastId.current += 1;
    setToast({ id: toastId.current, text: t, undo, extra });
  };
  const clearToast = useCallback(() => setToast(null), []);

  // ---- derived board ----
  const counts = useMemo(() => countsOf(tasks), [tasks]);
  const mood = moodOf(counts);
  const crew = useMemo(() => (empty ? [] : crewOf(tasks)), [tasks, empty]);
  const messages = useMemo(() => messageTasks(tasks), [tasks]);
  const deck = useMemo(() => deckTasks(tasks), [tasks]);
  const tokens = useMemo(() => tokensOf(drafts), [drafts]);
  const soonEvent = nextEvent(EVENTS, now);
  const soon = !!soonEvent && minutesUntil(soonEvent.startsAt, now) > 0 && minutesUntil(soonEvent.startsAt, now) <= 15;
  const top = sheets[sheets.length - 1] ?? null;

  const pin: Pin = layer === "person" && personId ? { kind: "person", id: personId } : layer === "ether" ? { kind: "all" } : layer === "secretary" ? { kind: "secretary" } : null;

  // ---- geometry ----
  const personHasWork = layer === "person" && tasks.some((t) => t.assigneeId === personId);
  const full = FULL_LAYERS.has(layer) && (layer !== "person" || personHasWork);
  const M = main.h || 720;
  const W = main.w || 393;
  const natural = head.h + content.h + keyBox.h + 6;
  const S = full ? M - BAND_H : Math.max(170, Math.min(natural || 320, M - 128));
  const skyH = Math.max(0, M - S);
  const band = full || skyH < 214;
  const tabH = tab.h || 64;

  // ---- the voice ----
  useEffect(() => {
    if (layer !== "recording") return;
    const t = window.setInterval(() => setRecTick((x) => x + 1), 100);
    return () => window.clearInterval(t);
  }, [layer]);

  const startRecording = (mode: "hold" | "tap", p: Pin = pin) => {
    setReturnTo(layer === "recording" || layer === "parsing" ? "home" : layer);
    setRecPin(p);
    setTapMode(mode === "tap");
    setRecTick(0);
    setAwake(false);
    setFlash(null);
    setLayer("recording");
    buzz(10);
  };
  const recSec = Math.floor(recTick / 10);

  const parse = useCallback(
    (o: Outcome, said: string) => {
      setOutcome(o);
      setHeard(said);
      setStage(0);
      setWords(0);
      setLayer("parsing");
    },
    [],
  );

  const stopRecording = (cancelled: boolean) => {
    if (layer !== "recording") return;
    if (cancelled) {
      setLayer(returnTo);
      setFlash({ title: "Отменил.", sub: "Ничего не записано и не отправлено.", tone: "quiet" });
      later(() => setFlash(null), 2600);
      return;
    }
    if (!tapMode && recTick < 10) {
      setFailure("short");
      setLayer("failure");
      return;
    }
    const o: Outcome = recPin?.kind === "person" ? "pinned" : recPin?.kind === "all" ? "all" : recPin?.kind === "secretary" ? "errand" : "draft";
    const said = o === "pinned" ? (PINNED_SAY[recPin && recPin.kind === "person" ? recPin.id : ""] ?? PINNED_FALLBACK).heard : o === "all" ? ALL_SAY.heard : o === "errand" ? ERRAND_SAY : HEARD;
    if (!online) {
      // the phrase is saved on the phone before anything else (principle 5) and waits for the network
      setKept((k) => [...k, { id: `k${Date.now()}`, at: NOW_ISO, sec: Math.max(2, recSec), text: said, kind: "voice" }]);
      setFailure("kept");
      setLayer("failure");
      return;
    }
    parse(o, said);
  };

  const finishParse = () => {
    switch (outcome) {
      case "pinned": {
        const id = recPin?.kind === "person" ? recPin.id : textPin?.kind === "person" ? textPin.id : "p-marat";
        const say = PINNED_SAY[id] ?? PINNED_FALLBACK;
        setDrafts([{ id: `pin-${id}`, kind: "task", title: say.title, assigneeId: id, deadline: say.deadline, voiceSec: textPin ? undefined : 5 }]);
        setLayer("confirm");
        break;
      }
      case "all":
        setDrafts([ALL_SAY.draft]);
        setLayer("confirm");
        break;
      case "errand": {
        const id = `er${Date.now()}`;
        setErrands((e) => [{ id, code: "voice", label: "Своими словами", note: ERRAND_SAY, status: "asked", at: NOW_ISO, by: "s-zhanna" }, ...e]);
        setLayer("secretary");
        showToast("Жанна получила просьбу своими словами");
        later(() => setErrands((e) => e.map((x) => (x.id === id ? { ...x, status: "seen" } : x))), 1600);
        break;
      }
      case "query":
        setLayer("answer");
        break;
      case "unparsed":
        setLayer("unparsed");
        break;
      case "stt":
        setFailure("stt");
        setLayer("failure");
        break;
      default:
        setDrafts(DRAFT as DraftItem[]);
        setLayer("confirm");
    }
  };

  // the pipeline: Сохраняю запись → Распознаю → Разбираю → the result
  useEffect(() => {
    if (layer !== "parsing") return;
    const ids: number[] = [];
    const all = heard.split(" ").length;
    const startStage = stage;
    const t0 = startStage === 0 ? 650 : 0;
    if (startStage === 0) ids.push(window.setTimeout(() => setStage(1), t0));
    const wordStep = Math.max(28, Math.min(70, 1300 / Math.max(1, all)));
    ids.push(
      window.setTimeout(() => {
        const iv = window.setInterval(() => setWords((w) => (w >= all ? w : w + 1)), wordStep);
        ids.push(iv);
      }, t0),
    );
    ids.push(window.setTimeout(() => setStage(2), t0 + 1500));
    ids.push(
      window.setTimeout(() => {
        setWords(all);
        finishParse();
      }, t0 + 2500),
    );
    return () => ids.forEach((id) => {
      window.clearTimeout(id);
      window.clearInterval(id);
    });
    // the pipeline runs once per entry into «parsing»
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer]);

  // the network comes back: what waited on the phone goes by itself, once
  useEffect(() => {
    if (online || !kept.length) return;
    const t = window.setTimeout(() => {
      setOnline(true);
      setKept([]);
      setErrands((e) => e.map((x) => (x.status === "waiting" ? { ...x, status: "asked" } : x)));
      setToast({ id: Date.now(), text: "Сеть появилась — то, что ждало на телефоне, ушло само" });
      if (kept.some((k) => k.kind === "voice")) parse("draft", HEARD);
    }, 16000);
    return () => window.clearTimeout(t);
  }, [online, kept, parse]);

  // «Не расслышал» retries by itself: the record is kept
  useEffect(() => {
    if (layer !== "failure" || failure !== "stt") return;
    const t = window.setTimeout(() => parse("draft", HEARD), 4200);
    return () => window.clearTimeout(t);
  }, [layer, failure, parse]);

  // ---- motion helpers ----
  const pulse = useCallback((id: string) => setPulses((p) => ({ ...p, [id]: (p[id] ?? 0) + 1 })), []);
  const drop = useCallback((id: string) => setDrops((d) => ({ ...d, [id]: (d[id] ?? 0) + 1 })), []);

  // the greeting lights up, one by one, the people it speaks of
  useEffect(() => {
    if (!init.awake) return;
    const heavy = heavyOrder(crewOf(TASKS));
    const ids = heavy.map((c, i) => window.setTimeout(() => setPulses((p) => ({ ...p, [c.id]: (p[c.id] ?? 0) + 1 })), 700 + i * 260));
    return () => ids.forEach((id) => window.clearTimeout(id));
  }, [init.awake]);

  // news: a change pops up over its person and fades after ~9 s, then the next one
  useEffect(() => {
    if (news === null) return;
    const t = window.setTimeout(() => {
      const next = news + 1 < NEWS.length ? news + 1 : null;
      setNews(next);
      const n = next !== null ? NEWS[next] : null;
      const who = n?.taskId ? tasks.find((x) => x.id === n.taskId)?.assigneeId : null;
      if (who) setDrops((d) => ({ ...d, [who]: (d[who] ?? 0) + 1 }));
    }, 9000);
    return () => window.clearTimeout(t);
  }, [news, tasks]);

  // a live thought fades like the scripted ones
  useEffect(() => {
    if (!live) return;
    const t = window.setTimeout(() => setLive(null), 9000);
    return () => window.clearTimeout(t);
  }, [live]);

  // the secretary's coffee arrives while her desk is open
  useEffect(() => {
    if (layer !== "secretary") return;
    const t = window.setTimeout(() => setErrands((e) => e.map((x) => (x.code === "coffee" && x.status === "doing" ? { ...x, status: "done", etaMin: undefined } : x))), 6500);
    return () => window.clearTimeout(t);
  }, [layer]);

  // ---- task moves -------------------------------------------------------------------------------------------
  const patch = (id: string, fn: (t: Task) => Task) => setTasks((ts) => ts.map((t) => (t.id === id ? fn(t) : t)));
  const restore = (old: Task, index: number) =>
    setTasks((ts) => {
      if (ts.some((t) => t.id === old.id)) return ts.map((t) => (t.id === old.id ? old : t));
      const next = [...ts];
      next.splice(Math.min(index, next.length), 0, old);
      return next;
    });
  const say = (id: string, from: Message["from"], textLine: string, voiceSec?: number): Message => ({ id: `${id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, from, text: textLine, at: NOW_ISO, voiceSec });

  const act = (taskId: string, key: string) => {
    const t = tasks.find((x) => x.id === taskId);
    if (!t) return;
    const p = personById(t.assigneeId);
    const who = p ? p.short : "";
    const index = tasks.findIndex((x) => x.id === taskId);
    const removeUndo = (msg: string, extra?: ReactNode) => {
      setTasks((ts) => ts.filter((x) => x.id !== taskId));
      showToast(msg, () => restore(t, index), extra);
      pulse(t.assigneeId);
    };
    switch (key) {
      case "Принять":
        removeUndo(`Принято · ${who}, «${t.title}»`, COMPANY.pointsEnabled ? <Reactions /> : undefined);
        break;
      case "Доработать":
        patch(taskId, (x) => ({ ...x, lane: "work", status: "rework", report: undefined }));
        setSheets((s) => [...s, { kind: "thread", taskId, compose: "Доработать: " }]);
        break;
      case "Настоять":
        patch(taskId, (x) => ({ ...x, lane: "work", status: "sent", decline: undefined, receipt: { sentAt: NOW_ISO, seenAt: null, acceptedAt: null }, thread: [...x.thread, say(x.id, "system", "Директор настоял — задача снова у исполнителя")] }));
        showToast(`Настояли — ${who} снова ${verb(t.assigneeId, "получил", "получила")} задачу`, () => restore(t, index));
        pulse(t.assigneeId);
        break;
      case "Переназначить":
        setSheets((s) => [...s, { kind: "picker", target: { taskId, why: "reassign" } }]);
        break;
      case "Передать":
        setSheets((s) => [...s, { kind: "picker", target: { taskId, why: "pass" } }]);
        break;
      case "Отменить":
      case "Отозвать":
        removeUndo(`Отозвана · «${t.title}»`);
        break;
      case "Удалить":
        removeUndo(`Удалена · «${t.title}»`);
        break;
      case "Срок":
        setSheets((s) => [...s, { kind: "deadline", target: { taskId, why: "deadline" } }]);
        break;
      case "Напомнить":
        showToast(p ? `Напомнил ${dative(p)} — уведомление ушло в ${hhmm(NOW_ISO)}` : "Напомнил");
        pulse(t.assigneeId);
        break;
      case "Отправить сейчас":
        patch(taskId, (x) => ({ ...x, lane: "work", status: "sent", receipt: { sentAt: NOW_ISO, seenAt: null, acceptedAt: null } }));
        showToast(`Ушло сейчас — ${who} увидит в уведомлениях`);
        pulse(t.assigneeId);
        break;
      case "Открыть":
      case "Ответить":
        setSheets((s) => [...s.filter((x) => x.kind !== "actions"), { kind: "thread", taskId }]);
        break;
      case "Выдать снова":
        setTasks((ts) => [...ts, { ...t, id: `${t.id}-again-${ts.length}`, lane: "work", status: "sent", receipt: { sentAt: NOW_ISO, seenAt: null, acceptedAt: null }, decline: undefined, report: undefined, question: undefined, timeRequest: undefined, unread: undefined, thread: [] }]);
        showToast(`Выдал снова — «${t.title}» ушла ${p ? dative(p) : ""}`);
        pulse(t.assigneeId);
        break;
    }
  };

  const answer = (taskId: string, a: string) => {
    const t = tasks.find((x) => x.id === taskId);
    if (!t) return;
    const p = personById(t.assigneeId);
    patch(taskId, (x) => ({ ...x, question: undefined, lane: x.timeRequest || x.unread ? "question" : "work", thread: [...x.thread, say(x.id, "director", a)] }));
    showToast(`Ответили ${p ? dative(p) : ""}: «${a}»`);
    pulse(t.assigneeId);
    buzz(10);
  };
  const timeKey = (taskId: string, key: string) => {
    const t = tasks.find((x) => x.id === taskId);
    if (!t?.timeRequest) return;
    const p = personById(t.assigneeId);
    if (key === "Другой срок") {
      setSheets((s) => [...s, { kind: "deadline", target: { taskId, why: "deadline" } }]);
      return;
    }
    const agreed = key === "Согласовать";
    patch(taskId, (x) => ({
      ...x,
      deadline: agreed ? x.timeRequest!.proposed : x.deadline,
      timeRequest: undefined,
      lane: x.question || x.unread ? "question" : "work",
      thread: [...x.thread, say(x.id, "director", agreed ? `Согласовано: ${hhmm(x.timeRequest!.proposed)} завтра` : "Срок прежний")],
    }));
    showToast(agreed ? `Согласовано — ${p?.short}, срок завтра к ${hhmm(t.timeRequest.proposed)}` : `Срок прежний — ${p?.short} увидит ответ`);
    pulse(t.assigneeId);
  };
  const read = (taskId: string) => {
    const t = tasks.find((x) => x.id === taskId);
    if (!t) return;
    patch(taskId, (x) => ({ ...x, unread: undefined, lane: x.question || x.timeRequest ? "question" : "work" }));
    showToast("Прочитано");
  };
  const sendInThread = (taskId: string, line: string, voiceSec?: number) => {
    const t = tasks.find((x) => x.id === taskId);
    if (!t) return;
    patch(taskId, (x) => ({
      ...x,
      question: undefined,
      unread: undefined,
      lane: x.lane === "question" ? (x.timeRequest ? "question" : "work") : x.lane,
      thread: [...x.thread, say(x.id, "director", line, voiceSec)],
    }));
    pulse(t.assigneeId);
  };

  // ---- the batch -------------------------------------------------------------------------------------------------
  const removeDraft = (id: string) => {
    const index = drafts.findIndex((d) => d.id === id);
    const d = drafts[index];
    if (!d) return;
    const next = drafts.filter((x) => x.id !== id);
    setDrafts(next);
    showToast(`Убрал: ${summaryOf([d]).replace("Понял так: ", "").replace(".", "")}`, () =>
      setDrafts((ds) => {
        const n = [...ds];
        n.splice(index, 0, d);
        return n;
      }),
    );
    if (!next.length) {
      setLayer("home");
    }
  };
  const editDraft = (id: string, t: string) =>
    setDrafts((ds) =>
      ds.map((d) => {
        if (d.id !== id) return d;
        switch (d.kind) {
          case "task":
          case "event":
          case "recurrence":
            return { ...d, title: t, edited: true };
          case "announcement":
          case "note":
          case "reminder":
            return { ...d, text: t, edited: true };
          default:
            return d;
        }
      }),
    );

  const send = (atMorning: boolean) => {
    const go = drafts.filter(sendable);
    if (!go.length) {
      const first = drafts.find((d) => !sendable(d));
      if (first) setSheets((s) => [...s, { kind: "picker", target: { draftId: first.id } }]);
      return;
    }
    // where each card flies: from its place to every one who receives it
    const rootBox = rootRef.current?.getBoundingClientRect();
    const ox = rootBox?.left ?? 0;
    const oy = rootBox?.top ?? 0;
    const flights: Comet[] = [];
    const tk = tokensOf(go);
    go.forEach((d, i) => {
      const card = document.querySelector(`[data-draft-id="${d.id}"]`)?.getBoundingClientRect();
      const x0 = card ? card.left + card.width / 2 - ox : W / 2;
      const y0 = card ? Math.max(card.top + 24, (rootBox?.top ?? 0) + 140) - oy : M;
      tk.filter((t) => t.draftIds.includes(d.id)).forEach((t, j) => {
        const el = document.querySelector(`[data-token="${t.key}"]`)?.getBoundingClientRect();
        if (!el) return;
        flights.push({ id: Date.now() + i * 10 + j, x0, y0: Math.min(y0, (rootBox?.height ?? 800) - 160), x1: el.left + el.width / 2 - ox, y1: el.top + 17 - oy, delay: i * 0.07 + j * 0.03, big: d.kind === "announcement" });
      });
    });
    setComets(flights);
    const landAt = 700 + go.length * 70;
    later(() => {
      tk.forEach((t) => pulse(`tok:${t.key}`));
      buzz([8, 40, 8]);
    }, landAt - 120);

    // the data is written at once; the flight plays over it (principle 1a)
    const newTasks: Task[] = [];
    const newPosts: EtherPost[] = [];
    go.forEach((d) => {
      const receipt = atMorning ? { sentAt: null, seenAt: null, acceptedAt: null } : { sentAt: NOW_ISO, seenAt: null, acceptedAt: null };
      if (d.kind === "task" && d.assigneeId)
        newTasks.push({ id: `n-${d.id}-${Date.now()}`, title: d.title, assigneeId: d.assigneeId, status: atMorning ? "scheduled" : "sent", lane: atMorning ? "held" : "work", deadline: d.deadline, createdAt: NOW_ISO, receipt, voiceSec: d.voiceSec, thread: [] });
      if (d.kind === "recurrence")
        newTasks.push({ id: `n-${d.id}-${Date.now()}`, title: d.title, assigneeId: d.assigneeId, status: atMorning ? "scheduled" : "sent", lane: atMorning ? "held" : "work", deadline: d.firstAt, createdAt: NOW_ISO, receipt, thread: [] });
      if (d.kind === "announcement") newPosts.push({ id: `e-${Date.now()}`, text: d.text, at: NOW_ISO, read: 0, of: d.reach });
    });
    setTasks((ts) => [...ts, ...newTasks]);
    if (newPosts.length) setEther((e) => [...newPosts, ...e]);
    const rest = drafts.filter((d) => !sendable(d));
    setDrafts(rest);
    const n = go.length;
    const people = [...new Set(tk.filter((t) => t.kind === "person").map((t) => t.label))];
    const names = `${people.slice(0, 4).join(", ")}${people.length > 4 ? ` и ещё ${people.length - 4}` : ""}`;
    const toAll = tk.some((t) => t.kind === "all");
    setSent(n);
    setFlightTokens(tk);
    setFlash(
      atMorning
        ? { title: `Утром в 08:00 уйдёт ${n}`, sub: "Ночью никого не беспокою. До утра можно поправить в «Задачах».", tone: "night" }
        : { title: `Ушло ${n} ${plural(n, ["карточка", "карточки", "карточек"])}`, sub: `${names ? `${names}.` : ""}${toAll ? " Объявление — всем 18." : ""} Квитанции придут сюда.`.trim(), tone: "lime" },
    );
    later(() => {
      setComets([]);
      setFlightTokens(null);
      if (!rest.length) {
        setLayer("home");
        setCelebrate((c) => c + 1);
        newTasks.forEach((t) => pulse(t.assigneeId));
      }
    }, landAt + 260);
    later(() => setFlash(null), landAt + 5200);
    if (!atMorning && newTasks[0]) {
      // the first receipt comes back as news
      const first = newTasks[0];
      later(() => {
        setTasks((ts) => ts.map((t) => (t.id === first.id ? { ...t, receipt: { ...t.receipt, seenAt: NOW_ISO } } : t)));
        drop(first.assigneeId);
        const p = personById(first.assigneeId);
        if (p) setLive({ id: `seen-${first.id}`, text: `${p.short} ${verb(p.id, "увидел", "увидела")} «${first.title}»`, tone: "ok", who: p.id, taskId: first.id });
      }, landAt + 3600);
    }
  };

  const assignDraft = (draftId: string, who: string) => {
    setDrafts((ds) => ds.map((d) => (d.id === draftId && d.kind === "task" ? { ...d, assigneeId: who } : d)));
    pulse(`tok:${who}`);
  };

  // ---- text ----
  const routeText = () => {
    const line = text.trim();
    if (!line) return;
    setText("");
    const low = line.toLowerCase();
    if (/\?$/.test(line) || /^(что|как|где|кто|сколько)\b/.test(low)) {
      parse("query", line);
      return;
    }
    if (line.replace(/[^а-яёa-z]/gi, "").length < 6) {
      parse("unparsed", line);
      return;
    }
    if (textPin?.kind === "person") {
      setOutcome("pinned");
      setHeard(line);
      setStage(2);
      setWords(line.split(" ").length);
      const id = textPin.id;
      setLayer("parsing");
      later(() => {
        setDrafts([{ id: `txt-${Date.now()}`, kind: "task", title: line.charAt(0).toUpperCase() + line.slice(1), assigneeId: id, deadline: null }]);
        setLayer("confirm");
      }, 900);
      return;
    }
    if (/^всем[:,\s]/.test(low)) {
      const body = line.replace(/^всем[:,\s]+/i, "");
      setHeard(line);
      setOutcome("all");
      setStage(2);
      setWords(line.split(" ").length);
      setLayer("parsing");
      later(() => {
        setDrafts([{ id: `txt-${Date.now()}`, kind: "announcement", text: body.charAt(0).toUpperCase() + body.slice(1), audience: "Всем", reach: 18 }]);
        setLayer("confirm");
      }, 900);
      return;
    }
    // a name in the line pins the task to that person; otherwise «Кому?»
    const found = crew.find((c) => low.includes(firstName(c.person).toLowerCase().slice(0, 4)));
    setHeard(line);
    setOutcome("draft");
    setStage(2);
    setWords(line.split(" ").length);
    setLayer("parsing");
    later(() => {
      setDrafts([{ id: `txt-${Date.now()}`, kind: "task", title: line.charAt(0).toUpperCase() + line.slice(1), assigneeId: found?.id ?? null, deadline: null }]);
      setLayer("confirm");
    }, 900);
  };

  // ---- navigation ----
  const openPanel = (id: SectionId) => {
    setAwake(false);
    setNews(null);
    setLayer(id);
  };
  const goHome = () => {
    setLayer("home");
    setSheets([]);
  };
  const openPerson = (id: string) => {
    setAwake(false);
    setNews(null);
    setPersonId(id);
    setLayer("person");
  };
  const closeSheet = useCallback(() => setSheets((s) => s.slice(0, -1)), []);
  const pushSheet = (s: SheetT) => setSheets((x) => [...x, s]);

  // ---- secretary ----
  const sendErrand = (code: string, note?: string, when?: string) => {
    const a = SECRETARY_ACTIONS.find((x) => x.code === code);
    if (!a) return;
    const id = `er-${Date.now()}`;
    const status: Errand["status"] = online ? "asked" : "waiting";
    setErrands((e) => [{ id, code, label: a.label, note: note ?? (when && when !== "Сейчас" ? when.toLowerCase() : undefined), status, at: NOW_ISO, by: "s-zhanna" }, ...e]);
    if (!online) {
      setKept((k) => [...k, { id, at: NOW_ISO, sec: 0, text: `${a.icon} ${a.label}${note ? ` → ${note}` : ""}`, kind: "errand" }]);
      showToast("Нет сети — просьба ждёт на телефоне и уйдёт сама");
      return;
    }
    showToast(`${a.icon} ${a.label} — Жанна получила${secretaryAway ? ", увидит в 14:00" : ""}`);
    if (!secretaryAway) {
      later(() => setErrands((e) => e.map((x) => (x.id === id ? { ...x, status: "seen" } : x))), 1400);
      later(() => setErrands((e) => e.map((x) => (x.id === id ? { ...x, status: "doing", etaMin: 4 } : x))), 3600);
    }
  };

  // ---- state id for the root ----
  const stateId: StateId = (() => {
    if (top?.kind === "thread") return "thread";
    if (top?.kind === "actions") return "actions";
    if (top?.kind === "picker" && "draftId" in top.target) return "picker";
    if (empty) return "empty";
    switch (layer) {
      case "home":
        return visitor || secMessage ? "visitor" : awake ? "awake" : news !== null ? "news" : "idle";
      case "failure":
        return failure === "kept" ? "kept" : "idle";
      case "confirm":
        return night ? "offhours" : "confirm";
      default:
        return layer;
    }
  })();

  // ---- the sky ----
  const focus = layer === "person" ? personId : layer === "answer" ? "p-marat" : (layer === "recording" || layer === "parsing") && recPin?.kind === "person" ? recPin.id : null;
  const bandIds = useMemo(() => {
    const order = [...heavyOrder(crew), ...crew.filter((c) => c.altitude === "work" || c.altitude === "unseen" || c.altitude === "held")].map((c) => c.id);
    if (focus && !order.includes(focus)) order.unshift(focus);
    return order;
  }, [crew, focus]);
  const fullSpots = useMemo(() => layoutFull(W, skyH, crew), [W, skyH, crew]);
  const bandH = full ? BAND_H : skyH;
  const bandLayout = useMemo(() => layoutBand(W, bandH, crew, bandIds), [W, bandH, crew, bandIds]);
  const spots = band ? bandLayout.spots : fullSpots;
  const deckFocus = layer === "tasks" ? deckWho : null;
  const threadTask = top?.kind === "thread" ? tasks.find((t) => t.id === top.taskId) : null;

  // the news, anchored over the person it is about
  const scripted = news !== null ? NEWS[news] : null;
  const newsItem = layer === "home" && !band ? (live ?? (scripted ? { ...scripted, who: scripted.taskId ? tasks.find((t) => t.id === scripted.taskId)?.assigneeId ?? null : null } : null)) : null;
  const newsWho = newsItem?.who ?? null;

  // the secretary's desk on the horizon
  const activeErrand = errands.find((e) => e.status === "doing") ?? errands.find((e) => e.status === "seen" || e.status === "asked");
  const deskLine = secretaryAway ? "отошли до 14:00" : visitor ? `гость · ${minutesAgo(VISITOR.since)} мин` : activeErrand ? deskShort(activeErrand) : "на месте";
  const deskIcon = secretaryAway ? "🪑" : visitor ? "🤝" : activeErrand ? SECRETARY_ACTIONS.find((a) => a.code === activeErrand.code)?.icon ?? "🗣️" : "";

  const nightText = night ? "#E7ECF3" : C.onSky;

  return (
    <MotionConfig reducedMotion="user">
    <div
      ref={rootRef}
      data-state={stateId}
      className="fixed inset-0 overflow-hidden"
      style={
        {
          fontFamily: "var(--own-sans), var(--font-body), system-ui, sans-serif",
          background: C.sky1,
          color: C.onSky,
          WebkitFontSmoothing: "antialiased",
          "--tabbar-h": `${kb ? (keyBox.h || 120) - 8 : tabH}px`,
          ...(kb ? { top: kb.top, height: kb.h, bottom: "auto" } : null),
        } as CSSProperties
      }
    >
      <SkyBackdrop mood={empty ? "calm" : mood} night={night} glowBottom={S + tabH} />

      <div className="relative flex h-full flex-col">
        {/* ---- header: the client's brand slot; service lines only after a tap ---- */}
        <header className="relative z-20 flex shrink-0 items-center gap-2 px-4" style={{ paddingTop: "max(env(safe-area-inset-top), 8px)", height: "calc(max(env(safe-area-inset-top), 8px) + 48px)" }}>
          <Press onClick={() => pushSheet({ kind: "service" })} className="-ml-1 flex min-h-[44px] items-center gap-2.5 rounded-full pl-1 pr-2" label="Компания и служебное">
            <span className="relative grid h-8 w-8 place-items-center rounded-[10px] text-[15px] font-bold" style={{ background: night ? "rgba(255,255,255,.12)" : C.ink, color: night ? "#fff" : "#fff" }}>
              {COMPANY.initials}
              {!pushOn || draftSaved || kept.length || empty ? <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full" style={{ background: C.onSky3, boxShadow: `0 0 0 2px ${night ? C.night0 : C.sky0}` }} /> : null}
            </span>
            <span className="text-[16px] font-semibold tracking-[-0.01em]" style={{ color: nightText }}>
              {COMPANY.name}
            </span>
          </Press>
          <div className="ml-auto flex items-center gap-2">
            {!online ? (
              <span className="inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-semibold" style={{ background: C.ink, color: C.amber }}>
                <Icon name="offline" size={14} /> нет сети
              </span>
            ) : null}
            <MoodWord mood={empty ? "calm" : mood} night={night} empty={empty} />
          </div>
        </header>

        <main ref={mainRef} className="relative min-h-0 flex-1">
          {/* ---- the sky: the team by whose move it is ---- */}
          <div className="absolute inset-x-0 top-0" style={{ height: skyH + 30 }}>
            {empty ? (
              <EmptySky H={skyH} onAdd={() => showToast("Добавление людей — в «Команде»; в прототипе не построено")} />
            ) : layer === "confirm" ? (
              <div className="absolute inset-x-0 top-0" style={{ height: BAND_H }}>
                <Recipients tokens={flightTokens ?? tokens} night={night} pulses={Object.fromEntries(Object.entries(pulses).filter(([k]) => k.startsWith("tok:")).map(([k, v]) => [k.slice(4), v]))} onToken={(t: Token) => (t.kind === "unknown" ? pushSheet({ kind: "picker", target: { draftId: t.draftIds[0]! } }) : undefined)} />
              </div>
            ) : (
              <>
                <motion.div className="absolute inset-0" initial={false} animate={{ opacity: layer === "recording" || layer === "parsing" ? 0.5 : 1 }} transition={{ duration: 0.4 }}>
                <People
                  crew={crew}
                  spots={spots}
                  mode={band ? "band" : "full"}
                  night={night}
                  focus={focus ?? deckFocus}
                  dim={!!focus}
                  pulses={pulses}
                  drops={drops}
                  onPerson={(id) => (layer === "person" && personId === id ? goHome() : openPerson(id))}
                />
                </motion.div>
                {band && bandLayout.more ? <BandMore x={bandLayout.moreX} y={Math.max(28, bandH - 44)} n={bandLayout.more} /> : null}
              </>
            )}
            {/* a tap on the folded band brings the ground back down */}
            {band && full && layer !== "confirm" && layer !== "person" ? <button type="button" aria-label="Свернуть" onClick={goHome} className="absolute inset-0 -z-10" /> : null}

            <AnimatePresence>
              {newsItem ? (
                <NewsThought
                  key={newsItem.id}
                  text={newsItem.text}
                  tone={newsItem.tone}
                  W={W}
                  who={newsWho}
                  bottom={shelfTopOf(spots, crew, skyH) - 10}
                  onTap={() => {
                    if (newsItem.taskId) pushSheet({ kind: "thread", taskId: newsItem.taskId });
                    else if (newsItem.id === "n3") openPanel("ether");
                    else setLayer("secretary");
                    setNews(null);
                    setLive(null);
                  }}
                />
              ) : null}
            </AnimatePresence>
          </div>

          {/* ---- the ground: the director's side ---- */}
          <motion.section
            className="absolute inset-x-0 bottom-0 z-10"
            initial={false}
            animate={{ height: S }}
            transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 34, mass: 0.9 }}
          >
            {/* the secretary's desk grows out of the ground's edge — the door between him and the company */}
            <AnimatePresence>
              {!empty && !band ? (
                <SecretaryTab
                  icon={deskIcon}
                  line={deskLine}
                  lit={visitor}
                  onTap={() => setLayer("secretary")}
                  onHold={() => startRecording("hold", { kind: "secretary" })}
                  onRelease={(c) => stopRecording(c)}
                  recording={layer === "recording" && recPin?.kind === "secretary"}
                />
              ) : null}
            </AnimatePresence>
            <div className="flex h-full flex-col overflow-hidden" style={{ background: C.ink, borderRadius: "30px 30px 0 0", boxShadow: `inset 0 1px 0 rgba(255,255,255,${night ? 0.14 : 0.06}), 0 -24px 50px -20px rgba(15,18,21,.45)` }}>
              <div ref={headRef} className="shrink-0">
                <SlabHead layer={layer} counts={counts} ether={ether.length} disputes={disputes.length} crew={crew.find((c) => c.id === personId) ?? null} away={secretaryAway} onClose={goHome} />
              </div>
              <div
                className="no-bar min-h-0 flex-1 overflow-y-auto overscroll-contain"
                style={{ touchAction: layer === "tasks" ? "none" : "pan-y", maskImage: full && layer !== "tasks" ? "linear-gradient(180deg, #000 calc(100% - 28px), transparent)" : undefined, WebkitMaskImage: full && layer !== "tasks" ? "linear-gradient(180deg, #000 calc(100% - 28px), transparent)" : undefined }}
              >
                <div ref={contentRef}>
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.div
                      key={layer === "home" ? `home` : layer}
                      initial={{ opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8, transition: { duration: 0.12 } }}
                      transition={{ type: "spring", stiffness: 420, damping: 36 }}
                      style={layer === "tasks" ? { height: Math.max(300, S - (head.h || 76) - (keyBox.h || 110)) } : undefined}
                    >
                      {renderLayer()}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>
              <div ref={keyRef} className="relative shrink-0">
                <Confetti n={celebrate} />
                {renderKey()}
              </div>
            </div>
          </motion.section>
        </main>

        {/* ---- the tab bar, on the ground ---- */}
        <nav ref={tabRef} className="relative z-20 flex shrink-0 items-stretch justify-around px-1" style={{ background: C.ink, paddingBottom: "max(env(safe-area-inset-bottom), 6px)", boxShadow: `inset 0 1px 0 ${C.line}`, display: kb ? "none" : undefined }}>
          {TABS.map((t) => {
            const on = t.id === "pulse";
            const icon = { pulse: "pulse", sent: "list", calendar: "calendar", notes: "note", screen: "screen", profile: "user" }[t.id] as "pulse";
            return (
              <Press
                key={t.id}
                onClick={() => (on ? goHome() : showToast(`«${t.label}» — отдельный экран, в этом прототипе не построен`))}
                className="relative flex min-h-[54px] flex-1 flex-col items-center justify-center gap-0.5"
                style={{ color: on ? C.onInk : C.onInk3 }}
                scale={0.9}
              >
                <span className="relative">
                  <Icon name={icon} size={23} style={{ color: on ? C.lime : undefined }} />
                  {on && counts.attention ? (
                    <motion.span key={counts.attention} initial={{ scale: 0.6 }} animate={{ scale: 1 }} className="absolute -right-2.5 -top-1.5 grid h-[17px] min-w-[17px] place-items-center rounded-full px-1 text-[10.5px] font-bold" style={{ background: C.lime, color: C.limeInk, boxShadow: `0 0 0 2px ${C.ink}` }}>
                      {counts.attention}
                    </motion.span>
                  ) : null}
                </span>
                <span className="text-[10.5px] font-medium">{t.label}</span>
              </Press>
            );
          })}
        </nav>
      </div>

      {/* ---- what flies up to people ---- */}
      <Comets comets={comets} />

      {/* ---- sheets over everything ---- */}
      <Sheet open={!!top} onClose={closeSheet} label={top?.kind ?? "sheet"} light={top?.kind === "picker"} height={top?.kind === "thread" ? "92%" : top?.kind === "picker" ? "84%" : top?.kind === "event" ? "72%" : undefined}>
        {renderSheet()}
      </Sheet>

      <Toast toast={toast} onDone={clearToast} />
    </div>
    </MotionConfig>
  );

  // ---- the ground's content per layer ------------------------------------------------------------------------------
  function renderLayer(): ReactNode {
    switch (layer) {
      case "home":
        return (
          <div className="flex flex-col gap-3 pb-1 pt-4">
            {visitor || secMessage ? (
              <div className="flex flex-col gap-2 px-3">
                {visitor ? (
                  <VisitorCard
                    visitor={VISITOR}
                    onKey={(k, extras) => {
                      setVisitor(false);
                      const extra = extras.length ? ` · ${extras.join(" и ").toLowerCase()} гостю` : "";
                      showToast(k === "Пусть заходит" ? `Жанна проводит ${VISITOR.name}${extra}` : k === "Подождёт" ? "Жанна попросит подождать" : "Жанна вежливо откажет");
                      if (k === "Пусть заходит" && extras.length) setErrands((e) => [{ id: `er-g${Date.now()}`, code: "guest", label: "Гостю", note: extras.join(", "), status: "doing", at: NOW_ISO, etaMin: 3, by: "s-zhanna" }, ...e]);
                    }}
                  />
                ) : null}
                {secMessage ? <SecretaryWords text={SECRETARY_MESSAGE.text} at={SECRETARY_MESSAGE.at} onOk={() => setSecMessage(false)} /> : null}
              </div>
            ) : (
              <HomeSpeech
                counts={counts}
                awake={awake}
                flash={flash}
                empty={empty}
                meeting={soonEvent ? { title: soonEvent.title, time: hhmm(soonEvent.startsAt), inMin: minutesUntil(soonEvent.startsAt, now) } : null}
                onWake={() => setAwake((a) => !a)}
                onMeeting={() => soonEvent && pushSheet({ kind: "event", eventId: soonEvent.id })}
              />
            )}
            {visitor ? null : empty ? (
              <FirstDay pushOn={pushOn} onPush={() => { setPushOn(true); showToast("Уведомления включены"); }} onInstall={() => pushSheet({ kind: "service" })} onTeam={() => showToast("Добавление людей — в «Команде»; в прототипе не построено")} />
            ) : (
              <Sections counts={counts} ether={ether.length} disputes={disputes.length} soon={soon} onOpen={openPanel} />
            )}
          </div>
        );
      case "recording":
        return <RecordingSpeech tick={recTick} pin={recPin} armed={armed} />;
      case "parsing":
        return <ParsingSpeech stage={stage} heard={heard} words={words} />;
      case "failure":
        return <FailureSpeech failure={failure ?? "short"} kept={kept.length} onKept={() => pushSheet({ kind: "kept" })} onText={() => setLayer("text")} />;
      case "unparsed":
        return (
          <div className="px-4 pb-2 pt-4">
            <p className="text-[19px] font-semibold leading-[25px]" style={{ color: C.onInk }}>
              {UNPARSED.line}
            </p>
            <p className="mt-2 text-[14px] leading-[19px]" style={{ color: C.onInk2 }}>
              Слышал: «{heard || UNPARSED.heard}»
            </p>
            <div className="mt-3 flex gap-1.5">
              <Key kind="quiet" className="min-w-0 flex-1 px-2" onClick={() => { setText(heard || UNPARSED.heard); setLayer("text"); }}>
                Исправить текст
              </Key>
              <Key kind="quiet" className="min-w-0 flex-1 px-2" onClick={() => { setDrafts([{ id: `u-${Date.now()}`, kind: "task", title: heard || UNPARSED.heard, assigneeId: null, deadline: null }]); setLayer("confirm"); }}>
                Сделать задачей
              </Key>
            </div>
            <Key kind="ghost" className="mt-1.5 w-full" onClick={goHome}>
              Закрыть
            </Key>
          </div>
        );
      case "answer":
        return (
          <div className="px-4 pb-2 pt-4">
            <p className="text-[13px]" style={{ color: C.onInk3 }}>
              Вы спросили: «{heard || QUERY.said}»
            </p>
            <p className="mt-1 text-[20px] font-semibold leading-[26px]" style={{ color: C.onInk }}>
              {QUERY.lines[0]}
            </p>
            <div className="mt-2.5 flex flex-col gap-1.5">
              {QUERY.lines.slice(1).map((l, i) => (
                <Press key={l} onClick={() => pushSheet({ kind: "thread", taskId: i === 0 ? "t-estimate" : "t-pass" })} className="flex w-full items-start gap-2.5 rounded-[18px] p-3 text-left" style={{ background: C.ink2 }} scale={0.98}>
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: C.blue }} />
                  <span className="flex-1 text-[14.5px] leading-[20px]" style={{ color: C.onInk }}>
                    {l}
                  </span>
                  <Icon name="chev" size={18} style={{ color: C.onInk3, marginTop: 2 }} />
                </Press>
              ))}
            </div>
            <div className="mt-3 flex gap-1.5">
              <Key kind="quiet" className="flex-1" onClick={() => openPerson("p-marat")}>
                Карточка Марата
              </Key>
              <Key kind="ghost" className="px-5" onClick={goHome}>
                Закрыть
              </Key>
            </div>
          </div>
        );
      case "text":
        return (
          <TextEntry
            value={text}
            onChange={setText}
            pin={textPin}
            onUnpin={() => setTextPin(null)}
            onSubmit={routeText}
            onClose={() => setLayer(returnTo === "text" ? "home" : returnTo)}
          />
        );
      case "confirm":
        return (
          <ConfirmList
            sent={sent}
            drafts={drafts}
            heard={heard}
            heardSec={21}
            night={night}
            onEdit={editDraft}
            onRemove={removeDraft}
            onWho={(id) => pushSheet({ kind: "picker", target: { draftId: id } })}
            onDeadline={(id) => pushSheet({ kind: "deadline", target: { draftId: id } })}
            onRepeat={(id) => pushSheet({ kind: "repeat", draftId: id })}
            onClose={() => {
              const saved = drafts;
              setDrafts([]);
              setLayer("home");
              showToast("Черновик закрыт — ничего не ушло", () => {
                setDrafts(saved);
                setLayer("confirm");
              });
            }}
          />
        );
      case "tasks":
        return deck.length + tasks.filter((t) => t.lane === "work" || t.lane === "held").length === 0 ? (
          <CalmLine text="Задач нет. Скажите — и первая уйдёт." />
        ) : (
          <TasksDeck deck={deck} tasks={tasks} onCurrent={setDeckWho} onKey={act} onOpen={(id) => pushSheet({ kind: "thread", taskId: id })} onAll={(id) => pushSheet({ kind: "actions", taskId: id })} />
        );
      case "messages":
        return <Messages items={messages} onAnswer={answer} onThread={(id) => pushSheet({ kind: "thread", taskId: id })} onTime={timeKey} onRead={read} />;
      case "ether":
        return <Ether posts={ether} />;
      case "calendar":
        return <CalendarPanel onEvent={(id) => pushSheet({ kind: "event", eventId: id })} />;
      case "rating":
        return (
          <RatingPanel
            disputes={disputes}
            onDispute={(id, k) => {
              const d = disputes.find((x) => x.id === id);
              setDisputes((ds) => ds.filter((x) => x.id !== id));
              const p = d ? personById(d.personId) : null;
              showToast(k === "Снять штраф" ? `Штраф снят — ${p?.short} вернулись 10 очков` : `Штраф остаётся — ${p?.short} увидит решение`);
              if (d) pulse(d.personId);
            }}
          />
        );
      case "person": {
        const c = crew.find((x) => x.id === personId);
        return c ? <PersonPanel crew={c} onKey={act} onAnswer={answer} onTime={timeKey} onRead={read} onThread={(id) => pushSheet({ kind: "thread", taskId: id })} onAll={(id) => pushSheet({ kind: "actions", taskId: id })} /> : null;
      }
      case "secretary":
        return (
          <SecretaryPanel
            errands={errands}
            away={secretaryAway ? "14:00" : null}
            offline={!online}
            dndOffer={dndOffer}
            dndOn={dndOn}
            onDnd={(on) => {
              setDndOffer(false);
              setDndOn(on);
              if (on) {
                const id = `er-dnd${Date.now()}`;
                setErrands((e) => [{ id, code: "dnd", label: "Не беспокоить", note: "до 12:00", status: "asked", at: NOW_ISO, by: "s-zhanna" }, ...e]);
                showToast("🔕 Жанна никого не пустит до 12:00");
              }
            }}
            onSend={sendErrand}
            onVoice={() => startRecording("tap", { kind: "secretary" })}
            onThanks={(id) => {
              setErrands((e) => e.filter((x) => x.id !== id));
              showToast("Спасибо ♥ — Жанне +1 очко");
            }}
          />
        );
    }
  }

  // ---- the one key per layer ------------------------------------------------------------------------------------------
  function renderKey(): ReactNode {
    const textKey = (p: Pin = pin) => (
      <SideKey
        icon={<Icon name="text" size={22} />}
        label="Строкой"
        onClick={() => {
          setTextPin(p && p.kind === "person" ? p : null);
          setReturnTo(layer);
          setLayer("text");
        }}
      />
    );
    const keptPill = kept.length ? (
      <Press onClick={() => pushSheet({ kind: "kept" })} className="flex max-w-[104px] flex-col items-center gap-1" label="Ждёт сети">
        <span className="relative grid h-12 w-12 place-items-center rounded-full" style={{ background: C.ink3, color: C.amber }}>
          <Icon name="offline" size={20} />
          <span className="absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[10.5px] font-bold" style={{ background: C.amber, color: C.ink }}>
            {kept.length}
          </span>
        </span>
        <span className="text-[11px] font-medium" style={{ color: C.onInk3 }}>
          ждёт сети
        </span>
      </Press>
    ) : null;

    const voiceHint = (p: Pin): string => {
      if (p?.kind === "person") {
        const person = personById(p.id);
        return person ? `Удержите — задача ${dative(person)}` : "Удержите и говорите";
      }
      if (p?.kind === "all") return "Удержите — объявление всем";
      if (p?.kind === "secretary") return "Удержите — скажите Жанне своими словами";
      return "Удержите и говорите";
    };

    // the sky is out of the thumb's reach: «Кому» picks a person from down here
    const whoKey = (
      <SideKey icon={<Icon name="people" size={22} />} label="Кому" onClick={() => pushSheet({ kind: "picker", target: { pin: true } })} />
    );
    const voice = (compact: boolean, left: ReactNode = textKey(), right: ReactNode = keptPill ?? (empty ? null : whoKey)) => (
      <VoiceKey
        mode="voice"
        compact={compact}
        hint={voiceHint(pin)}
        onHoldStart={() => startRecording("hold")}
        onHoldEnd={(c) => stopRecording(c)}
        onTap={() => startRecording("tap")}
        left={left}
        right={right}
      />
    );

    switch (layer) {
      case "recording":
        return (
          <VoiceKey
            mode="recording"
            level={levelAt(recTick)}
            tapMode={tapMode}
            hint={tapMode ? "Нажмите, чтобы закончить" : "Отпустите — разберу · вверх — отмена"}
            onHoldStart={() => undefined}
            onHoldEnd={(c) => stopRecording(c)}
            onTap={() => stopRecording(false)}
            onArm={setArmed}
            left={tapMode ? <SideKey icon={<Icon name="close" size={20} />} label="Отмена" onClick={() => stopRecording(true)} /> : null}
          />
        );
      case "parsing":
        return <VoiceKey mode="busy" hint={["Сохраняю запись", "Распознаю", "Разбираю"][stage]} />;
      case "confirm": {
        const ok = drafts.filter(sendable).length;
        if (!drafts.length) return <VoiceKey mode="action" label="Ушло" disabledAction />;
        const label = ok === 0 ? "Указать, кому" : night ? "Отправлю утром в 08:00" : ok === drafts.length ? (ok === 1 ? "Отправить" : `Отправить все ${ok}`) : `Отправить ${ok} из ${drafts.length}`;
        return (
          <VoiceKey
            mode="action"
            label={label}
            sub={night && ok ? "отправить сейчас" : undefined}
            onSub={() => send(false)}
            onAction={() => send(night)}
          />
        );
      }
      case "text":
        return (
          <VoiceKey
            mode="action"
            label="Разобрать"
            disabledAction={!text.trim()}
            onAction={routeText}
          />
        );
      case "person":
        return voice(false, textKey({ kind: "person", id: personId ?? "" }), null);
      case "home":
      case "failure":
      case "unparsed":
      case "answer":
        return voice(false);
      default:
        return voice(true);
    }
  }

  // ---- sheets --------------------------------------------------------------------------------------------------
  function renderSheet(): ReactNode {
    if (!top) return null;
    switch (top.kind) {
      case "thread":
        return threadTask ? <ThreadBody key={top.taskId} task={threadTask} compose={top.compose} onSend={sendInThread} onAnswer={(id, a) => answer(id, a)} onClose={closeSheet} /> : <CalmLine text="Задача уже закрыта." />;
      case "actions": {
        const t = tasks.find((x) => x.id === top.taskId);
        return t ? (
          <ActionsBody
            task={t}
            onPick={(a) => {
              closeSheet();
              act(t.id, a);
            }}
          />
        ) : null;
      }
      case "picker": {
        const target = top.target;
        if ("pin" in target) {
          return (
            <PickerBody
              title="Кому дать задачу?"
              candidates={[]}
              crew={crew}
              onPick={(id) => {
                setSheets([]);
                openPerson(id);
              }}
            />
          );
        }
        if ("draftId" in target) {
          const d = drafts.find((x) => x.id === target.draftId);
          if (!d || d.kind !== "task") return null;
          return (
            <PickerBody
              title={`«${d.title}»`}
              heard={d.heardName}
              candidates={d.candidates ?? []}
              crew={crew}
              current={d.assigneeId}
              onPick={(id) => {
                assignDraft(d.id, id);
                closeSheet();
              }}
            />
          );
        }
        const t = tasks.find((x) => x.id === target.taskId);
        if (!t) return null;
        const suggested = t.decline?.suggestion ? crew.filter((c) => t.decline!.suggestion!.includes(c.person.short)).map((c) => c.id) : [];
        return (
          <PickerBody
            title={`${target.why === "reassign" ? "Переназначить" : "Передать"} «${t.title}»`}
            candidates={suggested}
            crew={crew}
            current={t.assigneeId}
            onPick={(id) => {
              const old = t;
              const index = tasks.findIndex((x) => x.id === t.id);
              patch(t.id, (x) => ({ ...x, assigneeId: id, lane: "work", status: "sent", decline: undefined, receipt: { sentAt: NOW_ISO, seenAt: null, acceptedAt: null } }));
              const p = personById(id);
              setSheets([]);
              showToast(`Передал ${p ? dative(p) : ""} — «${t.title}»`, () => restore(old, index));
              pulse(id);
            }}
          />
        );
      }
      case "deadline": {
        const target = top.target;
        if ("pin" in target) return null;
        const current = "draftId" in target ? (drafts.find((d) => d.id === target.draftId) as { deadline?: string | null } | undefined)?.deadline : tasks.find((t) => t.id === target.taskId)?.deadline;
        return (
          <ChoiceBody
            title="Срок"
            sub={"draftId" in target ? "Для карточки в черновике" : "Исполнитель увидит новый срок сразу"}
            choices={deadlineChoices()}
            current={current ?? null}
            onPick={(iso) => {
              if ("draftId" in target) setDrafts((ds) => ds.map((d) => (d.id === target.draftId && d.kind === "task" ? { ...d, deadline: iso } : d)));
              else {
                const t = tasks.find((x) => x.id === target.taskId);
                patch(target.taskId, (x) => ({ ...x, deadline: iso, timeRequest: undefined, lane: x.lane === "overdue" || (x.lane === "question" && !x.question && !x.unread) ? "work" : x.lane }));
                if (t) {
                  showToast(`Новый срок — ${personById(t.assigneeId)?.short} увидит сразу`);
                  pulse(t.assigneeId);
                }
              }
              closeSheet();
            }}
          />
        );
      }
      case "repeat": {
        const d = drafts.find((x) => x.id === top.draftId);
        return (
          <ChoiceBody
            title="Повтор"
            choices={repeatChoices()}
            current={d && d.kind === "task" ? d.repeat ?? "Не повторять" : null}
            onPick={(r) => {
              setDrafts((ds) => ds.map((x) => (x.id === top.draftId && x.kind === "task" ? { ...x, repeat: r === "Не повторять" ? undefined : r } : x)));
              closeSheet();
            }}
          />
        );
      }
      case "event":
        return (
          <EventBody
            eventId={top.eventId}
            onRemind={() => {
              closeSheet();
              showToast("Напомнил тем, кто не ответил");
            }}
          />
        );
      case "service":
        return (
          <ServiceBody
            lines={{ push: !pushOn, install: !installed, draft: draftSaved, team: empty }}
            onInstalled={() => setInstalled(true)}
            kept={kept.length}
            onPush={() => {
              setPushOn(true);
              showToast("Уведомления включены");
            }}
            onDraft={() => {
              setDraftSaved(false);
              setSheets([]);
              setHeard("");
              setDrafts(DRAFT_EXTRA as DraftItem[]);
              setLayer("confirm");
            }}
            onKept={() => setSheets((s) => [...s.slice(0, -1), { kind: "kept" }])}
            onTeam={() => showToast("Добавление людей — в «Команде»; в прототипе не построено")}
          />
        );
      case "kept":
        return <KeptBody items={kept} />;
    }
  }
}

// ---- pieces of the ground ---------------------------------------------------------------------------------------

/** The desk's own short words: «кофе · 3 мин», «Олег · увидела». */
function deskShort(e: Errand): string {
  if (e.status === "doing") return `${e.label.toLowerCase()}${e.etaMin ? ` · ${e.etaMin} мин` : " · делает"}`;
  const w = { waiting: "ждёт сети", asked: "отправлено", seen: "увидела", doing: "делает", done: "готово" }[e.status];
  return `${e.note && e.note.length < 12 ? e.note : e.label.toLowerCase()} · ${w}`;
}

function SlabHead({ layer, counts, ether, disputes, crew, away, onClose }: { layer: Layer; counts: ReturnType<typeof countsOf>; ether: number; disputes: number; crew: Crew | null; away: boolean; onClose: () => void }) {
  const titles: Partial<Record<Layer, { title: string; count?: number | string; sub?: ReactNode }>> = {
    tasks: { title: "Задачи", count: counts.tasks, sub: movesPhrase({ ...counts, question: 0 }) ? `Ждут вас: ${movesPhrase({ ...counts, question: 0 })}` : "Ход за командой" },
    messages: { title: "Сообщения", count: counts.question, sub: "Ответ — одним тапом, без перехода" },
    ether: { title: "Эфир", count: ether, sub: "Новое объявление — скажите «Всем: …»" },
    calendar: { title: "Сегодня", sub: "вторник · планёрка в 11:00" },
    rating: { title: "Рейтинг", sub: disputes ? "Один спор ждёт вашего решения" : "Неделя: кто впереди" },
  };
  if (layer === "person" && crew) {
    const p = crew.person;
    return (
      <div className="flex items-center gap-3 px-4 pb-3 pt-4">
        <Disc initials={p.initials} look={crew.altitude === "heavy" ? "onInk" : "onInk"} size={52} style={{ background: crew.altitude === "heavy" ? "#2E353C" : "#F1F3F4", color: crew.altitude === "heavy" ? C.onInk : C.ink }} ring={crew.altitude === "heavy"} />
        <div className="min-w-0 flex-1 leading-[19px]">
          <div className="text-[21px] font-semibold tracking-[-0.01em]" style={{ color: C.onInk }}>
            {p.fullName}
          </div>
          <div className="text-[13px]" style={{ color: C.onInk2 }}>
            {p.position} · {crew.moves ? <span style={{ color: C.lime }}>ждёт вашего слова: {crew.moves}</span> : crew.tasks.length ? `в работе: ${crew.tasks.length}` : crew.reason}
          </div>
        </div>
        <Press onClick={onClose} label="Закрыть" className="grid h-11 w-11 shrink-0 place-items-center rounded-full" style={{ background: C.ink3, color: C.onInk2 }}>
          <Icon name="chevDown" size={20} />
        </Press>
      </div>
    );
  }
  if (layer === "secretary") {
    return (
      <div className="flex items-center gap-3 px-4 pb-3 pt-4">
        <Disc initials="ЖИ" look="secretary" size={48} />
        <div className="min-w-0 flex-1 leading-[19px]">
          <div className="text-[21px] font-semibold" style={{ color: C.onInk }}>
            Жанна
          </div>
          <div className="text-[13px]" style={{ color: C.onInk2 }}>
            {away ? "секретарь · все отошли до 14:00" : "секретарь · на месте"}
          </div>
        </div>
        <Press onClick={onClose} label="Закрыть" className="grid h-11 w-11 shrink-0 place-items-center rounded-full" style={{ background: C.ink3, color: C.onInk2 }}>
          <Icon name="chevDown" size={20} />
        </Press>
      </div>
    );
  }
  const h = titles[layer];
  if (!h) return null;
  return (
    <div className="pt-4">
      <PanelHeader title={h.title} count={h.count} sub={h.sub} onClose={onClose} />
    </div>
  );
}

function MoodWord({ mood, night, empty }: { mood: "alert" | "calm" | "happy"; night: boolean; empty: boolean }) {
  const words = { alert: "внимательно", calm: "спокойно", happy: "всё идёт" };
  const dot = { alert: C.amber, calm: C.blue, happy: C.limeDeep };
  if (empty) return null;
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.span key={night ? "night" : mood} className="inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-medium" style={{ background: night ? "rgba(255,255,255,.08)" : "rgba(255,255,255,.55)", color: night ? "#C9D2E0" : C.onSky2 }} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}>
        {night ? (
          <>
            <Icon name="moon" size={13} /> 21:30 · ночь
          </>
        ) : (
          <>
            <span className="h-2 w-2 rounded-full" style={{ background: dot[mood] }} />
            {words[mood]}
          </>
        )}
      </motion.span>
    </AnimatePresence>
  );
}

function HomeSpeech({
  counts,
  awake,
  flash,
  empty,
  meeting,
  onWake,
  onMeeting,
}: {
  counts: ReturnType<typeof countsOf>;
  awake: boolean;
  flash: Flash | null;
  empty: boolean;
  meeting: { title: string; time: string; inMin: number } | null;
  onWake: () => void;
  onMeeting: () => void;
}) {
  const reduce = useReduced();
  if (flash) {
    const tone = flash.tone === "lime" ? C.lime : flash.tone === "night" ? C.lav : flash.tone === "mint" ? C.mint : C.onInk2;
    return (
      <motion.div key={flash.title} className="px-4" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-2.5">
          <motion.span className="grid h-8 w-8 place-items-center rounded-full" style={{ background: `${tone}22`, color: tone }} initial={{ scale: 0.4, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 500, damping: 18 }}>
            <Icon name={flash.tone === "night" ? "moon" : flash.tone === "quiet" ? "close" : "check"} size={18} stroke={2.4} />
          </motion.span>
          <span className="text-[22px] font-semibold tracking-[-0.015em]" style={{ color: C.onInk }}>
            {flash.title}
          </span>
        </div>
        {flash.sub ? (
          <p className="mt-1 text-[14px] leading-[19px]" style={{ color: C.onInk2 }}>
            {flash.sub}
          </p>
        ) : null}
      </motion.div>
    );
  }
  if (empty) {
    return (
      <div className="px-4">
        <div className="text-[22px] font-semibold tracking-[-0.015em]" style={{ color: C.onInk }}>
          Первый день, {DIRECTOR.firstName}.
        </div>
        <p className="mt-1 text-[14px] leading-[19px]" style={{ color: C.onInk2 }}>
          Добавьте людей — и просто говорите: «Марату к пятнице смету».
        </p>
      </div>
    );
  }
  if (awake) {
    const [hello, ...rest] = GREETING[0]!.split(". ");
    const words = rest.join(". ").split(" ");
    return (
      <button type="button" onClick={onWake} className="block w-full px-4 text-left">
        <motion.div className="text-[22px] font-semibold tracking-[-0.015em]" style={{ color: C.onInk }} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          {hello}.
        </motion.div>
        <p className="mt-1 text-[15px] leading-[21px]" style={{ color: C.onInk2 }}>
          {words.map((w, i) => (
            <motion.span key={i} initial={reduce ? false : { opacity: 0, filter: "blur(4px)" }} animate={{ opacity: 1, filter: "blur(0px)" }} transition={{ delay: 0.25 + i * 0.05, duration: 0.3 }}>
              {w}{" "}
            </motion.span>
          ))}
        </p>
        {meeting ? (
          <motion.span
            role="button"
            tabIndex={0}
            aria-label={GREETING[1]}
            onClick={(e) => {
              e.stopPropagation();
              onMeeting();
            }}
            className="mt-3 flex min-h-[52px] items-center gap-3 rounded-[18px] py-2 pl-2.5 pr-3"
            style={{ background: C.ink2, color: C.onInk }}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 + words.length * 0.05 }}
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ background: "rgba(210,245,92,.14)", color: C.lime }}>
              <Icon name="calendar" size={17} />
            </span>
            <span className="min-w-0 flex-1 leading-[17px]">
              <span className="block truncate text-[14.5px] font-semibold">{meeting.title}</span>
              <span className="block text-[12.5px]" style={{ color: C.onInk2 }}>
                в <span style={MONO}>{meeting.time}</span> · через {meeting.inMin} {plural(meeting.inMin, ["минуту", "минуты", "минут"])}
              </span>
            </span>
            <Icon name="chev" size={18} style={{ color: C.onInk3 }} />
          </motion.span>
        ) : null}
      </button>
    );
  }
  const n = counts.attention;
  return (
    <button type="button" onClick={onWake} className="block w-full px-4 text-left" aria-label="Сводка">
      <div className="flex items-center gap-2.5">
        <span className="text-[24px] font-semibold tracking-[-0.02em]" style={{ color: C.onInk }}>
          {n ? "Ваш ход" : "Ход за командой"}
        </span>
        {n ? (
          <motion.span key={n} className="grid h-[28px] min-w-[28px] place-items-center rounded-full px-2 text-[15px]" style={{ ...MONO, background: C.lime, color: C.limeInk }} initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 600, damping: 20 }}>
            {n}
          </motion.span>
        ) : null}
      </div>
      <p className="mt-0.5 text-[14px] leading-[19px]" style={{ color: C.onInk2 }}>
        {n ? `${movesPhrase(counts).charAt(0).toUpperCase()}${movesPhrase(counts).slice(1)}.` : "Все в работе, ваше слово сейчас не нужно."}
      </p>
    </button>
  );
}

function RecordingSpeech({ tick, pin, armed }: { tick: number; pin: Pin; armed: boolean }) {
  const bars = 34;
  const who = pin?.kind === "person" ? personById(pin.id) : null;
  return (
    <div className="px-4 pb-1 pt-4">
      <div className="flex items-center gap-2.5">
        <motion.span className="h-2.5 w-2.5 rounded-full" style={{ background: armed ? C.onInk3 : C.lime }} animate={{ opacity: [1, 0.35, 1] }} transition={{ duration: 1.1, repeat: Infinity }} />
        <span className="text-[22px] font-semibold tracking-[-0.015em]" style={{ color: C.onInk }}>
          {armed ? "Отменю" : "Слушаю"}
        </span>
        <span className="text-[17px]" style={{ color: C.onInk2 }}>
          <Timer sec={Math.floor(tick / 10)} />
        </span>
        {pin ? (
          <span className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-full pl-1 pr-3 text-[13px] font-semibold" style={{ background: C.ink3, color: C.onInk }}>
            {who ? <Disc initials={who.initials} look="onInk" size={24} style={{ background: "#3A4148" }} /> : <span className="grid h-6 w-6 place-items-center">{pin.kind === "all" ? <Icon name="broadcast" size={15} /> : "ЖИ"}</span>}
            {who ? dative(who) : pin.kind === "all" ? "Всем" : "Жанне"}
          </span>
        ) : null}
      </div>
      <div className="mt-4 flex h-14 items-center gap-[3px]">
        {Array.from({ length: bars }, (_, i) => {
          const t = tick - (bars - 1 - i);
          const v = t < 0 ? 0.04 : levelAt(t);
          return <span key={i} className="flex-1 rounded-full" style={{ height: `${Math.round(Math.max(6, v * 100))}%`, backgroundColor: armed ? C.onInk3 : i === bars - 1 ? C.lime : `rgba(210,245,92,${(0.25 + (i / bars) * 0.6).toFixed(2)})`, transition: "height .1s linear" }} />;
        })}
      </div>
      <p className="mt-3 text-[13px] leading-[18px]" style={{ color: C.onInk3 }}>
        Запись сохраняется на телефоне сразу — даже если связь пропадёт, голос не потеряется.
      </p>
    </div>
  );
}

/** Words the parser picks out of the phrase — lit as «Разбираю» finds who, when and what. */
const KEYWORDS = /^(Марату|пятнице|Айгерим|сегодня|Всем|короткий|Плюс|пять|очков|Ерлану|Планёрку|понедельник|десять|прорабами|каждый|Олегу|резервные|копии)/;

function ParsingSpeech({ stage, heard, words }: { stage: number; heard: string; words: number }) {
  const labels = ["Сохраняю запись", "Распознаю", "Разбираю"];
  const list = heard.split(" ");
  return (
    <div className="px-4 pb-1 pt-4">
      <div className="flex gap-2">
        {labels.map((l, i) => (
          <div key={l} className="min-w-0" style={{ flex: i === 0 ? 1.45 : 1 }}>
            <div className="relative h-[3px] overflow-hidden rounded-full" style={{ background: C.ink3 }}>
              <motion.span className="absolute inset-y-0 left-0 rounded-full" style={{ background: C.lime }} initial={false} animate={{ width: i < stage ? "100%" : i === stage ? "62%" : "0%" }} transition={{ duration: i === stage ? 1.4 : 0.3, ease: "easeOut" }} />
            </div>
            <div className="mt-1.5 flex items-center gap-1 whitespace-nowrap text-[12px] font-medium" style={{ color: i <= stage ? C.onInk : C.onInk3 }}>
              {i < stage ? <Icon name="check" size={13} stroke={2.4} style={{ color: C.lime, flex: "none" }} /> : null}
              <span className="truncate">{l}</span>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 min-h-[60px] text-[15.5px] leading-[23px]" style={{ color: C.onInk2 }}>
        {list.slice(0, words).map((w, i) => {
          const key = stage >= 2 && KEYWORDS.test(w);
          return (
            <span key={i}>
            {i ? " " : ""}
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, color: key ? C.lime : stage >= 1 ? C.onInk : C.onInk2 }}
              transition={{ duration: 0.25, delay: key ? (i % 12) * 0.03 : 0 }}
              style={{ textDecorationLine: key ? "underline" : "none", textDecorationColor: "rgba(210,245,92,.45)", textUnderlineOffset: 4 }}
            >
              {w.replace(/[.,:]$/, "")}
              <span style={{ textDecorationLine: "none" }}>{/[.,:]$/.test(w) ? w.slice(-1) : ""}</span>
            </motion.span>
            </span>
          );
        })}
        {words < list.length ? <motion.span className="inline-block h-4 w-[2px] align-middle" style={{ background: C.lime }} animate={{ opacity: [1, 0, 1] }} transition={{ duration: 0.9, repeat: Infinity }} /> : null}
      </p>
    </div>
  );
}

function FailureSpeech({ failure, kept, onKept, onText }: { failure: Failure; kept: number; onKept: () => void; onText: () => void }) {
  const raw = { short: ERRORS.tooShort, nomic: ERRORS.noMic, stt: ERRORS.stt, kept: ERRORS.kept }[failure];
  const [title, ...rest] = raw.split(". ");
  return (
    <div className="px-4 pb-1 pt-4">
      <div className="flex items-center gap-2.5">
        <span className="grid h-8 w-8 place-items-center rounded-full" style={{ background: failure === "kept" ? "rgba(240,167,60,.16)" : C.ink3, color: failure === "kept" ? C.amber : C.onInk2 }}>
          <Icon name={failure === "kept" ? "offline" : failure === "nomic" ? "voice" : failure === "stt" ? "clock" : "hand"} size={17} />
        </span>
        <span className="text-[21px] font-semibold tracking-[-0.015em]" style={{ color: C.onInk }}>
          {title}.
        </span>
      </div>
      <p className="mt-1 text-[14.5px] leading-[20px]" style={{ color: C.onInk2 }}>
        {rest.join(". ")}
      </p>
      {failure === "stt" ? (
        <div className="mt-3 flex items-center gap-3">
          <Clip sec={8} seed={4} />
          <span className="flex items-center gap-1.5 text-[12.5px]" style={{ color: C.onInk3 }}>
            <motion.span className="h-1.5 w-1.5 rounded-full" style={{ background: C.lime }} animate={{ opacity: [1, 0.2, 1] }} transition={{ duration: 0.9, repeat: Infinity }} /> пробую снова…
          </span>
        </div>
      ) : null}
      {failure === "nomic" ? (
        <div className="mt-3 flex gap-1.5">
          <Key kind="quiet" onClick={onText}>
            <Icon name="text" size={17} /> Написать строкой
          </Key>
        </div>
      ) : null}
      {failure === "kept" && kept ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Press onClick={onKept} className="inline-flex h-10 items-center gap-2 rounded-full pl-2 pr-3.5 text-[13.5px] font-semibold" style={{ background: "rgba(240,167,60,.14)", color: C.amber }}>
            <motion.span className="h-2 w-2 rounded-full" style={{ background: C.amber }} animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.4, repeat: Infinity }} />
            {kept === 1 ? "1 фраза ждёт сети" : `${kept} ждут сети`} · Показать
          </Press>
        </div>
      ) : null}
    </div>
  );
}

function TextEntry({ value, onChange, pin, onUnpin, onSubmit, onClose }: { value: string; onChange: (v: string) => void; pin: Pin; onUnpin: () => void; onSubmit: () => void; onClose: () => void }) {
  const who = pin?.kind === "person" ? personById(pin.id) : null;
  const examples = who ? [`к пятнице ${"смету по объекту"}`, "зайти ко мне в 15:00"] : ["Всем: завтра планёрка в 9:00", "Айгуль — акт сверки к 12:00", "Что сейчас у Марата?"];
  return (
    <div className="px-4 pb-1 pt-4">
      <div className="flex min-h-[44px] items-center gap-2">
        <span className="min-w-0 flex-1 text-[13px] font-medium leading-[17px]" style={{ color: C.onInk3 }}>
          Одной строкой — как сказали бы голосом
        </span>
        {who ? (
          <button type="button" onClick={onUnpin} className="inline-flex h-9 items-center gap-1.5 rounded-full pl-1 pr-2.5 text-[12.5px] font-semibold" style={{ background: C.ink3, color: C.onInk }}>
            <Disc initials={who.initials} look="onInk" size={26} style={{ background: "#3A4148" }} />
            {dative(who)}
            <Icon name="close" size={13} />
          </button>
        ) : null}
        <Press onClick={onClose} label="Закрыть" className="-mr-1.5 grid h-11 w-11 shrink-0 place-items-center rounded-full" style={{ background: C.ink3, color: C.onInk2 }}>
          <Icon name="close" size={18} />
        </Press>
      </div>
      <textarea
        autoFocus
        value={value}
        rows={2}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onSubmit();
          }
        }}
        placeholder={who ? `Что сделать ${dative(who)}?` : "Например: Марату к пятнице график работ"}
        className="mt-2 w-full resize-none rounded-[20px] px-4 py-3 text-[18px] leading-[24px] outline-none placeholder:text-[#5F6870]"
        style={{ background: C.ink2, color: C.onInk, caretColor: C.lime, userSelect: "text", boxShadow: `inset 0 0 0 1.5px ${value ? "rgba(210,245,92,.45)" : "transparent"}` }}
      />
      <div className="no-bar -mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4" style={{ maskImage: "linear-gradient(90deg, transparent 0, #000 16px, #000 calc(100% - 28px), transparent)", WebkitMaskImage: "linear-gradient(90deg, transparent 0, #000 16px, #000 calc(100% - 28px), transparent)" }}>
        {examples.map((e) => (
          <Key key={e} small kind="ghost" onClick={() => onChange(e)}>
            {e}
          </Key>
        ))}
      </div>
    </div>
  );
}

function FirstDay({ pushOn, onPush, onInstall, onTeam }: { pushOn: boolean; onPush: () => void; onInstall: () => void; onTeam: () => void }) {
  const steps = [
    { done: false, title: "Добавьте первого сотрудника", sub: "Он получит ссылку и код входа", action: "Добавить", on: onTeam, icon: "people" as const },
    { done: pushOn, title: "Включите уведомления", sub: "Узнаете, когда сдадут задачу", action: "Включить", on: onPush, icon: "bell" as const },
    { done: false, title: "Pulse — на экран «Домой»", sub: "Так работают уведомления на iPhone", action: "Как?", on: onInstall, icon: "home" as const },
  ];
  return (
    <div className="mx-3 overflow-hidden rounded-[22px]" style={{ background: C.ink2 }}>
      {steps.map((s, i) => (
        <div key={s.title} className="flex min-h-[60px] items-center gap-3 px-3.5 py-2" style={{ borderTop: i ? `1px solid ${C.line}` : "none" }}>
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[13px]" style={{ ...MONO, background: s.done ? "rgba(95,211,154,.16)" : C.ink3, color: s.done ? C.mint : C.onInk2 }}>
            {s.done ? <Icon name="check" size={16} stroke={2.4} /> : i + 1}
          </span>
          <span className="min-w-0 flex-1 leading-[17px]">
            <span className="block text-[14.5px] font-semibold" style={{ color: s.done ? C.onInk3 : C.onInk, textDecoration: s.done ? "line-through" : "none" }}>
              {s.title}
            </span>
            <span className="block text-[12px]" style={{ color: C.onInk3 }}>
              {s.sub}
            </span>
          </span>
          {!s.done ? (
            <Key small kind={i === 0 ? "primary" : "quiet"} onClick={s.on}>
              {s.action}
            </Key>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function CalmLine({ text }: { text: string }) {
  return (
    <p className="px-6 py-10 text-center text-[15px]" style={{ color: C.onInk2 }}>
      {text}
    </p>
  );
}

/** A small celebration from under the thumb once a batch has landed. */
function Confetti({ n }: { n: number }) {
  const reduce = useReduced();
  if (!n || reduce) return null;
  const bits = Array.from({ length: 18 }, (_, i) => {
    const a = (-150 + (i * 120) / 17) * (Math.PI / 180) - Math.PI / 6;
    const d = 70 + ((i * 37) % 60);
    return { x: Math.cos(a) * d, y: Math.sin(a) * d - 20, r: (i * 47) % 180, c: i % 3 === 0 ? "#FFFFFF" : i % 3 === 1 ? C.lime : C.mint, w: i % 2 ? 6 : 4 };
  });
  return (
    <div key={n} aria-hidden className="pointer-events-none absolute left-1/2 top-[56px] z-20">
      {bits.map((b, i) => (
        <motion.span key={i} className="absolute block rounded-[1px]" style={{ width: b.w, height: b.w * 1.6, background: b.c }} initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 0.6 }} animate={{ x: b.x, y: [0, b.y, b.y + 40], opacity: [1, 1, 0], rotate: b.r, scale: 1 }} transition={{ duration: 1.1, ease: [0.2, 0.7, 0.3, 1] }} />
      ))}
    </div>
  );
}

/** Cards in flight: each becomes a spark that arcs up and lands on whoever receives it. */
function Comets({ comets }: { comets: Comet[] }) {
  const reduce = useReduced();
  if (reduce) return null;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-30">
      {comets.map((c) => {
        const mx = (c.x0 + c.x1) / 2 + (c.x1 > c.x0 ? -30 : 30);
        const my = Math.min(c.y0, c.y1) - 50;
        return (
          <motion.span
            key={c.id}
            className="absolute left-0 top-0 block rounded-full"
            style={{ width: c.big ? 18 : 14, height: c.big ? 18 : 14, marginLeft: c.big ? -9 : -7, marginTop: c.big ? -9 : -7, background: C.lime, boxShadow: `0 0 18px 4px rgba(210,245,92,.55)` }}
            initial={{ x: c.x0, y: c.y0, scale: 1.6, opacity: 0 }}
            animate={{ x: [c.x0, mx, c.x1], y: [c.y0, my, c.y1], scale: [1.6, 1.1, 0.7], opacity: [0, 1, 1] }}
            transition={{ duration: 0.72, delay: c.delay, ease: [0.3, 0.1, 0.25, 1], times: [0, 0.55, 1] }}
          />
        );
      })}
    </div>
  );
}

/** A change on the board, said over the person it is about; fades after ~9 s; a tap opens it. */
function NewsThought({ text, tone, W, who, bottom, onTap }: { text: string; tone: "ok" | "warn" | "info"; W: number; who: string | null; bottom: number; onTap: () => void }) {
  const w = Math.min(320, W - 32);
  const p = who ? personById(who) : null;
  const dot = tone === "ok" ? C.mint : tone === "warn" ? C.blue : C.slate;
  return (
    <motion.button
      type="button"
      onClick={onTap}
      className="absolute z-20 text-left"
      style={{ left: (W - w) / 2, top: 0, width: w }}
      initial={{ opacity: 0, scale: 0.92, y: bottom - 64 }}
      animate={{ opacity: 1, scale: 1, y: bottom - 74 }}
      exit={{ opacity: 0, scale: 0.97, y: bottom - 50, transition: { duration: 0.4, ease: [0.4, 0, 1, 1] } }}
      transition={{ type: "spring", stiffness: 380, damping: 26 }}
    >
      <span className="relative flex items-center gap-3 overflow-hidden rounded-[22px] py-2.5 pl-2.5 pr-3.5" style={{ background: "rgba(255,255,255,.92)", color: C.onSky, boxShadow: "0 18px 36px -16px rgba(30,45,60,.45), 0 0 0 1px rgba(16,20,24,.04)", backdropFilter: "blur(10px)" }}>
        {p ? (
          <Disc initials={p.initials} look="heavy" size={38} />
        ) : (
          <span className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-full" style={{ background: C.sky1, color: C.onSky2 }}>
            <Icon name={text.includes("Жанна") ? "cup" : "broadcast"} size={18} />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-medium leading-[19px]">{text}</span>
          <span className="mt-0.5 flex items-center gap-1.5 text-[11.5px]" style={{ color: C.onSky3 }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: dot }} />
            только что · тап — открыть
          </span>
        </span>
        <motion.span className="absolute bottom-0 left-0 h-[2px] w-full" style={{ background: dot, originX: 0, opacity: 0.7 }} initial={{ scaleX: 1 }} animate={{ scaleX: 0 }} transition={{ duration: 9, ease: "linear" }} />
      </span>
    </motion.button>
  );
}

/** The secretary's desk: a tab that grows out of the ground's edge. Tap — her keys; hold — say it in your own words. */
function SecretaryTab({
  icon,
  line,
  lit,
  onTap,
  onHold,
  onRelease,
  recording,
}: {
  icon: string;
  line: string;
  lit: boolean;
  onTap: () => void;
  onHold: () => void;
  onRelease: (cancelled: boolean) => void;
  recording: boolean;
}) {
  const t = useRef<{ timer: number | null; held: boolean }>({ timer: null, held: false });
  return (
    <motion.div
      className="absolute z-0"
      style={{ right: 26, top: -34, width: SHELF_TAB_W }}
      initial={{ y: 34, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 34, opacity: 0 }}
      transition={{ type: "spring", stiffness: 380, damping: 32 }}
    >
      <button
        type="button"
        aria-label={`Секретарь: ${line}`}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          t.current.held = false;
          t.current.timer = window.setTimeout(() => {
            t.current.held = true;
            t.current.timer = null;
            onHold();
          }, 450);
        }}
        onPointerUp={() => {
          if (t.current.timer) {
            window.clearTimeout(t.current.timer);
            t.current.timer = null;
            onTap();
          } else if (t.current.held) onRelease(false);
        }}
        onPointerCancel={() => {
          if (t.current.timer) window.clearTimeout(t.current.timer);
          if (t.current.held) onRelease(true);
        }}
        onContextMenu={(e) => e.preventDefault()}
        className="relative flex h-[40px] w-full items-center gap-2 rounded-t-[16px] pl-1.5 pr-2.5 pt-0.5 text-left"
        style={{ background: C.ink, touchAction: "none", WebkitTouchCallout: "none" }}
      >
        <span className="relative">
          <Disc initials="ЖИ" look="secretary" size={26} />
          {recording ? <motion.span className="absolute -inset-1 rounded-full" style={{ boxShadow: `0 0 0 2px ${C.lime}` }} animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 0.8, repeat: Infinity }} /> : null}
        </span>
        <span className="min-w-0 flex-1 leading-[13px]">
          <span className="block text-[11px] font-semibold" style={{ color: lit ? C.lime : C.onInk }}>
            Жанна
          </span>
          <span className="block truncate text-[11px]" style={{ color: lit ? C.lime : C.onInk2 }}>
            {icon ? `${icon} ` : ""}
            {line}
          </span>
        </span>
        {/* the fillets where the tab meets the ground */}
        <span aria-hidden className="absolute -left-[14px] bottom-0 h-[14px] w-[14px]" style={{ background: `radial-gradient(circle at 0 0, transparent 13.5px, ${C.ink} 14px)` }} />
        <span aria-hidden className="absolute -right-[14px] bottom-0 h-[14px] w-[14px]" style={{ background: `radial-gradient(circle at 100% 0, transparent 13.5px, ${C.ink} 14px)` }} />
      </button>
    </motion.div>
  );
}

/** The first day: the sky explains its own law with empty seats. */
function EmptySky({ H, onAdd }: { H: number; onAdd: () => void }) {
  // the sky explains its own law with empty seats: where people will stand, and why
  const rows = [
    { y: 18, label: "Свободные парят наверху", n: 4, size: 22 },
    { y: Math.max(84, H * 0.36), label: "Те, кто в работе, — посередине", n: 3, size: 36 },
    { y: Math.max(160, H - 92), label: "Кто ждёт вашего слова — опускается к пальцу", n: 3, size: 46 },
  ];
  return (
    <div className="absolute inset-0">
      {rows.map((r, ri) => (
        <motion.div key={r.label} className="absolute inset-x-0 px-5" style={{ top: r.y }} initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 + 0.18 * ri, type: "spring", stiffness: 260, damping: 26 }}>
          <div className="mb-1.5 text-[12px] font-medium" style={{ color: C.onSky3 }}>
            {r.label}
          </div>
          <div className="flex items-center" style={{ gap: r.size * 0.32 }}>
            {Array.from({ length: r.n }, (_, i) =>
              ri === 2 && i === 0 ? (
                <Press key={i} onClick={onAdd} label="Добавить сотрудника" className="grid place-items-center rounded-full" style={{ width: r.size, height: r.size, background: "#FFFFFF", color: C.ink, boxShadow: "0 10px 22px -12px rgba(40,60,80,.45)" }}>
                  <Icon name="plus" size={20} stroke={2.2} />
                </Press>
              ) : (
                <Disc key={i} initials="" look="ghost" size={r.size} style={{ opacity: 0.75 - i * 0.18 }} />
              ),
            )}
          </div>
        </motion.div>
      ))}
    </div>
  );
}

/** Reactions to an accepted task, only while points are on (D-133). */
function Reactions() {
  const [on, setOn] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[12px]" style={{ color: C.onSky3 }}>
        отметить:
      </span>
      {REACTIONS.map((r) => (
        <Press key={r} onClick={() => setOn(r)} className="inline-flex h-9 items-center rounded-full px-3 text-[14px]" style={{ background: on === r ? C.ink : "rgba(16,20,24,.06)", color: on === r ? "#fff" : C.onSky }}>
          {r}
        </Press>
      ))}
    </div>
  );
}
