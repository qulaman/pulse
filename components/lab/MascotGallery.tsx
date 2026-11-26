"use client";

import { useEffect, useRef, useState } from "react";

import { ACT_MS, Mascot, type MascotAct, type MascotState } from "@/components/brand/Mascot";
import { MascotScene, type Scene } from "@/components/brand/MascotScene";
import { MiniMark, type MiniState } from "@/components/brand/MiniMark";
import { IdleScene } from "@/components/pulse/IdleScene";
import { tasksOf } from "@/lib/idle/people";

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
  /** the employee's orders in work, held as a stack (D-110) */
  carry?: { count: number; hot?: boolean };
};

const STATES: StateEntry[] = [
  {
    state: "calm",
    title: "Спокоен",
    note: "Пульс: точка бьётся двумя ударами, кольцо вздыхает, от него уходят две волны; зрачок поглядывает по сторонам и моргает, блик иногда обегает кольцо",
    keys: "bk-beat · bk-breath · bk-wave-out · bk-wander · bk-blink · bk-shine-run",
  },
  {
    state: "listening",
    title: "Слушает",
    note: "Кольцо раскрыто на три дуги и медленно идёт по кругу, точка — три черты голоса, вокруг дрожит волнистое кольцо и идёт эхо. Реагирует на уровень микрофона",
    keys: "bk-turn · bk-bars-idle · --mascot-level",
  },
  {
    state: "saving",
    title: "Сохраняю",
    note: "Записка опускается в кольцо и исчезает в нём, кольцо сглатывает, волна идёт внутрь",
    keys: "bk-g-sink · bk-gulp · bk-wave-in",
  },
  {
    state: "transcribing",
    title: "Распознаю",
    note: "Янтарь. Три черты голоса ложатся в три строки и пишутся одна за другой; по потускневшему кольцу бежит комета",
    keys: "bk-type · bk-turn (комета)",
  },
  {
    state: "parsing",
    title: "Разбираю",
    note: "Янтарь. Дуги расходятся и шагают по трети оборота с остановкой, три точки подпрыгивают по очереди",
    keys: "bk-step · bk-hop · bk-think",
  },
  {
    state: "sending",
    title: "Отправляю",
    note: "Точка приседает и улетает вверх, за ней тает след; кольцо отдаёт, расходится сильная волна, вырастает новая точка",
    keys: "bk-launch · bk-ghost · bk-recoil · bk-burst · bk-flash",
  },
  {
    state: "offering",
    title: "Ждёт броска",
    note: "Точка — стрелка вверх: «отправить». Весь знак нажимается сам, как кнопка, и отпускает волну",
    keys: "bk-press · bk-g-up · bk-wave-out",
  },
  {
    state: "thinking",
    title: "Думает",
    note: "Янтарь. Дуги врозь медленно плывут по кругу, три точки по очереди; сияние мерцает",
    keys: "bk-turn · bk-hop · bk-think",
  },
  {
    state: "speaking",
    title: "Говорит",
    note: "Точка бьётся в ритме слов, каждый удар отпускает малую волну; моргает",
    keys: "bk-talk · bk-wave-out · bk-blink",
  },
  {
    state: "happy",
    title: "Доволен",
    note: "Золото. Точка сияет: с каждым ударом из неё выходят короткие лучи и медленно идут по кругу; вокруг три искры",
    keys: "bk-g-sun · bk-g-rays · bk-breath · bk-spark",
  },
  {
    state: "sleeping",
    title: "Спит",
    note: "Приглушённый цвет. Глаз закрыт — ровная черта, дышит вместе со знаком; самый медленный вдох, редкая волна, два «z» уплывают вверх",
    keys: "bk-sleep · bk-g-doze · bk-z · bk-wave-out",
  },
  {
    state: "alert",
    title: "Насторожен",
    note: "Насторожён: знак своего цвета, кольцо держится туго; зрачок обводит взглядом края и поднимается к янтарному огоньку над кольцом",
    keys: "bk-sweep · bk-taut · bk-light",
  },
  {
    state: "calling",
    title: "Зовёт",
    note: "Янтарь. Точка — карточка с «!»; знак подскакивает дважды, как собака у двери, частые волны",
    keys: "bk-call · bk-wave-out",
  },
  {
    state: "processing",
    title: "Обрабатывает",
    note: "Новость из базы: кольцо тускнеет, по нему бежит комета, зрачок следит за ней, волна идёт внутрь",
    keys: "bk-turn (комета) · bk-follow · bk-wave-in · bk-sync-dot",
  },
  {
    state: "nervous",
    title: "Нервничает",
    note: "Янтарь. Точка — конверт непрочитанного слова; кольцо мелко дрожит",
    keys: "bk-tremble",
  },
  {
    state: "panicking",
    title: "Паникует",
    note: "Красный. Точка — часы, стрелки несутся; дуги врозь, знак трясёт, частые волны",
    keys: "bk-shake · bk-turn (стрелки) · bk-wave-out",
    carry: { count: 2, hot: true },
  },
  {
    state: "checking",
    title: "Шарик «Задачи»",
    note: "Шарик «Задачи»: точка — список, галочки появляются по строкам",
    keys: "bk-g-tick · bk-calm",
  },
  {
    state: "chatting",
    title: "Шарик «Сообщения»",
    note: "Шарик «Сообщения»: точка — пузырь, внутри точки набора по очереди",
    keys: "bk-g-dot · bk-calm",
  },
  {
    state: "announcing",
    title: "Шарик «Эфир»",
    note: "Шарик «Эфир»: точка — мегафон, слова уходят из него дугами; кольцо качает, частые волны наружу",
    keys: "bk-g-arc · bk-pump · bk-wave-out",
  },
  {
    state: "scheduling",
    title: "Шарик «Календарь»",
    note: "Шарик «Календарь»: точка — отрывной календарь, день отрывается и падает",
    keys: "bk-g-page · bk-calm",
  },
  {
    state: "serving",
    title: "Шарик «Секретарь»",
    note: "Просьба секретарю: точка — чашка с паром; знак делает малый поклон",
    keys: "bk-g-steam · bk-bow",
  },
  {
    state: "celebrating",
    title: "Празднует",
    note: "Золото. Точка — звезда; дуги летят по кругу, знак прыгает, сильные волны, конфетти",
    keys: "bk-jump · bk-turn · bk-burst · bk-confetti · bk-g-twirl",
  },
  {
    state: "working",
    title: "Работает (сотрудник)",
    note: "Дела в работе: точка — стопка карточек (до трёх); красная метка, когда срок в пределах часа",
    keys: "bk-breath · bk-wave-out · bk-g-hot",
    carry: { count: 3 },
  },
  {
    state: "awaiting",
    title: "Ждёт приёмки (сотрудник)",
    note: "Всё сдано: точка — песочные часы, песок течёт, часы переворачиваются",
    keys: "bk-g-flip · bk-g-sand · bk-calm",
  },
  {
    state: "tuned",
    title: "Шарик «Эфир» (сотрудник)",
    note: "Эфир со стороны слушателя: золотые волны идут внутрь, точка отзывается на каждую",
    keys: "bk-wave-in · bk-sync-dot",
  },
];

