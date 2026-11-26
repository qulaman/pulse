"use client";

import { useSyncExternalStore } from "react";

import {
  audition,
  CUE_NAMES,
  CUES,
  GAINS,
  type Cue,
  type Pick,
  pickOf,
  picked,
  resetPicks,
  setPick,
  setSoundGain,
  setSoundOn,
  soundGain,
  soundOn,
  subscribeSound,
  type VoiceName,
  VOICES,
  voiceMs,
} from "@/lib/sound";

const PILL = "min-h-[40px] rounded-full border px-3 text-[14px] font-semibold leading-5 transition-transform duration-[120ms] active:scale-[0.97]";
const PILL_ON = "border-accent bg-accent text-bg";
const PILL_OFF = "border-border bg-surface-2";

const WHERE: Record<(typeof CUES)[Cue]["where"], string> = { phone: "телефон", desk: "компьютер", both: "телефон и компьютер" };
const GAIN_LABEL: Record<number, string> = { 0.5: "Тише", 1: "Как есть", 1.5: "Громче", 2.2: "Громко" };

/** One string for the whole choice: a snapshot `useSyncExternalStore` can compare. */
function snapshot(): string {
  return `${soundOn() ? 1 : 0}|${soundGain()}|${CUE_NAMES.map((cue) => pickOf(cue)).join(",")}`;
}

/** What to send back: only the moments changed here, «send: landed · tap: none». */
function changedLine(): string {
  const changed = CUE_NAMES.filter((cue) => picked(cue)).map((cue) => `${cue}: ${pickOf(cue)}`);
  const gain = soundGain();
  if (gain !== 1) changed.push(`громкость ×${gain}`);
  return changed.join(" · ");
}

function CueCard({ cue }: { cue: Cue }) {
  const spec = CUES[cue];
  const pick = pickOf(cue);
  const options: Pick[] = [...spec.voices, "none"];
  return (
    <section className="card mt-3 p-4" data-testid={`sound-cue-${cue}`}>
      <h2 className="text-[16px] font-semibold leading-[22px]">{spec.label}</h2>
      <p className="mt-1 text-[13px] leading-[18px] text-muted">
        {WHERE[spec.where]} · <span className="nums">{cue}</span>
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {options.map((option, index) => {
          const on = pick === option;
          const voice = option === "none" ? null : (option as VoiceName);
          return (
            <button
              key={option}
              type="button"
              // the bench's own buttons neither tick nor click: only the voice is heard
              data-haptic="off"
              aria-pressed={on}
              className={`${PILL} ${on ? PILL_ON : PILL_OFF}`}
              onClick={() => {
                setPick(cue, index === 0 ? null : option);
                if (voice) audition(voice);
              }}
            >
              {voice ? (
                <>
                  {voice} · <span className="nums">{Math.round(voiceMs(VOICES[voice]))}</span> мс
                </>
              ) : (
                "без звука"
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

/**
 * «Лаб → Звуки» (D-204): every moment the app sounds at, with the voices to choose from. A tap
 * plays the voice and puts it on this moment — on this device only, so the person lives with the
 * choice in the real app and then says which ones stayed. The first voice is the moment's own.
 */
export function SoundsBench() {
  // re-renders on every change of the switch, the loudness or a pick
  useSyncExternalStore(subscribeSound, snapshot, () => "");
  const on = soundOn();
  const gain = soundGain();
  const line = changedLine();

  return (
    <div>
      <p className="text-[14px] leading-5">
        Нажмите на вариант — он прозвучит и встанет на этот момент на этом устройстве. Первый вариант — как задумано. iPhone в беззвучном режиме молчит; Android играет по громкости музыки.
      </p>
      {!on ? (
        <p className="mt-2 text-[14px] leading-5" style={{ color: "var(--warn)" }}>
          Звук выключен в профиле — варианты здесь слышны, в приложении тихо.{" "}
          <button type="button" className="font-semibold underline" onClick={() => setSoundOn(true)}>
            Включить
          </button>
        </p>
      ) : null}

      <section className="card mt-3 p-4">
        <h2 className="text-[16px] font-semibold leading-[22px]">Громкость</h2>
        <p className="mt-1 text-[13px] leading-[18px] text-muted">На всё приложение на этом устройстве. Кнопки громкости телефона работают как обычно.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {GAINS.map((step) => (
            <button
              key={step}
              type="button"
              data-haptic="off"
              aria-pressed={gain === step}
              className={`${PILL} ${gain === step ? PILL_ON : PILL_OFF}`}
              onClick={() => {
                setSoundGain(step);
                audition("mark", step);
              }}
            >
              {GAIN_LABEL[step]}
            </button>
          ))}
        </div>
      </section>

      {CUE_NAMES.map((cue) => (
        <CueCard key={cue} cue={cue} />
      ))}

      <section className="card mt-3 p-4">
        <h2 className="text-[16px] font-semibold leading-[22px]">Что прислать</h2>
        <p className="mt-1 text-[13px] leading-[18px] text-muted">Поживите с выбором день и пришлите эту строку — выбранное станет звуком для всех.</p>
        <p className="mt-3 select-all break-words text-[14px] leading-5" data-testid="sound-picks-line">
          {line || "Пока всё как задумано."}
        </p>
        {line ? (
          <button
            type="button"
            className={`${PILL} ${PILL_OFF} mt-3`}
            onClick={() => {
              resetPicks();
              setSoundGain(1);
            }}
          >
            Вернуть как задумано
          </button>
        ) : null}
      </section>
    </div>
  );
}
