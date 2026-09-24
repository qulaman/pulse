"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { Mascot, type MascotState } from "@/components/brand/Mascot";
import { CrewCircle, IdleCircle } from "@/components/pulse/CrewCircle";
import { IdleScene } from "@/components/pulse/IdleScene";
import { lookOf, type CrewTask } from "@/lib/idle/look";
import { initialsOf, type Member, type Pick } from "@/lib/idle/people";
import { rng } from "@/lib/idle/random";
import type { TaskStatus } from "@/lib/tasks/status-text";

import { build } from "../tasks/fixtures";

const NAMES = [
  "Асхат Нурланов", "Динара Касымова", "Марат Оспанов", "Айгуль Сейтказиева", "Ерлан Бекмуханов", "Дана Жумабаева",
  "Нурлан Абенов", "Жанар Искакова", "Серик Тулегенов", "Алия Мусина", "Бауыржан Сагинтаев", "Гульнара Омарова",
  "Руслан Ким", "Сауле Байжанова", "Тимур Ахметов", "Мадина Ерланова", "Данияр Кенжебеков", "Асель Нургалиева",
  "Ержан Смагулов", "Камила Рахимова", "Арман Жолдасов", "Лаура Сарсенова", "Санжар Альжанов", "Айжан Токтарова",
  "Азамат Кожахметов", "Инна Петренко", "Олжас Бейсенов", "Карина Ли", "Бекзат Муратов", "Меруерт Аманова",
  "Дмитрий Орлов", "Анна Соколова", "Игорь Ткаченко", "Елена Ким", "Кайрат Садыков", "Салтанат Есенова",
  "Жандос Калиев", "Томирис Абдрахманова", "Максат Уразов", "Ботагоз Жакупова", "Нуржан Тасмагамбетов", "Акмарал Серикова",
  "Галым Исабеков", "Жулдыз Ахметжанова", "Талгат Бейсембаев", "Динмухамед Ержанов", "Айдана Сулейменова", "Ринат Галиев",
  "Зарина Абишева", "Бахыт Нуржанов", "Амина Каримова", "Ильяс Жунусов",
];
const QUESTIONS = ["Какой адрес склада?", "Сколько штук брать?", "До обеда успеть?", "Кому отдать документы?"];
const REASONS = ["занят срочным", "нет машины", "не моя зона"];
/** How long an accepted task stays on the board's cache here — a real board keeps it until the next fetch. */
const DONE_MS = 2_500;

type Pool = { fx: string; title: string }[];

/** The open tasks of the task sandboxes: a row in a card opens that very screen. */
function poolOf(): Pool {
  return build()
    .tasks.filter((t) => ["sent", "accepted", "rework", "pending_review", "declined"].includes(t.status))
    .map((t) => ({ fx: t.id, title: t.title }));
}

function taskOf(pool: Pool, index: number, status: TaskStatus, taken: CrewTask[], serial: number, patch: Partial<CrewTask> = {}): CrewTask {
  const free = pool.filter((p) => !taken.some((t) => t.href.includes(`id=${p.fx}&`)));
  const from = free.length ? free : pool;
  const fixture = from[index % from.length]!;
  return {
    id: `${fixture.fx}-${serial}`,
    title: fixture.title,
    status,
    overdue: false,
    question: null,
    unread: false,
    reason: null,
    href: `/dev/task?id=${fixture.fx}&role=director`,
    ...patch,
  };
}

/** A made-up company: the same one every time, so two screenshots can be compared. */
function teamOf(count: number, pool: Pool): Member[] {
  const random = rng(20260924);
  let serial = 0;
  return NAMES.slice(0, count).map((fullName, i) => {
    const tasks: CrewTask[] = [];
    if (random() < 0.5) {
      const many = random() < 0.3 ? 2 + Math.floor(random() * 2) : 1;
      for (let k = 0; k < many; k += 1) {
        const r = random();
        const status: TaskStatus = r < 0.55 ? "accepted" : r < 0.7 ? "sent" : r < 0.83 ? "pending_review" : r < 0.92 ? "rework" : "declined";
        const extra = random();
        tasks.push(
          taskOf(pool, Math.floor(random() * 100), status, tasks, (serial += 1), {
            overdue: status === "accepted" && extra < 0.12,
            question: status !== "declined" && extra > 0.9 ? QUESTIONS[k % QUESTIONS.length]! : null,
            unread: status !== "declined" && extra > 0.78 && extra <= 0.9,
            reason: status === "declined" ? REASONS[k % REASONS.length]! : null,
          }),
        );
      }
    }
    return { id: `p-${String(i + 1).padStart(2, "0")}`, fullName, alias: null, tasks };
  });
}

