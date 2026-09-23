"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import { ACT_MS, Mascot, type MascotAct, type MascotState } from "@/components/brand/Mascot";

type Carry = { count: number; hot?: boolean };
type Cell = { caption: string; state: MascotState; act?: MascotAct; carry?: Carry };

/** What the face holds at rest (D-110) — the barometer of the employee's hands. */
const REST: Cell[] = [
  { caption: "Руки пусты — спит", state: "sleeping" },
  { caption: "Одно дело в работе", state: "working", carry: { count: 1 } },
  { caption: "Пять дел в работе", state: "working", carry: { count: 5 } },
  { caption: "Новое или доработка — зовёт", state: "calling", carry: { count: 1 } },
  { caption: "Срок горит", state: "panicking", carry: { count: 2, hot: true } },
  { caption: "Не прочитано слово директора", state: "nervous", carry: { count: 1 } },
  { caption: "Всё сдано — ждёт приёмки", state: "awaiting" },
  { caption: "Проснулся, дел нет — рад", state: "happy" },
];

/** What happens to an order, and the face's answer to it (D-110). */
const EVENTS: Cell[] = [
  { caption: "Новая задача — ловит", state: "calling", act: "catch" },
  { caption: "Директор настаивает", state: "calling", act: "insist" },
  { caption: "Принял — «есть!»", state: "working", act: "nod", carry: { count: 1 } },
  { caption: "Уточнить — рука вверх", state: "calling", act: "raise" },
  { caption: "Не могу — «эх»", state: "happy", act: "shrug" },
  { caption: "Отозвали", state: "happy", act: "poof" },
  { caption: "Сдал — к директору", state: "awaiting", act: "handover" },
  { caption: "Директор принял — медаль", state: "happy", act: "medal" },
  { caption: "На доработку", state: "calling", act: "boomerang" },
  { caption: "Срок отодвинули — «фух»", state: "working", act: "relief", carry: { count: 1 } },
  { caption: "Пишет директор", state: "nervous", act: "letter", carry: { count: 1 } },
  { caption: "Прочитал", state: "working", act: "read", carry: { count: 1 } },
  { caption: "Объявление в Эфире", state: "happy", act: "listen" },
  { caption: "Ознакомился", state: "tuned", act: "thumb" },
  { caption: "Встреча скоро — часы", state: "working", act: "watch", carry: { count: 2 } },
  { caption: "Пришли очки", state: "happy", act: "coin" },
];

/** The acts of a busy face at rest, and the job of each open ball. */
const IDLE: Cell[] = [
  { caption: "С делами: часы", state: "working", act: "watch", carry: { count: 2 } },
  { caption: "С делами: вытирает лоб", state: "working", act: "wipe", carry: { count: 2 } },
  { caption: "С делами: перебирает", state: "working", act: "shuffle", carry: { count: 3 } },
  { caption: "Ждёт: выглядывает", state: "awaiting", act: "peek" },
  { caption: "Шарик «Дела»", state: "checking" },
  { caption: "Шарик «Сообщения»", state: "chatting" },
  { caption: "Шарик «Эфир» — слушает", state: "tuned" },
  { caption: "Шарик «Календарь»", state: "scheduling" },
];

/** A task's whole life on the employee's face, one step after another. */
const STORY: (Cell & { ms: number })[] = [
  { caption: "Дел нет — спит", state: "sleeping", ms: 3000 },
  { caption: "Директор дал задачу — ловит карточку", state: "calling", act: "catch", ms: 2200 },
  { caption: "Зовёт: «обрати внимание!»", state: "calling", ms: 2400 },
  { caption: "«Принял» — «есть!», карточка в стопку", state: "working", act: "nod", carry: { count: 1 }, ms: 1900 },
  { caption: "Работает: дело в руках", state: "working", act: "shuffle", carry: { count: 1 }, ms: 2600 },
  { caption: "«Уточнить» — поднял руку", state: "working", act: "raise", carry: { count: 1 }, ms: 2300 },
  { caption: "Директор ответил", state: "nervous", act: "letter", carry: { count: 1 }, ms: 2300 },
  { caption: "«Прочитал»", state: "working", act: "read", carry: { count: 1 }, ms: 1900 },
  { caption: "Срок через 40 минут", state: "panicking", carry: { count: 1, hot: true }, ms: 2600 },
  { caption: "Директор продлил срок — «фух»", state: "working", act: "relief", carry: { count: 1 }, ms: 2300 },
  { caption: "«Сдать» — карточка к директору", state: "awaiting", act: "handover", ms: 1800 },
  { caption: "Ждёт приёмки", state: "awaiting", ms: 3000 },
  { caption: "Вернули на доработку", state: "calling", act: "boomerang", ms: 2700 },
  { caption: "Сдал ещё раз", state: "awaiting", act: "handover", ms: 1800 },
  { caption: "Директор принял — медаль", state: "happy", act: "medal", ms: 2600 },
  { caption: "С очками: прыжок с конфетти", state: "celebrating", ms: 1900 },
  { caption: "Пришли очки: +5", state: "happy", act: "coin", ms: 2200 },
];

