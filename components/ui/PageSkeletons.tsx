/**
 * Page compositions of the skeleton blocks. Each keeps the page's real static chrome
 * (title, subtitle, filters) so only the dynamic area pulses, and each is used twice:
 * by the route's loading.tsx during navigation and by the page while its data loads.
 * Server-safe.
 */
import { Mascot } from "@/components/brand/Mascot";

import {
  AnnouncementBone,
  Bone,
  ChatBone,
  PeopleGridBone,
  CompanyFormBone,
  RatingRowBone,
  RowListBone,
  SectionBone,
  SkeletonGroup,
  StatBone,
  TableBone,
  TaskCardBone,
  TaskListBone,
} from "./Skeleton";

const MAIN = "mx-auto w-full max-w-lg flex-1 px-4 pb-36 pt-5";

function Title({ text, sub }: { text: string; sub?: string }) {
  return (
    <>
      <h1 className="text-[24px] font-bold leading-[30px]">{text}</h1>
      {sub ? <p className="mt-1 text-[13px] leading-4 text-muted">{sub}</p> : null}
    </>
  );
}

/* ---- director ---------------------------------------------------------------- */

/** The inbox part of Пульс (below the verdict card, which renders itself while loading). */
export function PulseInboxBone() {
  return (
    <SkeletonGroup className="mt-6">
      <div className="flex items-center gap-2">
        <Bone round w={10} h={10} />
        <Bone h={24} w={120} />
      </div>
      <div className="mt-3">
        <TaskListBone count={2} variant="director" />
      </div>
    </SkeletonGroup>
  );
}

/** Пульс (D-57): the assistant thinking, its first line, two tiles of the board, the pinned button block. */
export function PulseSkeleton() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 pb-[196px] pt-3">
      <div className="mx-auto flex h-[128px] w-[128px] items-center justify-center [@media(max-height:760px)]:h-[104px] [@media(max-height:760px)]:w-[104px]">
        <span className="flex items-center justify-center [@media(max-height:760px)]:scale-[0.82]">
          <Mascot state="thinking" size={112} />
        </span>
      </div>
      <div className="mt-2 flex flex-col gap-2">
        <div className="py-1 pl-4 text-[17px] leading-6">Смотрю, что нового…</div>
      </div>
      <SkeletonGroup className="mt-4 flex flex-col gap-2">
        <div className="mb-1 flex gap-2">
          <Bone round w={96} h={26} />
          <Bone round w={110} h={26} />
        </div>
        {[0, 1].map((i) => (
          <div key={i} className="rounded-[20px] border border-border bg-surface p-4 pl-5">
            <div className="flex items-center justify-between">
              <Bone w={72} h={14} />
              <Bone w={64} h={12} />
            </div>
            <Bone className="mt-2" w="80%" h={20} />
            <Bone className="mt-2" w={140} h={14} />
          </div>
        ))}
      </SkeletonGroup>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 z-20 flex flex-col items-center pt-8"
        style={{
          bottom: "calc(56px + env(safe-area-inset-bottom))",
          paddingBottom: 12,
          background: "linear-gradient(180deg, transparent, var(--bg) 28px)",
        }}
      >
        <SkeletonGroup className="flex flex-col items-center gap-2">
          <Bone round w={80} h={80} />
          <span className="text-[16px] font-semibold leading-[22px]">Дать задачу</span>
          <span className="text-[13px] leading-4 text-muted">удержи — говори · тап — текст</span>
        </SkeletonGroup>
      </div>
    </main>
  );
}

/** «Задачи»: capsule rows — a dot, a title, one meta line, a short status. */
export function SentListBone() {
  return (
    <SkeletonGroup className="mt-5 flex flex-col gap-2">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3 rounded-[20px] border border-border bg-surface py-3 pl-4 pr-4">
          <Bone round w={10} h={10} />
          <div className="min-w-0 flex-1">
            <Bone h={22} w={i % 2 ? 180 : 220} />
            <Bone h={16} w={240} className="mt-1" />
          </div>
          <Bone h={16} w={52} />
        </div>
      ))}
    </SkeletonGroup>
  );
}

export function SentSkeleton() {
  return (
    <main className={MAIN}>
      <Title text="Задачи" sub=" " />
      <SkeletonGroup className="mt-4 flex flex-wrap gap-2">
        {[96, 118, 104, 64].map((w) => (
          <Bone key={w} h={36} w={w} className="rounded-full" />
        ))}
      </SkeletonGroup>
      <SentListBone />
    </main>
  );
}

