/**
 * Page compositions of the skeleton blocks. Each keeps the page's real static chrome
 * (title, subtitle, filters) so only the dynamic area pulses, and each is used twice:
 * by the route's loading.tsx during navigation and by the page while its data loads.
 * The rule (D-122): a skeleton draws the screen down to the first block whose place depends
 * on the data, each block with the box of the real one (the real component in its pending
 * form where there is one), and below it one placeholder for the rest — so when the data
 * lands, things fill in and appear under what is there, nothing that is there moves.
 * `pnpm smoke:stages` measures every screen at every stage. Importable from loading.tsx.
 */
import { DataTable } from "@/components/admin/DataTable";
import { TableChips } from "@/components/admin/tables";
import { Mascot } from "@/components/brand/Mascot";
import { PeriodChips } from "@/components/rating/PeriodChips";
import { ShopRow } from "@/components/rating/ShopRow";
import { SettingsTiles } from "@/components/settings/SettingsTiles";
import { Tabs } from "@/components/tasks/list/Tabs";
import { HeadButtonBone } from "@/components/ui/HeadButton";
import { PageHead } from "@/components/ui/PageHead";
import { ADMIN_TABLES } from "@/lib/admin/tables";

import {
  AnnouncementBone,
  Bone,
  PeopleGridBone,
  RatingRowBone,
  RowListBone,
  SectionBone,
  SettingsSectionsBone,
  SkeletonGroup,
  StatBone,
  TaskListBone,
} from "./Skeleton";

const MAIN = "mx-auto w-full max-w-lg flex-1 px-4 pb-36";

/**
 * The screen head (D-113) as the page draws it. A line that loads keeps its room with a
 * no-break space: a plain " " collapses to nothing and the head grew by a line on arrival.
 */
function Title({ text, sub }: { text: string; sub?: string }) {
  return <PageHead title={text} sub={sub} />;
}

/** The date above the title, still grey: the phone's «now» draws it (D-113). */
const DATE_BONE = (
  <SkeletonGroup>
    <Bone h={16} w={148} />
  </SkeletonGroup>
);

/* ---- director ---------------------------------------------------------------- */

