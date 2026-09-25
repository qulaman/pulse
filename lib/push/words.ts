import type { PushPlatform, PushState } from "@/lib/push/client";

/** What stands between this phone and a push, in the words of its platform. */
export function pushBlocker(state: PushState, device: PushPlatform): string | null {
  if (state === "unsupported" && device.platform === "ios" && !device.standalone) {
    return "На iPhone уведомления приходят только в приложении на экране «Домой»: внизу Safari нажмите «Поделиться», затем «На экран „Домой“», и откройте Pulse оттуда.";
  }
  if (state === "denied") {
    if (device.platform === "ios") return "Уведомления запрещены: «Настройки» iPhone → «Уведомления» → Pulse → «Допуск уведомлений».";
    if (device.platform === "android") return "Уведомления запрещены: нажмите на замок слева от адреса → «Разрешения» → «Уведомления» → «Разрешить».";
    return "Уведомления запрещены в браузере: разрешите их в настройках сайта.";
  }
  return null;
}

/**
 * Said right after «Включить» (D-125). On Android the phone's own battery saver (Xiaomi,
 * Samsung, Honor…) holds Chrome's pushes until the screen wakes — a push minutes late with no
 * fault of ours; Chrome carries the pushes of the installed app too. Long enough to read.
 */
export function pushEnabledToast(device: PushPlatform, what = "Уведомления включены"): { text: string; lifetimeMs?: number } {
  if (device.platform !== "android") return { text: what };
  return {
    text: `${what}. Чтобы не опаздывали: «Настройки» → «Приложения» → Chrome → «Батарея» → «Без ограничений»`,
    lifetimeMs: 9000,
  };
}
