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
  RatingRowBone,
  RowListBone,
  SettingsSectionsBone,
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

/**
 * «Задачи» and «Мои дела» before their data (D-82): the page title, the status screen with
 * grey where the numbers go, the people strip (director), the tabs and a column of closed
 * cards. Every box has the height of the real one, so nothing moves when the data lands.
 */
function CardsSkeleton({ title, director }: { title: string; director: boolean }) {
  return (
    <main className={`mx-auto w-full max-w-lg flex-1 px-4 pt-3 ${director ? "pb-36" : "pb-24"}`}>
      <div className="flex items-end justify-between gap-3 px-0.5">
        <div>
          <SkeletonGroup>
            <Bone h={16} w={148} />
          </SkeletonGroup>
          <h1 className="mt-0.5 text-[30px] font-bold leading-[36px]">{title}</h1>
        </div>
        {director ? <span aria-hidden className="mb-0.5 h-10 w-10 rounded-full border border-border/80 bg-surface" /> : null}
      </div>

      <SkeletonGroup className="status-screen mt-3 rounded-[22px] px-4 pb-0.5 pt-3">
        <div className="flex items-center justify-between">
          <Bone h={16} w={124} />
          <Bone h={16} w={64} />
        </div>
        <div className="mt-2 flex min-h-[52px] items-center gap-3.5">
          <Bone h={46} w={46} className="rounded-[14px]" />
          <div className="flex-1">
            <Bone h={20} w="68%" />
            <Bone h={14} w="46%" className="mt-2" />
          </div>
        </div>
        <Bone h={8} className="mt-3 rounded-full" />
        <div className="mt-2 flex min-h-[18px] gap-3.5">
          <Bone h={16} w={96} className="mt-px" />
          <Bone h={16} w={84} className="mt-px" />
        </div>
        <div className="mt-2.5 flex min-h-[46px] items-center gap-2.5 border-t border-border/60">
          <Bone h={17} w={17} round />
          <Bone h={16} w="56%" />
        </div>
      </SkeletonGroup>

      {director ? (
        <SkeletonGroup className="-mx-4 mt-3 flex gap-2 overflow-hidden px-4 pb-0.5">
          {[64, 96, 88, 104].map((w, i) => (
            <Bone key={i} h={40} w={w} className="shrink-0 rounded-full" />
          ))}
        </SkeletonGroup>
      ) : null}

      <div className="mt-2">
        <div aria-hidden className="h-px" />
        <div className="py-2">
          <SkeletonGroup className="seg rounded-[14px] p-1">
            <Bone h={40} w="33%" className="rounded-[10px]" />
          </SkeletonGroup>
        </div>
      </div>

      <SkeletonGroup className="mt-1 flex flex-col gap-2">
        <div className="px-1 pb-0.5 pt-4">
          <Bone h={16} w={104} />
        </div>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="task-card flex gap-3 rounded-[18px] px-3.5 pb-3 pt-3.5">
            <Bone h={22} w={22} round className="shrink-0" />
            <div className="flex-1">
              <div className="flex gap-3">
                <Bone h={21} w={i % 2 ? "58%" : "74%"} />
                <Bone h={16} w={72} className="ml-auto mt-0.5 shrink-0" />
              </div>
              <Bone h={16} w={140} className="mt-1.5" />
            </div>
          </div>
        ))}
      </SkeletonGroup>
    </main>
  );
}

/** «Задачи» директора: the same page, grey. */
export function SentSkeleton() {
  return <CardsSkeleton title="Задачи" director />;
}

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
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36 pt-4">
      <Title text="Настройки" sub="Всё здесь — конфигурация компании: код одинаков для всех клиентов" />
      <h2 className="eyebrow mt-6 px-1">Компания</h2>
      <div className="mt-2">
        <SettingsSectionsBone count={1} />
      </div>
      <SkeletonGroup className="mt-2">
        <Bone h={176} className="rounded-[16px]" />
      </SkeletonGroup>
      <h2 className="eyebrow mt-6 px-1">Правила работы</h2>
      <div className="mt-2">
        <SettingsSectionsBone />
      </div>
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

