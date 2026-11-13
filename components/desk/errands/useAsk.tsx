"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";

import { askAfterWindow } from "@/components/desk/today/home/ask";
import { Menu } from "@/components/desk/ui/Menu";
import { toast } from "@/components/ui/Toast";
import { useCalendar } from "@/lib/calendar/queries";
import { dndChoices, freeAction, meetingEndOf } from "@/lib/desk/home";
import { rememberSend, usualNote } from "@/lib/errands/habits";
import { askSecretary } from "@/lib/errands/pending";
import { errandKeys, useSecretaries, useSecretaryActions, type Errand } from "@/lib/errands/queries";
import { absenceLine, sceneOfAction } from "@/lib/errands/scene";
import { useNow } from "@/lib/pulse/queries";
import type { SecretaryAction } from "@/lib/settings";

/*
 * The director's ask from the desk, one for «Сегодня» and the keypad of «Заявки» (D-164, D-175):
 * a click is held five seconds with «Отменить» in the toast (./today/home/ask.ts), the usual note
 * goes with it, «Не беспокоить» asks for how long (and offers the end of the meeting going on),
 * «Охрана» goes on a hold of two seconds and leaves at once, «Своими словами» is the request said
 * in the director's words. The blocks draw their own buttons; the behaviour is here.
 */

/** «Охрана» goes on a hold of two seconds, as on the phone (D-101): never one stray click away. */
export const ALARM_HOLD_MS = 2_000;

const NO_ACTIONS: SecretaryAction[] = [];

export const isAlarmAction = (action: Pick<SecretaryAction, "code" | "label" | "scene">) => sceneOfAction(action) === "security";
export const isDndAction = (action: Pick<SecretaryAction, "code" | "label" | "scene">) => sceneOfAction(action) === "dnd";

type Askable = Pick<SecretaryAction, "code" | "label" | "icon">;

export type DeskAsk = {
  /** The company's catalogue, in its own order (null until it came). */
  actions: readonly SecretaryAction[];
  /** The note the director usually adds to a button: «без сахара». */
  usual: (code: string) => string | null;
  /** Who of the secretaries is away — said in the toast (D-106). */
  absence: string | null;
  /** A button pressed: «Не беспокоить» opens its spans under `anchor`, anything else goes after the window. */
  press: (action: SecretaryAction, anchor: HTMLElement | null) => void;
  /** «Охрана», after its hold: at once, «Отменить» in the toast, «Ложная тревога» in its row (D-99). */
  alarm: (action: SecretaryAction) => void;
  /** The request in the director's own words (D-99). */
  own: (words: string) => void;
  /** «Попросить снова»: a refused request asked again — the same button and words, through the window. */
  again: (errand: Errand) => void;
  /** The spans of «Не беспокоить»; render it once, anywhere. */
  menu: ReactNode;
};

export function useDeskAsk(): DeskAsk {
  const queryClient = useQueryClient();
  const secretaries = useSecretaries();
  const catalogue = useSecretaryActions();
  const calendar = useCalendar();
  const now = useNow(30_000);
  const actions = catalogue.data ?? NO_ACTIONS;
  const notes = useMemo(() => new Map(actions.map((action) => [action.code, isAlarmAction(action) ? null : usualNote(action.code)])), [actions]);
  const absence = absenceLine(secretaries.data ?? [], now);
  const meetingEnd = meetingEndOf(calendar.data ?? [], now);
  const refresh = useCallback(() => void queryClient.invalidateQueries({ queryKey: errandKeys.root }), [queryClient]);
  const [dnd, setDnd] = useState<{ action: SecretaryAction; anchor: HTMLElement | null } | null>(null);

  const send = (action: Askable, note: string | null, untilMin: number | null = null) => askAfterWindow({ action, note, untilMin, absence, onSent: refresh });
  const usual = (code: string) => notes.get(code) ?? null;

  const menu = (
    <Menu
      open={dnd !== null}
      onClose={() => setDnd(null)}
      anchor={dnd?.anchor ?? null}
      align="start"
      width={260}
      label={dnd?.action.label}
      items={
        dnd
          ? dndChoices(meetingEnd, now).map((choice) => ({
              key: choice.key,
              label: choice.label,
              // the toast and the row say for how long; the server takes the span itself (until_min)
              onSelect: () => send({ ...dnd.action, label: `${dnd.action.label} ${choice.label.charAt(0).toLowerCase()}${choice.label.slice(1)}` }, choice.note, choice.untilMin),
            }))
          : []
      }
    />
  );

  return {
    actions,
    usual,
    absence,
    press: (action, anchor) => {
      if (isDndAction(action)) setDnd({ action, anchor });
      else send(action, usual(action.code));
    },
    alarm: (action) => {
      rememberSend(action.code, null);
      askSecretary(action, null, refresh);
    },
    own: (words) => {
      const text = words.trim();
      if (text) send(freeAction(text), text);
    },
    again: (errand) => {
      const action = actions.find((one) => one.code === errand.kind);
      // «не беспокоить» asked again keeps its span: the minutes it was asked for
      const span = errand.until_at ? Math.round((new Date(errand.until_at).getTime() - new Date(errand.created_at).getTime()) / 60_000) : null;
      send(action ?? { code: errand.kind, label: errand.label, icon: "" }, errand.note, span && span > 0 ? span : null);
    },
    menu,
  };
}

/**
 * A press held for `ms` (D-101): the pointer or Space / Enter kept down sends, a click or a short
 * press only says how. `holding` drives the line that fills under the button.
 */
export function useHold(onSend: () => void, label: string, ms = ALARM_HOLD_MS, disabled = false) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sent = useRef(false);
  const latest = useRef(onSend);
  const off = useRef(disabled);
  useEffect(() => {
    latest.current = onSend;
    off.current = disabled;
  });
  // the key turned off mid-hold (an alarm went up from another tab or the phone): the pointer's
  // «up» no longer reaches a disabled button, so the hold is dropped here — never a second alarm
  useEffect(() => {
    if (!disabled || !timer.current) return;
    clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  }, [disabled]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const start = () => {
    if (timer.current) return;
    sent.current = false;
    setHolding(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      setHolding(false);
      if (off.current) return;
      sent.current = true;
      latest.current();
    }, ms);
  };
  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  };
  const how = () => toast(`«${label}» — удержите 2 секунды: от случайного клика не уходит`);
  const isHoldKey = (event: KeyboardEvent) => event.key === " " || event.key === "Enter";
  return {
    holding,
    handlers: {
      onPointerDown: (event: PointerEvent) => {
        if (event.button === 0) start();
      },
      onPointerUp: stop,
      onPointerLeave: stop,
      onPointerCancel: stop,
      onBlur: stop,
      onKeyDown: (event: KeyboardEvent) => {
        if (!isHoldKey(event)) return;
        // the key's own click would only say how: the hold is the press
        event.preventDefault();
        if (!event.repeat) start();
      },
      onKeyUp: (event: KeyboardEvent) => {
        if (!isHoldKey(event)) return;
        event.preventDefault();
        const early = timer.current !== null;
        stop();
        if (early && !sent.current) how();
      },
      onClick: () => {
        if (sent.current) {
          sent.current = false;
          return;
        }
        // a click from the keyboard was taken by the keys above: only the mouse's comes here
        how();
      },
      onContextMenu: (event: { preventDefault: () => void }) => event.preventDefault(),
    },
  };
}
