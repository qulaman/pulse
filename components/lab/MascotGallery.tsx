"use client";

import { useEffect, useState } from "react";

import { Mascot, type MascotState } from "@/components/brand/Mascot";
import { MascotScene, type Scene } from "@/components/brand/MascotScene";

/**
 * The mascot's animation bench (Лаб). Every existing motion of «Капля» in one place,
 * under one set of controls: size, microphone level, pause, replay, background.
 *
 * Adding a new animation — one entry, nothing else on this page:
 *   a new state of the face  -> the state in components/brand/Mascot.tsx + an entry in STATES;
 *   a new pipeline scene     -> components/brand/MascotScene.tsx + an entry in SCENES;
 *   a gesture over the face  -> the keyframes in app/globals.css + an entry in GESTURES
 *                               (the bench puts the animation on a wrapper around the face,
 *                               exactly the way the screens do).
 */

type StateEntry = {
  state: MascotState;
  title: string;
  note: string;
  /** the keyframes that drive the state: pose / body / eyes / props */
  keys: string;
};

const STATES: StateEntry[] = [
  {
    state: "calm",
    title: "Спокоен",
    note: "Дыхание с паузой, блик ходит по телу, редкий взгляд в сторону, тень дышит вместе с телом",
    keys: "mascot-idle · mascot-glance · mascot-glint · mascot-shadow-idle · mascot-blink",
  },
  {
    state: "listening",
    title: "Слушает",
    note: "Наклон и ухо вверх (одноразовая поза), кивки в такт голосу, волны входят в ухо. Реагирует на уровень микрофона",
    keys: "mascot-lean · mascot-nod · mascot-attend · mascot-ear-up · mascot-ear-twitch · mascot-wave-in",
  },
  {
    state: "saving",
    title: "Сохраняю",
    note: "Записка опускается сверху в голову, тело принимает её приседанием, глаза провожают вниз",
    keys: "mascot-tuck · mascot-tuck-note · mascot-track-down",
  },
  {
    state: "transcribing",
    title: "Распознаю",
    note: "Наклон «читаю через плечо», полоски звука слева гаснут, строки текста справа печатаются, глаза идут по строке",
    keys: "mascot-tilt-read · mascot-read-body · mascot-read · mascot-bar-fade · mascot-line-type",
  },
  {
    state: "parsing",
    title: "Разбираю",
    note: "Карточки появляются над головой одна за другой и уходят в стопку вправо, глаза следят за ними",
    keys: "mascot-sort-body · mascot-sort-card · mascot-look-cards",
  },
  {
    state: "sending",
    title: "Отправляю",
    note: "Замах назад, бросок вперёд со сплющиванием, глаза провожают карточку вверх",
    keys: "mascot-throw · mascot-follow",
  },
  {
    state: "thinking",
    title: "Думает",
    note: "Наклон и пауза, глаза бегают, три точки над головой — общее состояние ожидания",
    keys: "mascot-ponder · mascot-wander · mascot-dot",
  },
  {
    state: "speaking",
    title: "Говорит",
    note: "Рот в ритме фразы, лёгкие кивки телом, взгляд между собеседником и следующей мыслью (D-49)",
    keys: "mascot-talk · mascot-speak-look · mascot-mouth",
  },
  {
    state: "happy",
    title: "Доволен",
    note: "Золотой, прищур, румянец и улыбка, сдержанный прыжок с искрами, тень отрывается от земли",
    keys: "mascot-happy · mascot-spark · mascot-shadow-hop",
  },
  {
    state: "sleeping",
    title: "Спит",
    note: "Глаза закрыты, самое медленное дыхание, «z» уплывают вверх; от 48px появляется сон — капля на месяце, звёзды, падающая звезда",
    keys: "mascot-sleep · mascot-zzz · mascot-dream · mascot-dream-star · mascot-shooting-star · mascot-shadow-sleep",
  },
  {
    state: "surprised",
    title: "Удивлён",
    note: "Разбужен мыслью: прыжок назад, широкие глаза вверх, маленький круглый рот, дальше настороженное дыхание",
    keys: "mascot-startle · mascot-alert · mascot-look-up",
  },
];

type GestureEntry = {
  key: string;
  title: string;
  note: string;
  /** put on a wrapper around the face, the way the screens do it */
  animation: string;
  /** where it is used in the product */
  where: string;
  loop: boolean;
};

