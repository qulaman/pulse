"use client";

import { AnimatePresence, motion } from "framer-motion";

import { Mascot, type MascotAct, type MascotState } from "@/components/brand/Mascot";
import { useMascotActs } from "@/components/pulse/useMascotActs";
import { useMascotSeason } from "@/lib/mascot/useSeason";
import type { TvSpeech } from "@/lib/tv/voice";

import { useVhPx } from "./useKiosk";

/**
 * Лицо посреди экрана — то же «Капля», что у директора в телефоне (D-45), только во всю
 * стену и молча: тапать киоск некому. Под лицом — одна строка о том, что происходит
 * прямо сейчас; рамки у неё нет, экран держится на воздухе.
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

export function TvMascot({ speech }: { speech: TvSpeech }) {
  const size = useVhPx(FACE_VH);
  const acts = useMascotActs(STATE[speech.mood], true, TV_SKIP);
  const season = useMascotSeason();

  return (
    <div className="flex flex-col items-center">
      <span className="relative" style={{ width: size, height: size }}>
        {/* тёплое свечение под лицом: два статичных слоя, бирюзовый и золотой, — лицо обрадовалось, и
            золото проступает прозрачностью (градиент сам не перетекает, он сменился бы одним кадром) */}
        <Glow tone="var(--accent)" opacity={speech.mood === "happy" ? 0 : speech.mood === "sleeping" ? 7 / 18 : 1} />
        <Glow tone="var(--gold)" opacity={speech.mood === "happy" ? 1 : 0} />
        {size > 0 ? <Mascot state={STATE[speech.mood]} size={size} act={acts.act} season={season} /> : null}
      </span>

      <div className="mt-[3vh] h-[6vh] text-center">
        <AnimatePresence mode="wait">
          {speech.text ? (
            <motion.p
              key={speech.text}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.25 } }}
              transition={{ duration: 0.5, ease: [0.2, 0, 0, 1] }}
              className="text-[4vh] font-semibold leading-[5.4vh]"
            >
              {speech.text}
            </motion.p>
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