type ActEntry = { act: MascotAct; on: MascotState; title: string; note: string; carry?: { count: number; hot?: boolean } };

/** The acts of a face at rest (D-82), each on the state whose pool it belongs to. */
const ACTS: ActEntry[] = [
  { act: "yawn", on: "sleeping", title: "Зевок", note: "Долгий вдох кольца; точка (или черта закрытого глаза) вытягивается вверх и возвращается" },
  { act: "snore", on: "sleeping", title: "Храп", note: "Вдох кольца; у кольца растёт тонкий пузырь и лопается" },
  { act: "turn", on: "sleeping", title: "Переворачивается", note: "Ворочается: дуги расходятся и поворачиваются на треть, черта глаза наклоняется" },
  { act: "doze", on: "sleeping", title: "Клюёт носом", note: "Клюёт носом: знак медленно оседает и клонится, рывок вверх — и снова спит" },
  { act: "mumble", on: "sleeping", title: "Бормочет", note: "Бормочет: черта глаза подрагивает, то шире, то уже" },
  { act: "smile", on: "sleeping", title: "Хороший сон", note: "Хороший сон: черта закрытого глаза собирается в точку, рядом вспыхивает искра, уходят две волны — и снова черта" },
  { act: "kick", on: "sleeping", title: "Бежит во сне", note: "Бежит во сне: два коротких рывка знака в сторону" },
  { act: "scan", on: "calm", title: "Осматривается", note: "Осматривается: кольцо тускнеет, по нему дважды пробегает комета, зрачок идёт за ней" },
  { act: "limber", on: "calm", title: "Разминка", note: "Разминка: кольцо раскрывается на три дуги, долгий вдох, глаз прикрыт — и смыкается" },
  { act: "eyeroll", on: "calm", title: "Закатывает глаз", note: "Закатывает глаз: зрачок один раз обходит кольцо по краю" },
  { act: "thump", on: "calm", title: "Удар пульса", note: "Один сильный удар пульса: точка сжимается и ухает, кольцо отдаёт, две волны" },
  { act: "wave", on: "calm", title: "Машет", note: "Привет: зрачок качается из стороны в сторону, от кольца уходят две дружеские волны. Играет на пробуждении по тапу" },
  { act: "wink", on: "calm", title: "Подмигивает", note: "Подмигивает: точка сплющивается в черту и раскрывается, рядом вспыхивает искра" },
  { act: "hop", on: "calm", title: "Подпрыгивает", note: "Подпрыгивает: весь знак приседает, взлетает и приземляется" },
  { act: "spin", on: "calm", title: "Кружится", note: "Дуги расходятся и делают полный оборот с разгоном и доводкой" },
  { act: "whistle", on: "calm", title: "Насвистывает", note: "Насвистывает: точка сжимается и смотрит вверх, от кольца уплывают две ноты" },
  { act: "heart", on: "calm", title: "Сердечко", note: "Точка превращается в сердце, оно бьётся дважды" },
  { act: "orbit", on: "calm", title: "Следит за шариками", note: "Вокруг кольца один раз обходит малая точка, зрачок следит за ней" },
  { act: "peek", on: "alert", title: "Выглядывает", note: "Выглядывает: зрачок уходит до упора влево, потом вправо; кольцо подаётся следом" },
  { act: "tiptoe", on: "alert", title: "На цыпочках", note: "На цыпочках: знак приподнимается и держится, зрачок смотрит вверх" },
  // the employee's work (D-110): what the face plays when something happens to an order
  { act: "catch", on: "calling", title: "Ловит задачу", note: "Новое поручение: карточка падает сверху в кольцо и садится, кольцо сглатывает" },
  { act: "insist", on: "calling", title: "Директор настаивает", note: "«Настоять»: карточка с «!!» мотает головой, знак подскакивает дважды" },
  { act: "nod", on: "working", title: "«Есть!» — Принял", note: "«Принял»: точка — галочка, знак кивает дважды", carry: { count: 2 } },
  { act: "raise", on: "calling", title: "Уточнить", note: "«Уточнить»: точка — «?», покачивается" },
  { act: "shrug", on: "happy", title: "Не могу", note: "«Не могу»: карточка с крестом клонится, дуги расходятся и приподнимаются — пожал плечами" },
  { act: "poof", on: "happy", title: "Отозвали", note: "Отозвано: карточка сжимается, раздувается и тает, от неё разлетается пыль" },
  { act: "handover", on: "awaiting", title: "Сдал", note: "«Сдал»: карточка приседает и улетает вверх, кольцо отдаёт, сильная волна" },
  { act: "medal", on: "happy", title: "Директор принял", note: "Золото. Точка — медаль на ленте, вспышка искры, две волны" },
  { act: "boomerang", on: "calling", title: "На доработку", note: "На доработку: карточка улетает, описывает петлю и возвращается в кольцо" },
  { act: "relief", on: "working", title: "Срок отодвинули", note: "«Уф»: глаз прикрыт на вдох, кольцо делает долгий вдох, две волны", carry: { count: 1 } },
  { act: "letter", on: "nervous", title: "Пишет директор", note: "Слово директора: конверт падает сверху в кольцо" },
  { act: "read", on: "working", title: "Прочитал", note: "Читает: точка — три строки", carry: { count: 1 } },
  { act: "listen", on: "happy", title: "Объявление", note: "Слушает голосовое: точка — пять полосок звука, бьются вразнобой" },
  { act: "thumb", on: "tuned", title: "Ознакомился", note: "Точка — большой палец вверх" },
  { act: "watch", on: "working", title: "Смотрит на часы", note: "Смотрит на время: точка — часы, покачиваются", carry: { count: 2 } },
  { act: "wipe", on: "working", title: "Вытирает лоб", note: "Вытер лоб: глаз прикрыт, от кольца отлетает капля", carry: { count: 2 } },
  { act: "shuffle", on: "working", title: "Перебирает карточки", note: "Перебирает стопку: карточки покачиваются из стороны в сторону", carry: { count: 3 } },
  { act: "coin", on: "happy", title: "Пришли очки", note: "Золото. Очки: монета подлетает и переворачивается в воздухе, искра" },
  // the director's face answers the board — the employee's steps and its own decisions (tasks/020)
  { act: "tick", on: "calm", title: "Директор: принял в работу", note: "Принял: точка — галочка, вырастает с отскоком" },
  { act: "receive", on: "calm", title: "Директор: сдали на проверку", note: "Сдал: карточка приходит сбоку и садится в кольцо, кольцо сглатывает" },
  { act: "hmm", on: "calm", title: "Директор: не может", note: "«Не могу»: карточка с крестом клонится туда и обратно" },
  { act: "puzzle", on: "calm", title: "Директор: вопрос", note: "«Уточнить»: точка — «?», покачивается" },
  { act: "stamp", on: "calm", title: "Директор: «Принять»", note: "«Принять»: галочка падает печатью, кольцо отдаёт, сильная волна" },
  { act: "flick", on: "calm", title: "Директор: «На доработку»", note: "На доработку: карточку отщёлкивают в сторону, она улетает кувырком" },
  { act: "crumple", on: "calm", title: "Директор: «Отозвать»", note: "Отзыв: карточка сминается в комок — в ту точку, из которой вышла" },
  { act: "push", on: "calm", title: "Директор: «Настоять»", note: "«Настоять»: карточка с «!» дважды подаётся вперёд, две волны" },
  { act: "clock", on: "calm", title: "Директор: «Продлить»", note: "Срок: точка — часы, покачиваются" },
  { act: "reply", on: "calm", title: "Директор: ответ на вопрос", note: "Ответ: точка — пузырь, в нём пишутся две строки" },
  // a phrase that did not make it (tasks/020, phase B)
  { act: "ear", on: "calm", title: "Запись: не расслышал", note: "Не расслышал: дуги раскрыты, уровень лежит ровной чертой, слабая волна приходит снаружи" },
  { act: "scratch", on: "calm", title: "Запись: не разобрал", note: "Не разобрал: точка — «?», дуги качаются в одну сторону и в другую" },
  { act: "pinch", on: "calm", title: "Запись: слишком коротко", note: "Слишком коротко: точка дважды сжимается в крошку" },
  { act: "nomic", on: "calm", title: "Запись: микрофона нет", note: "Нет микрофона: перечёркнутый микрофон мотает головой" },
  { act: "signal", on: "calm", title: "Запись: нет связи", note: "Нет связи: перечёркнутый значок связи мотает головой" },
];

