"use client";

import { useSyncExternalStore } from "react";

import { VibrateIcon } from "@/components/profile/icons";
import { HapticSwitch, useIosHapticMode } from "@/components/ui/HapticSwitch";
import { Row, RowGroup } from "@/components/ui/Row";
import { canVibrate, hapticsOn, isIosWeb, setHapticsOn, setIosHapticMode, subscribeHaptics, type IosHapticMode } from "@/lib/haptics";

type Platform = "ios" | "android" | "none";

const noStore = () => () => {};

function platformOf(): Platform {
  if (isIosWeb()) return "ios";
  return canVibrate() ? "android" : "none";
}

/** «iPhone» once the client knows it; the server and the first frame draw the plain toggle. */
export function usePlatform(): Platform | null {
  return useSyncExternalStore(noStore, platformOf, () => null);
}

const WAYS: { mode: IosHapticMode; title: string; note: string }[] = [
  { mode: "label", title: "Способ 1", note: "Нажмите — щёлкнул телефон?" },
  { mode: "input", title: "Способ 2", note: "Если первый молчал" },
  { mode: "off", title: "Без щелчка", note: "Ни один не щёлкнул" },
];

/**
 * Профиль → «Вибрация» (D-193): the switch for this phone and, on an iPhone, the way its tick is
 * carried. Safari has no Vibration API; a hidden switch under the finger ticks, and which of two
 * ways does depends on the iOS version (D-147) — so each way's row carries its own switch: the
 * tap that picks it is the test, and the person keeps the one that clicked. Android ticks by
 * itself; a computer has nothing to choose. «Лаб → Вибрация» stays the developers' bench.
 */
export function HapticsChoice() {
  const on = useSyncExternalStore(subscribeHaptics, hapticsOn, () => true);
  const mode = useIosHapticMode();
  const platform = usePlatform();

  return (
    <div className="mt-4">
      <RowGroup>
        <Row icon={<VibrateIcon />} title="Вибрация при нажатии" toggle={{ on, onChange: setHapticsOn }} />
      </RowGroup>

      {platform === "ios" && on ? (
        <>
          <h2 className="eyebrow mt-6 px-1">Как щёлкает ваш iPhone</h2>
          <p className="mt-2 px-1 text-[14px] leading-5 text-muted">
            Нажмите на первую строку. Телефон щёлкнул — готово. Нет — нажмите на вторую.
          </p>
          <div className="mt-3 flex flex-col gap-2" role="radiogroup" aria-label="Способ щелчка">
            {WAYS.map((way) => {
              const chosen = mode === way.mode;
              return (
                <button
                  key={way.mode}
                  type="button"
                  role="radio"
                  aria-checked={chosen}
                  onClick={() => setIosHapticMode(way.mode)}
                  data-haptic="off"
                  data-testid={`haptics-way-${way.mode}`}
                  className={`card relative flex min-h-[60px] items-center gap-3 px-4 text-left transition-transform duration-[120ms] active:scale-[0.98] ${chosen ? "ring-2 ring-accent" : ""}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[16px] font-semibold leading-[22px]">{way.title}</span>
                    <span className="block text-[13px] leading-[18px] text-muted">{way.note}</span>
                  </span>
                  <span
                    aria-hidden
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${chosen ? "border-accent bg-accent" : "border-border"}`}
                  >
                    {chosen ? <span className="h-2 w-2 rounded-full bg-bg" /> : null}
                  </span>
                  {way.mode === "off" ? null : <HapticSwitch mode={way.mode} />}
                </button>
              );
            })}
          </div>
        </>
      ) : null}

      {platform === "android" ? (
        <p className="mt-3 px-1 text-[14px] leading-5 text-muted">На этом телефоне каждое нажатие щёлкает само — выбирать ничего не нужно.</p>
      ) : null}
      {platform === "none" ? (
        <p className="mt-3 px-1 text-[14px] leading-5 text-muted">У этого устройства вибрации нет — переключатель действует на телефоне.</p>
      ) : null}
    </div>
  );
}
