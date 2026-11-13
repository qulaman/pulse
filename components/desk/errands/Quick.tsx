"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";

import { useHeldCodes } from "@/components/desk/today/home/ask";
import { useShortcuts } from "@/components/desk/ui/Shortcuts";
import { Button } from "@/components/ui/Button";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import { GRACE_MS } from "@/lib/desk/home";
import { useSecretaryActions } from "@/lib/errands/queries";
import { sceneOfAction } from "@/lib/errands/scene";
import type { SecretaryAction } from "@/lib/settings";

import { useScreenKeys } from "../team/keys";
import { SceneTile } from "./look";
import { ALARM_HOLD_MS, isAlarmAction, isDndAction, useHold, type DeskAsk } from "./useAsk";

/*
 * The keypad of the director's «Пульт» (D-175): the company's requests as keys in their own order —
 * a keypad does not reorder itself, so 1–7 always press the same key. A press goes after five
 * seconds with «Отменить» in the toast (the key shows its window running out), «Не беспокоить ▾»
 * asks for how long, «Охрана» goes on a hold of two seconds, «Своими словами» takes the rest. The
 * same ask as «Сегодня» (./useAsk.tsx). Nothing here needs the requests' read: a failed list still
 * asks.
 */

/** Where the catalogue is set: «Настройки → Программа → Кнопки секретаря». */
const CATALOGUE_HREF = "/desk/settings?tab=app";
/** The digit keys: 1–7, the first seven keys. */
const DIGITS = 7;

/** A field with its own button inside (D-175): Enter sends, the button too; the field empties after. */
export function PultField({
  placeholder,
  action,
  onSend,
  busy = false,
  label,
  title,
  testId,
  sendTestId,
}: {
  placeholder: string;
  action: string;
  onSend: (text: string) => void;
  busy?: boolean;
  label: string;
  title?: string;
  testId?: string;
  sendTestId?: string;
}) {
  const [text, setText] = useState("");
  const send = () => {
    const value = text.trim();
    if (!value || busy) return;
    onSend(value);
    setText("");
  };
  return (
    <div className="pult-field" data-filled={text.trim() ? "" : undefined}>
      <input
        className="pult-field-input"
        placeholder={placeholder}
        title={title}
        aria-label={label}
        value={text}
        maxLength={300}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            send();
          }
        }}
        data-testid={testId}
      />
      <Button size="sm" variant="secondary" className="pult-field-send" disabled={!text.trim() || busy} onClick={send} data-testid={sendTestId}>
        {action}
      </Button>
    </div>
  );
}

/** A key of the keypad: the scene's tile, the word, the usual note — or its five seconds running out. */
function Key({ action, digit, note, held, pressed, onPress, keyRef }: { action: SecretaryAction; digit: number | null; note: string | null; held: boolean; pressed: boolean; onPress: (anchor: HTMLElement) => void; keyRef: (el: HTMLButtonElement | null) => void }) {
  const dnd = isDndAction(action);
  return (
    <button
      ref={keyRef}
      type="button"
      className="pult-key desk-focus"
      onClick={(event) => onPress(event.currentTarget)}
      title={dnd ? "Выбрать, на сколько" : `Уйдёт через 5 с — успеете отменить${note ? ` · как обычно: ${note}` : ""}`}
      aria-haspopup={dnd ? "menu" : undefined}
      aria-keyshortcuts={digit ? String(digit) : undefined}
      data-code={action.code}
      data-held={held ? "" : undefined}
      data-pressed={pressed ? "" : undefined}
      data-testid="desk-pult-key"
    >
      <span className="pult-key-top">
        <SceneTile scene={sceneOfAction(action)} size={32} />
        {digit ? <span className="pult-cap nums">{digit}</span> : null}
      </span>
      <span className="pult-key-word">
        <span className="truncate">{action.label}</span>
        {dnd ? <ChevronDown size={14} strokeWidth={2.5} aria-hidden className="shrink-0" /> : null}
      </span>
      {/* the second line keeps its height: the words never move when the window starts */}
      <span className="pult-key-note">{held ? "уйдёт через 5 с" : (note ?? (dnd ? "на сколько?" : " "))}</span>
      {held ? (
        <span aria-hidden className="pult-key-window" style={{ "--window": `${GRACE_MS}ms` } as CSSProperties}>
          <i />
        </span>
      ) : null}
    </button>
  );
}

