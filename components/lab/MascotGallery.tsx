"use client";

import { useEffect, useRef, useState } from "react";

import { ACT_MS, Mascot, type MascotAct, type MascotState } from "@/components/brand/Mascot";
import { MascotScene, type Scene } from "@/components/brand/MascotScene";
import type { DreamId } from "@/components/pulse/DreamOrbit";
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
    note: "Замах назад, бросок вперёд со сплющиванием, карточка появляется в руке на замахе и улетает вверх-вправо на броске — рука отпускает её в момент броска, глаза провожают",
    keys: "mascot-throw · mascot-throw-card · mascot-card-grip · mascot-follow",
  },
  {
    state: "offering",
    title: "Ждёт броска",
    note: "Разобранная фраза в руках: лицо само просит тап — вжимается и отскакивает, как кнопка под пальцем, из тела расходится кольцо, стопка подпрыгивает на отскоке",
    keys: "mascot-offer · mascot-offer-eyes · mascot-tap-ring · mascot-offer-card",
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
    note: "Глаза закрыты, самое медленное дыхание, «z» уплывают вверх. Что ему снится — рисуется вне головы, см. «Сны спящего лица» ниже",
    keys: "mascot-sleep · mascot-zzz · mascot-shadow-sleep",
  },
  {
    state: "alert",
    title: "Насторожен",
    note: "Лицо директора: выпрямляется и замирает, дышит поверхностно, раз за цикл прислушивается поворотом, глаза медленно ведут по сторонам и задерживаются на краях. Негативных состояний у директора нет (D-70)",
    keys: "mascot-alert-pose · mascot-alert · mascot-scan",
  },
  {
    state: "calling",
    title: "Зовёт",
    note: "«Обрати внимание!»: наклон к зрителю, два настойчивых подскока с креном и пауза, над головой выскакивает новая карточка с бейджем «!» (D-110; на аватарном размере — голый «!»). Лента сотрудника, пока есть непринятая или возвращённая задача",
    keys: "mascot-lean · mascot-call · mascot-call-mark · mascot-badge",
  },
  {
    state: "surprised",
    title: "Удивлён",
    note: "Разбужен мыслью: прыжок назад, широкие глаза вверх, маленький круглый рот, дальше настороженное дыхание",
    keys: "mascot-startle · mascot-alert · mascot-look-up",
  },
  {
    state: "processing",
    title: "Обрабатывает",
    note: "Подключается к хранилищу, глаза бегут глифами как терминал, затем фиксация, прыжок и галочка нового статуса (D-65)",
    keys: "mascot-process · mascot-code-look · mascot-glyph · mascot-eye-return · mascot-store · mascot-data-bit · mascot-check-pop · mascot-shadow-process",
  },
  {
    state: "angry",
    title: "Злится",
    note: "Нахмуренные брови, короткий тяжёлый толчок корпусом и упрямый взгляд исподлобья.",
    keys: "mascot-angry-pose · mascot-angry · mascot-angry-look",
  },
  {
    state: "nervous",
    title: "Нервничает",
    note: "Неуверенно переминается, взгляд мечется, капля пота, а у головы подпрыгивает конверт — непрочитанное слово директора (D-110).",
    keys: "mascot-nervous · mascot-nervous-look · mascot-sweat · mascot-letter-bob",
  },
  {
    state: "bored",
    title: "Скучает",
    note: "Вялое дыхание, полуприкрытые глаза и долгий взгляд в сторону — заняться нечем.",
    keys: "mascot-bored · mascot-bored-look",
  },
  {
    state: "panicking",
    title: "Паникует",
    note: "Частая дрожь, широко раскрытые глаза и две торопливые капли пота. У сотрудника в руках стопка, верхняя карточка горит — часы срока пульсируют (D-110).",
    keys: "mascot-panic-pose · mascot-panic · mascot-panic-look · mascot-sweat · mascot-hot",
    carry: { count: 2, hot: true },
  },
  {
    state: "swearing",
    title: "Ругается",
    note: "Сердитая мимика, рубленый ритм и облачко с нейтральными символами вместо брани.",
    keys: "mascot-angry-pose · mascot-swear · mascot-swear-look · mascot-swear-cloud",
  },
  {
    state: "checking",
    title: "Шарик «Задачи»",
    note: "Достаёт планшет (большой палец на нижнем крае), наклоняется к нему, и вторая рука карандашом ставит галочки по строкам — глаза идут по списку вниз, на каждую галочку кивок, в конце довольный взгляд на директора (D-82)",
    keys: "mascot-check-pose · mascot-check · mascot-check-look · mascot-tick-1…3 · mascot-check-pen · mascot-prop-in",
  },
  {
    state: "chatting",
    title: "Шарик «Сообщения»",
    note: "Слева приходит пузырь с тремя «печатающими» точками — лицо повернулось к нему; затем справа уходит ответ, рот шевелится, строки печатаются (D-82)",
    keys: "mascot-chat · mascot-chat-look · mascot-chat-mouth · mascot-bubble-left · mascot-bubble-right · mascot-typing · mascot-reply-line",
  },
  {
    state: "announcing",
    title: "Шарик «Эфир»",
    note: "Выпрямляется, мегафон у рта, кулак на рукояти: вдох с откидыванием, выкрик с толчком вперёд, из раструба расходятся дуги (D-82)",
    keys: "mascot-announce-pose · mascot-announce · mascot-announce-look · mascot-shout-mouth · mascot-shout-wave",
  },
  {
    state: "scheduling",
    title: "Шарик «Календарь»",
    note: "Отрывной календарь в поднятой левой руке — наклоняется вместе с телом: верхний лист отрывается и падает, глаза провожают его вниз, кивок «записал»; сегодняшний день обведён и пульсирует (D-82)",
    keys: "mascot-schedule-pose · mascot-schedule · mascot-schedule-look · mascot-page-flip · mascot-today",
  },
  {
    state: "serving",
    title: "Шарик «Секретарь»",
    note: "Поклон, чашка на блюдце в обеих руках, над ней пар, аккуратное покачивание, мягкий прищур и улыбка — взгляд то на чашку, то на директора (D-82)",
    keys: "mascot-bow · mascot-serve · mascot-serve-look · mascot-steam",
  },
  {
    state: "celebrating",
    title: "Празднует",
    note: "Пачка улетела и дошла: настоящий прыжок, тень отрывается от земли, с макушки разлетается конфетти. Играет 1,8 с после броска (D-82); у сотрудника — после медали, если включены очки (D-110)",
    keys: "mascot-cheer-pose · mascot-happy · mascot-confetti · mascot-shadow-cheer",
  },
  {
    state: "working",
    title: "Работает (сотрудник)",
    note: "Дела в работе — лицо не спит, а держит их стопкой карточек: до трёх веером, число на бейдже, большой палец на краю. Раз за цикл поглядывает вниз на стопку (D-110)",
    keys: "mascot-work · mascot-work-look · mascot-prop-in",
    carry: { count: 3 },
  },
  {
    state: "awaiting",
    title: "Ждёт приёмки (сотрудник)",
    note: "Всё сдано директору: песочные часы стоят рядом на земле (не дышат с телом), песок течёт и часы переворачиваются, глаза то вверх — к директору, то на часы (D-110)",
    keys: "mascot-idle · mascot-await-look · mascot-hourglass · mascot-sand-top · mascot-sand-bottom",
  },
  {
    state: "tuned",
    title: "Шарик «Эфир» (сотрудник)",
    note: "Эфир со стороны слушателя: наклон и ухо, как у «слушает», золотые дуги входят в ухо, кивки. Мегафон — у того, кто объявляет (D-110)",
    keys: "mascot-lean · mascot-nod · mascot-attend · mascot-ear-up · mascot-wave-in",
  },
];

