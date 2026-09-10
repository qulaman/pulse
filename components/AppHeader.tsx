/** Screen header: product name plus who is signed in. */
export function AppHeader({ fullName }: { fullName: string }) {
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-bg/95 px-4 py-3 backdrop-blur">
      <div className="mx-auto flex max-w-lg items-baseline justify-between gap-3">
        <span className="text-[19px] font-semibold leading-6">Pulse</span>
        <span className="truncate text-[13px] leading-4 text-muted">{fullName}</span>
      </div>
    </header>
  );
}
