"use client";

import { useEffect, useState } from "react";

import { Mascot, type MascotState } from "@/components/brand/Mascot";

const STATES: { state: MascotState; label: string }[] = [
  { state: "calm", label: "Спокоен — дыхание 6 с, моргает" },
  { state: "listening", label: "Слушает — быстрое дыхание, взгляд вверх, растёт от голоса" },
  { state: "thinking", label: "Думает — жёлтый, взгляд в сторону" },
  { state: "happy", label: "Доволен — золотой, прищур, подпрыгивает" },
];

/** Sandbox for the mascot: every state side by side, a fake microphone level slider. */
export default function MascotSandbox() {
  const [level, setLevel] = useState(0);
  const [auto, setAuto] = useState(true);

  useEffect(() => {
    if (!auto) return;
    let frame = 0;
    const id = setInterval(() => {
      frame += 1;
      setLevel(Math.abs(Math.sin(frame / 5)) * 0.9);
    }, 80);
    return () => clearInterval(id);
  }, [auto]);

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-6">
      <h1 className="text-[24px] font-bold leading-[30px]">Маскот «Капля»</h1>
      <p className="mt-1 text-[13px] leading-4 text-muted">D-45: один SVG, только transform и цвет</p>

      <div className="mt-6 grid grid-cols-2 gap-4">
        {STATES.map(({ state, label }) => (
          <div key={state} className="flex flex-col items-center rounded-[16px] border border-border bg-surface p-4 text-center">
            <Mascot state={state} size={96} level={state === "listening" ? level : 0} />
            <p className="mt-3 text-[13px] leading-4 text-muted">{label}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-[16px] border border-border bg-surface p-4">
        <label className="flex flex-col gap-2 text-[14px] text-muted">
          Уровень микрофона: <span className="nums text-text">{level.toFixed(2)}</span>
          <input type="range" min={0} max={1} step={0.01} value={level} onChange={(e) => { setAuto(false); setLevel(Number(e.target.value)); }} />
        </label>
        <button type="button" className="mt-3 text-[13px] text-accent underline" onClick={() => setAuto((v) => !v)}>
          {auto ? "Остановить автоуровень" : "Автоуровень"}
        </button>
      </div>

      <div className="mt-6 flex items-center gap-4 rounded-[16px] border border-border bg-surface p-4">
        <Mascot state="calm" size={24} />
        <Mascot state="happy" size={32} />
        <Mascot state="thinking" size={44} />
        <p className="text-[13px] leading-4 text-muted">Малые размеры: 24 / 32 / 44 — глаза читаются?</p>
      </div>
    </main>
  );
}
