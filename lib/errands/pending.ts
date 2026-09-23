"use client";

import { onlineManager, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { create } from "zustand";

import { dismissToast, toast } from "@/components/ui/Toast";
import { errandKeys } from "@/lib/errands/queries";
import { atLine } from "@/lib/errands/scene";
import type { SecretaryAction } from "@/lib/settings";
import { createBrowserSupabase } from "@/lib/supabase/client";

/**
 * «Кофе» уходит сразу (D-101): случайную просьбу не даёт отправить удержание кнопки две
 * секунды. Уже ушедшую директор снимает «Отменить» в тосте или в строке живой заявки
 * (переход `cancelled`, очередь пушей снимается).
 *
 * Без сети просьба не теряется (D-106): она лежит на телефоне (localStorage, по автору) и
 * уходит сама — когда сеть вернулась, когда приложение снова на экране, и тихим тиком, пока
 * что-то ждёт; ключ запроса выдан при нажатии, поэтому повтор той, что дошла, ничего не
 * меняет (принцип 7). Просьба, прождавшая связь дольше `STALE_MS`, не уходит: кофе через
 * сорок минут — уже не тот кофе; директору говорят, что она не ушла.
 */

export type PendingErrand = {
  /** The client request id: the same uuid the row will carry, so a retry is idempotent. */
  id: string;
  code: string;
  label: string;
  icon: string;
  note: string | null;
  /** Голосовой путь (D-79, фаза D): запись уже в Storage, её нельзя потерять (принцип 5). */
  audioPath?: string | null;
  transcript?: string | null;
  inboxId?: string | null;
  /** «не беспокоить на 30 мин» — the request ends by itself (D-99) */
  untilMin?: number | null;
  /** «Такси к 18:00» — the moment it is needed by (D-106 §8), ISO */
  dueAt?: string | null;
  /** When the director asked, ms — a request that waited too long for the network is dropped. */
  at: number;
  /** A post has missed the network at least once: the line says «ждёт связи». */
  waiting?: boolean;
};

/** A request older than this is not sent when the network comes back (D-106). */
export const STALE_MS = 20 * 60_000;
/** How long «Отменить» stays in the toast of a request that has gone. */
export const UNDO_MS = 5_000;
/** While something waits on the phone, a quiet retry on this beat — `online` events lie on a captive network. */
const RETRY_MS = 15_000;

type PendingState = {
  pending: PendingErrand[];
  add: (errand: PendingErrand) => void;
  drop: (id: string) => void;
  patch: (id: string, fields: Partial<PendingErrand>) => void;
};

export const usePendingErrands = create<PendingState>((set) => ({
  pending: [],
  add: (errand) => set((state) => ({ pending: [errand, ...state.pending.filter((p) => p.id !== errand.id)] })),
  drop: (id) => set((state) => ({ pending: state.pending.filter((p) => p.id !== id) })),
  patch: (id, fields) => set((state) => ({ pending: state.pending.map((p) => (p.id === id ? { ...p, ...fields } : p)) })),
}));

/* -------------------------------------------------------------------------- */
/* Pure parts                                                                 */
/* -------------------------------------------------------------------------- */

/** What the server's answer means for a kept request: gone, try again later, or never. */
export function verdictOf(status: number): "ok" | "retry" | "fail" {
  if (status >= 200 && status < 300) return "ok";
  // no answer this time, an expired session, a busy server: keep it for the next round
  if (status === 0 || status === 401 || status === 408 || status === 429 || status >= 500) return "retry";
  return "fail";
}

/**
 * Too old to send: the network came back after the moment had passed. A request for a time
 * keeps until five minutes before that time — «такси к 18:00» asked in the morning still goes.
 */
export function isStale(errand: Pick<PendingErrand, "at" | "dueAt">, now: number): boolean {
  if (errand.dueAt) return new Date(errand.dueAt).getTime() - now < 5 * 60_000;
  return now - errand.at > STALE_MS;
}

/**
 * The toast of a request that went: «Кофе · без сахара · отправлено». A free request's
 * label is the first words of its note — then the note alone. Who is away is said after it
 * (D-106): the request waits for them.
 */
export function sentLine(label: string, note: string | null, absence: string | null = null, dueAt: string | null = null): string {
  const words = note?.trim() ?? "";
  const head = !words ? label : words.toLowerCase().startsWith(label.toLowerCase()) ? clip(words, 48) : `${label} · ${clip(words, 32)}`;
  return `${head}${dueAt ? ` · ${atLine(dueAt)}` : ""} · отправлено${absence ? ` · ${absence}` : ""}`;
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/** Only well-formed entries come back from the phone's storage. */
export function keptErrands(raw: string | null): PendingErrand[] {
  if (!raw) return [];
  try {
    const list: unknown = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list.filter(
      (e): e is PendingErrand =>
        Boolean(e) &&
        typeof e === "object" &&
        typeof (e as PendingErrand).id === "string" &&
        typeof (e as PendingErrand).code === "string" &&
        typeof (e as PendingErrand).label === "string" &&
        typeof (e as PendingErrand).at === "number",
    );
  } catch {
    return [];
  }
}

/* -------------------------------------------------------------------------- */
/* The outbox                                                                 */
/* -------------------------------------------------------------------------- */

/** Whose phone this is: kept requests are stored per author, never sent as somebody else. */
let owner: string | null = null;
const storageKey = (userId: string) => `pulse.errand.outbox.${userId}`;

function persist(): void {
  if (!owner || typeof window === "undefined") return;
  try {
    const list = usePendingErrands.getState().pending;
    if (list.length === 0) window.localStorage.removeItem(storageKey(owner));
    else window.localStorage.setItem(storageKey(owner), JSON.stringify(list));
  } catch {
    // private mode or a full storage: the request still lives in memory until the tab closes
  }
}
if (typeof window !== "undefined") usePendingErrands.subscribe(persist);

/** Refreshes the errand lists once a kept request lands — set by the replay in the layout. */
let onLanded: (() => void) | null = null;

/** The request is on its way now; «Отменить» that comes meanwhile is kept for its landing. */
const inFlight = new Set<string>();
const cancelWanted = new Set<string>();
/** Requests that reached the server — «Отменить» from the toast needs the row. */
const landed = new Map<string, { errandId: string | null; label: string }>();
/** Each ask's own refresh (the card's list); the replay after a reload has only `onLanded`. */
const refreshers = new Map<string, () => void>();
/** The «отправлено» toast of each ask — taken down if the send then fails. */
const sentToasts = new Map<string, number>();
/** Who is away right now, said in the toast (D-106) — set by the screen that knows. */
let absence: string | null = null;

export function setDeskAbsence(line: string | null): void {
  absence = line;
}

type PostResult =
  | { kind: "ok"; errandId: string | null }
  | { kind: "retry"; reason: "network" | "server" }
  | { kind: "fail"; message: string };

async function postErrand(errand: PendingErrand): Promise<PostResult> {
  let res: Response;
  try {
    res = await fetch("/api/errands", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: errand.code,
        note: errand.note ?? undefined,
        client_request_id: errand.id,
        audio_path: errand.audioPath ?? undefined,
        source_transcript: errand.transcript ?? undefined,
        inbox_item_id: errand.inboxId ?? undefined,
        until_min: errand.untilMin ?? undefined,
        due_at: errand.dueAt ?? undefined,
      }),
    });
  } catch {
    // fetch throws only when nothing came back — the network
    return { kind: "retry", reason: "network" };
  }
  const verdict = verdictOf(res.status);
  const body = (await res.json().catch(() => null)) as { errand?: { id?: string }; error?: { message_ru?: string } } | null;
  if (verdict === "ok") return { kind: "ok", errandId: body?.errand?.id ?? null };
  if (verdict === "retry") return { kind: "retry", reason: res.status === 0 ? "network" : "server" };
  return { kind: "fail", message: body?.error?.message_ru ?? "сервер не принял" };
}

