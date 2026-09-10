/** Three card-shaped placeholders — the feed never flashes an empty state first. */
export function TaskSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="skeleton flex flex-col gap-3" aria-hidden>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="rounded-[16px] border border-border bg-surface p-4">
          <div className="h-5 w-2/3 rounded bg-surface-2" />
          <div className="mt-3 h-4 w-1/3 rounded bg-surface-2" />
          <div className="mt-4 h-[44px] w-full rounded-[12px] bg-surface-2" />
        </div>
      ))}
    </div>
  );
}