/** The face's look at a point, px from its middle: mostly sideways and down, never so far up the pupils leave the eye (D-84). */
function lookAt(x: number, y: number): { x: number; y: number } {
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: Math.max(-0.6, y / length) };
}

const anyOf = <T,>(items: T[]): T | undefined => items[Math.floor(Math.random() * items.length)];
const inWork = (t: CrewTask) => t.status === "accepted" || t.status === "rework";

/**
 * The waiting screen's team (D-118) on a made-up company: the very scene Пульс draws —
 * `IdleScene` with its dreams and the circles — with a remote for what happens to the tasks.
 */
export function TeamSandbox({ initialCount, initialAuto }: { initialCount: 8 | 20 | 52; initialAuto: boolean }) {
  const pool = useMemo(() => poolOf(), []);
  const [count, setCount] = useState<8 | 20 | 52>(initialCount);
  const [people, setPeople] = useState<Member[]>(() => teamOf(initialCount, pool));
  const [picked, setPicked] = useState<Pick | null>(null);
  const [looking, setLooking] = useState<Pick | null>(null);
  const [still, setStill] = useState(false);
  const [auto, setAuto] = useState(initialAuto);
  const [shelf, setShelf] = useState(false);
  const serial = useRef(1000);

  const reset = (next: 8 | 20 | 52) => {
    setCount(next);
    setPeople(teamOf(next, pool));
    setPicked(null);
    setLooking(null);
  };

  // ---- what happens to the tasks: the director's and the employees' moves, one at a time ----
  // The move is chosen once, out here, from the latest team; the state update itself is pure —
  // a random pick inside it is run twice in dev (StrictMode) and the two picks disagree.
  const latest = useRef(people);
  useLayoutEffect(() => {
    latest.current = people;
  });
  const update = useCallback(
    (personId: string, change: (tasks: CrewTask[]) => CrewTask[]) => setPeople((list) => list.map((p) => (p.id === personId ? { ...p, tasks: change(p.tasks) } : p))),
    [],
  );
  const edit = useCallback(
    (match: (t: CrewTask) => boolean, change: (t: CrewTask) => CrewTask | null): string | null => {
      const hit = anyOf(latest.current.flatMap((p) => p.tasks.filter(match).map((t) => ({ p, t }))));
      if (!hit) return null;
      const next = change(hit.t);
      update(hit.p.id, (tasks) => (next ? tasks.map((t) => (t.id === hit.t.id ? next : t)) : tasks.filter((t) => t.id !== hit.t.id)));
      return hit.t.id;
    },
    [update],
  );
  const give = useCallback(
    (id?: string) => {
      const list = latest.current;
      const target = id ? list.find((p) => p.id === id) : (anyOf(list.filter((p) => !lookOf(p.tasks).busy)) ?? anyOf(list));
      if (!target) return;
      const task = taskOf(pool, Math.floor(Math.random() * 100), "sent", target.tasks, (serial.current += 1));
      update(target.id, (tasks) => [...tasks, task]);
    },
    [pool, update],
  );
  const events = useMemo(
    () => ({
      give: () => give(),
      accept: () => edit((t) => t.status === "sent", (t) => ({ ...t, status: "accepted" })),
      ask: () => edit((t) => (inWork(t) || t.status === "sent") && !t.question, (t) => ({ ...t, question: anyOf(QUESTIONS)! })),
      message: () => edit((t) => t.status !== "declined" && t.status !== "done" && !t.unread, (t) => ({ ...t, unread: true })),
      answer: () => edit((t) => Boolean(t.question) || t.unread, (t) => ({ ...t, question: null, unread: false })),
      decline: () => edit((t) => t.status === "sent" || t.status === "accepted", (t) => ({ ...t, status: "declined", reason: anyOf(REASONS)!, question: null })),
      overdue: () => edit((t) => inWork(t) && !t.overdue, (t) => ({ ...t, overdue: true })),
      handIn: () => edit(inWork, (t) => ({ ...t, status: "pending_review", question: null })),
      rework: () => edit((t) => t.status === "pending_review", (t) => ({ ...t, status: "rework", overdue: false })),
      // accepted: the row turns `done` on the board and leaves it with the next fetch
      approve: () => {
        const doneId = edit((t) => t.status === "pending_review", (t) => ({ ...t, status: "done" }));
        if (doneId) setTimeout(() => edit((t) => t.id === doneId, () => null), DONE_MS);
      },
      // a refusal settled by the director: «Отменить»
      settle: () => edit((t) => t.status === "declined", () => null),
    }),
    [give, edit],
  );

  // ---- a company living on its own: a move every couple of seconds ---------------------------
  useEffect(() => {
    if (!auto) return;
    const timer = setInterval(() => {
      const r = Math.random();
      if (r < 0.22) events.give();
      else if (r < 0.4) events.accept();
      else if (r < 0.48) events.message();
      else if (r < 0.54) events.ask();
      else if (r < 0.62) events.answer();
      else if (r < 0.66) events.decline();
      else if (r < 0.7) events.settle();
      else if (r < 0.84) events.handIn();
      else events.approve();
    }, 2_200);
    return () => clearInterval(timer);
  }, [auto, events]);

  // the picked one got his task and flew off: nobody is picked any more
  const pickedPerson = picked ? people.find((p) => p.id === picked.id && !lookOf(p.tasks).busy) : null;
  const target = pickedPerson ? picked : looking;
  const face: MascotState = target ? "calm" : "sleeping";
  const busyCount = people.filter((p) => lookOf(p.tasks.filter((t) => t.status !== "done")).busy).length;
  const team = useMemo(() => ({ members: people, allHref: () => "/dev/tasks?role=director" }), [people]);

  return (
    <div className="mx-auto flex h-dvh w-full max-w-[440px] flex-col bg-bg sm:border-x sm:border-border">
      <header className="shrink-0 border-b border-border px-3 pb-2 pt-2">
        <div className="flex items-baseline justify-between">
          <p className="font-display text-[15px] font-semibold leading-5">Команда · песочница</p>
          <p className="text-[12px] leading-4 text-muted">
            {busyCount} в работе · {people.length - busyCount} свободны
          </p>
        </div>
        <Chips>
          {([8, 20, 52] as const).map((n) => (
            <Chip key={n} on={count === n} onClick={() => reset(n)}>
              {n} чел.
            </Chip>
          ))}
          <Chip on={auto} onClick={() => setAuto((v) => !v)}>
            Жизнь сама
          </Chip>
          <Chip on={shelf} onClick={() => setShelf((v) => !v)}>
            Витрина
          </Chip>
          <Chip on={still} onClick={() => setStill((v) => !v)}>
            Без движения
          </Chip>
        </Chips>
        <Chips>
          <Chip onClick={events.give}>+ Дать задачу</Chip>
          <Chip onClick={events.accept}>Принял</Chip>
          <Chip onClick={events.ask}>Вопрос</Chip>
          <Chip onClick={events.message}>Сообщение</Chip>
          <Chip onClick={events.answer}>Ответил</Chip>
          <Chip onClick={events.decline}>Не могу</Chip>
          <Chip onClick={events.settle}>Отменить отказ</Chip>
          <Chip onClick={events.overdue}>Просрочка</Chip>
          <Chip onClick={events.handIn}>Сдал</Chip>
          <Chip onClick={events.rework}>На доработку</Chip>
          <Chip onClick={events.approve}>Принять работу</Chip>
        </Chips>
      </header>

      <main className="relative min-h-0 flex-1 overflow-hidden" data-still={still ? "" : undefined}>
        <div data-dream-area className="relative flex h-full w-full items-center justify-center">
          <IdleScene active quiet={!target} team={team} picked={pickedPerson ? pickedPerson.id : null} onPick={setPicked} onLook={setLooking} />
          <div className="relative z-10">
            <Mascot state={face} size={128} gaze={target ? lookAt(target.x, target.y) : null} />
          </div>

          {/* D-84, as a stand-in: on the real screen this is the card with «Записать» */}
          {pickedPerson && picked ? (
            <div className="absolute left-1/2 z-30 -translate-x-1/2" style={{ bottom: "calc(50% + 76px)" }}>
              <div className="flex items-center gap-2 rounded-[18px] border border-border bg-surface py-2 pl-3 pr-2" style={{ boxShadow: "var(--shadow-raised)", animation: "crew-card 220ms var(--ease-out) both" }}>
                <p className="whitespace-nowrap font-display text-[15px] font-semibold leading-5">{picked.name}</p>
                <button
                  type="button"
                  className="btn-primary !min-h-[36px] whitespace-nowrap !px-3.5 !text-[14px]"
                  onClick={() => {
                    give(picked.id);
                    setPicked(null);
                  }}
                >
                  Дать задачу
                </button>
                <button type="button" aria-label="Снять выбор" className="flex h-8 w-8 items-center justify-center rounded-full text-[18px] text-muted" onClick={() => setPicked(null)}>
                  ×
                </button>
              </div>
              <p className="mt-1 whitespace-nowrap text-center text-[11px] leading-4 text-muted">на Пульсе здесь запись голосом (D-84)</p>
            </div>
          ) : null}
        </div>

        {shelf ? <Shelf onClose={() => setShelf(false)} /> : null}
      </main>
    </div>
  );
}

