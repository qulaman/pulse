import type { ReactNode } from "react";

import { Switch as DeskSwitch } from "@/components/desk/ui/Switch";

/**
 * A group of desk settings (D-154 wave 3): a flat working plane — `--surface` 40 % and a hairline,
 * no shadow — its rows split by hairlines. The phone's 58 px rows with icons and chevrons are
 * the phone's; a computer reads a label on the left and its control on the right.
 */
export function SettingGroup({ children, className = "", testId }: { children: ReactNode; className?: string; testId?: string }) {
  return (
    <div className={`overflow-hidden rounded-[12px] border border-border bg-surface/40 [&>*+*]:border-t [&>*+*]:border-border/70 ${className}`} data-testid={testId}>
      {children}
    </div>
  );
}

/**
 * One setting: what it is (14/20) and, under it, what it does (12/16, muted) on the left; its
 * control on the right. `below` — what opens under the row (a form, more choices), full width.
 */
export function SettingRow({
  label,
  hint,
  children,
  below,
  testId,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children?: ReactNode;
  below?: ReactNode;
  testId?: string;
}) {
  return (
    <div className="px-4 py-3" data-testid={testId}>
      <div className="flex min-h-9 items-center gap-6">
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-medium leading-5">{label}</div>
          {hint ? <div className="mt-0.5 text-[12px] leading-4 text-muted">{hint}</div> : null}
        </div>
        {children ? <div className="flex shrink-0 items-center gap-2">{children}</div> : null}
      </div>
      {below ? <div className="mt-3">{below}</div> : null}
    </div>
  );
}

/** @deprecated use `Switch` from "@/components/desk/ui/Switch" (`checked` instead of `on`). */
export function Switch({ on, onChange, label, disabled = false }: { on: boolean; onChange: (on: boolean) => void; label: string; disabled?: boolean }) {
  return <DeskSwitch checked={on} onChange={onChange} label={label} disabled={disabled} />;
}
