/**
 * The skeleton system. One rule: a placeholder has exactly the box of the thing it
 * stands in for, so the swap to real content moves nothing. Blocks below mirror the
 * real components pixel for pixel (heights, paddings, radii); pages compose them in
 * components/ui/PageSkeletons.tsx, and the same composition is used by the route's
 * loading.tsx and by the page while its query is in flight — the picture never changes
 * between the tap and the data.
 *
 * Motion: the shimmer is an opacity pulse on the container (`.skeleton`, DESIGN §2),
 * nothing moves. Server-safe: no hooks, so loading.tsx can render these.
 */

type BoneProps = { className?: string; w?: number | string; h?: number | string; round?: boolean };

/** One grey bar. Width/height in px or any CSS length; `round` for avatars and dots. */
export function Bone({ className = "", w, h = 16, round = false }: BoneProps) {
  return (
    <span
      aria-hidden
      className={`block bg-surface-2 ${round ? "rounded-full" : "rounded-[6px]"} ${className}`}
      style={{ width: w ?? "100%", height: h }}
    />
  );
}

/** Wrapper that pulses everything inside and hides it from assistive tech. */
export function SkeletonGroup({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`skeleton ${className}`} aria-hidden aria-busy="true">
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Blocks — each mirrors a real component                                      */
/* -------------------------------------------------------------------------- */

/** components/tasks/TaskCard: title (2 lines max), chips row, receipt line, actions row. */
export function TaskCardBone({ variant = "employee" }: { variant?: "employee" | "director" }) {
  return (
    <div className="rounded-[16px] border border-border bg-surface p-4">
      <Bone h={24} w="72%" />
      <div className="mt-3 flex gap-2">
        <Bone h={32} w={112} className="rounded-full" />
        <Bone h={32} w={84} className="rounded-full" />
      </div>
      {variant === "director" ? <Bone h={16} w="55%" className="mt-2" /> : null}
      <Bone h={16} w={140} className="mt-3" />
      <div className="mt-4 flex gap-2">
        <Bone h={44} w={104} className="rounded-[12px]" />
        <Bone h={44} w={104} className="rounded-[12px]" />
        {variant === "employee" ? <Bone h={44} w={96} className="rounded-[12px]" /> : null}
      </div>
    </div>
  );
}

export function TaskListBone({ count = 3, variant = "employee" }: { count?: number; variant?: "employee" | "director" }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: count }, (_, i) => (
        <TaskCardBone key={i} variant={variant} />
      ))}
    </div>
  );
}

/** A list row with an avatar and two lines (people list, thread history). */
export function RowBone({ avatar = 44 }: { avatar?: number }) {
  return (
    <div className="flex items-center gap-3 rounded-[16px] border border-border bg-surface px-3 py-3">
      <Bone round w={avatar} h={avatar} className="shrink-0" />
      <div className="min-w-0 flex-1">
        <Bone h={22} w="60%" />
        <Bone h={16} w="40%" className="mt-1" />
      </div>
    </div>
  );
}

export function RowListBone({ count = 6, avatar = 44 }: { count?: number; avatar?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }, (_, i) => (
        <RowBone key={i} avatar={avatar} />
      ))}
    </div>
  );
}

/** A stat box (profile, person card): the number is a bone of the digits' height. */
export function StatBone({ label }: { label: string }) {
  return (
    <div className="rounded-[12px] bg-surface-2 px-2 py-2 text-center">
      <span className="mx-auto block h-[30px] w-8 rounded-[6px] bg-border" aria-hidden />
      <p className="text-[11px] leading-4 text-muted">{label}</p>
    </div>
  );
}

/** components/rating/RatingList Row: rank circle, name, points, «+». */
export function RatingRowBone({ withAward = true }: { withAward?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-[16px] border border-border bg-surface px-3 py-3">
      <Bone round w={40} h={40} className="shrink-0" />
      <div className="min-w-0 flex-1">
        <Bone h={22} w="55%" />
      </div>
      <Bone h={24} w={28} />
      {withAward ? <Bone h={36} w={44} className="rounded-[12px]" /> : null}
    </div>
  );
}

/** components/ether/AnnouncementCard: icon, two text lines, meta, ack line. */
export function AnnouncementBone() {
  return (
    <div className="rounded-[16px] border border-border bg-surface p-4">
      <div className="flex gap-3">
        <Bone w={36} h={36} className="shrink-0 rounded-[10px]" />
        <div className="min-w-0 flex-1">
          <Bone h={22} />
          <Bone h={22} w="70%" className="mt-1" />
          <Bone h={16} w="45%" className="mt-2" />
        </div>
      </div>
      <Bone h={20} w={140} className="mt-4" />
    </div>
  );
}

/** components/pulse/PeopleGrid tile: avatar with a dot, first name. */
export function PeopleGridBone({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex flex-col items-center rounded-[16px] border border-border bg-surface px-1 py-3">
          <Bone round w={48} h={48} />
          <Bone h={16} w={48} className="mt-2" />
        </div>
      ))}
    </div>
  );
}

/** A settings section: title, hint, two fields. */
export function SectionBone({ fields = 2 }: { fields?: number }) {
  return (
    <div className="rounded-[16px] border border-border bg-surface p-4">
      <Bone h={24} w="45%" />
      <Bone h={16} w="80%" className="mt-2" />
      <div className="mt-4 flex flex-col gap-4">
        {Array.from({ length: fields }, (_, i) => (
          <div key={i}>
            <Bone h={18} w="35%" />
            <Bone h={44} className="mt-1.5 rounded-[12px]" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** components/settings/CompanyForm: title, hint, preview row, name, tagline, logo block, accent block, button. */
export function CompanyFormBone() {
  return (
    <div className="rounded-[16px] border border-border bg-surface p-4">
      <Bone h={24} w={140} />
      <Bone h={16} className="mt-1" />
      <Bone h={16} w="60%" className="mt-0" />
      <Bone h={46} className="mt-4 rounded-[12px]" />
      <div className="mt-4 flex flex-col gap-4">
        <div>
          <Bone h={18} w={90} />
          <Bone h={44} className="mt-1.5 rounded-[12px]" />
        </div>
        <div>
          <Bone h={18} w={200} />
          <Bone h={44} className="mt-1.5 rounded-[12px]" />
        </div>
        <div>
          <Bone h={18} w={70} />
          <Bone h={44} w={120} className="mt-1.5 rounded-[12px]" />
          <Bone h={16} w="85%" className="mt-1.5" />
        </div>
        <div>
          <Bone h={18} w={130} />
          <Bone h={44} className="mt-1.5 rounded-[12px]" />
          <Bone h={16} w="70%" className="mt-1.5" />
        </div>
      </div>
      <Bone h={44} className="mt-4 rounded-[12px]" />
    </div>
  );
}

/** A table body: rows of cells with plausible widths. */
export function TableBone({ rows = 8, columns = 4 }: { rows?: number; columns?: number }) {
  const widths = ["30%", "45%", "20%", "25%", "35%", "15%"];
  return (
    <div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex items-center gap-3 border-t border-border px-3 py-2">
          {Array.from({ length: columns }, (_, c) => (
            <Bone key={c} h={16} w={widths[(r + c) % widths.length]} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** A chat bubble pair for the task page. */
export function ChatBone() {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-start">
        <Bone h={62} w="70%" className="rounded-[14px] rounded-bl-[4px]" />
      </div>
      <div className="flex justify-end">
        <Bone h={62} w="60%" className="rounded-[14px] rounded-br-[4px]" />
      </div>
    </div>
  );
}