/** The inbox part of Пульс (below the verdict card, which renders itself while loading). */
export function PulseInboxBone() {
  return (
    <SkeletonGroup grow className="mt-6">
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

/**
 * Пульс and Лента (D-60) before their data: the page's own three bands with the face asleep
 * in the middle one — the box of MascotLever (128 + 24) and its 0.82 on a low screen — so the
 * face is where the page will put it, at the size it will have.
 */
export function PulseSkeleton() {
  return (
    <main className="mx-auto flex w-full min-h-0 max-w-lg flex-1 flex-col overflow-hidden px-4" data-board="">
      <div className="min-h-0 flex-1" data-band="said" />
      <div className="relative flex shrink-0 flex-col items-center">
        <div className="flex h-[152px] w-[152px] items-center justify-center">
          <span className="flex items-center justify-center [@media(max-height:760px)]:scale-[0.82]">
            <Mascot state="sleeping" size={128} />
          </span>
        </div>
      </div>
      <div className="min-h-0 flex-1" data-band="cards" />
    </main>
  );
}

/**
 * A column of closed task cards under a section label: the part of a list screen whose
 * length only the data knows, so it is always the last block of a skeleton (D-122); its top
 * margin puts it where the page's first data block will start.
 */
function CardColumnBone({ className = "mt-1", count = 4 }: { className?: string; count?: number }) {
  return (
    <SkeletonGroup grow className={`flex flex-col gap-2 ${className}`}>
      <div className="px-1 pb-0.5 pt-4">
        <Bone h={16} w={104} />
      </div>
      {Array.from({ length: count }, (_, i) => (
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
  );
}

/**
 * «Задачи» and «Мои дела» before their data (D-83): the page head, the status screen with
 * grey where the numbers go, then only what stands where the data will not move it (D-122).
 * The director's people strip exists only when two people have open work, and the tabs
 * stand under it — so his skeleton stops at the status screen and a column of cards holds
 * the place of both; «Мои дела» has no strip, so its real tabs stand ready (`pending`).
 */
function CardsSkeleton({ title, director }: { title: string; director: boolean }) {
  return (
    <main className={`mx-auto w-full max-w-lg flex-1 px-4 ${director ? "pb-36" : "pb-24"}`}>
      <PageHead eyebrow={DATE_BONE} title={title} actions={director ? <HeadButtonBone /> : null} />

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
        // where the tabs start when there is no strip (the tabs' 1 px sentinel under mt-2)
        <CardColumnBone className="mt-[9px]" />
      ) : (
        <>
          <Tabs id="mine" pending value="new" className="mt-2" items={MINE_TABS} />
          <CardColumnBone />
        </>
      )}
    </main>
  );
}

/** The piles of «Мои дела», as EmployeeTasksView names them. */
const MINE_TABS = [
  { key: "new", label: "Новые", count: 0 },
  { key: "working", label: "В работе", count: 0 },
  { key: "closed", label: "Закрытые", count: 0 },
] as const;

/** «Задачи» директора: the same page, grey. */
export function SentSkeleton() {
  return <CardsSkeleton title="Задачи" director />;
}

export function TeamListBone() {
  return (
    <SkeletonGroup grow className="mt-4">
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

/**
 * «Команда» (D-104): the head with its state line and the grid «Сейчас» as PeopleGrid draws
 * it while loading. The grid is as long as the team, so the skeleton stops there — the page
 * shows the rows under it only once the grid has its size.
 */
export function PeopleSkeleton() {
  return (
    <main className={MAIN}>
      <PageHead title="Команда" state={LOADING_LINE} actions={<HeadButtonBone />} />
      <SkeletonGroup grow className="mt-6">
        <h2 className="text-[19px] font-semibold leading-6">Сейчас</h2>
        <div className="mt-3">
          <PeopleGridBone />
        </div>
      </SkeletonGroup>
    </main>
  );
}

/**
 * The person editor (D-104) before the person is in: the head — the name and the line of role
 * and position the editor always has — and the form's sections, as long as the form will be.
 */
export function EditPersonSkeleton({ back = { href: "/settings?tab=team", label: "Сотрудники" } }: { back?: { href: string; label: string } }) {
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-40">
      <PageHead
        back={back}
        heading={
          <SkeletonGroup className="mt-px min-w-0 flex-1 py-[5px]">
            <Bone h={30} w="62%" />
          </SkeletonGroup>
        }
        sub={LOADING_LINE}
      />
      <SkeletonGroup grow className="mt-5 flex flex-col gap-4">
        <SectionBone fields={3} />
        <SectionBone fields={4} />
        <SectionBone fields={2} />
      </SkeletonGroup>
    </main>
  );
}

/** «Новый сотрудник» (D-104): its head is known, the form waits for the roster. */
export function NewPersonSkeleton() {
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36">
      <PageHead back={{ href: "/settings?tab=team", label: "Сотрудники" }} title="Новый сотрудник" />
      <div className="mt-5">
        <NewPersonFormBone />
      </div>
    </main>
  );
}

/** The new-person form while the roster loads: the page's own placeholder too. */
export function NewPersonFormBone() {
  return (
    <SkeletonGroup grow className="flex flex-col gap-4">
      <SectionBone fields={2} />
      <SectionBone fields={3} />
    </SkeletonGroup>
  );
}

/**
 * A person's card (D-104): the head — the name, the position line (kept even without a
 * position), the TV button — and the card with the numbers and the buttons. The card is as
 * tall as the person makes it (their names in speech, the points switch), so the skeleton
 * stops at it and the tasks appear under it.
 */
export function PersonSkeleton() {
  return (
    <main className={MAIN}>
      <PageHead
        back={{ href: "/people", label: "Команда" }}
        heading={
          <SkeletonGroup className="mt-px min-w-0 flex-1 py-[5px]">
            <Bone h={30} w="62%" />
          </SkeletonGroup>
        }
        sub={LOADING_LINE}
        actions={<HeadButtonBone />}
      />
      <SkeletonGroup grow className="mt-4 card p-4">
        <div className="flex items-center gap-3">
          <Bone round w={64} h={64} className="shrink-0" />
          <div className="min-w-0 flex-1">
            <Bone h={26} w={96} className="rounded-full" />
          </div>
        </div>
        <div className="mt-4 grid grid-cols-4 gap-2">
          <StatBone label="в работе" />
          <StatBone label="просрочено" />
          <StatBone label="закрыто за 30 дн." />
          <StatBone label="очков" />
        </div>
        <div className="mt-4 flex flex-col gap-2">
          <Bone h={44} className="rounded-[12px]" />
          <div className="grid grid-cols-2 gap-2">
            <Bone h={44} className="rounded-[12px]" />
            <Bone h={44} className="rounded-[12px]" />
          </div>
        </div>
      </SkeletonGroup>
    </main>
  );
}

/**
 * «Настройки»: the four tiles themselves (they are the screen's chrome; «Компания» lit, the
 * tab of a plain /settings), then the closed sections of whichever tab opens.
 */
export function SettingsSkeleton() {
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36">
      <Title text="Настройки" />
      <SettingsTiles tab="company" />
      <div className="mt-5">
        <SettingsSectionsBone count={3} />
      </div>
    </main>
  );
}

/** Пульт от телевизора: карточка «Сейчас на стене», поиск по людям и список. */
export function ScreenSkeleton() {
  return (
    <main className={MAIN}>
      <Title text="Экран в кабинете" />
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

/**
 * «Данные»: the page itself before its rows — the chips of the tables and the first table,
 * which draws its own head and grey rows while it loads (and starts loading right away).
 */
export function AdminSkeleton() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-36">
      <Title text="Данные" />
      <TableChips active={ADMIN_TABLES[0].table} />
      <div className="mt-4">
        <DataTable spec={ADMIN_TABLES[0]} />
      </div>
    </main>
  );
}

/* ---- employee ---------------------------------------------------------------- */

/** Лента (D-62): the face alone in the middle, as on Пульс — the home screen has no title. */
export function FeedSkeleton() {
  return <PulseSkeleton />;
}

/** A line of the head that loads (a position, a count): a no-break space keeps its room. */
const LOADING_LINE = "\u00a0";

/**
 * The status screen that is also the recorder (NotesRecorder, D-93): its boxes are fixed —
 * the eyebrow row, an 82 px body, the field and the microphone, the hint line under them.
 */
function RecorderBone() {
  return (
    <SkeletonGroup className="status-screen rounded-[22px] px-4 pb-3.5 pt-3.5">
      <div className="flex h-4 items-center justify-between">
        <Bone h={12} w={110} />
        <Bone h={12} w={80} />
      </div>
      <div className="mt-2.5 flex h-[82px] items-center gap-3.5 overflow-hidden">
        <Bone h={46} w={46} className="shrink-0 rounded-[14px]" />
        <div className="flex-1">
          <Bone h={20} w="40%" />
          <Bone h={14} w="70%" className="mt-2" />
        </div>
      </div>
      <div className="mt-3 flex items-end gap-2.5 border-t border-border/60 pt-3">
        <Bone h={56} className="flex-1 rounded-[18px]" />
        <Bone h={56} w={56} round className="shrink-0" />
      </div>
      <div className="mt-2 flex h-4 items-center justify-center">
        <Bone h={12} w="70%" />
      </div>
    </SkeletonGroup>
  );
}

/** The four piles of «Заметки» (D-102), as the page names them. */
const NOTES_TABS = [
  { key: "active", label: "Мысли", count: 0 },
  { key: "boards", label: "Доски", count: 0 },
  { key: "converted", label: "В деле", count: 0 },
  { key: "trash", label: "Корзина", count: 0 },
] as const;

/**
 * «Заметки» while the feed loads (D-93): the title, the status screen with the field and the
 * microphone, the tabs and a column of closed cards — the boxes of the real ones.
 */
export function NotesSkeleton() {
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-28">
      <PageHead eyebrow={DATE_BONE} title="Заметки" actions={<HeadButtonBone />} />
      <div className="mt-3">
        <RecorderBone />
      </div>
      <Tabs id="notes" pending value="active" className="mt-2" items={NOTES_TABS} />
      <SkeletonGroup grow className="mt-1 flex flex-col gap-2">
        <div className="px-1 pb-0.5 pt-4">
          <Bone h={16} w={90} />
        </div>
        {[0, 1, 2].map((i) => (
          <div key={i} className="task-card flex gap-3 rounded-[18px] px-3.5 pb-3 pt-3.5">
            <Bone h={22} w={22} round className="shrink-0" />
            <div className="flex-1">
              <Bone h={21} w={i === 1 ? "58%" : "76%"} />
              <Bone h={16} w="88%" className="mt-1.5" />
              <Bone h={12} w={60} className="mt-2" />
            </div>
          </div>
        ))}
      </SkeletonGroup>
    </main>
  );
}

/** A board of «Заметки» (D-102): the way back, the title, the status screen and numbered points. */
export function BoardSkeleton() {
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-28">
      <PageHead
        back={{ href: "/notes?tab=boards", label: "Заметки" }}
        heading={
          <SkeletonGroup className="mt-px min-w-0 flex-1 py-[5px]">
            <Bone h={30} w="62%" />
          </SkeletonGroup>
        }
        actions={<HeadButtonBone />}
      />
      <div className="mt-3">
        <RecorderBone />
      </div>
      <SkeletonGroup grow className="mt-4 flex flex-col gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="task-card flex gap-3 rounded-[18px] px-3.5 pb-3 pt-3.5">
            <Bone h={22} w={22} round className="shrink-0" />
            <div className="flex-1 py-[2px]">
              <Bone h={17} w={i === 1 ? "58%" : "76%"} />
            </div>
          </div>
        ))}
      </SkeletonGroup>
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
    <SkeletonGroup grow className="mt-5 flex flex-col gap-3">
      <AnnouncementBone />
      <AnnouncementBone />
    </SkeletonGroup>
  );
}

