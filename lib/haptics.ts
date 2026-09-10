/**
 * Haptics wrapper. iOS Safari has no Vibration API and desktop browsers ignore it —
 * a missing API is a no-op, never a crash (docs/DESIGN.md §3).
 */
export function haptic(pattern: number | number[] = 20): void {
  if (typeof navigator === "undefined") return;
  navigator.vibrate?.(pattern);
}
