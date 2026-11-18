/**
 * «Дин-дон» стены, когда секретарь объявил посетителя (D-96): директор может не смотреть
 * на экран — звук поворачивает голову. Два мягких синусовых тона WebAudio, без файла.
 *
 * Браузер не играет звук без жеста пользователя, а киоску тапать некому: автозапуск
 * Chrome в киоске обязан идти с `--autoplay-policy=no-user-gesture-required`
 * (docs/FRONTEND.md, appliance-чеклист). Без флага звук молча не прозвучит — надпись всё
 * равно на стене.
 */

type AudioContextCtor = typeof AudioContext;

let context: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor: AudioContextCtor | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
  if (!Ctor) return null;
  context ??= new Ctor();
  return context;
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