/** Search, filter chips, the count line, then rows — the roster below the grid. */
export function TeamListBone() {
  return (
    <SkeletonGroup className="mt-4">
      <Bone h={44} className="rounded-[12px]" />
      <div className="mt-3 flex flex-wrap gap-2">
        {[52, 92, 118, 122, 96].map((w) => (
          <Bone key={w} h={32} w={w} className="rounded-full" />
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <Bone h={16} w={80} />
        <Bone h={16} w={160} />
      </div>
      <div className="mt-4">
        <Bone h={16} w={110} className="mb-2" />
        <RowListBone count={6} />
      </div>
    </SkeletonGroup>
  );
}

export function PeopleSkeleton() {
  return (
    <main className={MAIN}>
      <div className="flex items-end justify-between gap-3">
        <Title text="Команда" sub=" " />
        <Bone h={44} w={128} className="rounded-[12px]" />
      </div>
      <SkeletonGroup className="mt-7">
        <Bone h={24} w={80} />
        <div className="mt-3">
          <PeopleGridBone />
        </div>
      </SkeletonGroup>
      <div className="mt-6 flex min-h-[48px] items-center justify-between card px-4 text-[16px] leading-[22px]">
        Рейтинг
        <span className="text-[13px] leading-4 text-muted">очки и динамика ›</span>
      </div>
      <h2 className="mt-7 text-[19px] font-semibold leading-6">Все сотрудники</h2>
      <TeamListBone />
    </main>
  );
}

export function PersonSkeleton() {
  return (
    <main className={MAIN}>
      <p className="text-[13px] leading-4 text-muted">← Сотрудники</p>
      <SkeletonGroup>
        <section className="mt-3 card p-4">
          <div className="flex items-start gap-3">
            <Bone round w={64} h={64} className="shrink-0" />
            <div className="min-w-0 flex-1">
              <Bone h={30} w="70%" />
              <Bone h={22} w="45%" className="mt-1" />
              <Bone h={28} w={96} className="mt-2 rounded-full" />
            </div>
          </div>
          <div className="mt-4 grid grid-cols-4 gap-2">
            <StatBone label="в работе" />
            <StatBone label="просрочено" />
            <StatBone label="закрыто за 30 дн." />
            <StatBone label="очков" />
          </div>
          <div className="mt-4 flex gap-2">
            <Bone h={44} className="rounded-[12px]" />
            <Bone h={44} w={110} className="rounded-[12px]" />
            <Bone h={44} w={100} className="rounded-[12px]" />
          </div>
        </section>
        <div className="mt-6">
          <Bone h={24} w={100} />
          <div className="mt-3">
            <TaskListBone count={2} variant="director" />
          </div>
        </div>
      </SkeletonGroup>
    </main>
  );
}

export function SettingsSkeleton() {
  return (
    <main className={MAIN}>
      <Title text="Настройки" sub="Всё здесь — конфигурация компании: код одинаков для всех клиентов" />
      <h2 className="mt-5 text-[13px] font-semibold uppercase tracking-wide text-muted">Компания</h2>
      <div className="mt-2 flex flex-col gap-2">
        {[
          ["Сотрудники", "карточки, алиасы, роли ›"],
          ["Данные", "таблицы компании как есть ›"],
          ["Задачи", "все поручения списком ›"],
        ].map(([title, hint]) => (
          <div key={title} className="flex min-h-[52px] items-center justify-between gap-3 card px-4 text-[16px] leading-[22px]">
            {title}
            <span className="text-[13px] leading-4 text-muted">{hint}</span>
          </div>
        ))}
      </div>
      <SkeletonGroup className="mt-4">
        <CompanyFormBone />
      </SkeletonGroup>
      <h2 className="mt-6 text-[13px] font-semibold uppercase tracking-wide text-muted">Голос и разбор</h2>
      <SkeletonGroup className="mt-2 flex flex-col gap-4">
        <SectionBone fields={3} />
        <SectionBone fields={2} />
      </SkeletonGroup>
    </main>
  );
}

export function AdminSkeleton() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-36 pt-5">
      <Title text="Данные" sub="Таблицы компании как есть, только чтение. Под правами директора: чужих компаний здесь нет" />
      <SkeletonGroup className="mt-4 flex flex-wrap gap-2">
        {[84, 110, 72, 68, 90, 160, 120].map((w, i) => (
          <Bone key={i} h={36} w={w} className="rounded-full" />
        ))}
      </SkeletonGroup>
      <SkeletonGroup className="mt-4 card">
        <div className="px-4 pt-4">
          <Bone h={26} w={140} />
          <Bone h={16} w={200} className="mt-1" />
          <Bone h={40} w={240} className="mt-3 rounded-[12px]" />
        </div>
        <div className="mt-3">
          <TableBone rows={6} columns={3} />
        </div>
      </SkeletonGroup>
    </main>
  );
}

/* ---- employee ---------------------------------------------------------------- */

export function FeedSkeleton() {
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-10 pt-5">
      <Title text="Лента" />
      <SkeletonGroup className="mt-4">
        <TaskListBone count={3} />
      </SkeletonGroup>
    </main>
  );
}

