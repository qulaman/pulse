import { whenAqtobe } from "@/lib/lab/format";

/** A moment in a console table, on the company's wall clock (Asia/Aqtobe); a dash when it never happened. */
export function When({ iso }: { iso: string | null }) {
  return iso ? <span className="nums whitespace-nowrap">{whenAqtobe(iso)}</span> : <span className="text-muted/60">—</span>;
}
