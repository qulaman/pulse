"use client";

import { motion, useInView } from "framer-motion";
import { useEffect, useRef, useState } from "react";

import { Mascot, type MascotState } from "@/components/brand/Mascot";

import { MiniCard, type CardKind, type Mark } from "./parts";
import styles from "./pitch.module.css";

/**
 * The voice pipeline in slow motion (docs/CONCEPT.md §4): one phrase of the director goes
 * through listening, the safe, speech-to-text, the parse, the throw and the receipts, and the
 * real face plays every stage the way it does on Пульс. A scripted replay, not a live call —
 * it runs while it is on screen, loops, and can be paused or jumped to a step.
 */

type Entity = {
  kind: CardKind;
  who: string;
  badge?: string;
  title: string;
  when: string | null;
  /** the receipt line after the throw: sent, then seen, then taken */
  sent: Mark;
  seen: Mark;
  took: Mark;
};

type Scenario = {
  key: "ru" | "kz";
  label: string;
  phrase: string;
  /** words of the phrase that are people — lit once speech is recognised */
  names: string[];
  heard: string;
  parse: string;
  thrown: string;
  /** the face's line once everyone has answered */
  answered: string;
  entities: Entity[];
};

const task = (who: string, title: string, when: string | null, seen: string, took: string): Entity => ({
  kind: "task",
  who,
  title,
  when,
  sent: { tone: "muted", text: "отправлено 9:12" },
  seen: { tone: "accent", text: `увидел ${seen}` },
  took: { tone: "ok", text: `принял ${took}` },
});

const SCENARIOS: Scenario[] = [
  {
    key: "ru",
    label: "По-русски",
    phrase:
      "Марат, до пятницы коммерческое предложение по объекту на Абая. Айгуль, завтра до обеда созвонись с банком. Всем: в субботу субботник в девять. И напомни мне в пять позвонить юристу.",
    names: ["Марат", "Айгуль", "Всем", "мне"],
    heard: "Понял так: 2 задачи, объявление и напоминание",
    parse: "Разбираю поток на отдельные дела: кто, что и к какому сроку. «До обеда» — это 13:00, «до пятницы» — пятница, 18:00.",
    thrown: "Отправил Марату, Айгуль и всем",
    answered: "Все приняли и ознакомились",
    entities: [
      task("Марат", "Коммерческое предложение по объекту на Абая", "пт, 18:00", "9:14", "9:15"),
      task("Айгуль", "Созвониться с банком", "завтра, 13:00", "9:13", "9:16"),
      {
        kind: "announcement",
        who: "Всем",
        badge: "все",
        title: "В субботу субботник в 9:00",
        when: "сб, 9:00",
        sent: { tone: "muted", text: "отправлено всем 9:12" },
        seen: { tone: "accent", text: "прочитали 9 из 16" },
        took: { tone: "ok", text: "ознакомились 16 из 16" },
      },
      {
        kind: "reminder",
        who: "Вам",
        badge: "вы",
        title: "Позвонить юристу",
        when: "сегодня, 17:00",
        sent: { tone: "muted", text: "сохранил" },
        seen: { tone: "muted", text: "напомню в 17:00" },
        took: { tone: "muted", text: "напомню в 17:00" },
      },
    ],
  },
  {
    key: "kz",
    label: "Қазақша + русский",
    // a case of the parser's own evals (fs-07): Kazakh and Russian in one breath, names declined
    phrase: "Сәкенге айт, объект бойынша фотоотчёт жіберсін бүгін кешке. И Маратқа скажи, пусть перезвонит по тендеру.",
    names: ["Сәкенге", "Маратқа"],
    heard: "Понял так: 2 задачи",
    parse: "«Сәкенге», «Маратқа» — падежи не мешают: человека выбираю из списка команды, а не угадываю. «Бүгін кешке» — сегодня, 18:00.",
    thrown: "Отправил Сәкену и Марату",
    answered: "Сәкен и Марат приняли",
    entities: [
      task("Сәкен", "Отправить фотоотчёт по объекту", "сегодня, 18:00", "9:13", "9:15"),
      task("Марат", "Перезвонить по тендеру", null, "9:14", "9:17"),
    ],
  },
];

