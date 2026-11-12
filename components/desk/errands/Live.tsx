"use client";

import { CircleHelp, CloudOff, LoaderCircle } from "lucide-react";
import type { CSSProperties, MouseEvent } from "react";

import { MiniButton } from "@/components/desk/tasks/RowMoves";
import { When } from "@/components/desk/ui/When";
import { humanAqtobe } from "@/lib/ai/time";
import { asksDirector } from "@/lib/desk/home";
import { useErrandLink } from "@/lib/errands/mutations";
import { cancelAsked, STALE_MS, usePendingErrands, type PendingErrand } from "@/lib/errands/pending";
import { useErrandReceipt, waitedFor, type Errand } from "@/lib/errands/queries";
import { atLine, etaLeftMin, etaLine, isYesNo, sceneOf, untilLine } from "@/lib/errands/scene";
import { shortName } from "@/lib/people/names";
import type { SecretaryAction } from "@/lib/settings";
import { receiptLine } from "@/lib/tasks/receipts";

import { ErrandTile, PersonFace, SceneTile, WaitClock } from "./look";
import { canCancel, cancelWord } from "./words";

const STAGES = ["Попросили", "Взяли", "Готово"] as const;

/**
 * Where a request stands, as a delivery is tracked (D-174): asked → taken → done, the reached
 * steps in the ink, the line between them filled as far as it got. A promise («будет через 5
 * мин») fills the second line by the time that has passed of it.
 */
export function StageTrack({ errand, now }: { errand: Errand; now: Date }) {
  const stage = errand.status === "sent" ? 0 : errand.status === "accepted" ? 1 : 2;
  let toward = 0;
  if (errand.status === "accepted" && errand.eta_at && errand.accepted_at) {
    const span = new Date(errand.eta_at).getTime() - new Date(errand.accepted_at).getTime();
    toward = span > 0 ? Math.max(0.08, Math.min(1, (now.getTime() - new Date(errand.accepted_at).getTime()) / span)) : 1;
  }
  const label = `${STAGES.slice(0, stage + 1).join(" → ")}${stage < 2 ? ` · дальше: ${STAGES[stage + 1].toLowerCase()}` : ""}`;
  return (
    <span className="errands-track" role="img" aria-label={label} title={label} data-stage={stage}>
      {STAGES.map((word, index) => (
        <span key={word} className="contents">
          {index > 0 ? (
            <span className="errands-track-line" data-on={index <= stage ? "" : undefined}>
              <i style={{ "--fill": index <= stage ? 1 : index === stage + 1 ? toward : 0 } as CSSProperties} />
            </span>
          ) : null}
          <span className="errands-track-node" data-on={index <= stage ? "" : undefined} data-now={index === stage + 1 && stage < 2 ? "" : undefined} />
        </span>
      ))}
    </span>
  );
}

/** What the director needs to know of a live request, in one line under it. */
function StateLine({ errand, now, dnd }: { errand: Errand; now: Date; dnd: boolean }) {
  const receiptQuery = useErrandReceipt(errand.id, errand.status === "sent");
  const who = shortName(errand.claimed?.full_name ?? "");
  if (asksDirector(errand)) {
    return (
      <span className="errands-state" data-tone="ask">
        <CircleHelp size={13} strokeWidth={2.5} aria-hidden />
        <span className="truncate">
          {who || "Секретарь"} спрашивает: <b>{errand.question}</b>
        </span>
      </span>
    );
  }
  if (errand.status === "sent") {
    const receipt = receiptLine(receiptQuery.data, now);
    const stale = now.getTime() - new Date(errand.created_at).getTime() >= STALE_MS;
    return (
      <span className="errands-state" data-tone={stale ? "warn" : "wait"}>
        <span aria-hidden className="errands-ping" />
        <span className="truncate">
          никто ещё не взял
          {/* the push's receipt while nobody has it (principle 8): «не открывал с 9:14», never «не получил» */}
          {receipt ? <span data-tone={receipt.tone}> · {receipt.text}</span> : null}
        </span>
      </span>
    );
  }
  const eta = etaLine(etaLeftMin(errand, now));
  const late = eta?.startsWith("опаздывает");
  return (
    <span className="errands-state" data-tone={late ? "warn" : "work"}>
      <LoaderCircle size={13} strokeWidth={2.5} className="desk-spin" aria-hidden />
      <span className="truncate">
        {dnd && errand.until_at ? `дверь закрыта ${untilLine(errand.until_at)}` : eta ? eta : "в работе"}
      </span>
    </span>
  );
}