function Chips({ children }: { children: React.ReactNode }) {
  return <div className="no-bar mt-1.5 flex gap-1.5 overflow-x-auto">{children}</div>;
}

function Chip({ on = false, onClick, children }: { on?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-[13px] font-semibold leading-4"
      style={{
        borderColor: on ? "color-mix(in srgb, var(--accent) 60%, var(--border))" : "var(--border)",
        background: on ? "color-mix(in srgb, var(--accent) 12%, transparent)" : "var(--surface)",
        color: on ? "var(--text)" : "var(--text-muted)",
      }}
    >
      {children}
    </button>
  );
}

const sample = (status: TaskStatus, patch: Partial<CrewTask> = {}, id = "s"): CrewTask => ({
  id,
  title: "",
  status,
  overdue: false,
  question: null,
  unread: false,
  reason: null,
  href: "#",
  ...patch,
});

/** Every state of a circle side by side: to judge the drawing, not the story. */
const STATES: { caption: string; tasks: CrewTask[] }[] = [
  { caption: "Свободен", tasks: [] },
  { caption: "Выдана, не принял", tasks: [sample("sent")] },
  { caption: "В работе", tasks: [sample("accepted")] },
  { caption: "Две в работе", tasks: [sample("accepted", {}, "a"), sample("accepted", {}, "b")] },
  { caption: "Три в работе", tasks: [sample("accepted", {}, "a"), sample("accepted", {}, "b"), sample("accepted", {}, "c")] },
  { caption: "На доработке", tasks: [sample("rework")] },
  { caption: "Просрочена", tasks: [sample("accepted", { overdue: true })] },
  { caption: "Сдал, ждёт приёмки", tasks: [sample("pending_review")] },
  { caption: "Отказ", tasks: [sample("declined", { reason: "занят" })] },
  { caption: "Вопрос", tasks: [sample("accepted", { question: "?" })] },
  { caption: "Новое сообщение", tasks: [sample("accepted", { unread: true })] },
  { caption: "Принято (на миг)", tasks: [sample("done")] },
];

function Shelf({ onClose }: { onClose: () => void }) {
  const size = 44;
  return (
    <div className="absolute inset-0 z-40 overflow-y-auto bg-bg/95 px-4 pb-6 pt-4" onClick={onClose} data-testid="crew-shelf">
      <p className="mb-4 text-[12px] leading-4 text-muted">Все состояния кружка. Тап — закрыть.</p>
      <div className="grid grid-cols-3 gap-x-2 gap-y-6">
        {STATES.map((state, i) => {
          const look = lookOf(state.tasks);
          const initials = initialsOf(NAMES[i]!);
          return (
            <div key={state.caption} className="flex flex-col items-center gap-2.5">
              <span className="flex items-center justify-center" style={{ width: size + 20, height: size + 20 }}>
                {look.busy ? <CrewCircle id={`shelf-${i}`} initials={initials} size={size} look={look} /> : <IdleCircle id={`shelf-${i}`} initials={initials} size={size} />}
              </span>
              <span className="text-center text-[12px] leading-4 text-muted">{state.caption}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
