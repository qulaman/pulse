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

/**
 * Wrapper that pulses everything inside and hides it from assistive tech. `grow` marks the
 * part whose length only the data knows (a list): the screen may lengthen from there, and
 * `pnpm smoke:stages` measures everything above it to the pixel (D-122).
 */
export function SkeletonGroup({ children, className = "", grow = false }: { children: React.ReactNode; className?: string; grow?: boolean }) {
  return (
    <div className={`skeleton ${className}`} aria-hidden aria-busy="true" data-grow={grow ? "" : undefined}>
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Blocks — each mirrors a real component                                      */
/* -------------------------------------------------------------------------- */

/** components/tasks/TaskCard: rail, status + deadline pill, title, who, actions row. */
export function TaskCardBone({ variant = "employee" }: { variant?: "employee" | "director" }) {
  return (
    <div className="card relative overflow-hidden p-4 pl-5">
      <span aria-hidden className="absolute inset-y-3 left-0 w-[3px] rounded-r-full bg-border" />
      <div className="flex items-center justify-between gap-2">
        <Bone h={16} w={92} />
        <Bone h={26} w={104} className="rounded-full" />
      </div>
      <Bone h={24} w="72%" className="mt-2" />
      {variant === "director" ? (
        <div className="mt-3 flex items-center gap-2">
          <Bone round w={24} h={24} className="shrink-0" />
          <Bone h={16} w={120} />
        </div>
      ) : null}
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
    <div className="flex items-center gap-3 card px-3 py-3">
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
    <div className="flex items-center gap-3 card px-3 py-3">
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
    <div className="card p-4">
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
        <div key={i} className="flex flex-col items-center card px-1 py-3">
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
    <div className="card p-4">
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

/** components/ui/Disclosure closed: the icon tile, the title, one line of summary. */
export function SectionRowBone() {
  return (
    <div className="flex min-h-[64px] items-center gap-3 card px-4 py-3">
      <Bone w={32} h={32} className="shrink-0" />
      <div className="min-w-0 flex-1">
        <Bone h={22} w="52%" />
        <Bone h={14} w="34%" className="mt-1" />
      </div>
    </div>
  );
}

/** The settings screen is a stack of closed sections — the same picture before and after. */
export function SettingsSectionsBone({ count = 6 }: { count?: number }) {
  return (
    <SkeletonGroup grow className="flex flex-col gap-2">
      {Array.from({ length: count }, (_, i) => (
        <SectionRowBone key={i} />
      ))}
    </SkeletonGroup>
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