/**
 * One act on repeat: it plays, the face rests a beat, it plays again. `?still` keeps every act
 * on from the first frame, so a script can pause the page and seek it for contact sheets.
 */
function Repeat({ cell, size }: { cell: Cell; size: number }) {
  const [on, setOn] = useState(true);
  useEffect(() => {
    if (!cell.act || window.location.search.includes("still")) return;
    let timer: ReturnType<typeof setTimeout>;
    const flip = (value: boolean) => {
      timer = setTimeout(() => {
        setOn(value);
        flip(!value);
      }, value ? 900 : ACT_MS[cell.act!]);
    };
    flip(false);
    return () => clearTimeout(timer);
  }, [cell.act]);
  return <Mascot state={cell.state} size={size} act={cell.act && on ? cell.act : null} carry={cell.carry ?? null} />;
}

function Story() {
  const [step, setStep] = useState(0);
  const [run, setRun] = useState(0);
  const current = STORY[step]!;
  useEffect(() => {
    const timer = setTimeout(() => setStep((index) => (index + 1) % STORY.length), current.ms);
    return () => clearTimeout(timer);
  }, [step, run, current.ms]);
  return (
    <div className="flex flex-col items-center gap-3 rounded-[20px] border border-border bg-surface/40 px-4 pb-4 pt-14" data-testid="employee-story" data-step={step}>
      <div className="flex h-[168px] items-center justify-center">
        {/* a new key per step: the act and the pose of each step start from their first frame */}
        <Mascot key={`${run}-${step}`} state={current.state} size={128} act={current.act ?? null} carry={current.carry ?? null} />
      </div>
      <p className="text-center text-[15px] font-medium leading-5">
        <span className="nums mr-2 text-muted">
          {step + 1}/{STORY.length}
        </span>
        {current.caption}
      </p>
      <button
        type="button"
        className="min-h-[40px] rounded-full border border-border px-4 text-[14px] font-semibold"
        onClick={() => {
          setStep(0);
          setRun((value) => value + 1);
        }}
      >
        С начала
      </button>
    </div>
  );
}

function Grid({ title, cells }: { title: string; cells: Cell[] }) {
  return (
    <section className="mt-6">
      <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">{title}</h2>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-4" data-testid="employee-grid">
        {cells.map((cell) => (
          <figure
            key={cell.caption}
            className="flex flex-col items-center gap-2 overflow-hidden rounded-[20px] border border-border bg-surface/40 px-2 pb-3 pt-12"
            data-cell={cell.act ?? cell.state}
          >
            <div className="flex h-[124px] w-full items-center justify-center">
              <Repeat cell={cell} size={96} />
            </div>
            <figcaption className="text-center text-[13px] leading-4 text-muted">{cell.caption}</figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

/**
 * /dev/employee — the employee's face carrying the work (dev only, D-110). `?one` — the story
 * alone: one face going through every act, the way a phone draws it, for a frame budget.
 */
export default function EmployeeSandboxPage() {
  // read after hydration (the server sees the whole page), so the two never disagree
  const one = useSyncExternalStore(
    () => () => {},
    () => window.location.search.includes("one"),
    () => false,
  );
  if (one) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6">
        <Story />
      </main>
    );
  }
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6">
      <h1 className="text-[24px] font-bold leading-[30px]">Маскот сотрудника</h1>
      <p className="mt-1 text-[13px] leading-4 text-muted">Лицо несёт работу: что в руках, что случилось с делом, сценки занятого лица (D-110)</p>
      <section className="mt-6">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">Жизнь задачи</h2>
        <div className="mt-2">
          <Story />
        </div>
      </section>
      <Grid title="Покой: что в руках" cells={REST} />
      <Grid title="Что случилось с делом" cells={EVENTS} />
      <Grid title="Сценки с делами и шарики" cells={IDLE} />
    </main>
  );
}
