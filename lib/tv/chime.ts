/**
 * «Дин-дон» стены, когда секретарь объявил посетителя (D-96): директор может не смотреть
 * на экран — звук поворачивает голову. Два мягких синусовых тона WebAudio, без файла.
 *
 * Браузер не играет звук без жеста пользователя, а киоску тапать некому: автозапуск
 * Chrome в киоске обязан идти с `--autoplay-policy=no-user-gesture-required`
 * (docs/SETUP.md §8). Без флага звук молча не прозвучит — надпись всё равно на стене, а
 * квитанция стены скажет пульту `sound: "suspended"` и число немых звонков (D-182).
 */

type AudioContextCtor = typeof AudioContext;

let context: AudioContext | null = null;
/** Chimes rung while the sound was not running — the silent failure the receipt reports. */
let silentRings = 0;

function audioCtor(): AudioContextCtor | undefined {
  if (typeof window === "undefined") return undefined;
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
}

function audio(): AudioContext | null {
  const Ctor = audioCtor();
  if (!Ctor) return null;
  context ??= new Ctor();
  return context;
}

/**
 * The wall's sound for its receipt (D-182): `running` — a visitor's chime will be heard;
 * `suspended` — Chrome was started without the autoplay flag; `idle` — not opened yet;
 * `unsupported` — no WebAudio. `silent` — chimes rung into a sound that was not running.
 */
export function chimeStatus(): { state: string; silent: number } {
  if (!context) return { state: audioCtor() ? "idle" : "unsupported", silent: silentRings };
  return { state: context.state, silent: silentRings };
}

/**
 * Open the sound when the wall comes up, not at the first visitor: the receipt then tells at
 * once whether the kiosk can ring. Without the autoplay flag the context stays suspended.
 */
export function primeChime(): void {
  try {
    const ctx = audio();
    if (ctx && ctx.state === "suspended") void ctx.resume().catch(() => undefined);
  } catch {
    // no sound is not a reason to disturb the wall
  }
}

function tone(ctx: AudioContext, frequency: number, at: number, length: number, peak: number): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  osc.connect(gain).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + length + 0.05);
}

export function playChime(): void {
  try {
    const ctx = audio();
    if (!ctx) return;
    void ctx.resume().catch(() => undefined);
    const at = ctx.currentTime + 0.05;
    // ми и до — дверной звонок, а не тревога
    tone(ctx, 659.25, at, 0.9, 0.22);
    tone(ctx, 523.25, at + 0.42, 1.3, 0.2);
    // resume() may wait for a gesture forever: whether the ring was heard is read a moment later
    setTimeout(() => {
      if (ctx.state !== "running") silentRings += 1;
    }, 400);
  } catch {
    // no sound is not a reason to disturb the wall
  }
}

/** Визит звенит один раз, и после перезапуска экрана — не снова. */
const RUNG_KEY = "tv:rung";

export function rungBefore(id: string): boolean {
  try {
    return (sessionStorage.getItem(RUNG_KEY) ?? "").split(",").includes(id);
  } catch {
    return false;
  }
}

export function markRung(id: string): void {
  try {
    const list = (sessionStorage.getItem(RUNG_KEY) ?? "").split(",").filter(Boolean);
    sessionStorage.setItem(RUNG_KEY, [...list.slice(-19), id].join(","));
  } catch {
    // storage may be off in a kiosk profile: a second ring after a reload is harmless
  }
}
