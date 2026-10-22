"use client";

import { MotionConfig } from "framer-motion";
import type { ReactNode } from "react";

import { CountUp, EcgLine, Reveal } from "@/components/lab/pitch/parts";

import { RlsDemo } from "./RlsDemo";
import { TechMap } from "./TechMap";

/**
 * «Технология» — what is under the hood, shown rather than told: the pipeline as a moving
 * system map with its failure modes, the one database with walls between companies, and the
 * parts it is built from. The measured numbers are the last parser run on Claude
 * (tests/ai/results/2026-09-22_1315.json) and the latency target of D-43; nothing reads data.
 */
export function TechStory() {
  return (
    <MotionConfig reducedMotion="user">
      <Hero />
      <MapSection />
      <Isolation />
      <Stack />
    </MotionConfig>
  );
}

function Section({ n, eyebrow, title, lead, children }: { n: string; eyebrow: string; title: ReactNode; lead?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-16 md:mt-24">
      <Reveal>
        <p className="eyebrow">
          <span className="nums text-accent">{n}</span> · {eyebrow}
        </p>
        <h2 className="mt-3 font-display text-[30px] font-extrabold leading-[34px] tracking-[-0.03em] md:text-[42px] md:leading-[46px]">{title}</h2>
        {lead ? <p className="mt-3 max-w-[62ch] text-[16px] leading-[24px] text-muted md:text-[18px] md:leading-[28px]">{lead}</p> : null}
      </Reveal>
      <div className="mt-6 md:mt-8">{children}</div>
    </section>
  );
}

function Hero() {
  return (
    <section className="pt-2 md:pt-6">
      <p className="eyebrow">Технология</p>
      <h1 className="mt-3 font-display text-[42px] font-extrabold leading-[44px] tracking-[-0.035em] md:text-[62px] md:leading-[62px]">
        Путь одного
        <br />
        <span className="text-accent">голосового</span>
      </h1>
      <p className="mt-4 max-w-[52ch] text-[17px] leading-[26px] text-muted md:text-[19px] md:leading-[29px]">
        Схема системы в движении. Фраза директора проходит через его телефон, облако и телефон сотрудника — на каждом узле видно, что с ней
        происходит и что будет, если что-то сломается.
      </p>
      <EcgLine className="mt-4" />
      <div className="mt-6 grid grid-cols-3 gap-2 md:gap-3">
        <Fact value="1 ключ" label="на всё действие: повтор не создаёт дубль" />
        <Fact value="0 потерь" label="запись в сейфе раньше, чем её услышит ИИ" />
        <Fact value="3 отметки" label="отправлено · увидел · принял" />
      </div>
    </section>
  );
}

function Fact({ value, label }: { value: string; label: string }) {
  return (
    <div className="card p-3 md:p-4">
      <p className="nums font-display text-[22px] font-extrabold leading-7 tracking-[-0.03em] md:text-[30px] md:leading-9">{value}</p>
      <p className="mt-1 text-[13px] leading-[17px] text-muted md:text-[14px] md:leading-5">{label}</p>
    </div>
  );
}

function MapSection() {
  return (
    <Section
      n="01"
      eyebrow="Схема в движении"
      title="От голоса до «принял»"
      lead="Выберите сценарий: обычный путь или один из сбоев. Шаги и узлы схемы нажимаются — рядом видно, что проходит через узел на самом деле."
    >
      <Reveal>
        <TechMap />
      </Reveal>
    </Section>
  );
}

function Isolation() {
  return (
    <Section
      n="02"
      eyebrow="Изоляция"
      title="Одна база — стены между компаниями"
      lead="Все клиенты живут в одной базе Postgres. Каждая строка помечена компанией, и правило доступа выполняет сама база. Выберите, кто спрашивает."
    >
      <Reveal>
        <RlsDemo />
      </Reveal>
    </Section>
  );
}

const PARTS: { area: string; tech: string; text: string }[] = [
  {
    area: "Телефон",
    tech: "Next.js 15 · PWA",
    text: "Свой service worker: уведомления и офлайн-копия приложения. Запись и неотправленное ждут сети в IndexedDB.",
  },
  {
    area: "Голос",
    tech: "gpt-4o-transcribe",
    text: "Подсказка с именами команды. Распознавание — за сменным интерфейсом: запасной провайдер включается в настройках компании.",
  },
  {
    area: "Смысл",
    tech: "Claude Haiku 4.5",
    text: "Structured outputs по своей JSON-схеме. Сложные фразы перепроверяет Sonnet; длинные обе модели разбирают сразу, параллельно.",
  },
  {
    area: "Данные",
    tech: "Supabase · Франкфурт",
    text: "Postgres с RLS, Realtime и Storage. Действие над несколькими таблицами — функция в базе, одной транзакцией.",
  },
  {
    area: "Доставка",
    tech: "Web Push · VAPID",
    text: "Очередь с квитанциями «отправлено → увидел → принял» и окно доставки компании — ночью никого не будит.",
  },
  {
    area: "Сервер",
    tech: "Vercel · fra1",
    text: "Функции стоят в том же регионе, что и база. Фоновая работа — тик по расписанию.",
  },
];

function Stack() {
  return (
    <Section
      n="03"
      eyebrow="Стек"
      title="Из чего собрано"
      lead="Данные — в переносимом Postgres, модели — за сменными интерфейсами: провайдера распознавания или разбора меняет настройка, а не переписывание."
    >
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {PARTS.map((part, i) => (
          <Reveal key={part.area} delay={(i % 3) * 0.06}>
            <div className="card h-full p-4">
              <p className="eyebrow">{part.area}</p>
              <p className="mt-1.5 font-mono text-[15px] font-semibold leading-5 text-accent">{part.tech}</p>
              <p className="mt-2 text-[15px] leading-[22px] text-muted">{part.text}</p>
            </div>
          </Reveal>
        ))}
      </div>

      <Reveal className="mt-3">
        <div className="card p-4 md:p-6">
          <p className="font-display text-[19px] font-bold leading-6">Разбор — по замерам, а не по ощущениям</p>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <Measure value={<CountUp to={100} suffix=" %" />} label="исполнитель определён верно" />
            <Measure value={<CountUp to={97.6} decimals={1} suffix=" %" />} label="точность разбора (F1)" />
            <Measure value={<CountUp to={1.5} decimals={1} suffix=" с" />} label="разбор фразы, медиана" />
          </div>
          <p className="mt-3 text-[13px] leading-[18px] text-muted">
            Claude Haiku 4.5 с перепроверкой на Sonnet · автотесты на 66 фразах, включая казахские и смешанные · прогон 22.09.2026. Любая правка
            промпта проходит этот корпус, иначе не принимается.
          </p>
          <p className="mt-3 border-t border-border pt-3 text-[15px] leading-[22px] text-muted">
            <span className="font-semibold text-text">Цель — не дольше 6 секунд</span> от отпускания кнопки до карточек на доске (медиана).
          </p>
        </div>
      </Reveal>
    </Section>
  );
}

function Measure({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div>
      <p className="font-display text-[26px] font-extrabold leading-8 tracking-[-0.02em] text-accent md:text-[34px] md:leading-10">{value}</p>
      <p className="mt-1 text-[13px] leading-[17px] text-muted">{label}</p>
    </div>
  );
}
