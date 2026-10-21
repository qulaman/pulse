"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";

import { HapticSwitch, useIosHapticMode } from "@/components/ui/HapticSwitch";
import { canVibrate, haptic, hapticsOn, isIosWeb, setIosHapticMode, subscribeHaptics, TAP_MS, type IosHapticMode } from "@/lib/haptics";

const noStore = () => () => {};

/** What the phone is, said plainly — the first thing to tell when something does not tick. */
function platformLine(): string {
  if (typeof navigator === "undefined") return "";
  const ios = navigator.userAgent.match(/OS (\d+)_(\d+)(?:_(\d+))? like Mac OS X/);
  if (isIosWeb()) return `iPhone, iOS ${ios ? `${ios[1]}.${ios[2]}${ios[3] ? `.${ios[3]}` : ""}` : "?"} — вибрации у Safari нет, тик только от переключателя под пальцем`;
  if (canVibrate()) return "Вибрация есть (Android) — тикает каждое нажатие по всему приложению";
  return "Вибрации нет (компьютер или браузер без неё)";
}

const BTN =
  "relative min-h-[48px] flex-1 rounded-[12px] bg-surface-2 px-4 text-[15px] font-semibold leading-5 transition-transform duration-[120ms] active:scale-[0.97]";

function Counted({ label, children }: { label: string; children?: ReactNode }) {
  const [n, setN] = useState(0);
  return (
    <button type="button" className={BTN} onClick={() => setN((v) => v + 1)} data-haptic="off">
      {label} · <span className="nums">{n}</span>
      {children}
    </button>
  );
}

/** The script's way: a hidden switch flipped by `label.click()` — it ticked up to iOS 26.4. */
function scriptTick() {
  const label = document.createElement("label");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.setAttribute("switch", "");
  label.style.cssText = "position:fixed;opacity:0;pointer-events:none;left:-99px";
  label.appendChild(input);
  document.body.appendChild(label);
  label.click();
  label.remove();
}

function Section({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <section className="card mt-3 p-4">
      <h2 className="text-[16px] font-semibold leading-[22px]">{title}</h2>
      <p className="mt-1 text-[13px] leading-[18px] text-muted">{note}</p>
      <div className="mt-3 flex flex-wrap gap-2">{children}</div>
    </section>
  );
}

/**
 * «Лаб → Вибрация» (D-147): which way an iPhone ticks is not known until a real iPhone is
 * tapped — iOS 26.5 shut the script's way, and a switch under the finger is what is left.
 * Each way here counts its taps, so a tap counted twice shows at once; the scroll box checks
 * that a finger which starts on a button still scrolls. The way that ticks is turned on for the
 * whole app on this phone from here.
 */
export function HapticsBench() {
  const platform = useSyncExternalStore(noStore, platformLine, () => "");
  const mode = useIosHapticMode();
  const on = useSyncExternalStore(subscribeHaptics, hapticsOn, () => true);
  const [scrollWay, setScrollWay] = useState<Exclude<IosHapticMode, "off">>("label");

  return (
    <div>
      <p className="text-[14px] leading-5" data-testid="haptics-platform">
        {platform}
      </p>
      {!on ? (
        <p className="mt-2 text-[14px] leading-5" style={{ color: "var(--warn)" }}>
          Вибрация выключена в профиле — сначала включите её там.
        </p>
      ) : null}

      <Section title="1. Переключатель в метке" note="Прозрачная метка с переключателем внутри лежит поверх кнопки. Тикнуло? Счётчик прибавил ровно один?">
        <Counted label="Нажать">
          <HapticSwitch mode="label" />
        </Counted>
        <Counted label="Ещё раз">
          <HapticSwitch mode="label" />
        </Counted>
      </Section>

      <Section title="2. Сам переключатель" note="Прозрачный переключатель растянут на всю кнопку. Тикнуло? Счётчик прибавил ровно один?">
        <Counted label="Нажать">
          <HapticSwitch mode="input" />
        </Counted>
        <Counted label="Ещё раз">
          <HapticSwitch mode="input" />
        </Counted>
      </Section>

      <Section title="3. Из кода" note="Старый способ: скрипт сам щёлкает спрятанный переключатель. До iOS 26.4 тикал, с 26.5 должен молчать.">
        <button type="button" className={BTN} onClick={scriptTick} data-haptic="off">
          Щёлкнуть из кода
        </button>
      </Section>

      <Section title="4. Android" note={`navigator.vibrate: тик нажатия — ${TAP_MS} мс и узор «запись пошла». На iPhone здесь тишина — так и должно быть.`}>
        <button type="button" className={BTN} onClick={() => haptic(TAP_MS)} data-haptic="off">
          Тик
        </button>
        <button type="button" className={BTN} onClick={() => haptic([15, 30, 15])} data-haptic="off">
          Узор
        </button>
      </Section>

      <section className="card mt-3 p-4">
        <h2 className="text-[16px] font-semibold leading-[22px]">5. Прокрутка поверх кнопок</h2>
        <p className="mt-1 text-[13px] leading-[18px] text-muted">
          Начните прокрутку пальцем прямо на кнопке: список должен ехать, кнопка — не нажиматься и не тикать.
        </p>
        <div className="mt-3 flex gap-2">
          {(["label", "input"] as const).map((way) => (
            <button
              key={way}
              type="button"
              className={`min-h-[40px] rounded-full border px-3 text-[13px] font-semibold ${scrollWay === way ? "border-accent bg-accent text-bg" : "border-border bg-surface-2"}`}
              onClick={() => setScrollWay(way)}
              data-haptic="off"
            >
              {way === "label" ? "способ 1" : "способ 2"}
            </button>
          ))}
        </div>
        <div className="mt-3 flex h-56 flex-col gap-2 overflow-y-auto rounded-[12px] border border-border p-2" data-testid="haptics-scroll">
          {Array.from({ length: 14 }, (_, i) => (
            <Counted key={`${scrollWay}-${i}`} label={`Строка ${i + 1}`}>
              <HapticSwitch mode={scrollWay} />
            </Counted>
          ))}
        </div>
      </section>

      <section className="card mt-3 p-4">
        <h2 className="text-[16px] font-semibold leading-[22px]">На всём приложении на этом телефоне</h2>
        <p className="mt-1 text-[13px] leading-[18px] text-muted">
          Только для iPhone: включите способ, который тикнул, и пройдитесь по приложению — вкладки, кнопки, чипы, строки профиля. Android тикает и так.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(["off", "label", "input"] as const).map((way) => (
            <button
              key={way}
              type="button"
              className={`min-h-[40px] rounded-full border px-3 text-[13px] font-semibold ${mode === way ? "border-accent bg-accent text-bg" : "border-border bg-surface-2"}`}
              onClick={() => setIosHapticMode(way)}
              data-testid={`haptics-mode-${way}`}
            >
              {way === "off" ? "выключено" : way === "label" ? "способ 1" : "способ 2"}
            </button>
          ))}
        </div>
        {platform && !platform.startsWith("iPhone") ? (
          <p className="mt-2 text-[13px] leading-[18px] text-muted">Это не iPhone: выбор здесь ничего не меняет.</p>
        ) : null}
      </section>

      <section className="card mt-3 p-4">
        <h2 className="text-[16px] font-semibold leading-[22px]">Что прислать</h2>
        <p className="mt-1 text-[14px] leading-5 text-muted">
          Верхнюю строку (версию iOS), какие из 1–3 тикнули, прибавлял ли счётчик ровно по одному, ехала ли прокрутка в 5 обоими способами.
        </p>
      </section>
    </div>
  );
}