function forget(id: string): void {
  usePendingErrands.getState().drop(id);
  refreshers.delete(id);
}

/** «Кофе · отправлено» must not stay on the screen over a send that did not happen. */
function takeDownSent(id: string): void {
  const shown = sentToasts.get(id);
  if (shown === undefined) return;
  sentToasts.delete(id);
  dismissToast(shown);
}

async function send(errand: PendingErrand): Promise<void> {
  if (inFlight.has(errand.id)) return;
  inFlight.add(errand.id);
  let result: PostResult;
  try {
    result = await postErrand(errand);
  } finally {
    inFlight.delete(errand.id);
  }
  const refresh = refreshers.get(errand.id);

  if (result.kind === "ok") {
    sentToasts.delete(errand.id);
    forget(errand.id);
    landed.set(errand.id, { errandId: result.errandId, label: errand.label });
    if (landed.size > 20) landed.delete(landed.keys().next().value as string);
    if (cancelWanted.delete(errand.id)) {
      void cancelLanded(errand.id, refresh);
      return;
    }
    refresh?.();
    onLanded?.();
    return;
  }
  takeDownSent(errand.id);
  if (cancelWanted.delete(errand.id)) {
    // «Отменить» came while it was on its way, and it never arrived: nothing to take back
    forget(errand.id);
    toast(`${errand.label} · отменено`);
    return;
  }
  if (result.kind === "fail") {
    forget(errand.id);
    toast(`«${errand.label}» не ушла: ${result.message}`, { lifetimeMs: 6_000 });
    return;
  }
  const first = !usePendingErrands.getState().pending.find((p) => p.id === errand.id)?.waiting;
  usePendingErrands.getState().patch(errand.id, { waiting: true });
  if (first) waitingToast(errand, result.reason);
}

/** Said once per request; «нет связи» itself is the offline banner's to say. */
function waitingToast(errand: PendingErrand, reason: "network" | "server"): void {
  const text =
    reason === "network"
      ? `«${errand.label}» уйдёт, как только появится связь`
      : `Сервер не ответил — «${errand.label}» уйдёт сама чуть позже`;
  toast(text, {
    lifetimeMs: 5_000,
    action: { label: "Отменить", onClick: () => cancelAsked(errand.id) },
  });
}

