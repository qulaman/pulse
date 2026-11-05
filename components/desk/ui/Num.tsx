import { TONE_VAR, type Tone } from "@/components/desk/ui/tone";
import { formatNum } from "@/lib/desk/format";

/**
 * A number in a desk table or a total (D-158): even figures, thousands apart, a zero
 * always quiet and never coloured — «0 просрочено» is not news.
 */
export function Num({ value, tone, signed = false, className = "" }: { value: number; tone?: Tone | null; signed?: boolean; className?: string }) {
  const zero = value === 0;
  return (
    <span className={`nums ${zero ? "text-muted/60" : ""} ${className}`} style={!zero && tone ? { color: TONE_VAR[tone] } : undefined}>
      {formatNum(value, { signed })}
    </span>
  );
}
