/**
 * Sound (D-204): a short voice at a moment with a meaning — sent, accepted, done, «не получилось».
 * A phone never sounds by itself: every cue answers the person's own action; what arrives from
 * other people comes with the system's push sound. Only the computer clicks on every button
 * (`DeskTapSound`) — one person sits at it.
 *
 * One audio context for the whole app, the desk's chime included (`lib/desk/chime.ts`); the wall
 * keeps its own (`lib/tv/chime.ts`: a kiosk has nobody to tap). A browser plays nothing before the
 * person has touched the page: `SoundGate` wakes the audio on the first touch or key. A cue asked
 * for while the audio sleeps plays if it wakes at once and is dropped otherwise — never queued,
 * so nothing comes out later in a heap. The data is written first; a sound only plays over it and
 * a missing API is a no-op, never a crash (principle 1a).
 *
 * The person switches it off on this device: Профиль → «Звук». «Лаб → Звуки» tries another voice
 * for a moment and another loudness on this device only.
 *
 * An iPhone on its silent switch stays silent; Android plays at the media volume.
 */

import { type Note, VOICES, type VoiceName } from "./voices";

export { type Note, VOICE_NAMES, VOICES, type VoiceName, voiceMs } from "./voices";

type CueSpec = {
  /** What the moment is, in the person's words («Лаб → Звуки»). */
  label: string;
  /** Where it sounds. */
  where: "phone" | "desk" | "both";
  /** The voices to choose from; the first one is the moment's own. */
  voices: readonly [VoiceName, ...VoiceName[]];
};

export const CUES = {
  recStart: { label: "Запись началась", where: "both", voices: ["listen", "wisp", "plop"] },
  recStop: { label: "Запись принята", where: "both", voices: ["heard", "plop", "hush"] },
  send: { label: "Отправлено", where: "both", voices: ["lift", "sent", "landed"] },
  accept: { label: "«Принял»", where: "phone", voices: ["nod", "mark", "latch"] },
  handIn: { label: "«Сдал»", where: "phone", voices: ["paid", "sent", "nod"] },
  done: { label: "Задача закрыта", where: "both", voices: ["landed", "chord", "paid"] },
  points: { label: "Очки начислены", where: "phone", voices: ["coins", "beacon", "landed"] },
  refuse: { label: "Не получилось, отказ", where: "both", voices: ["nope", "buzz", "bump", "sigh"] },
  back: { label: "Шаг назад: «Отменить», вернуть, отозвать", where: "both", voices: ["back", "glide", "step", "hush"] },
  check: { label: "Отметка: «Проверено»", where: "both", voices: ["mark", "nod", "wisp"] },
  key: { label: "Клавиша пульта «Заявки»", where: "desk", voices: ["key", "tick", "latch", "plop"] },
  tap: { label: "Любая кнопка на компьютере", where: "desk", voices: ["tap", "wisp", "plop", "tick"] },
} satisfies Record<string, CueSpec>;

export type Cue = keyof typeof CUES;

export const CUE_NAMES = Object.keys(CUES) as Cue[];

/** A moment's choice in «Лаб → Звуки»: a voice, or silence for this moment. */
export type Pick = VoiceName | "none";

/** The same cue asked twice within this is one sound (a handler and its effect, a double event). */
export const SAME_CUE_MS = 80;
/** A cue waits this long for sleeping audio to wake; later than that it would sound out of place. */
export const LATE_MS = 250;
/** The audio goes back to sleep this long after the last touch or sound. */
export const IDLE_MS = 30_000;
/** A cue this close before a desk click was that click's own: the click's tick stays silent. */
export const OWN_CUE_MS = 350;

/** Loudness steps of «Лаб → Звуки»; 1 is the device's own loudness. */
export const GAINS = [0.5, 1, 1.5, 2.2] as const;
/**
 * The voices are written quiet — a peak of 0.03–0.1 of full scale (`pnpm smoke:sounds` measures it).
 * A phone's small speaker in a room with people needs more of it than a computer's at arm's length.
 */
export const BASE_GAIN = { phone: 2.2, desk: 1.3 } as const;

