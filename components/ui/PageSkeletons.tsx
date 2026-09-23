/**
 * Page compositions of the skeleton blocks. Each keeps the page's real static chrome
 * (title, subtitle, filters) so only the dynamic area pulses, and each is used twice:
 * by the route's loading.tsx during navigation and by the page while its data loads.
 * Server-safe.
 */
import { Mascot } from "@/components/brand/Mascot";
import device from "@/components/ui/device/device.module.css";

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

/** Пульс (D-60): the face alone in the middle of the screen while its data loads. */
export function PulseSkeleton() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center px-4 pb-28">
      <div className="flex h-[152px] w-[152px] items-center justify-center">
        <Mascot state="sleeping" size={128} />
      </div>
    </main>
  );
}

/** The thread of a task list while its data is on the way: line, beads, text blocks. */
function TraceBone({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative" style={{ paddingLeft: 24 }}>
      <span aria-hidden className="absolute bottom-2 top-1 w-px bg-border" style={{ left: 8 }} />
      {children}
    </div>
  );
}

function BeadBone() {
  return <span aria-hidden className="absolute block rounded-full bg-border" style={{ left: -21, top: 7, width: 10, height: 10 }} />;
}

/** «Задачи»: two piles on the thread — a heading, then title, deadline and who. */
export function SentListBone() {
  return (
    <SkeletonGroup className="mt-4">
      <TraceBone>
        {[0, 1].map((group) => (
          <div key={group} className={group ? "mt-6" : ""}>
            <Bone h={16} w={92} className="mb-3" />
            <div className="flex flex-col gap-4">
              {[0, 1].map((i) => (
                <div key={i} className="relative">
                  <BeadBone />
                  <div className="flex items-baseline gap-3">
                    <Bone h={22} w={i ? "54%" : "70%"} />
                    <Bone h={16} w={78} className="ml-auto shrink-0" />
                  </div>
                  <Bone h={16} w={124} className="mt-1.5" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </TraceBone>
    </SkeletonGroup>
  );
}

/**
 * «Задачи»: the desk before its data — the same body, lens, display and keys as the head
 * (components/tasks/desk/Desk.tsx), grey where the words will be — then the search field,
 * the order row and the thread of the list. The display keeps its height, so the keys
 * under it are already where the thumb will find them.
 */
export function SentSkeleton() {
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36 pt-3">
      <div className="h-px" />
      <div className="-mx-4 px-4 pb-3">
        <SkeletonGroup className={`${device.body} mx-auto w-full max-w-[380px]`}>
          <Bone h={14} w={64} className="mx-auto rounded-full" />
          <div className={`${device.lcd} mt-3`}>
            <div className="min-h-[155px]">
              <div className="flex items-center justify-between">
                <Bone h={12} w={120} />
                <Bone h={12} w={40} />
              </div>
              <Bone h={24} w="78%" className="mt-3" />
              <Bone h={14} w="52%" className="mt-2.5" />
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {[0, 1, 2].map((i) => (
              <Bone key={i} h={66} className="rounded-[18px]" />
            ))}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {[0, 1, 2].map((i) => (
              <Bone key={i} h={60} className="rounded-[18px]" />
            ))}
          </div>
          <div className="mt-2 h-[5px]" />
        </SkeletonGroup>
      </div>
      <SkeletonGroup className="mt-1">
        <Bone h={44} className="rounded-[12px]" />
      </SkeletonGroup>
      <SkeletonGroup className="mt-3 flex min-h-[36px] items-center">
        <Bone h={16} w={88} />
      </SkeletonGroup>
      <SentListBone />
    </main>
  );
}

/** Пульт от телевизора: карточка «Сейчас на стене», поиск по людям и список. */
export function ScreenSkeleton() {
  return (
    <main className={MAIN}>
      <Title text="Экран в кабинете" sub="Пульт от телевизора: что сейчас на стене и что показать" />
      <SkeletonGroup className="mt-4 card p-4">
        <Bone h={26} w={200} />
        <Bone h={16} w={120} className="mt-2" />
      </SkeletonGroup>
      <h2 className="eyebrow mt-6 px-1">Показать сотрудника</h2>
      <SkeletonGroup className="mt-2">
        <Bone h={44} className="rounded-[12px]" />
      </SkeletonGroup>
      <div className="mt-2">
        <RowListBone count={4} />
      </div>
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

export function TasksListBone() {
  return (
    <SkeletonGroup className="mt-4">
      <TraceBone>
        {[0, 1].map((group) => (
          <div key={group} className={group ? "mt-7" : ""}>
            <Bone h={16} w={92} className="mb-3" />
            <div className="flex flex-col gap-5">
              {[0, 1].map((i) => (
                <div key={i} className="relative">
                  <BeadBone />
                  <div className="flex items-baseline gap-3">
                    <Bone h={16} w={88} />
                    <Bone h={22} w={96} className="ml-auto shrink-0 rounded-full" />
                  </div>
                  <Bone h={22} w={i ? "62%" : "80%"} className="mt-2" />
                  <div className="mt-4 flex gap-2">
                    <Bone h={44} w={104} className="rounded-[12px]" />
                    <Bone h={44} w={104} className="rounded-[12px]" />
                    <Bone h={44} w={96} className="rounded-[12px]" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </TraceBone>
    </SkeletonGroup>
  );
}

/** «Заметки»: three cards of a heading and one quiet line. */
export function NotesListBone() {
  return (
    <SkeletonGroup className="mt-4 flex flex-col gap-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="card p-3">
          <Bone h={22} w={i === 1 ? "58%" : "76%"} />
          <Bone h={16} w="42%" className="mt-2" />
        </div>
      ))}
    </SkeletonGroup>
  );
}

export function TasksSkeleton() {
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-10 pt-4">
      <Title text="Мои дела" sub=" " />
      <TasksListBone />
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

/** The calendar ribbon: a day heading and its rows — the geometry of CalendarList. */
export function CalendarListBone() {
  return (
    <SkeletonGroup className="mt-4">
      {[0, 1].map((group) => (
        <div key={group} className={group ? "mt-6" : ""}>
          <Bone h={16} w="24%" />
          <div className="mt-2 flex flex-col gap-2">
            {[0, 1].map((row) => (
              <div key={row} className="card flex items-start gap-3 p-3">
                <Bone h={22} w={52} />
                <div className="min-w-0 flex-1">
                  <Bone h={22} w={row ? "52%" : "68%"} />
                  <Bone h={16} w="38%" className="mt-2" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </SkeletonGroup>
  );
}

export function CalendarSkeleton() {
  return (
    <main className={MAIN}>
      <Title text="Календарь" />
      <CalendarListBone />
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