export function EtherSkeleton() {
  return (
    <main className={MAIN}>
      <Title text="Эфир" />
      <EtherListBone />
    </main>
  );
}

/** The ribbon of /calendar: a day heading and its cards — the geometry of EventCard (D-94). */
export function CalendarListBone() {
  return (
    <SkeletonGroup grow className="mt-1">
      {[0, 1].map((group) => (
        <div key={group}>
          <div className={`flex min-h-[32px] items-end px-1 pb-0.5 ${group ? "pt-4" : "pt-3"}`}>
            <Bone h={16} w={group ? "34%" : "46%"} />
          </div>
          <div className="mt-2 flex flex-col gap-2">
            {[0, 1].map((row) => (
              <div
                key={row}
                className="flex gap-3 rounded-[18px] border px-3.5 pb-3 pt-3.5"
                style={{ borderColor: "color-mix(in srgb, var(--border) 72%, transparent)", background: "var(--surface)" }}
              >
                <div className="w-[44px] shrink-0">
                  <Bone h={21} w={42} />
                  <Bone h={16} w={34} className="mt-0.5" />
                </div>
                <Bone h={66} w={3} />
                <div className="min-w-0 flex-1">
                  <Bone h={21} w={row ? "56%" : "72%"} />
                  <Bone h={16} w="38%" className="mt-1" />
                  <Bone h={18} w="46%" className="mt-1.5" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </SkeletonGroup>
  );
}

/**
 * /calendar before the phone takes over (D-94): the date and the title, the status screen,
 * the month of five weeks, the ribbon — each bone the box of its element (measured: head
 * 54, status 223, grid 338).
 */
export function CalendarSkeleton() {
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-28">
      <PageHead eyebrow={DATE_BONE} title="Календарь" />
      <SkeletonGroup className="mt-3">
        <div className="h-[223px] rounded-[22px] border border-border/70 bg-surface px-4 pt-3">
          <Bone h={16} w="34%" />
          <div className="mt-2 flex h-[58px] items-center gap-3.5">
            <Bone h={46} w={46} round />
            <div className="flex-1">
              <Bone h={22} w="62%" />
              <Bone h={16} w="84%" className="mt-1.5" />
            </div>
          </div>
          <Bone h={10} className="mt-3 w-full" round />
        </div>
      </SkeletonGroup>
      <SkeletonGroup className="mt-3">
        <div
          className="h-[338px] rounded-[22px] border px-2 pt-1.5"
          style={{ borderColor: "color-mix(in srgb, var(--border) 72%, transparent)", background: "var(--surface)" }}
        >
          <div className="flex h-11 items-center pl-2.5">
            <Bone h={22} w="40%" />
          </div>
        </div>
      </SkeletonGroup>
      <CalendarListBone />
    </main>
  );
}

export function RatingListBone({ withAward = true }: { withAward?: boolean }) {
  return (
    <SkeletonGroup grow className="mt-4 space-y-2">
      {Array.from({ length: 6 }, (_, i) => (
        <RatingRowBone key={i} withAward={withAward} />
      ))}
    </SkeletonGroup>
  );
}

/** «Рейтинг»: the head, the «Магазин» row and the period chips as they are, then the rows. */
export function RatingSkeleton() {
  return (
    <main className={MAIN}>
      <Title text="Рейтинг" />
      <ShopRow />
      <div className="mt-4">
        <PeriodChips value="week" />
        <RatingListBone />
      </div>
    </main>
  );
}

/**
 * The task's own screen (D-87): the bar and the status screen. The status screen is as tall
 * as the task's state makes it (buttons, a reason, «Удалить»), so the skeleton stops at it
 * and «О задаче» and the thread appear under it — nothing below the card is drawn to move.
 */
export function TaskPageSkeleton() {
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4">
      <PageHead bare back={{ label: "Назад" }} />
      <SkeletonGroup grow className="status-screen mt-1 rounded-[22px] px-4 pb-3.5 pt-3.5">
        <div className="flex items-center justify-between">
          <Bone h={18} w={120} />
          <Bone h={26} w={112} className="rounded-full" />
        </div>
        <Bone h={26} w="84%" className="mt-3" />
        <Bone h={26} w="52%" className="mt-1" />
        <Bone h={22} w={190} className="mt-2" />
        <div className="mt-4 grid grid-cols-4 gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <Bone h={14} w={14} round />
              <Bone h={12} w="70%" />
            </div>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {[0, 1, 2].map((i) => (
            <Bone key={i} h={44} className="rounded-[12px]" />
          ))}
        </div>
        <div className="mt-4 border-t border-border/60 pt-3">
          <Bone h={18} w={140} />
        </div>
      </SkeletonGroup>
    </main>
  );
}