export function TasksSkeleton() {
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-10 pt-5">
      <Title text="Мои дела" />
      <SkeletonGroup className="mt-4">
        <TaskListBone count={3} />
      </SkeletonGroup>
    </main>
  );
}

/* ---- shared ------------------------------------------------------------------ */

export function EtherListBone() {
  return (
    <SkeletonGroup className="mt-5 flex flex-col gap-3">
      <AnnouncementBone />
      <AnnouncementBone />
    </SkeletonGroup>
  );
}

export function EtherSkeleton() {
  return (
    <main className={MAIN}>
      <Title text="Эфир" sub=" " />
      <EtherListBone />
    </main>
  );
}

export function RatingListBone({ withAward = true }: { withAward?: boolean }) {
  return (
    <SkeletonGroup className="mt-4 space-y-2">
      {Array.from({ length: 6 }, (_, i) => (
        <RatingRowBone key={i} withAward={withAward} />
      ))}
    </SkeletonGroup>
  );
}

export function RatingSkeleton() {
  return (
    <main className={MAIN}>
      <Title text="Рейтинг" sub="Очки за закрытые в срок задачи и поощрения директора" />
      <div className="mt-4 flex gap-2">
        <Bone h={32} w={92} className="rounded-full" />
        <Bone h={32} w={84} className="rounded-full" />
        <Bone h={32} w={104} className="rounded-full" />
      </div>
      <RatingListBone />
    </main>
  );
}

export function ProfileSkeleton() {
  return (
    <main className={MAIN}>
      <Title text="Профиль" />
      <SkeletonGroup className="mt-4">
        <section className="card p-4">
          <div className="flex items-center gap-4">
            <Bone round w={64} h={64} className="shrink-0" />
            <div className="min-w-0 flex-1">
              <Bone h={24} w="60%" />
              <Bone h={16} w="40%" className="mt-1" />
              <Bone h={28} w={96} className="mt-2 rounded-full" />
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <StatBone label=" " />
            <StatBone label=" " />
            <StatBone label=" " />
          </div>
        </section>
      </SkeletonGroup>
      <h2 className="mt-6 text-[13px] font-semibold uppercase tracking-wide text-muted">Личное</h2>
      <SkeletonGroup className="mt-2 flex flex-col gap-2">
        {[0, 1, 2].map((i) => (
          <Bone key={i} h={52} className="rounded-[16px]" />
        ))}
      </SkeletonGroup>
    </main>
  );
}

export function TaskPageSkeleton() {
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-5">
      <p className="flex min-h-[32px] items-center gap-1 text-[14px] leading-[18px] text-muted">
        <span aria-hidden>←</span> Назад
      </p>
      <SkeletonGroup>
        <div className="mt-3">
          <TaskCardBone variant="director" />
        </div>
        <section className="mt-4 card px-4 py-2">
          <h2 className="pt-1 text-[13px] font-semibold uppercase tracking-wide text-muted">Сроки</h2>
          {["Создана", "Срок", "Принял", "Выполнил", "Закрыта"].map((label) => (
            <div key={label} className="flex items-center justify-between py-1.5">
              <span className="text-[13px] leading-4 text-muted">{label}</span>
              <Bone h={18} w={110} />
            </div>
          ))}
        </section>
        <section className="mt-4">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">Хронология</h2>
          <div className="mt-2 border-l border-border pl-4">
            <Bone h={18} w="70%" className="my-1.5" />
            <Bone h={18} w="55%" className="my-1.5" />
          </div>
        </section>
        <section className="mt-4">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">Чат</h2>
          <div className="mt-2">
            <ChatBone />
          </div>
        </section>
      </SkeletonGroup>
    </main>
  );
}