/** Who has it: their circle and name, when they took it; nobody yet — an empty seat. */
function Taker({ errand, now }: { errand: Errand; now: Date }) {
  if (!errand.claimed_by) {
    return (
      <span className="flex min-w-0 items-center gap-2 text-[13px] leading-[18px] text-muted">
        <span aria-hidden className="errands-seat" />
        <span className="truncate">никто</span>
      </span>
    );
  }
  const name = shortName(errand.claimed?.full_name ?? "") || "Секретарь";
  return (
    <span className="flex min-w-0 items-center gap-2">
      <PersonFace id={errand.claimed_by} name={errand.claimed?.full_name ?? name} size={24} ring="ok" />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[13px] font-medium leading-[18px]">{name}</span>
        {errand.accepted_at ? (
          <span className="truncate text-[12px] leading-4 text-muted">
            взяли <When>{humanAqtobe(new Date(errand.accepted_at), now).replace(/^сегодня /, "в ")}</When>
          </span>
        ) : null}
      </span>
    </span>
  );
}

function RowMoves({ errand, meId, onCancel }: { errand: Errand; meId: string; onCancel: (errand: Errand) => void }) {
  const link = useErrandLink();
  const busy = link.isPending && link.variables?.id === errand.id;
  const answer = (text: string) => link.mutate({ fn: "errand_answer", id: errand.id, text });
  if (asksDirector(errand) && isYesNo(errand.question ?? "")) {
    return (
      <span className="flex items-center justify-end gap-1">
        <MiniButton label="Да" main disabled={busy} onPress={() => answer("Да")} testId="desk-errand-row-yes" />
        <MiniButton label="Нет" disabled={busy} onPress={() => answer("Нет")} testId="desk-errand-row-no" />
      </span>
    );
  }
  if (!canCancel(errand, meId)) return null;
  return (
    <button
      type="button"
      className="errands-cancel desk-focus"
      data-urgent={errand.urgent ? "" : undefined}
      title="Отменить заявку · клавиша X, когда она открыта"
      onClick={(event) => {
        // the row's click would open the panel for what is leaving the list
        event.stopPropagation();
        onCancel(errand);
      }}
      data-testid="desk-errand-cancel"
    >
      {cancelWord(errand)}
    </button>
  );
}

/** A request on its way from this computer (D-106): «отправляю…», or kept without network with «Отменить». */
function PendingLine({ row }: { row: PendingErrand }) {
  return (
    <div role="row" className="errands-live-row desk-row" data-pending data-testid="desk-errand-pending">
      <SceneTile scene={sceneOf({ kind: row.code, label: row.label }, [])} size={30} muted />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[14px] font-medium leading-5">{row.label}</span>
        <span className="errands-state" data-tone={row.waiting ? "warn" : "wait"}>
          {row.waiting ? <CloudOff size={13} strokeWidth={2.5} aria-hidden /> : <LoaderCircle size={13} strokeWidth={2.5} className="desk-spin" aria-hidden />}
          <span className="truncate">{row.waiting ? "ждёт связи — уйдёт сама" : "отправляю…"}</span>
        </span>
      </span>
      <span className="errands-live-track" />
      <span className="errands-live-who" />
      <span />
      <span className="flex justify-end">
        {row.waiting ? (
          <button type="button" className="errands-cancel desk-focus" data-shown onClick={() => cancelAsked(row.id)}>
            Отменить
          </button>
        ) : null}
      </span>
    </div>
  );
}

