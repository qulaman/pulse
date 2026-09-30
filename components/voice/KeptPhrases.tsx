"use client";

import { onlineManager, useQueryClient } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { create } from "zustand";

import { useOnline } from "@/components/OfflineBanner";
import { Mascot } from "@/components/brand/Mascot";
import { entitiesSummary, pluralRu } from "@/components/confirm/format";
import { toast } from "@/components/ui/Toast";
import { humanAqtobe } from "@/lib/ai/time";
import { bindIngestOwner, useIngestStore } from "@/lib/store/ingest";
import { useMe } from "@/lib/tasks/queries";
import { voiceApi } from "@/lib/voice/api";
import { dropPhrase, keepPhrase, keptView, listPhrases, patchPhrase, subscribeKept, wasParkedHere, type KeptPhrase } from "@/lib/voice/kept";
import { replayRound, withPhraseLock } from "@/lib/voice/keptReplay";

/** While something waits on the phone, a quiet retry on this beat — `online` events lie on a captive network. */
const RETRY_MS = 30_000;

/** Whether the pill is up: Пульс keeps its gesture hint out of the pill's place. */
export const useKeptPill = create<{ shown: boolean }>(() => ({ shown: false }));

/** The phrases this director's phone holds, live. */
function usePhrases(userId: string | undefined): KeptPhrase[] {
  const [phrases, setPhrases] = useState<KeptPhrase[]>([]);
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    const read = async () => {
      const list = await listPhrases(userId);
      if (alive) setPhrases(list);
    };
    void read();
    const off = subscribeKept(() => void read());
    return () => {
      alive = false;
      off();
    };
  }, [userId]);
  return userId ? phrases : [];
}

/** The pipeline is free for a kept phrase to come back to the face. */
function faceFree(): boolean {
  const stage = useIngestStore.getState().stage;
  return stage === "idle" || stage === "kept";
}

/**
 * The replay of kept phrases for the whole director app (D-130): on start, when the network is
 * back, when the app comes to the front, and on a slow beat while something waits. A phrase
 * this tab parked comes back to the face by itself when its cards are ready and the director is
 * on Пульс — he saw «разберу, как появится сеть» and is waiting for them.
 */
function useKeptReplay(userId: string | undefined, pathname: string) {
  const queryClient = useQueryClient();
  // read at the end of a round, not a reason to start one
  const at = useRef(pathname);
  useEffect(() => {
    at.current = pathname;
  }, [pathname]);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    let running = false;
    const round = async () => {
      if (running || !onlineManager.isOnline()) return;
      running = true;
      try {
        const { sent, ready } = await replayRound(userId, { api: voiceApi, patch: patchPhrase, drop: dropPhrase }, { lock: withPhraseLock });
        if (!alive) return;
        if (sent > 0) {
          toast(sent === 1 ? "Отправил то, что ждало сети" : `Отправил ${sent} ${pluralRu(sent, ["пачку", "пачки", "пачек"])}, что ждали сети`);
          void queryClient.invalidateQueries({ queryKey: ["tasks"] });
          void queryClient.invalidateQueries({ queryKey: ["notes"] });
          void queryClient.invalidateQueries({ queryKey: ["ether"] });
          void queryClient.invalidateQueries({ queryKey: ["calendar"] });
        }
        const back = ready.find((phrase) => wasParkedHere(phrase.id));
        if (back && at.current === "/pulse" && faceFree() && document.visibilityState === "visible") {
          useIngestStore.getState().restore(back);
        }
      } finally {
        running = false;
      }
    };
    void round();
    const offOnline = onlineManager.subscribe((online) => {
      if (online) void round();
    });
    const onVisible = () => {
      if (document.visibilityState === "visible") void round();
    };
    document.addEventListener("visibilitychange", onVisible);
    const beat = setInterval(() => void round(), RETRY_MS);
    // the face parked a phrase just now: a network that is back already takes it at once
    const offKept = subscribeKept(() => void round());
    return () => {
      alive = false;
      offOnline();
      offKept();
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(beat);
    };
  }, [userId, queryClient]);
}