const ON_KEY = "pulse.sound.v1";
const PICKS_KEY = "pulse.sound.picks.v1";
const GAIN_KEY = "pulse.sound.gain.v1";
const CHANGED = "pulse:sound";

// ---- the switch and the bench's choices, per device ---------------------------------------------

/** What storage refused to keep (a private window, blocked site data): the choice lasts until the tab closes. */
const unkept = new Map<string, string | null>();

function read(key: string): string | null {
  if (unkept.has(key)) return unkept.get(key) ?? null;
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function forgetRead(): void {
  on = null;
  picks = null;
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) globalThis.localStorage?.removeItem(key);
    else globalThis.localStorage?.setItem(key, value);
    unkept.delete(key);
  } catch {
    unkept.set(key, value);
  }
  forgetRead();
  globalThis.dispatchEvent?.(new Event(CHANGED));
}

let watching = false;

/** Another tab of this browser changed a choice: what was read here is read again. */
function watchStorage(): void {
  if (watching || typeof window === "undefined") return;
  watching = true;
  window.addEventListener("storage", (event) => {
    if (event.key === null || event.key === ON_KEY || event.key === PICKS_KEY || event.key === GAIN_KEY) forgetRead();
  });
}

/** The switch as last read: `SoundGate` asks on every touch and key, storage is not read each time. */
let on: boolean | null = null;

/** On by default; a device that said «выключить» stays quiet. */
export function soundOn(): boolean {
  watchStorage();
  on ??= read(ON_KEY) !== "off";
  return on;
}

export function setSoundOn(on: boolean): void {
  write(ON_KEY, on ? "on" : "off");
}

let picks: Partial<Record<Cue, Pick>> | null = null;

/** The bench's choices on this device; anything unreadable or unknown is dropped. */
export function parsePicks(raw: string | null): Partial<Record<Cue, Pick>> {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return {};
    const out: Partial<Record<Cue, Pick>> = {};
    for (const [cue, pick] of Object.entries(value as Record<string, unknown>)) {
      // own keys only: «constructor» is in every object and is no voice
      if (!Object.hasOwn(CUES, cue) || typeof pick !== "string") continue;
      if (pick === "none" || Object.hasOwn(VOICES, pick)) out[cue as Cue] = pick as Pick;
    }
    return out;
  } catch {
    return {};
  }
}

function readPicks(): Partial<Record<Cue, Pick>> {
  watchStorage();
  picks ??= parsePicks(read(PICKS_KEY));
  return picks;
}

/** What the moment plays on this device: the bench's choice, else its own voice. */
export function pickOf(cue: Cue): Pick {
  return readPicks()[cue] ?? CUES[cue].voices[0];
}

/** Whether the bench has changed this moment on this device. */
export function picked(cue: Cue): boolean {
  return readPicks()[cue] !== undefined;
}

/** `null` gives the moment its own voice back. */
export function setPick(cue: Cue, pick: Pick | null): void {
  const next = { ...readPicks() };
  if (pick === null || pick === CUES[cue].voices[0]) delete next[cue];
  else next[cue] = pick;
  write(PICKS_KEY, Object.keys(next).length ? JSON.stringify(next) : null);
}

export function resetPicks(): void {
  write(PICKS_KEY, null);
}

/** The bench's loudness on this device; 1 until chosen. */
export function soundGain(): number {
  const value = Number(read(GAIN_KEY));
  return (GAINS as readonly number[]).includes(value) ? value : 1;
}

export function setSoundGain(gain: number): void {
  write(GAIN_KEY, gain === 1 ? null : String(gain));
}

/** For `useSyncExternalStore`: the switch and the choices change in this tab or in another one. */
export function subscribeSound(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== ON_KEY && event.key !== PICKS_KEY && event.key !== GAIN_KEY) return;
    forgetRead();
    onChange();
  };
  window.addEventListener(CHANGED, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

// ---- the audio ------------------------------------------------------------------------------------

type AudioContextCtor = typeof AudioContext;

let context: AudioContext | null = null;
let unlocked = false;
let lastUseAt = 0;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
const audioListeners = new Set<() => void>();

function ctor(): AudioContextCtor | null {
  if (typeof window === "undefined") return null;
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext ?? null;
}

/** The page has had a click or a key already (this load): the browser lets it make sound. */
function activated(): boolean {
  const nav = typeof navigator === "undefined" ? null : (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } });
  return Boolean(nav?.userActivation?.hasBeenActive);
}