type StepKey = "listen" | "save" | "hear" | "parse" | "send" | "track";

const STEPS: { key: StepKey; ms: number; label: string; title: string; note: string }[] = [
  {
    key: "listen",
    ms: 5600,
    label: "Слушаю",
    title: "Слушаю",
    note: "Директор зажал лицо на экране и говорит — как утром в кабинете. Можно несколько дел подряд, можно по-казахски, по-русски и вперемешку.",
  },
  {
    key: "save",
    ms: 1500,
    label: "Сейф",
    title: "Прячу в сейф",
    note: "Запись уходит в хранилище раньше, чем её услышит ИИ. Пропала связь или сбой — голосовое цело, повторю.",
  },
  {
    key: "hear",
    ms: 1800,
    label: "Слышу",
    title: "Распознаю речь",
    note: "Модель распознавания заранее знает имена команды, поэтому имена пишутся правильно — и казахские тоже.",
  },
  { key: "parse", ms: 3000, label: "Понимаю", title: "Понимаю", note: "" },
  {
    key: "send",
    ms: 4400,
    label: "Отправляю",
    title: "Тап — и полетело",
    note: "Директор видит, как я понял, и отправляет одним касанием по лицу. Каждый получает своё уведомление на телефон.",
  },
  {
    key: "track",
    ms: 5600,
    label: "Слежу",
    title: "Слежу за ответом",
    note: "Отправлено → увидел → принял. Если человек молчит, директор видит «не открывал с 9:14» — факт, а не догадку.",
  },
];

const STARTS = STEPS.reduce<number[]>((acc, step, i) => [...acc, i === 0 ? 0 : acc[i - 1] + STEPS[i - 1].ms], []);
const REST = 2600;
const TOTAL = STARTS[STEPS.length - 1] + STEPS[STEPS.length - 1].ms + REST;
const TICK = 80;

// inside «send»: the face offers the stack, throws it, and celebrates the landing (D-60, D-82 §4)
const OFFER = 1400;
const THROW = 1200;
// inside «parse»: the first card lands after this, the next ones one by one
const FIRST_CARD = 450;
const CARD_GAP = 520;

function stepAt(t: number): number {
  for (let i = STEPS.length - 1; i >= 0; i--) if (t >= STARTS[i]) return i;
  return 0;
}

function faceOf(key: StepKey, local: number): MascotState {
  switch (key) {
    case "listen":
      return "listening";
    case "save":
      return "saving";
    case "hear":
      return "transcribing";
    case "parse":
      return "parsing";
    case "send":
      return local < OFFER ? "offering" : local < OFFER + THROW ? "sending" : "celebrating";
    case "track":
      return local < 2600 ? "calm" : "happy";
  }
}

/** A voice-like envelope for the face's swell while it listens: syllables riding on phrases. */
function voiceLevel(local: number): number {
  const syllable = Math.abs(Math.sin(local / 150));
  const phrase = 0.55 + 0.45 * Math.sin(local / 700);
  return Math.min(1, 0.18 + 0.7 * syllable * phrase);
}

const bare = (word: string) => word.replace(/[.,:!?]/g, "");

