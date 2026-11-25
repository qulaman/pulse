/**
 * What the phone is, from what the browser says about itself (D-190): the messenger whose
 * built-in browser opened Pulse, the maker whose battery saver may hold pushes, the browser
 * that carries them. Pure — the user agent (and, on Chrome, the model from its client hints)
 * comes in, vitest pins the guesses. A guess, never a promise: the words built on it say «если».
 */

/**
 * A messenger's or a social app's own browser: nothing installs from it, a push never reaches
 * it. The name for the words, `""` for an Android web view that does not say whose it is, null
 * for a real browser. The same tokens send the sign-in to «Нужен обычный браузер» (D-135 §4).
 */
export function inAppBrowser(ua: string): string | null {
  if (/Telegram/i.test(ua)) return "Telegram";
  if (/WhatsApp/i.test(ua)) return "WhatsApp";
  if (/Instagram/i.test(ua)) return "Instagram";
  if (/FBAN|FBAV|FB_IAB/.test(ua)) return "Facebook";
  if (/VKClient|VKAndroidApp/i.test(ua)) return "ВКонтакте";
  if (/OKApp/i.test(ua)) return "Одноклассники";
  if (/Line\//.test(ua)) return "LINE";
  if (/; wv\)/.test(ua)) return "";
  return null;
}

export type Maker = "iphone" | "xiaomi" | "samsung" | "huawei" | "android" | "other";

/**
 * Xiaomi's model numbers: an optional «M», the year and month of the model, a few letters and
 * digits — «2201117TG», «M2101K6G», «23049PCD8G». Chrome hides the model in its user agent
 * («Android 10; K») and gives it only through client hints, so the number is what usually comes.
 */
const XIAOMI_MODEL = /^M?(1[89]|2\d)(0[1-9]|1[0-2])[0-9A-Z]{3,7}$/;
/** Huawei and Honor: three letters, a dash, a letter or two and digits — «ELS-NX9», «ANY-LX1». */
const HUAWEI_MODEL = /^[A-Z]{3}-[A-Z]{1,2}\d{1,2}[A-Z]?$/;

/** The model a user agent still names — «Android 13; 2201117TG Build/…» — before Chrome cut it to «K». */
function modelInAgent(ua: string): string {
  return /Android [\d.]+;(?: [a-z]{2}-[a-z]{2};)? ([^;)]+?)(?: Build\/[^;)]*)?[;)]/i.exec(ua)?.[1]?.trim() ?? "";
}

/** Whose phone this is, as far as the browser tells. `model` — Chrome's client hint, when it gave one. */
export function phoneMaker(ua: string, model?: string | null): Maker {
  if (/iPhone|iPad|iPod/i.test(ua)) return "iphone";
  if (!/Android/i.test(ua)) return "other";
  const m = (model || modelInAgent(ua)).trim();
  if (/Xiaomi|MiuiBrowser|MIUI|HyperOS|Redmi|POCO/i.test(ua) || /^(Xiaomi|Redmi|POCO|Mi\s)/i.test(m) || XIAOMI_MODEL.test(m)) {
    return "xiaomi";
  }
  if (/SamsungBrowser|SAMSUNG|SM-[A-Z]\d/.test(ua) || /^(SM-|Galaxy)/i.test(m)) return "samsung";
  if (/HUAWEI|HONOR|HarmonyOS|HMSCore/i.test(ua) || /^(HUAWEI|HONOR)/i.test(m) || HUAWEI_MODEL.test(m)) return "huawei";
  return "android";
}

/**
 * The app on the phone that holds the browser's pushes — the one whose battery and notification
 * settings matter. An installed Pulse on Android is carried by the same browser.
 */
export function browserApp(ua: string): string {
  if (/SamsungBrowser/.test(ua)) return "Samsung Internet";
  if (/YaBrowser/.test(ua)) return "Яндекс Браузер";
  if (/EdgA?\//.test(ua)) return "Edge";
  if (/OPR\/|Opera/.test(ua)) return "Opera";
  if (/Firefox|FxiOS/.test(ua)) return "Firefox";
  if (/iPhone|iPad|iPod/i.test(ua) && !/CriOS/.test(ua)) return "Safari";
  return "Chrome";
}