async function cancelLanded(id: string, refresh?: () => void): Promise<void> {
  const row = landed.get(id);
  if (!row) return;
  try {
    if (!row.errandId) throw new Error("no_row");
    const supabase = createBrowserSupabase();
    const { error } = await supabase.rpc("transition_errand", {
      p_id: row.errandId,
      p_to: "cancelled",
      client_request_id: crypto.randomUUID(),
    });
    if (error) throw new Error(error.message);
    landed.delete(id);
    toast(`${row.label} · отменено`);
  } catch (error) {
    // already done in those five seconds, or no network: the live row keeps its own «Отменить»
    const done = error instanceof Error && error.message.includes("bad_transition");
    toast(done ? `«${row.label}» уже выполнили` : "Не получилось отменить — «Отменить» есть в карточке секретаря", { lifetimeMs: 5_000 });
  }
  refresh?.();
  onLanded?.();
}

/**
 * «Отменить» from a toast: a request still on the phone is simply dropped; one on its way is
 * taken back the moment it lands; one that landed goes `cancelled`.
 */
export function cancelAsked(id: string): void {
  if (inFlight.has(id)) {
    cancelWanted.add(id);
    return;
  }
  const kept = usePendingErrands.getState().pending.find((p) => p.id === id);
  if (kept) {
    forget(id);
    toast(`${kept.label} · отменено`);
    return;
  }
  void cancelLanded(id);
}

/** Sends what waits on the phone, oldest first; drops what waited too long. */
export async function flushErrands(now = Date.now()): Promise<void> {
  const list = [...usePendingErrands.getState().pending].reverse();
  for (const errand of list) {
    if (!errand.waiting || inFlight.has(errand.id)) continue;
    if (isStale(errand, now)) {
      forget(errand.id);
      toast(`«${errand.label}» не ушла: связи не было ${Math.round((now - errand.at) / 60_000)} мин`, { lifetimeMs: 8_000 });
      continue;
    }
    await send(errand);
  }
}

/** Takes up the requests this author left on the phone — after a reload, a killed PWA. */
function adopt(userId: string): void {
  if (owner === userId) return;
  owner = userId;
  if (typeof window === "undefined") return;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(storageKey(userId));
  } catch {
    raw = null;
  }
  const mine = new Set(usePendingErrands.getState().pending.map((p) => p.id));
  for (const errand of keptErrands(raw)) {
    if (!mine.has(errand.id)) usePendingErrands.getState().add({ ...errand, waiting: true });
  }
  persist();
}

/**
 * The replay of kept requests for the whole director app (mounted in the layout): on start,
 * when the network is back, when the app comes to the front, and on a slow beat while
 * something still waits.
 */
export function useErrandReplay(userId: string | undefined): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!userId) return;
    adopt(userId);
    onLanded = () => void queryClient.invalidateQueries({ queryKey: errandKeys.root });
    const round = () => {
      if (onlineManager.isOnline()) void flushErrands();
    };
    round();
    const offOnline = onlineManager.subscribe((online) => {
      if (online) round();
    });
    const onVisible = () => {
      if (document.visibilityState === "visible") round();
    };
    document.addEventListener("visibilitychange", onVisible);
    const beat = setInterval(round, RETRY_MS);
    return () => {
      onLanded = null;
      offOnline();
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(beat);
    };
  }, [userId, queryClient]);
}

/**
 * The request leaves at once. A toast says it went, with «Отменить» for five seconds (D-106);
 * `quiet` — a panel that stays open shows the line «отправляю…» itself. Without network the
 * toast says it will go by itself. `onSent` refreshes the list the row belongs to.
 */
export function askSecretary(
  action: Pick<SecretaryAction, "code" | "label" | "icon">,
  note: string | null,
  onSent: () => void,
  voice?: { id?: string; audioPath?: string | null; transcript?: string | null; inboxId?: string | null },
  options?: { untilMin?: number | null; quiet?: boolean; dueAt?: string | null },
): string {
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  const errand: PendingErrand = {
    // голос приносит свой ключ запроса: повтор той же фразы не купит второй кофе
    id: voice?.id ?? crypto.randomUUID(),
    code: action.code,
    label: action.label,
    icon: action.icon,
    note,
    audioPath: voice?.audioPath ?? null,
    transcript: voice?.transcript ?? null,
    inboxId: voice?.inboxId ?? null,
    untilMin: options?.untilMin ?? null,
    dueAt: options?.dueAt ?? null,
    at: Date.now(),
    waiting: offline,
  };
  usePendingErrands.getState().add(errand);
  refreshers.set(errand.id, onSent);
  if (offline) {
    // no network at all: say so once, and let the replay send it
    waitingToast(errand, "network");
    return errand.id;
  }
  if (!options?.quiet) {
    const shown = toast(sentLine(action.label, note, absence, errand.dueAt ?? null), {
      lifetimeMs: UNDO_MS,
      action: { label: "Отменить", onClick: () => cancelAsked(errand.id) },
    });
    sentToasts.set(errand.id, shown);
  }
  void send(errand);
  return errand.id;
}