/**
 * «Сейчас» of the director (D-174): the live requests as a board — what (its scene's icon, by when,
 * the note), where it stands (asked → taken → done, and the line under it: nobody has it yet and
 * what the push did, the promise, the secretary's question), who has it, how long it waits; the
 * secretary's yes-or-no answered in the row, «Отменить» under the hand. A request asked from here
 * is in the list at once («отправляю…»); one that arrives rises into place.
 */
export function LiveBoard({
  active,
  meId,
  now,
  catalogue,
  openId,
  fresh,
  onOpen,
  onCancel,
}: {
  active: readonly Errand[];
  meId: string;
  now: Date;
  catalogue: readonly SecretaryAction[];
  openId: string | null;
  /** Requests that arrived while the screen looks (`useArrivals`). */
  fresh: ReadonlySet<string>;
  onOpen: (id: string) => void;
  onCancel: (errand: Errand) => void;
}) {
  const pending = usePendingErrands((state) => state.pending);
  if (active.length === 0 && pending.length === 0) return null;
  const open = (id: string) => (event: MouseEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest("button, a, input")) return;
    onOpen(id);
  };
  return (
    <div role="grid" aria-label="Заявки сейчас" className="errands-card errands-live">
      <div role="row" className="errands-live-head">
        <span role="columnheader" className="col-span-2">
          Что
        </span>
        <span role="columnheader" className="errands-live-track">
          Где
        </span>
        <span role="columnheader" className="errands-live-who">
          У кого
        </span>
        <span role="columnheader" className="text-right">
          Ждёт
        </span>
        <span role="columnheader" />
      </div>
      {pending.map((row) => (
        <PendingLine key={row.id} row={row} />
      ))}
      {active.map((errand, index) => {
        const alarm = sceneOf(errand, catalogue) === "security";
        const late = Boolean(errand.due_at) && new Date(errand.due_at as string) < now;
        const waited = now.getTime() - new Date(errand.created_at).getTime();
        const urgency = errand.status !== "sent" ? 0 : waited >= STALE_MS ? 2 : waited >= 3 * 60_000 ? 1 : 0;
        return (
          <div
            key={errand.id}
            role="row"
            aria-selected={openId === errand.id}
            data-row-key={errand.id}
            data-testid="desk-errand-live"
            data-status={errand.status}
            data-asks={asksDirector(errand) ? "" : undefined}
            data-alarm={alarm ? "" : undefined}
            data-arrived={fresh.has(errand.id) ? "" : undefined}
            className="errands-live-row desk-row"
            style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}
            onClick={open(errand.id)}
          >
            <ErrandTile errand={errand} catalogue={catalogue} size={30} />
            <span role="gridcell" className="flex min-w-0 flex-col">
              <span className="truncate text-[14px] font-medium leading-5" title={[errand.label, errand.note].filter(Boolean).join(" · ")}>
                <span className={alarm ? "errands-alarm-word" : undefined}>{alarm ? "Вызови охрану!" : errand.label}</span>
                {errand.due_at ? (
                  <span className="font-normal" data-testid="errand-due">
                    {" · "}
                    <When overdue={late}>{atLine(errand.due_at, now)}</When>
                  </span>
                ) : null}
                {errand.note ? <span className="font-normal text-muted"> · {errand.note}</span> : null}
              </span>
              <StateLine errand={errand} now={now} dnd={sceneOf(errand, catalogue) === "dnd"} />
            </span>
            <span role="gridcell" className="errands-live-track">
              <StageTrack errand={errand} now={now} />
            </span>
            <span role="gridcell" className="errands-live-who min-w-0">
              <Taker errand={errand} now={now} />
            </span>
            <span role="gridcell" className="flex justify-end">
              <WaitClock text={waitedFor(errand, now)} urgency={urgency} />
            </span>
            <span role="gridcell" className="flex justify-end">
              <RowMoves errand={errand} meId={meId} onCancel={onCancel} />
            </span>
          </div>
        );
      })}
    </div>
  );
}
