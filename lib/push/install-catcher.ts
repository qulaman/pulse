/**
 * Chrome's install offer (`beforeinstallprompt`) may fire before React hydrates: the root
 * layout runs this inline, keeps the offer on `window` for «Установить Pulse»
 * (lib/push/install.ts, D-125) instead of Chrome's mini-infobar, and tells the page when it
 * changes. A plain module — the server layout needs the string itself, not a client reference.
 */
export const INSTALL_READY = "pulse-install";

export const INSTALL_CATCHER = `window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.__pulseInstall=e;window.dispatchEvent(new Event("${INSTALL_READY}"))});window.addEventListener("appinstalled",function(){window.__pulseInstall=null;window.dispatchEvent(new Event("${INSTALL_READY}"))});`;
