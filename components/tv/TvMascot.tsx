"use client";

import { AnimatePresence, motion } from "framer-motion";

import { Mascot, type MascotState } from "@/components/brand/Mascot";
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

const STATE: Record<TvSpeech["mood"], MascotState> = {
  calm: "calm",
  speaking: "speaking",
  happy: "happy",
  sleeping: "sleeping",
};

export function TvMascot({ speech }: { speech: TvSpeech }) {
  const size = useVhPx(FACE_VH);

  return (
    <div className="flex flex-col items-center">
      <span className="relative" style={{ width: size, height: size }}>
        {/* тёплое свечение под лицом: статичное, не анимируется (перф-контракт D-45) */}
        <span
          aria-hidden
          className="absolute -inset-[12%] rounded-full"
          style={{
            background: `radial-gradient(circle, color-mix(in srgb, ${speech.mood === "happy" ? "var(--gold)" : "var(--accent)"} ${speech.mood === "sleeping" ? 7 : 18}%, transparent), transparent 68%)`,
            transition: "background 800ms var(--ease-out)",
          }}
        />
        {size > 0 ? <Mascot state={STATE[speech.mood]} size={size} /> : null}
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
