/**
 * Page compositions of the skeleton blocks. Each keeps the page's real static chrome
 * (title, subtitle, filters) so only the dynamic area pulses, and each is used twice:
 * by the route's loading.tsx during navigation and by the page while its data loads.
 * Server-safe.
 */
import { Mascot } from "@/components/brand/Mascot";
import { HeadButtonBone } from "@/components/ui/HeadButton";
import { PageHead } from "@/components/ui/PageHead";

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
  TaskListBone,
} from "./Skeleton";

const MAIN = "mx-auto w-full max-w-lg flex-1 px-4 pb-36";

/** The screen head (D-113) as the page draws it; `sub=" "` keeps the room of a line that loads. */
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
 * «Задачи» and «Мои дела» before their data (D-83): the page title, the status screen with
 * grey where the numbers go, the people strip (director), the tabs and a column of closed
 * cards. Every box has the height of the real one, so nothing moves when the data lands.
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
      <PageHead title="Команда" sub=" " actions={<HeadButtonBone />} />
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
      <PageHead
        back={{ href: "/people", label: "Команда" }}
        heading={
          <SkeletonGroup className="min-w-0 flex-1 py-[3px]">
            <Bone h={30} w="62%" />
          </SkeletonGroup>
        }
        sub=" "
      />
      <SkeletonGroup>
        <section className="mt-4 card p-4">
          <div className="flex items-center gap-3">
            <Bone round w={64} h={64} className="shrink-0" />
            <div className="min-w-0 flex-1">
              <Bone h={28} w={96} className="rounded-full" />
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
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36">
      <Title text="Настройки" />
      {/* the four tab tiles, then the closed sections of whichever tab opens */}
      <SkeletonGroup className="mt-5 grid grid-cols-2 gap-2">
        {[0, 1, 2, 3].map((i) => (
          <Bone key={i} h={104} className="rounded-[16px]" />
        ))}
      </SkeletonGroup>
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

export function AdminSkeleton() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-36">
      <Title text="Данные" />
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

/** Лента (D-62): the face alone in the middle, as on Пульс — the home screen has no title. */
export function FeedSkeleton() {
  return <PulseSkeleton />;
}

/** «Заметки»: a printed day label and cards of a heading, a line and the time. */
/**
 * «Заметки» while the feed loads (D-93): the title, the status screen with the field and the
 * microphone, the tabs and a column of closed cards — the boxes of the real ones.
 */
export function NotesSkeleton() {
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-28">
      <PageHead eyebrow={DATE_BONE} title="Заметки" actions={<HeadButtonBone />} />
      <SkeletonGroup className="status-screen mt-3 rounded-[22px] px-4 pb-3.5 pt-3.5">
        <div className="flex items-center justify-between">
          <Bone h={16} w={110} />
          <Bone h={16} w={80} />
        </div>
        <div className="mt-2.5 flex min-h-[64px] items-center gap-3.5">
          <Bone h={46} w={46} className="rounded-[14px]" />
          <div className="flex-1">
            <Bone h={20} w="40%" />
            <Bone h={14} w="70%" className="mt-2" />
          </div>
        </div>
        <div className="mt-3 flex items-end gap-2.5 border-t border-border/60 pt-3">
          <Bone h={56} className="flex-1 rounded-[18px]" />
          <Bone h={56} w={56} round className="shrink-0" />
        </div>
        <Bone h={14} w="70%" className="mx-auto mt-2" />
      </SkeletonGroup>
      <div className="mt-2">
        <div aria-hidden className="h-px" />
        <div className="py-2">
          <SkeletonGroup className="seg rounded-[14px] p-1">
            <Bone h={40} w="25%" className="rounded-[10px]" />
          </SkeletonGroup>
        </div>
      </div>
      <SkeletonGroup className="mt-1 flex flex-col gap-2">
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
          // the large title's 40 px line (D-113), one line — a long title shrinks before it wraps
          <SkeletonGroup className="mt-px min-w-0 flex-1 py-[5px]">
            <Bone h={30} w="62%" />
          </SkeletonGroup>
        }
        actions={<HeadButtonBone />}
      />
      {/* the status screen of the board, box for box (NotesRecorder): eyebrow, 82 px body, input row, hint */}
      <SkeletonGroup className="status-screen mt-3 rounded-[22px] px-4 pb-3.5 pt-3.5">
        <div className="flex h-4 items-center justify-between">
          <Bone h={12} w={110} />
          <Bone h={12} w={80} />
        </div>
        <div className="mt-2.5 flex h-[82px] items-center gap-3.5">
          <Bone h={48} w={40} className="rounded-[12px]" />
          <div className="flex-1">
            <Bone h={18} w="58%" />
            <Bone h={13} w="72%" className="mt-2" />
            <Bone h={13} w="64%" className="mt-[5px]" />
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
      {/* closed branches: the number and one line of words (sub-points arrive with the data) */}
      <SkeletonGroup className="mt-4 flex flex-col gap-2">
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
    <SkeletonGroup className="mt-5 flex flex-col gap-3">
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
    <SkeletonGroup className="mt-1">
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
      <Title text="Рейтинг" />
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
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36">
      <PageHead title="Профиль" />
      <SkeletonGroup className="mt-3">
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
  // the task's own screen (D-87): the top bar, the status screen, «О задаче», the thread
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4">
      <PageHead bare back={{ label: "Назад" }} />
      <SkeletonGroup>
        <div className="status-screen mt-1 rounded-[22px] px-4 pb-3.5 pt-3.5">
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
        </div>
        <div className="task-card mt-3 rounded-[18px] px-4 py-3.5">
          <Bone h={16} w={80} />
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
            {[0, 1, 2, 3].map((i) => (
              <Bone key={i} h={34} />
            ))}
          </div>
        </div>
        <div className="mt-5">
          <ChatBone />
        </div>
      </SkeletonGroup>
    </main>
  );
}
