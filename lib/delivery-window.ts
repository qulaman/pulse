/**
 * «Тихие часы» said as what they are (D-38): the company stores the window when pushes go
 * (`settings.delivery_window`, from–to, Asia/Aqtobe), the settings call it by its other side —
 * the hours when nothing is delivered. A pushed send leaves inside [from, to); everything else
 * waits for `from` (`next_delivery_slot`), so the quiet runs from `to` to `from`.
 */
export type DeliveryHours = { from: string; to: string };

/** «тихо с 21:00 до 08:00»; a window that never opens is quiet all day. */
export function quietHoursText({ from, to }: DeliveryHours): string {
  // «HH:MM» compares as text; from ≥ to leaves no minute inside the window
  if (from >= to) return "тихо круглые сутки";
  return `тихо с ${to} до ${from}`;
}