/** «Запись 14:05», «Текст вчера 18:20» — today goes without the word, the pill is narrow */
function label(phrase: KeptPhrase): string {
  const when = humanAqtobe(new Date(phrase.createdAt)).replace(/^сегодня /, "");
  return `${phrase.source === "voice" ? "Запись" : "Текст"} ${when}`;
}

/** What waits for the director in one line. */
function readyLine(phrase: KeptPhrase): string {
  if (phrase.failure) {
    if (phrase.stage === "sending") return `${label(phrase)} не отправилась`;
    if (phrase.failure.code === "empty_transcript") return `${label(phrase)}: не расслышал`;
    return `${label(phrase)} ждёт вас`;
  }
  if (phrase.toSecretary || phrase.errand) return `${label(phrase)}: просьба секретарю`;
  if (phrase.entities.length === 0) return `${label(phrase)}: не разобрал`;
  return `${label(phrase)}: ${entitiesSummary(phrase.entities)}`;
}

/**
 * The phrases the phone keeps (D-130), for every screen of the director: the replay, and a
 * pill — «Ждёт сети: 2 записи» while they are on their way, «Запись 14:05: 2 задачи · открыть»
 * when one waits for his tap. The phrase on the face right now is the face's business.
 */
export function KeptPhrases() {
  const me = useMe();
  const userId = me.data?.userId;
  const pathname = usePathname();
  const phrases = usePhrases(userId);
  const live = useIngestStore((state) => state.keptId);
  const stage = useIngestStore((state) => state.stage);
  const restore = useIngestStore((state) => state.restore);
  const online = useOnline();

  useEffect(() => {
    bindIngestOwner(userId ?? null);
  }, [userId]);
  useKeptReplay(userId, pathname);

  const view = keptView(phrases, live);
  // one pill at a time: while a phrase is on the face (its draft pill, its overlay) this one waits
  const shown = view !== null && (stage === "idle" || stage === "kept" || stage === "question") && pathname !== "/confirm";
  useEffect(() => {
    useKeptPill.setState({ shown });
    return () => useKeptPill.setState({ shown: false });
  }, [shown]);
  if (!shown || !view) return null;

  const open = () => {
    if (view.kind !== "ready") return;
    if (!restore(view.phrase)) toast("Сначала закончи с текущей фразой");
  };

  return (
    <div
      className="above-tabbar fixed inset-x-0 z-30 flex justify-center px-4"
      style={{ bottom: "calc(var(--tabbar-space) + 8px)" }}
      data-testid="kept-pill"
      data-kind={view.kind}
    >
      <div className="flex max-w-full items-center gap-3 rounded-full border border-border bg-surface py-2 pl-2 pr-2" style={{ boxShadow: "var(--shadow-raised)" }}>
        {view.kind === "waiting" ? (
          <>
            <Mascot state="saving" size={32} />
            <p className="pr-2 text-[14px] font-medium leading-[18px]">
              {online
                ? "Отправляю то, что ждало сети…"
                : `Ждёт сети: ${view.count} ${pluralRu(view.count, ["запись", "записи", "записей"])}`}
            </p>
          </>
        ) : (
          <>
            <Mascot state={view.phrase.failure ? "thinking" : "offering"} size={32} />
            <button type="button" onClick={open} className="flex min-w-0 items-baseline gap-1.5 text-left text-[14px] font-medium leading-[18px]">
              <span className="min-w-0 truncate">
                {readyLine(view.phrase)}
                {view.more > 0 ? <span className="text-muted"> · ещё {view.more}</span> : null}
              </span>
              <span className="shrink-0 text-accent">Открыть</span>
            </button>
            <button
              type="button"
              aria-label="Стереть"
              onClick={() => {
                const phrase = view.phrase;
                void dropPhrase(phrase.id);
                // a slip of the finger must not cost the recording: the phone takes it back
                toast("Стёр", { action: { label: "Вернуть", onClick: () => void keepPhrase(phrase) } });
              }}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[16px] text-muted"
            >
              ×
            </button>
          </>
        )}
      </div>
    </div>
  );
}