/** «Охрана»: held two seconds, the line under it fills; while an alarm is up it says so and waits. */
function AlarmKey({ action, live, wide, onSend }: { action: SecretaryAction; live: boolean; wide: boolean; onSend: () => void }) {
  const { holding, handlers } = useHold(onSend, action.label, undefined, live);
  return (
    <button
      type="button"
      className="pult-key pult-key-alarm desk-focus"
      {...(live ? {} : handlers)}
      disabled={live}
      title={live ? "Охрана уже вызвана — она первая в «Ждут вас»" : "Удержите 2 секунды — уйдёт сразу"}
      aria-label={live ? `${action.label}: уже вызвана` : `${action.label}: удержите две секунды, чтобы отправить`}
      data-holding={holding ? "" : undefined}
      data-live={live ? "" : undefined}
      data-wide={wide ? "" : undefined}
      data-testid="desk-pult-alarm-key"
    >
      <span className="pult-key-top">
        <SceneTile scene="security" size={32} />
        <span className="pult-key-hint">{live ? "идёт" : "держать 2 с"}</span>
      </span>
      <span className="pult-key-word">{action.label}</span>
      {live ? null : (
        <span aria-hidden className="pult-hold">
          <i style={{ transform: holding ? "scaleX(1)" : "scaleX(0)", transition: holding ? `transform ${ALARM_HOLD_MS}ms linear` : "transform 150ms var(--ease-out, ease-out)" }} />
        </span>
      )}
    </button>
  );
}

/** `asks` — the screen's one ask (`useDeskAsk`): «Попросить снова» elsewhere on the screen goes the same way. */
export function Keypad({ asks, alarmLive }: { asks: DeskAsk; alarmLive: boolean }) {
  const catalogue = useSecretaryActions();
  const held = useHeldCodes();
  const keys = useRef(new Map<number, HTMLButtonElement>());
  const [pressed, setPressed] = useState<string | null>(null);
  // one press-flash at a time, and none outliving the keypad
  const flash = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (flash.current) clearTimeout(flash.current);
    },
    [],
  );
  const regular = asks.actions.filter((action) => !isAlarmAction(action));
  const alarm = asks.actions.find(isAlarmAction) ?? null;

  // the digits press the keys when no field has the keys (useScreenKeys skips fields, menus, dialogs)
  useScreenKeys((event) => {
    const match = /^(?:Digit|Numpad)([1-9])$/.exec(event.code);
    if (!match) return false;
    const index = Number(match[1]) - 1;
    const action = index < DIGITS ? regular[index] : undefined;
    if (!action) return false;
    const key = keys.current.get(index) ?? null;
    // the key answers the digit as it answers the mouse: it sinks for a moment
    setPressed(action.code);
    if (flash.current) clearTimeout(flash.current);
    flash.current = setTimeout(() => {
      flash.current = null;
      setPressed(null);
    }, 160);
    asks.press(action, key);
    return true;
  });
  useShortcuts("Заявки · попросить", [
    { keys: [`1–${Math.min(DIGITS, Math.max(1, regular.length))}`], label: "Кнопка с этой цифрой — уйдёт через 5 с" },
    { keys: ["Удержать"], label: "«Охрана» — две секунды мышью, Space или Enter" },
  ]);

  return (
    <aside className="pult-keypad" data-testid="desk-pult-keypad" aria-label="Попросить секретаря">
      <div className="pult-keypad-head">
        <h2 className="pult-keypad-title">Попросить</h2>
        <span className="pult-keypad-hint">уходит через 5 с — успеете отменить</span>
      </div>
      {catalogue.isPending ? (
        <SkeletonGroup className="pult-keys" aria-hidden>
          {Array.from({ length: 6 }, (_, index) => (
            <Bone key={index} h={84} />
          ))}
        </SkeletonGroup>
      ) : catalogue.data === undefined ? (
        <p className="pult-keypad-note">
          Кнопки не загрузились — своими словами можно и сейчас.{" "}
          <button type="button" className="underline-offset-2 hover:underline" onClick={() => void catalogue.refetch()}>
            Повторить
          </button>
        </p>
      ) : asks.actions.length === 0 ? (
        <p className="pult-keypad-note">
          Кнопок у секретаря пока нет —{" "}
          <Link href={CATALOGUE_HREF} prefetch className="text-text underline-offset-2 hover:underline">
            задать в «Настройках»
          </Link>
        </p>
      ) : (
        <div className="pult-keys">
          {regular.map((action, index) => (
            <Key
              key={action.code}
              action={action}
              digit={index < DIGITS ? index + 1 : null}
              note={isDndAction(action) ? null : asks.usual(action.code)}
              held={held.includes(action.code)}
              pressed={pressed === action.code}
              onPress={(anchor) => asks.press(action, anchor)}
              keyRef={(el) => {
                if (el) keys.current.set(index, el);
                else keys.current.delete(index);
              }}
            />
          ))}
          {alarm ? <AlarmKey action={alarm} live={alarmLive} wide={regular.length % 2 === 0} onSend={() => asks.alarm(alarm)} /> : null}
        </div>
      )}
      <PultField
        placeholder="Своими словами…"
        action="Попросить"
        label="Просьба секретарю своими словами"
        title="Например: «чай без сахара гостю» — уйдёт через 5 с, успеете отменить"
        onSend={asks.own}
        testId="desk-pult-words"
        sendTestId="desk-pult-words-send"
      />
      {asks.menu}
    </aside>
  );
}
