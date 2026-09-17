/** «Сегодня» / «Вчера» / «14.09» between the days of a thread. */
export function DaySeparator({ label }: { label: string }) {
  return (
    <div className="my-2 flex items-center gap-3" data-testid="day-separator">
      <span aria-hidden className="h-px flex-1 bg-border" />
      <span className="text-[12px] leading-4 text-muted">{label}</span>
      <span aria-hidden className="h-px flex-1 bg-border" />
    </div>
  );
}