/** One act on repeat: it plays, the face rests a beat, it plays again. Remount to restart. */
function ActDemo({ entry, size }: { entry: ActEntry; size: number }) {
  const [on, setOn] = useState(true);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const flip = (value: boolean) => {
      timer = setTimeout(() => {
        setOn(value);
        flip(!value);
      }, value ? 900 : ACT_MS[entry.act]);
    };
    flip(false);
    return () => clearTimeout(timer);
  }, [entry.act]);
  return <Mascot state={entry.on} size={size} act={on ? entry.act : null} carry={entry.carry ?? null} />;
}

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
  { scene: "sending", title: "Отправляю", note: "Бросок; карточка теперь улетает из самого лица (mascot-throw-card)" },
];

/**
 * A made-up company of fifty-two, so the waiting screen can be looked at the way it will
 * actually be seen — rows of lit circles over the face and rows of idlers under it (D-118) —
 * instead of the four people a dev database happens to hold.
 */
const CROWD = (() => {
  const names = ["Марат Оспанов", "Динара Ахметова", "Ерлан Бек", "Тимур Салимов", "Айгуль Сапарова", "Асель Ким", "Нурлан Ким", "Жанна Ли"];
  const people = Array.from({ length: 52 }, (_, i) => ({
    id: `crowd-${i}`,
    fullName: `${names[i % names.length]!.split(" ")[0]} ${String.fromCharCode(1040 + (i % 32))}.`,
    alias: null,
  }));
  // two thirds of the company are carrying something, at every stage a circle can be in
  const now = Date.now();
  const stages = ["sent", "accepted", "pending_review", "declined", "rework", "accepted"] as const;
  const rows = people.slice(0, 34).flatMap((person, i) =>
    Array.from({ length: 1 + (i % 3) }, (_, k) => ({
      id: `${person.id}-${k}`,
      assignee_id: person.id,
      status: stages[(i + k) % stages.length]!,
      deadline: i % 7 === 0 ? new Date(now - 3_600_000).toISOString() : null,
      title: `Задача ${k + 1} для ${person.fullName.split(" ")[0]}`,
      question: i % 11 === 0 && k === 0 ? "А когда?" : null,
      decline_reason: null,
      unread: i % 9 === 4 && k === 0,
    })),
  );
  // the clock is read once, when the module loads: the bench only needs a plausible «now»
  const byPerson = tasksOf(rows, now);
  return { members: people.map((person) => ({ ...person, tasks: byPerson[person.id] ?? [] })) };
})();

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

