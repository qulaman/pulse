"use client";

import { MotionConfig } from "framer-motion";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import { ACT_MS, Mascot, type MascotAct, type MascotState } from "@/components/brand/Mascot";

import { ChatBefore, CountUp, EcgLine, MiniCard, Reveal, Tile, TvWall } from "./parts";
import styles from "./pitch.module.css";
import { VoiceDemo } from "./VoiceDemo";

/**
 * «Как работает Pulse» — the product in five minutes, the page the owner opens before the live
 * demo (an investor, a new client). A scroll story in the product's own language: the real
 * face, the board's cards, the wall. Every number on it is measured — the parser evals
 * (tests/ai/results), the STT series (WORKLOG, 2026-08-20), the unit-cost model
 * (lib/lab/costs.ts) and the repository itself as of 2026-09-26; nothing here reads data.
 */
export function PitchStory() {
  return (
    <MotionConfig reducedMotion="user">
      <Hero />
      <Problem />
      <HowItWorks />
      <Secret />
      <ForDirector />
      <ForCompany />
      <Business />
      <Progress />
      <Finale />
    </MotionConfig>
  );
}

/* -------------------------------------------------------------------------- */
/* Layout                                                                      */
/* -------------------------------------------------------------------------- */

function Section({ n, eyebrow, title, lead, children }: { n: string; eyebrow: string; title: ReactNode; lead?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-20 md:mt-28">
      <Reveal>
        <p className="eyebrow">
          <span className="nums text-accent">{n}</span> · {eyebrow}
        </p>
        <h2 className="mt-3 font-display text-[30px] font-extrabold leading-[34px] tracking-[-0.03em] md:text-[42px] md:leading-[46px]">{title}</h2>
        {lead ? <p className="mt-3 max-w-[62ch] text-[16px] leading-[24px] text-muted md:text-[18px] md:leading-[28px]">{lead}</p> : null}
      </Reveal>
      <div className="mt-8">{children}</div>
    </section>
  );
}

/** A face on its own small stage: the props of a state draw outside the face's box. */
function Face({ state, size, act = null, carry = null }: { state: MascotState; size: number; act?: MascotAct | null; carry?: { count: number } | null }) {
  return (
    <div className="grid place-items-center" style={{ height: Math.round(size * 1.7), minWidth: Math.round(size * 1.9) }}>
      <Mascot state={state} size={size} act={act} carry={carry} />
    </div>
  );
}

