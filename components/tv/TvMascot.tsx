"use client";

import { AnimatePresence, motion } from "motion/react";
import { useSyncExternalStore } from "react";

import { Mascot, type MascotAct, type MascotState } from "@/components/brand/Mascot";
import { useMascotActs } from "@/components/pulse/useMascotActs";
import { useMascotSeason } from "@/lib/mascot/useSeason";
import type { TvPaceRow } from "@/lib/tv/scenes";
import type { TvSpeech } from "@/lib/tv/voice";

import { TvPace } from "./TvPace";

/**
 * Лицо посреди экрана — то же «Капля», что у директора в телефоне (D-45), только во всю
 * стену и молча: тапать киоск некому. Под лицом — свежая новость словами лица, а в тишине —
 * темп дня (`TvPace`, D-182): «Сегодня принято: 9» словами лица повторяло бегущую строку.
 *
 * Состояний ровно четыре и все не обидные: спокоен, говорит, доволен, спит. Тревогу,
 * недовольство и зов на экран в кабинете не выносят — это личное и живёт в канале
 * адресата (D-45).
 *
 * Размер считается из высоты экрана: `Mascot` рисуется в пикселях, а стена бывает и
 * 720p, и 4K.
 */

const FACE_VH = 34;

/**
 * The face on the wall does the small things a face at rest does (D-82, D-119): asleep it snores
 * and rolls over, awake it waves, winks, whistles — never the look after the balls: the wall has
 * none. Only the calm and glad acts: the wall shows nothing that could sting (D-45).
 */
const TV_SKIP: readonly MascotAct[] = ["orbit"];

const STATE: Record<TvSpeech["mood"], MascotState> = {
  calm: "calm",
  speaking: "speaking",
  happy: "happy",
  sleeping: "sleeping",
};

function subscribeResize(onChange: () => void): () => void {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

/**
 * A share of the wall's height in pixels, for what is drawn by a number (the mascot takes `size`
 * in px). Read during render, not after an effect: a scene drawn ahead of time behind `<Activity>`
 * runs no effects until it is shown, and a face measured only then would pop in a frame late.
 * The server draws nothing (0) and hydration catches up at once.
 */
export function useWallPx(vh: number): number {
  return useSyncExternalStore(
    subscribeResize,
    () => Math.round((window.innerHeight * vh) / 100),
    () => 0,
  );
}

export function TvMascot({ speech, pace = null }: { speech: TvSpeech; pace?: TvPaceRow | null }) {
  const size = useWallPx(FACE_VH);
  const acts = useMascotActs(STATE[speech.mood], true, TV_SKIP);
  const season = useMascotSeason();

  return (
    <div className="flex flex-col items-center">
      <span className="relative" style={{ width: `${FACE_VH}vh`, height: `${FACE_VH}vh` }}>
        {/* тёплое свечение под лицом: два статичных слоя, бирюзовый и золотой, — лицо обрадовалось, и
            золото проступает прозрачностью (градиент сам не перетекает, он сменился бы одним кадром) */}
        <Glow tone="var(--accent)" opacity={speech.mood === "happy" ? 0 : speech.mood === "sleeping" ? 7 / 18 : 1} />
        <Glow tone="var(--gold)" opacity={speech.mood === "happy" ? 1 : 0} />
        {size > 0 ? <Mascot state={STATE[speech.mood]} size={size} act={acts.act} season={season} /> : null}
      </span>

      {/* one slot under the face: the news while it is fresh, else the pace of the day — the face never jumps */}
      <div className="mt-[3vh] flex min-h-[calc(11vh*var(--tv-k,1))] items-start justify-center text-center">
        <AnimatePresence mode="wait" initial={false}>
          {speech.text ? (
            <motion.p
              key={speech.text}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.25 } }}
              transition={{ duration: 0.5, ease: [0.2, 0, 0, 1] }}
              className="tv-lead max-w-[80vw] font-semibold"
            >
              {speech.text}
            </motion.p>
          ) : pace ? (
            <motion.div
              key="pace"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.25 } }}
              transition={{ duration: 0.5, ease: [0.2, 0, 0, 1] }}
            >
              <TvPace pace={pace} />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}

/** One glow under the face at 18 % of its tone; the mood picks the layer by opacity (D-45: opacity only). */
function Glow({ tone, opacity }: { tone: string; opacity: number }) {
  return (
    <span
      aria-hidden
      className="absolute -inset-[12%] rounded-full"
      style={{
        background: `radial-gradient(circle, color-mix(in srgb, ${tone} 18%, transparent), transparent 68%)`,
        opacity,
        transition: "opacity 800ms var(--ease-out)",
      }}
    />
  );
}
