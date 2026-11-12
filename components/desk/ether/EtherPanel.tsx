"use client";

import { CheckCheck, Clock3, Trash2 } from "lucide-react";

import { PersonFace } from "@/components/desk/errands/look";
import { MiniButton } from "@/components/desk/tasks/RowMoves";
import { PanelHeader } from "@/components/desk/ui/DeskPanel";
import { When } from "@/components/desk/ui/When";
import { AudioOriginal } from "@/components/tasks/AudioOriginal";
import { Button } from "@/components/ui/Button";
import { humanAqtobe } from "@/lib/ai/time";
import type { Reach } from "@/lib/desk/ether";
import type { Announcement } from "@/lib/ether/queries";
import { shortName, useNamesKey } from "@/lib/people/names";
import type { Person } from "@/lib/people/queries";
import { whenHeld } from "@/lib/tasks/held";

import { ackName, ReachRing } from "./Reach";

/**
 * One announcement in the panel: who said it and when, the whole text, the recording it came from,
 * when it goes if it still waits, and how far it got — a ring that draws itself to its share, then
 * who has read it (their circles, the time) and who has not (dimmer) — the names are the reach's
 * reason for being. The director's moves stand at the foot: the card's menu has the same ones.
 */
export function EtherPanel({
  item,
  until,
  reach,
  team,
  now,
  director,
  heard,
  acking,
  onAck,
  onSend,
  onDelete,
}: {
  item: Announcement;
  /** Held for the delivery window: when the pushes go. */
  until: string | null;
  /** Null — the team is not known yet: the names of those who read it still stand. */
  reach: Reach<Person> | null;
  team: readonly Person[];
  now: Date;
  director: boolean;
  heard: boolean;
  acking: boolean;
  onAck: () => void;
  onSend: () => void;
  onDelete: () => void;
}) {
  useNamesKey();
  const acks = [...item.acks].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const author = item.author?.full_name ?? "Директор";

  return (
    <div className="ether-panel flex flex-col gap-5" data-testid="ether-panel">
      <PanelHeader>
        <div className="flex items-center gap-3">
          <PersonFace id={item.author_id} name={author} size={36} />
          <div className="min-w-0">
            <p className="text-[14px] font-semibold leading-5">Объявление · {shortName(author)}</p>
            <p className="text-[13px] leading-[18px] text-muted">
              <When>{humanAqtobe(new Date(item.created_at), now)}</When>
            </p>
          </div>
        </div>
      </PanelHeader>

      <p className="whitespace-pre-wrap text-[16px] leading-6 [overflow-wrap:anywhere]" data-testid="ether-panel-text">
        {item.transcript}
      </p>

      {until ? (
        <div className="ether-panel-held" data-testid="ether-held">
          <Clock3 size={16} strokeWidth={2.25} aria-hidden />
          <span className="min-w-0 flex-1 text-[14px] leading-5">
            Команда получит <When>{whenHeld(until, now)}</When>
            <span className="block text-[12px] leading-4 text-muted">ждёт окна доставки — ночью телефоны не будим</span>
          </span>
          {director ? <MiniButton label="Отправить сейчас" main onPress={onSend} testId="ether-panel-send" /> : null}
        </div>
      ) : null}

      {item.audio_path ? <AudioOriginal path={item.audio_path} /> : null}

      {director ? null : heard ? (
        <p className="ether-heard text-[14px] leading-5">
          <CheckCheck size={15} strokeWidth={2.25} aria-hidden />
          Вы ознакомились
        </p>
      ) : (
        <div>
          <Button size="sm" onClick={onAck} disabled={acking} data-testid="ether-panel-ack">
            Ознакомился
          </Button>
        </div>
      )}

      {reach && !until ? (
        <div className="ether-panel-reach">
          <ReachRing seen={reach.seen} of={reach.of} />
          <div className="min-w-0">
            <p className="text-[15px] font-semibold leading-5">{reach.of > 0 && reach.seen >= reach.of ? "Ознакомились все" : `Ознакомились ${reach.seen} из ${reach.of}`}</p>
            <p className="text-[12px] leading-4 text-muted">{reach.missing.length > 0 ? `ещё нет — ${reach.missing.length}` : "из тех, кто сейчас в команде"}</p>
          </div>
        </div>
      ) : null}

      <section className="flex flex-col gap-1.5" data-testid="ether-read">
        <h3 className="ether-panel-label">
          Ознакомились
          {reach ? (
            <span className="nums">
              {reach.seen} из {reach.of}
            </span>
          ) : null}
        </h3>
        {acks.length === 0 ? (
          <p className="py-1.5 text-[14px] leading-5 text-muted">Пока никто</p>
        ) : (
          <ul className="ether-people">
            {acks.map((ack, index) => (
              <li key={ack.user_id} style={{ animationDelay: `${Math.min(index, 10) * 30}ms` }}>
                <PersonFace id={ack.user_id} name={ackName(ack, team)} size={26} ring="ok" />
                <span className="min-w-0 flex-1 truncate">{shortName(ackName(ack, team))}</span>
                <When className="shrink-0 text-[12px] text-muted">{humanAqtobe(new Date(ack.created_at), now)}</When>
              </li>
            ))}
          </ul>
        )}
      </section>

      {reach && reach.missing.length > 0 ? (
        <section className="flex flex-col gap-1.5" data-testid="ether-unread">
          <h3 className="ether-panel-label">
            Ещё нет
            <span className="nums">{reach.missing.length}</span>
          </h3>
          <ul className="ether-people" data-unread>
            {reach.missing.map((person, index) => (
              <li key={person.id} style={{ animationDelay: `${Math.min(acks.length + index, 14) * 30}ms` }}>
                <PersonFace id={person.id} name={person.full_name} size={26} away />
                <span className="min-w-0 flex-1 truncate">{shortName(person.full_name)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {director ? (
        <div className="border-t border-border/60 pt-4">
          <Button size="sm" variant="danger" onClick={onDelete} data-testid="ether-panel-delete">
            <Trash2 size={14} strokeWidth={2.25} aria-hidden className="mr-1.5" />
            Удалить…
          </Button>
        </div>
      ) : null}
    </div>
  );
}