function Stat({ value, label }: { value: ReactNode; label: ReactNode }) {
  return (
    <div className="card p-4">
      <p className="font-display text-[34px] font-extrabold leading-[38px] tracking-[-0.03em] text-accent md:text-[40px] md:leading-[44px]">{value}</p>
      <p className="mt-1.5 text-[14px] leading-5 text-muted">{label}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 0. Hero                                                                     */
/* -------------------------------------------------------------------------- */

// the waiting screen's little shows, one after another (D-82 §2)
const HERO_ACTS: MascotAct[] = ["wave", "wink", "heart", "hop", "whistle", "spin"];

function HeroFace() {
  const [turn, setTurn] = useState(0);
  const [act, setAct] = useState<MascotAct | null>(null);

  useEffect(() => {
    const next = HERO_ACTS[turn % HERO_ACTS.length];
    const wait = turn === 0 ? 900 : 2600;
    const start = window.setTimeout(() => setAct(next), wait);
    const stop = window.setTimeout(() => {
      setAct(null);
      setTurn((t) => t + 1);
    }, wait + ACT_MS[next]);
    return () => {
      window.clearTimeout(start);
      window.clearTimeout(stop);
    };
  }, [turn]);

  return (
    <div className="relative grid h-[250px] place-items-center md:h-[300px] lg:h-[360px]">
      <div aria-hidden className={styles.halo} />
      <div className="relative translate-y-4 lg:scale-[1.3]">
        <Mascot state="calm" size={132} act={act} />
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section className="pt-2 md:pt-6">
      <div className="grid items-center gap-2 md:grid-cols-[1.25fr_1fr] md:gap-6">
        <div>
          <p className="eyebrow">Голосовое управление компанией</p>
          <h1 className="mt-3 font-display text-[42px] font-extrabold leading-[44px] tracking-[-0.035em] md:text-[62px] md:leading-[62px] lg:text-[76px] lg:leading-[76px]">
            Директор говорит.
            <br />
            <span className="text-accent">Компания делает.</span>
          </h1>
          <p className="mt-4 max-w-[46ch] text-[17px] leading-[26px] text-muted md:text-[19px] md:leading-[29px]">
            Pulse — личный ассистент директора. Одно голосовое превращается в поручения у каждого сотрудника: с исполнителем, сроком
            и квитанцией «увидел — принял».
          </p>
        </div>
        <HeroFace />
      </div>
      <EcgLine className="mt-4" />
      <div className="mt-6 grid grid-cols-3 gap-2 md:gap-3">
        <HeroFact value="1 → 5" label="одно голосовое — пять поручений" />
        <HeroFact value="3" label="кнопки у сотрудника на карточке" />
        <HeroFact value="0" label="потерянных голосовых: запись в сейфе до ИИ" />
      </div>
    </section>
  );
}

function HeroFact({ value, label }: { value: string; label: string }) {
  return (
    <div className="card p-3 md:p-4">
      <p className="nums font-display text-[26px] font-extrabold leading-8 tracking-[-0.03em] md:text-[32px] md:leading-9">{value}</p>
      <p className="mt-1 text-[13px] leading-[17px] text-muted md:text-[14px] md:leading-5">{label}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 1. The problem                                                              */
/* -------------------------------------------------------------------------- */

function Problem() {
  return (
    <Section
      n="01"
      eyebrow="Проблема"
      title="Директор работает диспетчером"
      lead="Поручения раздаются голосовыми в мессенджере. Через час они тонут между фото и стикерами, срок живёт в голове, а статус приходится выяснять звонками."
    >
      <div className="grid gap-6 md:grid-cols-2">
        <Reveal>
          <p className="eyebrow mb-3">Было · мессенджер</p>
          <ChatBefore />
          <p className="mt-3 text-[15px] leading-[22px] text-muted">
            «Прочитано» — не значит «принял». Кто за что отвечает и к какому сроку — не видно.
          </p>
        </Reveal>
        <Reveal delay={0.12}>
          <p className="eyebrow mb-3" style={{ color: "var(--accent)" }}>
            Стало · Pulse
          </p>
          <div className="flex flex-col gap-2">
            <MiniCard kind="task" who="Марат" title="КП по объекту на Абая" when="пт, 18:00" mark={{ tone: "ok", text: "принял 9:15" }} />
            <MiniCard kind="task" who="Айгуль" title="Созвониться с банком" when="завтра, 13:00" mark={{ tone: "accent", text: "увидел 9:20" }} />
            <MiniCard kind="task" who="Ерлан" title="Фотоотчёт с объекта" when="сегодня, 18:00" mark={{ tone: "warn", text: "не открывал с 9:14" }} />
          </div>
          <p className="mt-3 text-[15px] leading-[22px] text-muted">Каждое поручение — карточка: кто, что, к какому сроку и видел ли.</p>
        </Reveal>
      </div>
    </Section>
  );
}

/* -------------------------------------------------------------------------- */
/* 2. How it works                                                             */
/* -------------------------------------------------------------------------- */

function HowItWorks() {
  return (
    <Section
      n="02"
      eyebrow="Как это работает"
      title="Одно голосовое — и все при деле"
      lead="Путь одной фразы директора от микрофона до исполнителя. Лицо на экране показывает каждый этап — так же, как в приложении."
    >
      <Reveal>
        <VoiceDemo />
      </Reveal>
      <Reveal className="mt-4">
        <p className="text-[15px] leading-[22px] text-muted">
          Кроме задач, из той же фразы я достаю объявления, встречи с участниками, напоминания и заметки. Если говорить неудобно — та же
          строка текстом.
        </p>
      </Reveal>
    </Section>
  );
}

/* -------------------------------------------------------------------------- */
/* 3. The secret                                                               */
/* -------------------------------------------------------------------------- */

function Pillar({ face, title, points, children }: { face: MascotState; title: string; points: [string, string][]; children?: ReactNode }) {
  return (
    <div className="card h-full p-4 md:p-5">
      <div className="flex items-center gap-2">
        <div className="grid size-14 shrink-0 place-items-center">
          <Mascot state={face} size={44} />
        </div>
        <p className="font-display text-[24px] font-extrabold leading-7 tracking-[-0.02em]">{title}</p>
      </div>
      <ul className="mt-2 flex flex-col gap-3">
        {points.map(([lead, text]) => (
          <li key={lead} className="text-[15px] leading-[22px] text-muted">
            <span className="font-semibold text-text">{lead}.</span> {text}
          </li>
        ))}
      </ul>
      {children}
    </div>
  );
}

function MiniStat({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div>
      <p className="font-display text-[24px] font-extrabold leading-7 tracking-[-0.02em] text-accent">{value}</p>
      <p className="mt-0.5 text-[12px] leading-4 text-muted">{label}</p>
    </div>
  );
}

function Secret() {
  return (
    <Section
      n="03"
      eyebrow="Секрет технологии"
      title="Голосу можно доверить компанию"
      lead="Голосовой ввод есть у многих. Мы сделали так, чтобы на нём можно было держать работу целой компании: ничего не теряется, не путается и не остаётся без ответа."
    >
      <div className="grid gap-3 md:grid-cols-2">
        <Reveal>
          <Pillar
            face="listening"
            title="Слышит"
            points={[
              ["Сначала сейф, потом ИИ", "Голосовое сохраняется до распознавания: ни сбой сети, ни сбой модели его не потеряют."],
              [
                "Знает команду по именам",
                "Модель распознавания получает подсказку с именами сотрудников — казахские имена и смешанная речь пишутся правильно.",
              ],
            ]}
          >
            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4">
              <MiniStat value="0–12,5 %" label="ошибок в словах на казахских фразах у выбранной модели" />
              <MiniStat value={<span className="text-muted">75–100 %</span>} label="у модели прошлого поколения — сравнивали на живых записях" />
            </div>
          </Pillar>
        </Reveal>
        <Reveal delay={0.08}>
          <Pillar
            face="parsing"
            title="Понимает"
            points={[
              ["Смысл, а не расшифровка", "Claude разбирает поток на задачи, объявления, встречи, напоминания — сколько бы их ни было в одной фразе."],
              ["Ответ всегда по форме", "Модель обязана вернуть строго заданную структуру — никаких «ИИ ответил криво»."],
              [
                "Имена не путаются",
                "Модель называет имя, человека выбирает сервер по списку команды. Сомневается — предлагает два-три варианта; словарь учится на исправлениях.",
              ],
            ]}
          >
            <div className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-4">
              <MiniStat value={<CountUp to={100} suffix=" %" />} label="исполнитель определён верно" />
              <MiniStat value={<CountUp to={97.6} decimals={1} suffix=" %" />} label="точность разбора" />
              <MiniStat value={<CountUp to={1.5} decimals={1} prefix="≈" suffix=" с" />} label="на разбор фразы" />
            </div>
            <p className="mt-2 text-[12px] leading-4 text-muted">Автотесты на 66 фразах, включая казахские и смешанные.</p>
          </Pillar>
        </Reveal>
        <Reveal>
          <Pillar
            face="sending"
            title="Доставляет"
            points={[
              ["Квитанции", "Каждое уведомление проходит журнал доставки: отправлено → увидел → принял. Директору не нужно переспрашивать."],
              ["Бережёт время людей", "Тихие часы: то, что может подождать, приходит утром; срочное — сразу."],
              ["Живая картинка", "Любое изменение само появляется на всех экранах и на ТВ в кабинете — без обновления страницы."],
            ]}
          />
        </Reveal>
        <Reveal delay={0.08}>
          <Pillar
            face="processing"
            title="Не подводит"
            points={[
              ["Ровно один раз", "У каждого нажатия свой номер: повтор при плохой связи не создаст дубль задачи."],
              ["Отдельная база на клиента", "Никакой общей базы на всех: данные каждой компании лежат физически отдельно."],
              ["Экономика под контролем", "Лаборатория считает цену каждого распознавания и себестоимость клиента."],
            ]}
          />
        </Reveal>
      </div>
    </Section>
  );
}

/* -------------------------------------------------------------------------- */
/* 4. For the director                                                         */
/* -------------------------------------------------------------------------- */

const BAROMETER: { state: MascotState; title: string; note: string }[] = [
  { state: "sleeping", title: "Спит", note: "всё спокойно" },
  { state: "happy", title: "Доволен", note: "всё сделано" },
  { state: "alert", title: "Насторожен", note: "что-то ждёт вас" },
];

function ForDirector() {
  return (
    <Section
      n="04"
      eyebrow="Что получает директор"
      title="Время и спокойствие"
      lead="Раздать работу — одно голосовое. Узнать, как дела, — один взгляд на телефон."
    >
      <Reveal>
        <div className="card p-4 md:p-6">
          <p className="font-display text-[19px] font-bold leading-6">Лицо на главном экране — барометр компании</p>
          <div className="mt-2 grid grid-cols-3">
            {BAROMETER.map((b) => (
              <div key={b.state} className="flex flex-col items-center text-center">
                <Face state={b.state} size={58} />
                <p className="font-display text-[16px] font-bold leading-5">{b.title}</p>
                <p className="text-[13px] leading-4 text-muted">{b.note}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[15px] leading-[22px] text-muted">
            Просрочка, непринятое поручение, вопрос сотрудника — лицо настораживается. Тап — и видно, что именно ждёт решения.
          </p>
        </div>
      </Reveal>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Reveal>
          <Tile icon="eye" title="Видно, кто увидел и кто принял">
            Не нужно звонить и переспрашивать: «не открывал с 9:14» — это факт.
          </Tile>
        </Reveal>
        <Reveal delay={0.06}>
          <Tile icon="stamp" title="Последнее слово — за директором">
            Задачу закрывает только он: «Принято» или «На доработку». Цифровая субординация.
          </Tile>
        </Reveal>
        <Reveal>
          <Tile icon="cup" title="Секретарь одним касанием">
            Кофе, врач, «зайди ко мне», посетитель у двери — без звонков и лишних слов.
          </Tile>
        </Reveal>
        <Reveal delay={0.06}>
          <Tile icon="note" title="Мысли не теряются">
            Заметки и доски голосом — только для себя. «Напомни мне в пять» — напомню.
          </Tile>
        </Reveal>
      </div>

      <Reveal className="mt-3">
        <div className="card grid items-center gap-4 p-4 md:grid-cols-[1.3fr_1fr] md:p-6">
          <TvWall />
          <div>
            <p className="font-display text-[19px] font-bold leading-6">Стена в кабинете</p>
            <p className="mt-1.5 text-[15px] leading-[22px] text-muted">
              ТВ показывает, как живёт компания сегодня. Пульт — в телефоне директора: показать дела сотрудника, календарь, рейтинг.
              «Гость в кабинете» прячет фамилии, очки и названия клиентов.
            </p>
          </div>
        </div>
      </Reveal>
    </Section>
  );
}

/* -------------------------------------------------------------------------- */
/* 5. For the company                                                          */
/* -------------------------------------------------------------------------- */

function ForCompany() {
  return (
    <Section
      n="05"
      eyebrow="Что получает компания"
      title="Порядок без бюрократии"
      lead="Никаких форм и обучения. У сотрудника на телефоне — лента дел и три кнопки."
    >
      <Reveal>
        <div className="card grid items-center gap-2 p-4 md:grid-cols-[auto_1fr] md:gap-8 md:p-6">
          <div className="flex justify-center">
            <Face state="working" size={76} carry={{ count: 3 }} />
          </div>
          <div>
            <p className="font-display text-[19px] font-bold leading-6">Три кнопки — и всё понятно</p>
            <div aria-hidden className="mt-3 grid grid-cols-3 gap-2">
              <span className="btn-primary grid h-11 place-items-center rounded-[12px] text-[14px] font-semibold text-bg">Принял</span>
              <span className="btn-secondary grid h-11 place-items-center rounded-[12px] text-[14px] font-semibold">Уточнить</span>
              <span className="btn-secondary grid h-11 place-items-center rounded-[12px] text-[14px] font-semibold">Не могу</span>
            </div>
            <p className="mt-3 text-[15px] leading-[22px] text-muted">
              Отчёт — текстом, фото или голосом прямо в задаче. Лицо сотрудника держит его дела в руках и зовёт, когда пришло новое.
            </p>
          </div>
        </div>
      </Reveal>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Reveal>
          <Tile icon="archive" title="Ничего не теряется">
            У каждого дела — автор, срок, история, фото и голос директора внутри.
          </Tile>
        </Reveal>
        <Reveal delay={0.06}>
          <Tile icon="team" title="Видна загрузка команды">
            Кто занят, кто свободен, кто ждёт решения — кружками на главном экране директора.
          </Tile>
        </Reveal>
        <Reveal>
          <Tile icon="star" title="Мотивация, а не надзор">
            Очки, рейтинг и магазин мерча за очки. По зарплате очки не бьют никогда.
          </Tile>
        </Reveal>
        <Reveal delay={0.06}>
          <Tile icon="phone" title="Любой телефон">
            Открывается в браузере и ставится на главный экран. Без App Store и установки.
          </Tile>
        </Reveal>
      </div>
    </Section>
  );
}

/* -------------------------------------------------------------------------- */
/* 6. The business                                                             */
/* -------------------------------------------------------------------------- */

function Business() {
  return (
    <Section
      n="06"
      eyebrow="Почему это бизнес"
      title="Дёшево обслуживать, легко тиражировать"
      lead="Конкурент — не другая программа, а мессенджер директора. Выигрываем структурой: одно голосовое становится пятью поручениями со сроками и квитанциями — мессенджер так не умеет."
    >
      <div className="grid gap-3 md:grid-cols-3">
        <Reveal>
          <Stat value={<CountUp to={29} prefix="≈ $" />} label="в месяц — себестоимость клиента до 50 человек: сервер, база и ИИ" />
        </Reveal>
        <Reveal delay={0.06}>
          <Stat value="$0,25–0,6" label="на сотрудника в месяц — чем больше компания, тем дешевле каждый" />
        </Reveal>
        <Reveal delay={0.12}>
          <Stat value={<CountUp to={100} suffix="+" />} label="компаний — цель: МСБ Казахстана и СНГ на 20–200 сотрудников" />
        </Reveal>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Reveal>
          <Tile icon="mic" title="Ниша">
            Директора «старой школы»: стройка, производство, логистика, сервис. Формы они заполнять не будут, а поручения говорят каждый день.
          </Tile>
        </Reveal>
        <Reveal delay={0.06}>
          <Tile icon="lock" title="Своя база у каждого клиента">
            Отдельная база и отдельный сервер на компанию. Аргумент для продажи — и для закона о персональных данных.
          </Tile>
        </Reveal>
      </div>
    </Section>
  );
}

/* -------------------------------------------------------------------------- */
/* 7. What is built                                                            */
/* -------------------------------------------------------------------------- */

const BUILT = [
  "Голос и текст → задачи, объявления, встречи, напоминания, заметки",
  "Главный экран директора: лицо-барометр и вся команда",
  "Задачи: принять, уточнить, отказаться, сдать, вернуть, отозвать",
  "Уведомления с квитанциями «отправлено — увидел — принял»",
  "Переписка внутри задачи: текст, фото, голос",
  "Календарь и встречи с приглашениями",
  "Заметки и доски для мыслей директора",
  "Секретарь: просьбы одним касанием, посетители",
  "ТВ-стена в кабинете и пульт в телефоне",
  "Очки, рейтинг и магазин мерча — включаются тумблером",
  "Словарь имён, который учится на исправлениях",
];

const NEXT = [
  "Гарантийная доставка через Telegram",
  "Вопросы голосом: «Что там по объекту?», «Кто не отчитался?»",
  "Голосовая сводка дня",
  "Пилот на команде первого клиента",
  "Новый клиент под ключ за один день",
];

function Progress() {
  return (
    <Section
      n="07"
      eyebrow="Что уже сделано"
      title="Это не макет — продукт уже работает"
      lead="Всё, что вы увидите дальше, — живое приложение."
    >
      {/* counted in the repository on 2026-09-26: first commit 2026-08-14, D-01…D-123, tests/ai/parser_evals.jsonl */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Reveal>
          <Stat value={<CountUp to={6} />} label="недель разработки" />
        </Reveal>
        <Reveal delay={0.05}>
          <Stat value={<CountUp to={535} />} label="изменений в коде" />
        </Reveal>
        <Reveal delay={0.1}>
          <Stat value={<CountUp to={123} />} label="продуктовых решения в журнале" />
        </Reveal>
        <Reveal delay={0.15}>
          <Stat value={<CountUp to={66} />} label="фраз в автотестах ИИ" />
        </Reveal>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-[1.4fr_1fr]">
        <Reveal>
          <div className="card h-full p-4 md:p-5">
            <p className="eyebrow">Работает сейчас</p>
            <ul className="mt-3 flex flex-col gap-2.5">
              {BUILT.map((item) => (
                <li key={item} className="flex gap-2.5 text-[15px] leading-[21px]">
                  <svg width={18} height={18} viewBox="0 0 24 24" aria-hidden className="mt-[2px] shrink-0 text-accent" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                    <path d="m5 12.5 4.5 4.5L19 7.5" />
                  </svg>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
        <Reveal delay={0.08}>
          <div className="card h-full p-4 md:p-5">
            <p className="eyebrow">Дальше</p>
            <ul className="mt-3 flex flex-col gap-2.5">
              {NEXT.map((item) => (
                <li key={item} className="flex gap-2.5 text-[15px] leading-[21px] text-muted">
                  <span aria-hidden className="mt-[2px] shrink-0 font-display font-bold text-accent">
                    →
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}

/* -------------------------------------------------------------------------- */
/* 8. Over to the app                                                          */
/* -------------------------------------------------------------------------- */

function Finale() {
  return (
    <section className="mt-24 flex flex-col items-center text-center md:mt-32">
      <Reveal className="flex flex-col items-center">
        <Face state="offering" size={96} />
        <h2 className="mt-2 font-display text-[32px] font-extrabold leading-[36px] tracking-[-0.03em] md:text-[44px] md:leading-[48px]">
          Хватит слов.
          <br />
          <span className="text-accent">Смотрим вживую.</span>
        </h2>
        <Link href="/pulse" className="btn-primary mt-6 inline-flex h-12 items-center gap-2 rounded-[12px] px-6 text-[16px] font-semibold text-bg">
          Открыть Пульс
          <span aria-hidden>→</span>
        </Link>
      </Reveal>
      <EcgLine className="mt-10 w-full" />
    </section>
  );
}