type ActEntry = { act: MascotAct; on: MascotState; title: string; note: string; carry?: { count: number; hot?: boolean } };

/** The acts of a face at rest (D-82), each on the state whose pool it belongs to. */
const ACTS: ActEntry[] = [
  { act: "yawn", on: "sleeping", title: "Зевок", note: "Приседает, тянется вверх, рот широко, глаза зажмурены. И сам по себе, и при засыпании по тапу" },
  { act: "snore", on: "sleeping", title: "Храп", note: "Пузырь у рта растёт на выдохе, сдувается на вдохе и лопается" },
  { act: "turn", on: "sleeping", title: "Переворачивается", note: "Ворочается во сне: на один бок, через себя, на другой" },
  { act: "doze", on: "sleeping", title: "Клюёт носом", note: "Голова медленно опускается, рывок вверх, глаза приоткрываются — всё тихо — снова спит" },
  { act: "mumble", on: "sleeping", title: "Бормочет", note: "Говорит во сне: маленький рот и пузырь с точками, без слов" },
  { act: "smile", on: "sleeping", title: "Улыбается во сне", note: "Хороший сон: улыбка под закрытыми глазами, румянец" },
  { act: "kick", on: "sleeping", title: "Бежит во сне", note: "Короткие рывки влево-вправо, из-под него пыль — снится погоня" },
  { act: "wave", on: "calm", title: "Машет", note: "Из-за тела выходит ручка и машет, глаза улыбаются. Играет на пробуждении по тапу" },
  { act: "wink", on: "calm", title: "Подмигивает", note: "Наклон, один глаз закрывается, рядом блик" },
  { act: "hop", on: "calm", title: "Подпрыгивает", note: "Два прыжка просто так, тень отвечает" },
  { act: "spin", on: "calm", title: "Кружится", note: "Прыжок и разворот в воздухе: тело встаёт ребром, показывает спину (глаз на ней нет) и возвращается" },
  { act: "whistle", on: "calm", title: "Насвистывает", note: "Губы трубочкой, покачивается в ритм, ноты улетают вверх" },
  { act: "heart", on: "calm", title: "Сердечко", note: "Сжимается «ми-ми», с макушки поднимаются два сердечка, глаза улыбаются им вслед" },
  { act: "orbit", on: "calm", title: "Следит за шариками", note: "Взгляд делает круг — вслед шарикам на орбите, тело поворачивается за ним" },
  { act: "peek", on: "alert", title: "Выглядывает", note: "Насторожен: высовывается посмотреть в одну сторону, потом в другую" },
  { act: "tiptoe", on: "alert", title: "На цыпочках", note: "Насторожен: тянется вверх, смотреть поверх, водит глазами и опускается" },
  // the employee's work (D-110): what the face plays when something happens to an order
  { act: "catch", on: "calling", title: "Ловит задачу", note: "Сотрудник: новая задача падает сверху карточкой, лицо приседает под ней, глаза следят — и она остаётся над головой с «!»" },
  { act: "insist", on: "calling", title: "Директор настаивает", note: "После «Не могу» карточка возвращается тяжелее, с красным «!!»" },
  { act: "nod", on: "working", title: "«Есть!» — Принял", note: "Два быстрых кивка, улыбка, галочка; карточка уходит вниз в стопку", carry: { count: 2 } },
  { act: "raise", on: "calling", title: "Уточнить", note: "Поднимает руку, машет ею «можно?», с ладони уходит вверх «?»" },
  { act: "shrug", on: "happy", title: "Не могу", note: "Плечи вверх, ладони в стороны, «эх» ртом; карточка отъезжает в сторону. Сдержанно, без драмы (D-45)" },
  { act: "poof", on: "happy", title: "Отозвали", note: "Карточка над головой рассыпается в воздухе, лицо смотрит на пустое место и разводит руками" },
  { act: "handover", on: "awaiting", title: "Сдал", note: "Бросок «Отправляю» с этой стороны: карточка с галочкой улетает вверх — к директору" },
  { act: "medal", on: "happy", title: "Директор принял", note: "Медаль падает на грудь, прыжок, гордый вдох, искры. С очками после неё — прыжок с конфетти" },
  { act: "boomerang", on: "calling", title: "На доработку", note: "Карточка возвращается по дуге и стукает по макушке; вздох, плечи опускаются — и решительный подскок. Не злится" },
  { act: "relief", on: "working", title: "Срок отодвинули", note: "Вдох, стрелка часов бежит назад, долгое «фух»", carry: { count: 1 } },
  { act: "letter", on: "nervous", title: "Пишет директор", note: "Конверт влетает к голове, лицо поворачивается к нему" },
  { act: "read", on: "working", title: "Прочитал", note: "Конверт раскрывается, галочка, кивок — и конверт уходит", carry: { count: 1 } },
  { act: "listen", on: "happy", title: "Объявление", note: "Ухо вверх, золотые дуги Эфира входят в него" },
  { act: "thumb", on: "tuned", title: "Ознакомился", note: "Большой палец вверх из-за бока, улыбка, гордая осанка" },
  { act: "watch", on: "working", title: "Смотрит на часы", note: "Рука с часами слева, взгляд на них, кивок. И в покое с делами, и на мысль о встрече", carry: { count: 2 } },
  { act: "wipe", on: "working", title: "Вытирает лоб", note: "Левая рука проходит по лбу (правая держит стопку), капля слетает, выдох — сценка занятого лица", carry: { count: 2 } },
  { act: "shuffle", on: "working", title: "Перебирает карточки", note: "Верхняя карточка стопки поднимается, поворачивается и возвращается", carry: { count: 3 } },
  { act: "coin", on: "happy", title: "Пришли очки", note: "Монета взлетает с макушки, крутится и падает в голову; рядом «+N» (только с очками, D-40)" },
  // the director's face answers the board — the employee's steps and its own decisions (tasks/020)
  { act: "tick", on: "calm", title: "Директор: принял в работу", note: "Короткий кивок, у головы вспыхивает галочка, глаза улыбаются" },
  { act: "receive", on: "calm", title: "Директор: сдали на проверку", note: "Карточка с зелёной галочкой прилетает снизу в руку, лицо наклоняется и читает её по строкам" },
  { act: "hmm", on: "calm", title: "Директор: не может", note: "Кулак под подбородком, глаза в сторону, одно медленное моргание. Раздумье, не досада (D-70)" },
  { act: "puzzle", on: "calm", title: "Директор: вопрос", note: "Слева подлетает карточка с «?», голова наклоняется к ней" },
  { act: "stamp", on: "calm", title: "Директор: «Принять»", note: "Карточка в левой руке, правая опускает штамп — остаётся «✓» в круге, улыбка" },
  { act: "flick", on: "calm", title: "Директор: «На доработку»", note: "Щелчок кистью — карточка с красным уголком уходит вниз-влево, взгляд провожает" },
  { act: "crumple", on: "calm", title: "Директор: «Отозвать»", note: "Карточка сминается в кулаке в комок, комок улетает за край" },
  { act: "push", on: "calm", title: "Директор: «Настоять»", note: "Карточку с «!!» выталкивает вперёд обеими руками — и она уходит к человеку снова" },
  { act: "clock", on: "calm", title: "Директор: «Продлить»", note: "Рука к часам у головы, заводная головка — минутная стрелка уходит вперёд. И для «без срока»" },
  { act: "reply", on: "calm", title: "Директор: ответ на вопрос", note: "Рука пишет строки на записке, записка уходит вверх к человеку" },
  // a phrase that did not make it (tasks/020, phase B)
  { act: "ear", on: "calm", title: "Запись: не расслышал", note: "Ладонь за ухом, голова наклоняется к ней, над головой «?». STT не дал текста или упал" },
  { act: "scratch", on: "calm", title: "Запись: не разобрал", note: "Рука на макушке чешет её, глаза вверх. Парсер не справился, отказался или не нашёл ни задачи" },
  { act: "pinch", on: "calm", title: "Запись: слишком коротко", note: "Пальцы сбоку показывают «вот столечко», один глаз прищурен" },
  { act: "nomic", on: "calm", title: "Запись: микрофона нет", note: "Ухо «слушает» вырастает, его перечёркивает красная черта, лицо отворачивается" },
  { act: "signal", on: "calm", title: "Запись: нет связи", note: "Телефон поднят высоко в руке и покачивается, дуги сигнала над ним гаснут одна за другой" },
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
  { scene: "sending", title: "Отправляю", note: "Бросок; карточка теперь улетает из самого лица (mascot-throw-card)" },
];

