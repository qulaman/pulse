"use client";

import { AnimatePresence, motion } from "framer-motion";

import { Mascot, type MascotState } from "@/components/brand/Mascot";
import type { TvSpeech } from "@/lib/tv/voice";

import { useVhPx } from "./useKiosk";

/**
 * Лицо на стене — то же «Капля», что у директора в телефоне (D-45), только крупно и
 * молча: тапать киоск некому. Состояний ровно три и все они не обидные — спокоен,
 * доволен, спит; тревогу и недовольство на экран в кабинете не выносят (D-45), их видит
 * только адресат в своём канале.
 *
 * Размер считается из высоты экрана: `Mascot` рисуется в пикселях, а стена бывает и
 * 720p, и 4K.
 */

const FACE_VH = 16;

const STATE: Record<TvSpeech["mood"], MascotState> = {
  calm: "calm",
  speaking: "speaking",
  happy: "happy",
  sleeping: "sleeping",
};

export function TvMascot({ speech }: { speech: TvSpeech }) {
  const size = useVhPx(FACE_VH);

  return (
    <div className="flex items-center gap-[2.2vh]">
      <span className="relative shrink-0" style={{ width: size, height: size }}>
        {/* тёплое свечение под лицом: статичное, не анимируется (перф-контракт D-45) */}
        <span
          aria-hidden
          className="absolute inset-0 rounded-full"
          style={{
            background: `radial-gradient(circle, color-mix(in srgb, ${speech.mood === "happy" ? "var(--gold)" : "var(--accent)"} ${speech.mood === "sleeping" ? 8 : 20}%, transparent), transparent 70%)`,
            transition: "background 600ms var(--ease-out)",
          }}
        />
        {size > 0 ? <Mascot state={STATE[speech.mood]} size={size} /> : null}
      </span>

      <div className="min-w-0 flex-1">
        <AnimatePresence mode="wait">
          {speech.text ? (
            <motion.p
              key={speech.text}
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.2 } }}
              transition={{ duration: 0.45, ease: [0.2, 0, 0, 1] }}
              className="relative inline-block rounded-[1.8vh] border border-border bg-surface-2 px-[2.4vh] py-[1.8vh] text-[3vh] font-medium leading-[3.8vh]"
            >
              {/* хвост к лицу — те же две точки, что у мысли в телефоне (ThoughtBubble) */}
              <span
                aria-hidden
                className="absolute right-full top-1/2 h-[1.4vh] w-[1.4vh] -translate-y-1/2 rounded-full border border-border bg-surface-2"
                style={{ marginRight: "0.7vh" }}
              />
              <span
                aria-hidden
                className="absolute right-full top-1/2 h-[0.8vh] w-[0.8vh] -translate-y-1/2 rounded-full border border-border bg-surface-2"
                style={{ marginRight: "2.6vh" }}
              />
              {speech.text}
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
