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