/** A phone: the finger is the pointer. The computer's audio never sleeps — its chime must not depend on waking. */
function onBattery(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
}

function baseGain(): number {
  return onBattery() ? BASE_GAIN.phone : BASE_GAIN.desk;
}

/** Who needs the audio awake whatever the device: the desk, whose calls come with no touch before them. */
let awake = 0;

/**
 * Keep the audio from sleeping until the returned function is called. The desk holds it while its
 * calls are on: a tablet at the secretary's desk is a touch device too, and a ring of «Охрана»
 * must not depend on audio waking with nobody touching the screen.
 */
export function keepAudioAwake(): () => void {
  awake += 1;
  if (idleTimer !== null) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    awake -= 1;
    if (context?.state === "running") watchIdle();
  };
}

/** Running audio keeps a phone's sound hardware awake: it sleeps once nobody touches or sounds. */
function watchIdle(): void {
  if (idleTimer !== null || awake > 0 || !onBattery()) return;
  const check = () => {
    idleTimer = null;
    if (awake > 0 || !context || context.state !== "running") return;
    const left = IDLE_MS - (Date.now() - lastUseAt);
    if (left > 0) idleTimer = setTimeout(check, left);
    else void context.suspend().catch(() => undefined);
  };
  idleTimer = setTimeout(check, IDLE_MS);
}

/** The audio runs: from now on the page may sound, and whoever waited for that is told once. */
function running(): void {
  lastUseAt = Date.now();
  watchIdle();
  if (unlocked) return;
  unlocked = true;
  for (const listener of audioListeners) listener();
}

function wake(ctx: AudioContext): Promise<void> {
  return ctx.resume().then(running);
}

/**
 * Wake the audio — from a touch or a key (`gesture`), or when the page has had one already.
 * Before that a context would only be born suspended and the browser would scold in the console.
 */
export function unlockAudio(gesture = false): void {
  const Ctor = ctor();
  if (!Ctor || (!gesture && !activated() && !unlocked)) return;
  try {
    context ??= new Ctor();
    // some browsers hand out a context already running inside a touch: that is «unlocked» too
    if (context.state === "running") running();
    else void wake(context).catch(() => undefined);
  } catch {
    // no audio here: the screen still says everything
  }
}

/** Whether the browser lets this page make sound yet. */
export function audioUnlocked(): boolean {
  return unlocked;
}

export function subscribeAudio(listener: () => void): () => void {
  audioListeners.add(listener);
  return () => audioListeners.delete(listener);
}

/**
 * Run `play` on the audio: at once while it runs; while it sleeps — wake it and play only if it
 * woke within `lateMs`. A sound scheduled on a sleeping context would wait and come out later in a
 * heap with the others.
 */
export function withAudio(play: (ctx: AudioContext) => void, lateMs = LATE_MS): void {
  if (!context) unlockAudio();
  const ctx = context;
  if (!ctx) return;
  if (ctx.state === "running") {
    running();
    play(ctx);
    return;
  }
  const asked = Date.now();
  void wake(ctx)
    .then(() => {
      if (lateMs > 0 && Date.now() - asked <= lateMs && ctx.state === "running") play(ctx);
    })
    .catch(() => undefined);
}

const NOISE = new WeakMap<BaseAudioContext, AudioBuffer>();

function noiseFor(ctx: BaseAudioContext): AudioBuffer {
  let buffer = NOISE.get(ctx);
  if (!buffer) {
    buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 2), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    NOISE.set(ctx, buffer);
  }
  return buffer;
}

/**
 * Write a voice's notes into a context at a time (after Bencho's `schedule`, MIT — see voices.ts):
 * the same code plays it live and renders it into an `OfflineAudioContext` for a measurement.
 */