export function VoiceDemo() {
  const [scenarioKey, setScenarioKey] = useState<Scenario["key"]>("ru");
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const inView = useInView(box, { amount: 0.35 });
  const running = inView && !paused;

  useEffect(() => {
    if (!running) return;
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const dt = now - last;
      last = now;
      setElapsed((t) => (t + dt) % TOTAL);
    }, TICK);
    return () => window.clearInterval(id);
  }, [running]);

  const scenario = SCENARIOS.find((s) => s.key === scenarioKey) ?? SCENARIOS[0];
  const index = stepAt(elapsed);
  const step = STEPS[index];
  const local = elapsed - STARTS[index];
  const inRest = elapsed >= STARTS[STEPS.length - 1] + STEPS[STEPS.length - 1].ms;

  const parseStart = STARTS[3];
  const sendStart = STARTS[4];
  const trackStart = STARTS[5];

  const words = scenario.phrase.split(" ");
  const typed =
    step.key === "listen" ? Math.min(words.length, Math.ceil((words.length * local) / (STEPS[0].ms * 0.86))) : words.length;
  const recognised = elapsed >= STARTS[2] + 500;
  const cardsShown = elapsed < parseStart ? 0 : Math.floor((elapsed - parseStart - FIRST_CARD) / CARD_GAP) + 1;
  const heardShown = elapsed >= parseStart + FIRST_CARD + scenario.entities.length * CARD_GAP;
  const thrown = elapsed >= sendStart + OFFER + THROW * 0.45;

  const face = inRest ? "happy" : faceOf(step.key, local);
  const note = step.key === "parse" ? scenario.parse : step.note;

  const markOf = (entity: Entity, i: number): Mark => {
    if (!thrown) return { tone: "muted", text: "ждёт отправки" };
    if (elapsed >= trackStart + 1900 + i * 420) return entity.took;
    if (elapsed >= trackStart + 500 + i * 300) return entity.seen;
    return entity.sent;
  };

  const faceLine =
    step.key === "listen"
      ? `Слушаю… 0:0${Math.min(9, Math.floor(local / 1000))}`
      : step.key === "save"
        ? "Сохраняю"
        : step.key === "hear"
          ? "Распознаю"
          : step.key === "parse"
            ? heardShown
              ? scenario.heard
              : "Разбираю"
            : step.key === "send"
              ? local < OFFER
                ? "Всё верно? Тап — отправлю"
                : scenario.thrown
              : inRest || local >= 1900 + (scenario.entities.length - 1) * 420
                ? scenario.answered
                : "Жду ответа";

  const jump = (i: number) => setElapsed(STARTS[i] + 1);
  const pick = (key: Scenario["key"]) => {
    setScenarioKey(key);
    setElapsed(0);
    setPaused(false);
  };

  return (
    <div ref={box} className="card overflow-hidden p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="radiogroup" aria-label="Язык фразы" className="flex rounded-[12px] border border-border bg-surface-2 p-1">
          {SCENARIOS.map((s) => (
            <button
              key={s.key}
              type="button"
              role="radio"
              aria-checked={s.key === scenarioKey}
              onClick={() => pick(s.key)}
              className="relative h-9 rounded-[9px] px-3 text-[14px] font-medium leading-[18px]"
            >
              {s.key === scenarioKey ? (
                <motion.span
                  layoutId="voice-demo-lang"
                  className="absolute inset-0 rounded-[9px] border border-accent/40 bg-accent/15"
                  transition={{ type: "spring", stiffness: 260, damping: 24 }}
                />
              ) : null}
              <span className={`relative ${s.key === scenarioKey ? "text-text" : "text-muted"}`}>{s.label}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            className="btn-secondary grid size-11 place-items-center rounded-[12px]"
            aria-label={paused ? "Продолжить" : "Пауза"}
          >
            <svg width={18} height={18} viewBox="0 0 24 24" aria-hidden fill="currentColor">
              {paused ? <path d="M7 4.5v15l12-7.5z" /> : <path d="M6.5 4.5h4v15h-4zM13.5 4.5h4v15h-4z" />}
            </svg>
          </button>
          <button
            type="button"
            onClick={() => {
              setElapsed(0);
              setPaused(false);
            }}
            className="btn-secondary grid size-11 place-items-center rounded-[12px]"
            aria-label="Сначала"
          >
            <svg width={18} height={18} viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12a8 8 0 1 0 2.4-5.7M4 4.5v4.5h4.5" />
            </svg>
          </button>
        </div>
      </div>

      {/* the steps: a story bar — done segments full, the current one filling */}
      <div className="mt-4 grid grid-cols-6 gap-1.5">
        {STEPS.map((s, i) => {
          const fill = i < index || inRest ? 1 : i === index ? Math.min(1, local / s.ms) : 0;
          return (
            <button key={s.key} type="button" onClick={() => jump(i)} className="group flex flex-col gap-1.5 pt-2 text-left" aria-label={`Шаг ${i + 1}: ${s.label}`}>
              <span className="block h-[3px] w-full overflow-hidden rounded-full bg-border">
                <span className={`block h-full w-full rounded-full bg-accent ${styles.segFill}`} style={{ transform: `scaleX(${fill})` }} />
              </span>
              {/* on a phone the caption below names the step; the bar is wide enough for words from md up */}
              <span className={`hidden truncate text-[12px] font-semibold leading-4 md:block ${i === index && !inRest ? "text-accent" : "text-muted"}`}>{s.label}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-2 grid gap-6 md:grid-cols-[1fr_1.1fr] md:gap-8">
        <div>
          {/* the face, with the room its props need above and beside it */}
          <div className="relative grid h-[200px] place-items-center md:h-[230px]">
            <div aria-hidden className="absolute inset-x-[18%] inset-y-[14%] rounded-full" style={{ background: "radial-gradient(closest-side, color-mix(in srgb, var(--accent) 16%, transparent), transparent)" }} />
            <div className="relative translate-y-3">
              <Mascot state={face} size={112} level={step.key === "listen" ? voiceLevel(local) : 0} />
            </div>
          </div>
          <p className="nums h-10 text-balance text-center text-[15px] font-medium leading-5 text-muted">{faceLine}</p>

          <div className="mt-3 min-h-[112px]">
            <motion.div key={`${scenario.key}-${step.key}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: [0.2, 0, 0, 1] }}>
              <p className="font-display text-[22px] font-bold leading-7 tracking-[-0.02em]">
                <span className="nums text-accent">{index + 1}.</span> {step.title}
              </p>
              <p className="mt-1.5 text-[15px] leading-[22px] text-muted">{note}</p>
            </motion.div>
          </div>
        </div>

        <div>
          {/* the phrase: every word is laid out from the start and only lights up, so nothing below moves */}
          <div className="rounded-[14px] border border-border bg-surface-2 p-3">
            <p className="eyebrow flex items-center gap-1.5">
              <span aria-hidden className={`size-1.5 rounded-full ${step.key === "listen" ? "bg-accent" : "bg-muted"}`} />
              Голос директора
            </p>
            <p className="mt-2 text-[16px] leading-[24px]">
              {words.map((word, i) => {
                const lit = recognised && scenario.names.includes(bare(word));
                return (
                  <span
                    key={`${scenario.key}-${i}`}
                    className={`transition-opacity duration-150 ${lit ? "font-semibold text-accent" : ""}`}
                    style={{ opacity: i < typed ? (recognised || step.key !== "listen" ? 1 : 0.85) : 0 }}
                  >
                    {word}{" "}
                  </span>
                );
              })}
            </p>
          </div>

          <div className="mt-3 flex flex-col gap-2 md:min-h-[392px]">
            {scenario.entities.map((entity, i) => {
              const shown = i < cardsShown;
              return (
                <motion.div
                  key={`${scenario.key}-${i}`}
                  initial={false}
                  animate={shown ? { opacity: 1, y: thrown ? [0, -10, 0] : 0, scale: 1 } : { opacity: 0, y: 14, scale: 0.97 }}
                  transition={{ duration: thrown ? 0.5 : 0.35, ease: [0.2, 0, 0, 1], delay: thrown ? i * 0.06 : 0 }}
                >
                  <MiniCard kind={entity.kind} who={entity.who} badge={entity.badge} title={entity.title} when={entity.when} mark={markOf(entity, i)} />
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
