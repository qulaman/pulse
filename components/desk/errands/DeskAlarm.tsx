"use client";

import { Check, ChevronDown, Copy, Phone, Siren } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

import { Kbd } from "@/components/desk/ui/Kbd";
import { afterAlarm, agoLine, alarmOf, clock, guardPhone } from "@/lib/desk/signals";
import { isPlainKey, isTypingTarget } from "@/lib/desk/keys";
import { useErrandActions } from "@/lib/errands/mutations";
import { useErrands, useSecretaryActions, useSecretarySetup, type Errand } from "@/lib/errands/queries";
import { shortName } from "@/lib/people/names";
import { useNow } from "@/lib/pulse/queries";
import { useVisits } from "@/lib/visits/queries";

/** A stray Enter typed just as the alarm comes up must not answer it. */
const ARMED_AFTER_MS = 600;

/** What the alarm shows of the request after a press, before the list's next read confirms it. */
type Local = { id: string; status: "accepted" | "done"; at: string } | null;

/**
 * «Вызови охрану!» on the computer (D-175): while an «Охрана» nobody has taken waits, the work
 * area of whatever section is open becomes the alarm — the navigation and the top bar stay. No
 * mascot and no `tel:` on a computer: the guard's number in big figures with «Копировать», the
 * answer on Enter, «Свернуть» on Esc. Taken by her: the field holds still, a timer counts the
 * call, «Охрана на месте» closes it. Folded: one red strip over the work area. Taken by a
 * colleague: a quiet strip that says who is calling. The same moves as the phone's overlay.
 */
export function DeskAlarm({ meId, main }: { meId: string; main: RefObject<HTMLElement | null> }) {
  const errands = useErrands(true);
  const catalogue = useSecretaryActions(true);
  const [local, setLocal] = useState<Local>(null);
  const [folded, setFolded] = useState<string | null>(null);
  // the move belongs here, not to the field: «Свернуть» right after Enter unmounts the field, and a
  // per-call `onSuccess` of an unmounted observer never runs — the strip would say «calling» on
  const transition = useErrandActions();
  const act = (target: Errand) => {
    if (transition.isPending) return;
    const to = target.status === "accepted" ? "done" : "accepted";
    // «Охрана на месте» — the director hears it from the push of this very step (as on the phone)
    transition.mutate({ id: target.id, to }, { onSuccess: () => setLocal({ id: target.id, status: to, at: new Date().toISOString() }) });
  };

  const found = alarmOf(errands.data ?? [], catalogue.data ?? []);
  // a press shows at once; the list's next read says the same, or the alarm is gone
  const alarm: Errand | null =
    found && local?.id === found.id
      ? local.status === "done"
        ? null
        : found.status === "sent"
          ? { ...found, status: "accepted", claimed_by: meId, accepted_at: local.at }
          : found
      : found;
  if (!alarm) return null;

  const theirs = alarm.status === "accepted" && alarm.claimed_by !== meId;
  if (theirs) return <AlarmStrip alarm={alarm} state="theirs" />;
  if (folded === alarm.id) return <AlarmStrip alarm={alarm} state={alarm.status === "sent" ? "calling" : "taken"} onOpen={() => setFolded(null)} />;
  return <AlarmField alarm={alarm} meId={meId} main={main} busy={transition.isPending} onAct={() => act(alarm)} onFold={() => setFolded(alarm.id)} />;
}

