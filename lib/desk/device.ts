/**
 * Phone or computer (D-153 §2): the desk is chosen by the device, not by the window's width —
 * a narrow desktop window still gets the desk (with a hint), a phone never does. Plain functions:
 * the proxy calls them on every request of a signed-in user, the profiles set and clear the cookie.
 */

const MOBILE_UA = /Mobi|Android|iPhone|iPad|iPod/i;

/**
 * A desktop browser: `sec-ch-ua-mobile` says it outright where Chromium sends it (`?0` — a
 * computer, `?1` — a phone); without the hint (Safari, Firefox) the user agent decides.
 */
export function isDesktopUa(ua: string | null | undefined, chMobile: string | null | undefined): boolean {
  if (chMobile === "?0") return true;
  if (chMobile === "?1") return false;
  return !MOBILE_UA.test(ua ?? "");
}

/** The cookie that keeps a computer on the phone screens («Телефонная версия»). */
export const VIEW_COOKIE = "pulse_view";
export const PHONE_VIEW = "phone";
const YEAR_S = 365 * 24 * 60 * 60;

/** The director or the secretary asked for the phone screens on this browser. */
export function wantsPhoneView(cookieValue: string | null | undefined): boolean {
  return cookieValue === PHONE_VIEW;
}

/** `document.cookie` line that turns the phone screens on for a year. */
export function phoneViewCookie(): string {
  return `${VIEW_COOKIE}=${PHONE_VIEW}; Max-Age=${YEAR_S}; Path=/; SameSite=Lax`;
}

/** `document.cookie` line that takes it off: the device decides again. */
export function clearViewCookie(): string {
  return `${VIEW_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;
}

/**
 * Before the first paint of a hard load: the desk's sheet and its theme (D-158, D-159); the
 * attributes DeskShell sets in its layout effect come after the phone's tokens have been painted.
 */
export const DESK_SHEET_SCRIPT = `(function(p,r){if(p==="/desk"||p.indexOf("/desk/")===0){r.dataset.surface="desk";r.dataset.journal="";var t="dark";try{if(localStorage.getItem("pulse.desk.theme")==="light")t="light"}catch(e){}r.dataset.deskTheme=t}})(location.pathname,document.documentElement)`;

/** Browser only: the phone screens from now on, then a full load so the proxy sees the cookie. */
export function goPhoneView(to: string): void {
  document.cookie = phoneViewCookie();
  window.location.assign(to);
}

/** Browser only: the device decides again, then the desk. */
export function goDeskView(to = "/desk"): void {
  document.cookie = clearViewCookie();
  window.location.assign(to);
}