/** The small mark's states (D-209), as the lab shows them. */
const MINI: { state: MiniState; title: string; note: string; tone?: string }[] = [
  { state: "still", title: "Стоит", note: "Знак без движения — как значок" },
  { state: "idle", title: "Пульс", note: "Точка бьётся, от кольца уходит волна: «на связи»" },
  { state: "busy", title: "Работает", note: "Кольцо раскрыто на три дуги, они шагают по кругу, точка тикает: загрузка, разбор, отправка" },
  { state: "listening", title: "Слушает", note: "Дуги плывут, точка — три черты голоса: идёт запись" },
  { state: "done", title: "Готово", note: "Один раз: точка подпрыгивает, уходит волна", tone: "var(--ok)" },
  { state: "alert", title: "Зовёт", note: "Точка подскакивает, волны чаще: что-то ждёт", tone: "var(--warn)" },
];

export function MascotGallery() {
  const [size, setSize] = useState(96);
  const [background, setBackground] = useState<BackgroundKey>("surface");
  const [paused, setPaused] = useState(false);
  const [level, setLevel] = useState(0);
  const [auto, setAuto] = useState(true);
  // remounting a demo restarts its one-shot pose (lean, tilt-read, startle) and the gestures
  const [runKey, setRunKey] = useState(0);
  const [replays, setReplays] = useState<Record<string, number>>({});
  // the seek harness: while paused, every keyframe is held at this second of its own timeline
  const [seek, setSeek] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const baseDelays = useRef(new WeakMap<Element, number>());

  useEffect(() => {
    if (!auto) return;
    let frame = 0;
    const id = setInterval(() => {
      frame += 1;
      setLevel(Math.abs(Math.sin(frame / 5)) * 0.9);
    }, 80);
    return () => clearInterval(id);
  }, [auto]);

  /**
   * Freeze a chosen moment: a negative animation-delay seeks a paused keyframe to that
   * second, so a frame can be read and screenshotted deterministically. Each element keeps
   * its own authored delay, so staggered props (the three dots, the cards) stay in step.
   */
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const animated = node.querySelectorAll<HTMLElement | SVGElement>("[style*='animation']");
    for (const element of animated) {
      let base = baseDelays.current.get(element);
      if (base === undefined) {
        const declared = getComputedStyle(element).animationDelay.split(",")[0]?.trim() ?? "0s";
        base = declared.endsWith("ms") ? parseFloat(declared) / 1000 : parseFloat(declared) || 0;
        baseDelays.current.set(element, base);
      }
      element.style.animationDelay = paused ? `${(base - seek).toFixed(3)}s` : `${base}s`;
    }
  }, [paused, seek, size, runKey, replays]);

  const replay = (key: string) => setReplays((current) => ({ ...current, [key]: (current[key] ?? 0) + 1 }));
  const stageBg = BACKGROUNDS.find((item) => item.key === background)!.css;
  const stageHeight = Math.round(size * 1.5 + 48);

  return (
    <div ref={root} className={paused ? "lab-paused" : undefined}>
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
          {paused ? (
            <label className="mt-2 flex items-center gap-2 text-[13px] leading-4 text-muted">
              Кадр
              <input
                type="range"
                min={0}
                max={8}
                step={0.02}
                value={seek}
                onChange={(event) => setSeek(Number(event.target.value))}
                className="min-h-[36px] min-w-0 flex-1 accent-accent"
              />
              <span className="nums w-12 text-right text-text">{seek.toFixed(2)}с</span>
            </label>
          ) : null}
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
                    carry={entry.carry ?? null}
                  />
                </button>
              </Stage>
              <Caption title={entry.title} note={entry.note} keys={entry.keys} />
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-[19px] font-semibold leading-6">Сценки в покое</h2>
        <p className="mt-1 text-[13px] leading-4 text-muted">
          {ACTS.length} коротких сценок поверх состояния (D-82): на Пульсе в покое лицо само играет одну из подходящих каждые 6–12 с —
          спящее спит дальше, бодрствующее ждёт выбора шарика, настороженное только оглядывается (D-70). С «Ловит задачу» и ниже —
          сценки сотрудника (D-110): что лицо играет, когда с его делом что-то случилось, — и его сценки с делами в руках. Раскадровка
          всей жизни задачи — /dev/employee. Здесь каждая крутится по кругу; тап — сначала.
        </p>
        <div className="mt-3 flex flex-col gap-4">
          {ACTS.map((entry) => (
            <div key={entry.act} className="card p-4">
              <Stage height={stageHeight} background={stageBg}>
                <button type="button" aria-label={`Переиграть: ${entry.title}`} onClick={() => replay(`act-${entry.act}`)}>
                  <ActDemo key={`${entry.act}-${runKey}-${replays[`act-${entry.act}`] ?? 0}`} entry={entry} size={size} />
                </button>
              </Stage>
              <Caption title={entry.title} note={entry.note} keys={`act «${entry.act}» на «${entry.on}» · ${ACT_MS[entry.act]} мс`} />
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
        <h2 className="text-[19px] font-semibold leading-6">Экран ожидания</h2>
        <p className="mt-1 text-[13px] leading-4 text-muted">
          Пока домашний экран в покое, свет маскота вынесен на весь экран: три орбиты, по которым идут маленькие копии знака (точка в кольце) и точки, каждая
          своим шагом; волны от кольца до края экрана и редкая комета на средней орбите. Что волна задевает, то повторяет пульс: вспыхивает, а маленький знак
          отпускает свою волну; каждая точка медленно уходит в свой цвет и обратно. Когда волна доходит до кружка команды, он чуть вздрагивает. Здесь зона сцены —
          сама карточка; команда выдуманная, 52 человека: сверху те, у кого есть работа, снизу ряды свободных.
        </p>
        <div className="mt-3 flex flex-col gap-4">
          {[false, true].map((crowd) => (
            <div key={String(crowd)} className="card p-4">
              <Stage height={340} background={stageBg}>
                <div key={`${crowd}-${runKey}`} data-idle-area className="relative flex h-full w-full items-center justify-center overflow-hidden">
                  <IdleScene active team={crowd ? CROWD : undefined} />
                  <Mascot state="sleeping" size={96} />
                </div>
              </Stage>
              <Caption title={crowd ? "Поле и команда" : "Поле"} note={crowd ? "У директора: кружки команды стоят в поле и вздрагивают от волны" : "У сотрудника: только поле вокруг спящего маскота"} keys="idle-wave · idle-turn · idle-flare · idle-echo · idle-hue · idle-comet · crew-ripple" />
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-[19px] font-semibold leading-6">Мини-маскот</h2>
        <p className="mt-1 text-[13px] leading-4 text-muted">
          Маленький знак для остальных экранов и компьютера: в строке текста, в кнопке, на вкладке. Один лёгкий рисунок без кода — ставится куда угодно и
          берёт цвет текста вокруг. Шесть состояний; размеры 14 / 16 / 20 / 24 / 32.
        </p>
        <div className="card mt-3 flex flex-col gap-4 p-5" data-testid="mini-gallery">
          {MINI.map((entry) => (
            <div key={entry.state} className="flex items-center gap-4">
              <div className="flex w-[150px] shrink-0 items-center gap-3 text-accent" style={entry.tone ? { color: entry.tone } : undefined}>
                {[14, 16, 20, 24, 32].map((value) => (
                  <MiniMark key={`${value}-${runKey}`} state={entry.state} size={value} />
                ))}
              </div>
              <div className="min-w-0">
                <p className="text-[14px] font-semibold leading-[18px]">{entry.title}</p>
                <p className="text-[12px] leading-4 text-muted">{entry.note}</p>
              </div>
            </div>
          ))}
          <p className="border-t border-border pt-3 text-[14px] leading-5">
            В строке: <MiniMark state="busy" tone="var(--accent)" /> Разбираю фразу… · <MiniMark state="listening" tone="var(--accent)" /> Слушаю · <MiniMark state="idle" tone="var(--accent)" /> на связи
          </p>
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-[19px] font-semibold leading-6">Мелкие размеры</h2>
        <p className="mt-1 text-[13px] leading-4 text-muted">
          24 / 32 / 44 — аватарные размеры: читаются ли кольцо и точка и не превращается ли предмет в шум.
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