/** «Заметки»: a printed day label and cards of a heading, a line and the time. */
export function NotesListBone() {
  return (
    <SkeletonGroup className="mt-4">
      <Bone h={16} w={72} className="mx-1" />
      <div className="mt-2 flex flex-col gap-2.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card px-3.5 pb-2.5 pt-3">
            <Bone h={22} w={i === 1 ? "58%" : "76%"} />
            <Bone h={20} w="88%" className="mt-1" />
            <Bone h={12} w={44} className="mt-4" />
          </div>
        ))}
      </div>
    </SkeletonGroup>
  );
}

/**
 * «Заметки» while the feed loads: the dictaphone of components/notes/NotesDevice.tsx
 * with grey where the words will be, then the privacy line, the search and the feed.
 */
export function NotesSkeleton() {
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36 pt-3">
      <SkeletonGroup className={`${device.body} mx-auto w-full max-w-[380px]`}>
        <Bone h={14} w={64} className="mx-auto rounded-full" />
        <div className={`${device.lcd} mt-3`}>
          <div className="min-h-[102px]">
            <div className="flex items-center justify-between">
              <Bone h={12} w={80} />
              <Bone h={12} w={40} />
            </div>
            <Bone h={26} w="46%" className="mt-3" />
            <Bone h={14} w="70%" className="mt-2" />
            <Bone h={14} w="44%" className="mt-1.5" />
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <Bone h={60} className="flex-1 rounded-[18px]" />
          <Bone h={60} w={60} className="shrink-0 rounded-full" />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {[0, 1, 2].map((i) => (
            <Bone key={i} h={60} className="rounded-[18px]" />
          ))}
        </div>
        <div className="mt-2 h-[5px]" />
      </SkeletonGroup>
      <SkeletonGroup className="mt-2 flex justify-center">
        <Bone h={16} w={180} />
      </SkeletonGroup>
      <SkeletonGroup className="mt-3">
        <Bone h={44} className="rounded-[12px]" />
      </SkeletonGroup>
      <NotesListBone />
    </main>
  );
}

/** «Мои дела»: the same page as the director's, without the people strip. */
export function TasksSkeleton() {
  return <CardsSkeleton title="Мои дела" director={false} />;
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
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36 pt-4">
      <SkeletonGroup>
        <section className="card px-4 pb-4 pt-7 text-center">
          <Bone round w={84} h={84} className="mx-auto" />
          <Bone h={30} w={190} className="mx-auto mt-3.5" />
          <Bone h={18} w={120} className="mx-auto mt-1" />
          <Bone h={26} w={104} className="mx-auto mt-2.5 rounded-full" />
          <div className="mt-4 grid grid-cols-3 gap-2 rounded-[12px] bg-surface-2 py-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex flex-col items-center">
                <Bone h={20} w={26} className="bg-border" />
                <Bone h={12} w={64} className="mt-2 bg-border" />
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-[12px] bg-surface-2 px-3 pb-3 pt-2.5">
            <div className="flex items-center justify-between">
              <Bone h={16} w={110} className="bg-border" />
              <Bone h={16} w={72} className="bg-border" />
            </div>
            <div className="mt-2 flex h-[36px] items-end gap-[3px]">
              {Array.from({ length: 14 }, (_, i) => (
                <span key={i} className="flex-1 rounded-[3px] bg-border" style={{ height: 3 }} />
              ))}
            </div>
          </div>
        </section>
      </SkeletonGroup>
      <h2 className="eyebrow mt-6 px-1">Личное</h2>
      <SkeletonGroup className="mt-2">
        <Bone h={176} className="rounded-[16px]" />
      </SkeletonGroup>
      <SkeletonGroup className="mt-6">
        <Bone h={58} className="rounded-[16px]" />
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