export function schedule(ctx: BaseAudioContext, notes: readonly Note[], when: number, volume = 1, bend = 1): void {
  for (const note of notes) {
    const t0 = when + (note.at ?? 0) / 1000;
    const t1 = t0 + note.ms / 1000;
    const tg = note.glide ? t0 + note.glide / 1000 : t1;
    let source: AudioScheduledSourceNode;
    let head: AudioNode;
    if (note.noise) {
      const buffer = ctx.createBufferSource();
      buffer.buffer = noiseFor(ctx);
      buffer.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = note.noise;
      filter.frequency.setValueAtTime(note.hz * bend, t0);
      if (note.to) filter.frequency.exponentialRampToValueAtTime(note.to * bend, tg);
      if (note.q !== undefined) filter.Q.value = note.q;
      buffer.connect(filter);
      source = buffer;
      head = filter;
    } else {
      const osc = ctx.createOscillator();
      osc.type = note.wave ?? "sine";
      osc.frequency.setValueAtTime(note.hz * bend, t0);
      if (note.to) osc.frequency.exponentialRampToValueAtTime(note.to * bend, tg);
      source = osc;
      head = osc;
    }
    // nothing starts at full gain: that is a click on the front
    const gain = ctx.createGain();
    const attack = Math.min((note.atk ?? 4) / 1000, (note.ms / 1000) * 0.6);
    const peak = (note.gain ?? 0.05) * volume;
    gain.gain.setValueAtTime(0.0001, t0);
    if (note.lin) gain.gain.linearRampToValueAtTime(peak, t0 + attack);
    else gain.gain.exponentialRampToValueAtTime(peak, t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t1);
    let tail: AudioNode = head;
    if (note.cut) {
      const lowpass = ctx.createBiquadFilter();
      lowpass.type = "lowpass";
      lowpass.frequency.value = note.cut;
      head.connect(lowpass);
      tail = lowpass;
    }
    tail.connect(gain).connect(ctx.destination);
    if (note.noise) (source as AudioBufferSourceNode).start(t0, Math.random() * 1.5);
    else source.start(t0);
    source.stop(t1 + 0.02);
  }
}

let lastCue: Cue | null = null;
let lastCueAt = -Infinity;
/** The last cue with a meaning — anything but the desk's plain click. */
let lastOwnAt = -Infinity;

/** The moment's sound. Call it where the person acts, beside the write — never after the server's answer. */
export function sound(cue: Cue, options: { pitch?: number } = {}): void {
  try {
    if (typeof window === "undefined" || !soundOn()) return;
    const now = Date.now();
    if (cue === lastCue && now - lastCueAt < SAME_CUE_MS) return;
    lastCue = cue;
    lastCueAt = now;
    if (cue !== "tap") lastOwnAt = now;
    const pick = pickOf(cue);
    if (pick === "none") return;
    const volume = baseGain() * soundGain();
    // «слушаю» plays now or never: late, it would sound into the microphone that is opening
    const lateMs = cue === "recStart" ? 0 : LATE_MS;
    withAudio((ctx) => schedule(ctx, VOICES[pick], ctx.currentTime + 0.005, volume, options.pitch ?? 1), lateMs);
  } catch {
    // no sound is no reason to disturb the action
  }
}

/** The desk's click for a plain button, unless that click has just played a cue of its own. */
export function tapSound(clickedAt: number): void {
  if (lastOwnAt >= clickedAt - OWN_CUE_MS) return;
  sound("tap");
}

/**
 * The click that follows belongs to a cue already played: a key held for two seconds sounds when
 * the hold completes, and the click of letting it go is not one more press.
 */
export function claimClick(): void {
  lastOwnAt = Date.now();
}

/** «Лаб → Звуки»: hear a voice as it is, whatever the switch says. */
export function audition(voice: VoiceName, step = soundGain()): void {
  try {
    unlockAudio(true);
    const volume = baseGain() * step;
    withAudio((ctx) => schedule(ctx, VOICES[voice], ctx.currentTime + 0.005, volume), 1_000);
  } catch {
    // the bench has nothing to play on
  }
}

/** Tests only: forget the last cue and the read choices. */
export function resetSoundForTest(): void {
  lastCue = null;
  lastCueAt = -Infinity;
  lastOwnAt = -Infinity;
  unkept.clear();
  forgetRead();
}