const GESTURES: GestureEntry[] = [
  {
    key: "wake",
    title: "Пробуждение",
    note: "Потягивание на первом тапе по спящему лицу",
    animation: "mascot-wake 520ms cubic-bezier(0.34, 1.4, 0.64, 1) both",
    where: "MascotLever, wakeKey",
    loop: false,
  },
  {
    key: "shake",
    title: "Дрожь удержания",
    note: "Короткая дрожь в момент срабатывания удержания, перед позой «слушает» (D-60)",
    animation: "mascot-shake 220ms ease-in-out both",
    where: "MascotLever, удержание",
    loop: false,
  },
  {
    key: "bounce",
    title: "Подскок",
    note: "Подскок с приседанием — общий жест радости, пока свободен",
    animation: "mascot-bounce 600ms cubic-bezier(0.34, 1.4, 0.64, 1) both",
    where: "не занят",
    loop: false,
  },
  {
    key: "breathe",
    title: "Простое дыхание",
    note: "Ровный цикл без пауз — им пульсирует активный шаг конвейера",
    animation: "mascot-breathe 1.2s ease-in-out infinite",
    where: "MascotScene, активный шаг",
    loop: true,
  },
];

const SCENES: { scene: Scene; title: string; note: string }[] = [
  { scene: "listening", title: "Слушаю", note: "Лицо и эквалайзер голоса под ним (eq-idle плюс уровень микрофона)" },
  { scene: "saving", title: "Сохраняю", note: "Лицо и полоска этапов" },
  { scene: "transcribing", title: "Распознаю", note: "Лицо и полоска этапов" },
  { scene: "parsing", title: "Разбираю", note: "Лицо и полоска этапов" },
  { scene: "sending", title: "Отправляю", note: "Бросок и карточка, улетающая в такт mascot-throw (fly-card)" },
];

const SIZES = [32, 64, 96, 128];

const BACKGROUNDS = [
  { key: "surface", label: "Карточка", css: "var(--surface)" },
  { key: "bg", label: "Фон", css: "var(--bg)" },
  {
    key: "grid",
    label: "Сетка",
    css: "repeating-linear-gradient(0deg, var(--border) 0 1px, transparent 1px 16px), repeating-linear-gradient(90deg, var(--border) 0 1px, transparent 1px 16px), var(--bg)",
  },
] as const;

type BackgroundKey = (typeof BACKGROUNDS)[number]["key"];

function Chip({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="min-h-[36px] rounded-[12px] border px-3 text-[13px] leading-4 transition-colors duration-[120ms]"
      style={{
        borderColor: active ? "var(--accent)" : "var(--border)",
        background: active ? "color-mix(in srgb, var(--accent) 16%, transparent)" : "var(--surface-2)",
        color: active ? "var(--text)" : "var(--text-muted)",
      }}
    >
      {children}
    </button>
  );
}

/** One stage: the demo sits in the middle — a state's props draw outside the 64-box. */
function Stage({ height, background, children }: { height: number; background: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center rounded-[12px] border border-border" style={{ height, background }}>
      {children}
    </div>
  );
}

function Caption({ title, note, keys }: { title: string; note: string; keys?: string }) {
  return (
    <>
      <p className="mt-3 text-[15px] font-semibold leading-5">{title}</p>
      <p className="mt-1 text-[13px] leading-4 text-muted">{note}</p>
      {keys ? <p className="mt-2 break-words font-mono text-[11px] leading-4 text-muted opacity-70">{keys}</p> : null}
    </>
  );
}