function AlarmField({ alarm, meId, main, busy, onAct, onFold }: { alarm: Errand; meId: string; main: RefObject<HTMLElement | null>; busy: boolean; onAct: () => void; onFold: () => void }) {
  const setup = useSecretarySetup(true);
  const errands = useErrands(true);
  const visits = useVisits(true);
  const now = useNow(1_000);
  const field = useRef<HTMLElement>(null);
  const [copied, setCopied] = useState(false);
  const taken = alarm.status === "accepted";
  const state = taken ? "taken" : "calling";

  const phone = guardPhone(setup.data?.securityPhone);
  const author = shortName(alarm.author?.full_name ?? "") || "Директор";
  const behind = afterAlarm({ errands: errands.data ?? [], visits: visits.data ?? [], meId, alarmId: alarm.id });

  const act = onAct;

  // the screen under the alarm is out of reach: no Tab into it, no reader reading it
  useLayoutEffect(() => {
    const screen = main.current;
    if (!screen) return;
    screen.setAttribute("inert", "");
    return () => screen.removeAttribute("inert");
  }, [main]);

  // the alarm takes the caret (Tab starts in it), unless the person is typing somewhere above (the
  // top bar's dialogs); the field itself, not the white button — Enter answers anyway, and a ring
  // around the one white button would only double it
  useEffect(() => {
    const active = document.activeElement;
    if (!active || active === document.body || main.current?.contains(active)) field.current?.focus({ preventScroll: true });
  }, [main, state]);

  // Enter answers, Esc folds; the screen's own keys stay asleep under the alarm
  const latest = useRef({ act, onFold });
  useLayoutEffect(() => {
    latest.current = { act, onFold };
  });
  useEffect(() => {
    const armedAt = Date.now() + ARMED_AFTER_MS;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isTypingTarget(event.target)) return;
      if (document.body.hasAttribute("data-sheet-open") || document.body.hasAttribute("data-dialog-open")) return;
      // a menu or a popover of the top bar is open: its own Enter and Esc come first
      if (document.querySelector("body > .desk-pop")) return;
      if (!isPlainKey(event)) return;
      if (event.key === "Enter" || event.code === "NumpadEnter") {
        // a button of its own under the caret («Свернуть», «Копировать», the top bar's) answers itself
        const target = event.target as HTMLElement | null;
        if (target && target !== document.body && target !== field.current && !target.matches(".desk-alarm-main")) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!event.repeat && Date.now() >= armedAt) latest.current.act();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        latest.current.onFold();
        return;
      }
      // the desk's own keys pass: «G» and a section, «[», «?» and «/»
      if (event.code === "KeyG" || event.code === "BracketLeft" || event.code === "Slash" || event.key === "?" || event.key === "Tab") return;
      // a letter, a digit or an arrow meant for the hidden screen («N» — «Не могу» on a ticket) is swallowed
      if (event.key.length === 1 || event.key.startsWith("Arrow") || event.key === "Home" || event.key === "End" || event.key === " ") {
        event.stopImmediatePropagation();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [alarm.id, state]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2_000);
    return () => clearTimeout(timer);
  }, [copied]);
  const copy = () => {
    void navigator.clipboard?.writeText(phone).then(
      () => setCopied(true),
      () => undefined,
    );
  };

  return (
    <section ref={field} tabIndex={-1} className="desk-alarm" data-state={state} role="alertdialog" aria-labelledby="desk-alarm-title" aria-describedby="desk-alarm-who" data-testid="desk-alarm">
      <div className="desk-alarm-body">
        <span className="desk-alarm-tile" aria-hidden>
          <Siren size={44} strokeWidth={2} />
        </span>
        <h2 id="desk-alarm-title" className="desk-alarm-title" data-testid="desk-alarm-title">
          {taken ? "Охрана вызывается" : "Вызови охрану!"}
        </h2>
        <p id="desk-alarm-who" className="desk-alarm-who">
          {author} · {taken && alarm.accepted_at ? <>вызываете <span className="desk-alarm-clock">{clock(alarm.accepted_at, now)}</span></> : agoLine(alarm.created_at, now)}
        </p>
        {alarm.note ? <p className="desk-alarm-note">«{alarm.note}»</p> : null}

        <div className="desk-alarm-phone" data-testid="desk-alarm-phone">
          <Phone size={22} strokeWidth={2} aria-hidden className="desk-alarm-phone-icon" />
          {phone ? (
            <>
              <span className="desk-alarm-phone-label">Охрана</span>
              <span className="desk-alarm-phone-number">{phone}</span>
              <button type="button" className="desk-alarm-copy" onClick={copy} data-testid="desk-alarm-copy" aria-live="polite">
                {copied ? <Check size={15} strokeWidth={2.5} aria-hidden /> : <Copy size={15} strokeWidth={2.25} aria-hidden />}
                <span>{copied ? "Скопировано" : "Копировать"}</span>
              </button>
            </>
          ) : (
            <span className="desk-alarm-phone-none">Номер охраны не записан в настройках</span>
          )}
        </div>

        <div className="desk-alarm-moves">
          <button type="button" className="desk-alarm-main" disabled={busy} onClick={act} data-testid={taken ? "desk-alarm-done" : "desk-alarm-accept"}>
            {taken ? "Охрана на месте" : "Вызываю охрану"}
            <Kbd>Enter</Kbd>
          </button>
          <button type="button" className="desk-alarm-fold" onClick={onFold} data-testid="desk-alarm-fold">
            Свернуть
            <Kbd>Esc</Kbd>
          </button>
        </div>

        {behind ? <p className="desk-alarm-behind">{behind}</p> : null}
      </div>
    </section>
  );
}

/**
 * The alarm folded — one red strip at the top of the work area, never over the top bar: «Охрана ·
 * 1:12 · развернуть». A colleague's call is a quiet strip without a move: the screen is hers again.
 */
function AlarmStrip({ alarm, state, onOpen }: { alarm: Errand; state: "calling" | "taken" | "theirs"; onOpen?: () => void }) {
  const now = useNow(1_000);
  const since = state === "calling" ? alarm.created_at : (alarm.accepted_at ?? alarm.created_at);
  const time = <span className="desk-alarm-clock">{clock(since, now)}</span>;
  if (state === "theirs") {
    return (
      <div className="desk-alarm-strip" data-state="theirs" role="status" data-testid="desk-alarm-strip">
        <Siren size={16} strokeWidth={2.25} aria-hidden />
        <span>Охрану вызывает {shortName(alarm.claimed?.full_name ?? "") || "секретарь"}</span>
        <span aria-hidden>·</span>
        {time}
      </div>
    );
  }
  return (
    <button type="button" className="desk-alarm-strip" data-state={state} onClick={onOpen} data-testid="desk-alarm-strip">
      <Siren size={16} strokeWidth={2.25} aria-hidden />
      <span className="font-semibold">Охрана</span>
      <span aria-hidden>·</span>
      {state === "taken" ? <span>вызываете</span> : null}
      {time}
      <span className="desk-alarm-strip-open">
        развернуть
        <ChevronDown size={15} strokeWidth={2.25} aria-hidden />
      </span>
    </button>
  );
}