const DREAMS: { id: DreamId; title: string; note: string; keys: string }[] = [
  {
    id: "rocket",
    title: "Ракета",
    note: "Капля в кабине, вид сверху; сопло пульсирует, из него отрываются клубы выхлопа. Летит одна — за ней никто не гонится",
    keys: "dream-lap · dream-swell · dream-thrust · dream-puff",
  },
  {
    id: "dragon",
    title: "Китайский дракон",
    note: "Голова с рогами, гривой и усами позади капли, за ней девять звеньев тела и хвост — каждое стартует на 34 мс позже предыдущего, поэтому тело само ложится по линии полёта, хлещет на отскоках и волной идёт по нему",
    keys: "dream-lap · dream-swell · dream-step · dream-wave",
  },
  {
    id: "monster",
    title: "Монстр",
    note: "Капля убегает, монстр следом тянет лапы с когтями; три глаза со зрачками и пасть с зубами",
    keys: "dream-lap · dream-swell · dream-step · dream-grab",
  },
  {
    id: "plane",
    title: "Бумажный самолётик",
    note: "Капля верхом на самолётике, крылья «кренятся» (сужаются и расширяются), за ним пунктир — как маршрут на карте. Летит один (D-82)",
    keys: "dream-lap · dream-swell · dream-bank",
  },
  {
    id: "bees",
    title: "Рой пчёл",
    note: "Капля убегает от четырёх пчёл: полоски, жало, крылья жужжат размытым пятном, каждая пчела висит в воздухе в своём ритме — рой, а не паровозик (D-82)",
    keys: "dream-lap · dream-swell · dream-step · dream-hover · dream-buzz",
  },
  {
    id: "ufo",
    title: "НЛО",
    note: "Летающая тарелка гонится за каплей: огни бегут по кругу, под стеклянным куполом пилот, кольцо-луч пульсирует — пытается поймать (D-82)",
    keys: "dream-lap · dream-swell · dream-step · dream-lights · dream-beam",
  },
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
        <h2 className="text-[19px] font-semibold leading-6">Сны спящего лица</h2>
        <p className="mt-1 text-[13px] leading-4 text-muted">
          Сцена ожидания на домашних экранах: пыль «нарисованная ручкой» по всему экрану и сон, летящий сквозь неё.
          Полёт управляемый — инерция, снос с курса, отталкивание от краёв дугой и погоня на упреждение; он считается
          один раз на старте сна и записывается в keyframes, дальше JS спит. Пометки, мимо которых прошёл полёт,
          вспыхивают. Первый сон — через 2,6 с, полёт 14 с, между снами 5 с; пробуждение гасит сцену за 180 мс. Здесь
          зона сцены — сама карточка, каждый сон закреплён (`only`); в продукте зона равна экрану, а сны идут по кругу.
          Команда здесь выдуманная, 52 человека: сверху те, у кого есть работа, — такие же кружки, подсвеченные цветом
          стадии, как в «Задачах», с кольцом (крутится — в работе, дышит — выдана и не принята, замкнуто — сдана,
          разорвано — отказ) и значком «?», сообщение или «×»; снизу ряды бездельников. Тап по светящемуся кружку — его
          задачи со ссылками, тап по серому — «Записать задачу?».
        </p>
        <div className="mt-3 flex flex-col gap-4">
          {DREAMS.map((dream) => (
            <div key={dream.id} className="card p-4">
              <Stage height={340} background={stageBg}>
                <div key={`${dream.id}-${runKey}`} data-dream-area className="relative flex h-full w-full items-center justify-center overflow-hidden">
                  <IdleScene active only={dream.id} team={dream.id === "rocket" ? CROWD : undefined} />
                  <Mascot state="sleeping" size={96} />
                </div>
              </Stage>
              <Caption title={dream.title} note={dream.note} keys={dream.keys} />
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