export function MascotGallery() {
  const [size, setSize] = useState(96);
  const [background, setBackground] = useState<BackgroundKey>("surface");
  const [paused, setPaused] = useState(false);
  const [level, setLevel] = useState(0);
  const [auto, setAuto] = useState(true);
  // remounting a demo restarts its one-shot pose (lean, tilt-read, startle) and the gestures
  const [runKey, setRunKey] = useState(0);
  const [replays, setReplays] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!auto) return;
    let frame = 0;
    const id = setInterval(() => {
      frame += 1;
      setLevel(Math.abs(Math.sin(frame / 5)) * 0.9);
    }, 80);
    return () => clearInterval(id);
  }, [auto]);

  const replay = (key: string) => setReplays((current) => ({ ...current, [key]: (current[key] ?? 0) + 1 }));
  const stageBg = BACKGROUNDS.find((item) => item.key === background)!.css;
  const stageHeight = Math.round(size * 1.5 + 48);

  return (
    <div className={paused ? "lab-paused" : undefined}>
      {/* pause holds every keyframe where it is — the only way to read a single frame */}
      <style>{".lab-paused, .lab-paused *, .lab-paused *::before, .lab-paused *::after { animation-play-state: paused !important; }"}</style>

      {/* the bench stays reachable while scrolling, so it is kept to three tight rows */}
      <div className="sticky top-0 z-10 bg-bg pb-2">
        <section className="card p-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[13px] leading-4 text-muted">Размер</span>
              {SIZES.map((value) => (
                <Chip key={value} active={size === value} onClick={() => setSize(value)}>
                  <span className="nums">{value}</span>
                </Chip>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[13px] leading-4 text-muted">Фон</span>
              {BACKGROUNDS.map((item) => (
                <Chip key={item.key} active={background === item.key} onClick={() => setBackground(item.key)}>
                  {item.label}
                </Chip>
              ))}
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Chip active={paused} onClick={() => setPaused((value) => !value)}>
              {paused ? "Продолжить" : "Пауза"}
            </Chip>
            <Chip active={false} onClick={() => setRunKey((value) => value + 1)}>
              Переиграть всё
            </Chip>
            <Chip active={auto} onClick={() => setAuto((value) => !value)}>
              Автоуровень
            </Chip>
            <label className="flex min-w-[150px] flex-1 items-center gap-2 text-[13px] leading-4 text-muted">
              Голос
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={level}
                onChange={(event) => {
                  setAuto(false);
                  setLevel(Number(event.target.value));
                }}
                className="min-h-[36px] min-w-0 flex-1 accent-accent"
              />
              <span className="nums w-9 text-right text-text">{level.toFixed(2)}</span>
            </label>
          </div>
        </section>
      </div>

      <section className="mt-5">
        <h2 className="text-[19px] font-semibold leading-6">Состояния лица</h2>
        <p className="mt-1 text-[13px] leading-4 text-muted">
          Все {STATES.length} состояний компонента Mascot. Тап по лицу — проиграть входную позу заново.
        </p>
        <div className="mt-3 flex flex-col gap-4">
          {STATES.map((entry) => (
            <div key={entry.state} className="card p-4">
              <Stage height={stageHeight} background={stageBg}>
                <button type="button" aria-label={`Переиграть: ${entry.title}`} onClick={() => replay(entry.state)}>
                  <Mascot
                    key={`${entry.state}-${runKey}-${replays[entry.state] ?? 0}`}
                    state={entry.state}
                    size={size}
                    level={entry.state === "listening" ? level : 0}
                  />
                </button>
              </Stage>
              <Caption title={entry.title} note={entry.note} keys={entry.keys} />
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-[19px] font-semibold leading-6">Жесты над лицом</h2>
        <p className="mt-1 text-[13px] leading-4 text-muted">
          Анимации, которые экраны вешают на обёртку вокруг маскота, а не на его состояние.
        </p>
        <div className="mt-3 flex flex-col gap-4">
          {GESTURES.map((gesture) => (
            <div key={gesture.key} className="card p-4">
              <Stage height={stageHeight} background={stageBg}>
                <button type="button" aria-label={`Играть: ${gesture.title}`} onClick={() => replay(gesture.key)}>
                  <span
                    key={`${gesture.key}-${runKey}-${replays[gesture.key] ?? 0}`}
                    className="block"
                    style={{ animation: gesture.animation }}
                  >
                    <Mascot state="calm" size={size} />
                  </span>
                </button>
              </Stage>
              <Caption
                title={gesture.title}
                note={gesture.loop ? gesture.note : `${gesture.note}. Тап по лицу — проиграть`}
                keys={`${gesture.animation} · ${gesture.where}`}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-[19px] font-semibold leading-6">Сцены конвейера</h2>
        <p className="mt-1 text-[13px] leading-4 text-muted">
          MascotScene: лицо плюс то, что живёт вне капли — эквалайзер, полоска этапов, улетающая карточка. Размер лица здесь свой, 112.
        </p>
        <div className="mt-3 flex flex-col gap-4">
          {SCENES.map((entry) => (
            <div key={entry.scene} className="card p-4">
              <Stage height={280} background={stageBg}>
                <MascotScene key={`${entry.scene}-${runKey}`} scene={entry.scene} level={entry.scene === "listening" ? level : 0} />
              </Stage>
              <Caption title={entry.title} note={entry.note} keys={entry.scene} />
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-[19px] font-semibold leading-6">Мелкие размеры</h2>
        <p className="mt-1 text-[13px] leading-4 text-muted">
          24 / 32 / 44 — аватарные размеры: читаются ли глаза и не превращается ли реквизит в шум.
        </p>
        <div className="card mt-3 flex flex-col gap-4 p-5">
          {[24, 32, 44].map((value) => (
            <div key={value} className="flex items-center gap-5">
              <span className="nums w-10 text-[12px] leading-4 text-muted">{value}px</span>
              <div className="flex items-end gap-5">
                <Mascot key={`calm-${value}-${runKey}`} state="calm" size={value} />
                <Mascot key={`happy-${value}-${runKey}`} state="happy" size={value} />
                <Mascot key={`thinking-${value}-${runKey}`} state="thinking" size={value} />
                <Mascot key={`sleeping-${value}-${runKey}`} state="sleeping" size={value} />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
