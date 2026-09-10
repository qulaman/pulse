"use client";

import { useEffect, useState } from "react";

import { Mascot, type MascotState } from "@/components/brand/Mascot";
import { MascotScene, type Scene } from "@/components/brand/MascotScene";

const STATES: { state: MascotState; label: string }[] = [
  { state: "calm", label: "Спокоен — дыхание, моргает, изредка косится" },
  { state: "listening", label: "Слушает — покачивается, широкие глаза, кольца звука, растёт от голоса" },
  { state: "thinking", label: "Разбирает — жёлтый, наклон, глаза бегают, три точки" },
  { state: "happy", label: "Доволен — золотой, прищур и румянец, прыжок с искрами" },
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

      <h2 className="mt-8 text-[19px] font-semibold leading-6">Сцены оверлея</h2>
      <div className="mt-3 grid grid-cols-1 gap-4">
        {(["listening", "transcribing", "sending"] as Scene[]).map((scene) => (
          <div key={scene} className="flex flex-col items-center rounded-[16px] border border-border bg-surface p-5">
            <MascotScene scene={scene} level={scene === "listening" ? level : 0} />
            <p className="mt-3 text-[13px] leading-4 text-muted">{scene}</p>
          </div>
        ))}
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
