"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Menu, type MenuItem } from "@/components/desk/ui/Menu";
import { SegmentTabs } from "@/components/desk/ui/Toolbar";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { useSetAway } from "@/lib/errands/mutations";
import { useSecretaries, type Errand, type SecretaryPerson } from "@/lib/errands/queries";
import { AWAY_SPANS, awayUntil, isAway, justThanked, untilLine } from "@/lib/errands/scene";
import { shortName } from "@/lib/people/names";

import { writeParams } from "../tasks/flow";
import { PersonFace } from "./look";
import { RingState } from "./Ring";

/*
 * The head of «Стойка» (D-175): «Заявки», «Очередь | История», her presence as a control, and
 * whether this computer rings (RingState, the signals' hand). Under it, only while she is away, a
 * band that says so with «Я на месте».
 */

/** Who of the others is at the desk now: they get the director's requests while she is away. */
function hereOf(people: readonly SecretaryPerson[], meId: string, now: Date): SecretaryPerson[] {
  return people.filter((person) => person.id !== meId && !isAway(person, now));
}

/** «Айгуль», «Айгуль и Дина», «Айгуль, Дина и Сауле». */
function namesLine(people: readonly SecretaryPerson[]): string {
  const names = people.map((person) => shortName(person.full_name));
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} и ${names[names.length - 1]}`;
}

/**
 * «● На месте ▾» — her presence as one control (D-99): a menu of the four spans of «Отойти», the
 * others' state in its head; away — «Нет до 14:08 ▾» with «Я на месте» first. The dot holds still.
 */
function PresencePill({ meId, people, now }: { meId: string; people: readonly SecretaryPerson[]; now: Date }) {
  const setAway = useSetAway(meId);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const me = people.find((person) => person.id === meId) ?? null;
  const away = me !== null && isAway(me, now);
  const others = people.filter((person) => person.id !== meId);
  const items: MenuItem[] = [
    ...(away ? ([{ key: "back", label: "Я на месте", onSelect: () => setAway.mutate(null) }, "separator"] as MenuItem[]) : []),
    ...AWAY_SPANS.map((span) => ({
      key: String(span.min),
      label: `Отойти ${span.label.charAt(0).toLowerCase()}${span.label.slice(1)}`,
      onSelect: () => setAway.mutate(awayUntil(span.min)),
    })),
  ];
  return (
    <>
      <button
        type="button"
        className="stoika-presence desk-focus"
        data-away={away ? "1" : "0"}
        aria-haspopup="menu"
        aria-expanded={Boolean(anchor)}
        onClick={(event) => setAnchor(anchor ? null : event.currentTarget)}
        data-testid="desk-presence"
        title={away ? "Вы не на месте — просьбы получают те, кто на месте" : "Вы на месте — просьбы директора приходят вам"}
      >
        <span aria-hidden className="stoika-presence-dot" />
        <span className="nums">{away && me?.away_until ? `Нет ${untilLine(me.away_until)}` : "На месте"}</span>
        <ChevronDown size={14} strokeWidth={2.25} aria-hidden className="text-muted" />
      </button>
      <Menu
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        anchor={anchor}
        align="end"
        width={264}
        label="Где вы"
        items={items}
        header={
          <div className="flex flex-col gap-1.5">
            <p className="text-[13px] font-semibold leading-[18px]">{away ? "Вас нет — просьбы получают другие" : "Вы на месте — просьбы приходят вам"}</p>
            {others.map((person) => {
              const gone = isAway(person, now);
              return (
                <p key={person.id} className="flex items-center gap-2 text-[12px] leading-4 text-muted">
                  <PersonFace id={person.id} name={person.full_name} size={18} away={gone} />
                  <span className="min-w-0 flex-1 truncate font-medium text-text">{shortName(person.full_name)}</span>
                  <span className="nums shrink-0">{gone ? `нет ${untilLine(person.away_until as string)}` : "на месте"}</span>
                </p>
              );
            })}
          </div>
        }
      />
    </>
  );
}

/** The page's head: the title, the two views, the presence, whether this computer rings. */
export function StoikaHead({ meId, history, count, now, settled }: { meId: string; history: boolean; count: number; now: Date; settled: boolean }) {
  const secretaries = useSecretaries();
  return (
    <div className="stoika-head desk-page-title" data-testid="stoika-head">
      <h1 className="font-display text-[28px] font-bold leading-[34px] tracking-[-0.025em]">Заявки</h1>
      <SegmentTabs<"queue" | "history">
        aria-label="Вид"
        value={history ? "history" : "queue"}
        onChange={(view) => writeParams(view === "history" ? { view: "history" } : { view: null, from: null, to: null })}
        items={[
          { value: "queue", label: "Очередь", count: count > 0 ? count : undefined },
          { value: "history", label: "История" },
        ]}
      />
      <span className="flex-1" />
      <RingState />
      {/* drawn as the server drew it until the page has hydrated: «На месте» is not known before */}
      <PresencePill meId={meId} people={settled ? (secretaries.data ?? []) : []} now={now} />
    </div>
  );
}

/** While she is away: who gets the director's requests now, and the way back in one click. */
export function AwayBand({ meId, now }: { meId: string; now: Date }) {
  const secretaries = useSecretaries();
  const setAway = useSetAway(meId);
  const people = secretaries.data ?? [];
  const me = people.find((person) => person.id === meId);
  if (!me || !isAway(me, now)) return null;
  const here = hereOf(people, meId, now);
  return (
    <div className="stoika-away" role="status" data-testid="stoika-away">
      <PersonFace id={meId} name={me.full_name} size={28} away />
      <p className="min-w-0 flex-1 text-[14px] leading-5">
        <b className="nums font-semibold">Вас нет {untilLine(me.away_until as string)}</b>
        <span className="text-muted">
          {here.length > 0 ? ` — просьбы ${here.length > 1 ? "получают" : "получает"} ${namesLine(here)}` : " — на месте никого, просьбы ждут вас"}
        </span>
      </p>
      <Button size="sm" variant="secondary" className="!min-h-8" onClick={() => setAway.mutate(null)} data-testid="stoika-back">
        Я на месте
      </Button>
    </div>
  );
}

/** The undo of «на месте» stays as long as the toast says it can. */
const BACK_UNDO_MS = 5_000;

/**
 * Taking a request while marked away marks her back (owner, D-175 Q6): she is plainly at the desk.
 * Returns the call for the take; it does nothing while she is there.
 */
export function useBackOnTake(meId: string): () => void {
  const secretaries = useSecretaries();
  // the one presence write (lib/errands/mutations), quiet: the toast below says it with «Отменить»
  const write = useSetAway(meId, { quiet: true });
  return () => {
    const me = secretaries.data?.find((person) => person.id === meId);
    if (!me || !isAway(me, new Date())) return;
    const was = me.away_until;
    write.mutate(null);
    toast("Отметил: на месте", {
      lifetimeMs: BACK_UNDO_MS,
      action: {
        label: "Отменить",
        // her old «до 14:08», unless that time has gone by meanwhile
        onClick: () => {
          if (was && Date.parse(was) > Date.now()) write.mutate(was);
        },
      },
    });
  };
}

/** «Директор: спасибо ♥» — once for each thank that lands on one of her requests while she looks. */
export function useThanksToast(rows: readonly Errand[] | undefined, meId: string) {
  const before = useRef<readonly Errand[] | null>(null);
  useEffect(() => {
    if (!rows || !meId) return;
    const prev = before.current;
    before.current = rows;
    if (!prev) return;
    if (justThanked(prev, rows, meId)) toast("Директор: спасибо ♥");
  }, [rows, meId]);
}
