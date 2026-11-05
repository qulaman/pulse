"use client";

import { MiniButton } from "@/components/desk/tasks/RowMoves";
import { PanelHeader } from "@/components/desk/ui/DeskPanel";
import { SectionLabel } from "@/components/desk/ui/SectionLabel";
import { When } from "@/components/desk/ui/When";
import { AudioOriginal } from "@/components/tasks/AudioOriginal";
import { Button } from "@/components/ui/Button";
import { humanAqtobe } from "@/lib/ai/time";
import type { Reach } from "@/lib/desk/ether";
import type { Announcement } from "@/lib/ether/queries";
import { shortName, useNamesKey } from "@/lib/people/names";
import type { Person } from "@/lib/people/queries";
import { whenHeld } from "@/lib/tasks/held";

/** A person with the time beside the name, on the sheet's two verticals. */
const LINE = "flex min-h-[30px] items-baseline justify-between gap-3 py-1 text-[14px] leading-5";

/**
 * One announcement in the panel: the whole text, the recording it came from, when it goes if it
 * still waits, who has read it and who has not — the names are the reach's reason for being. The
 * director's moves stand at the foot: the row's menu has the same ones.
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
  const nameOf = (ack: Announcement["acks"][number]) => ack.user?.full_name ?? team.find((person) => person.id === ack.user_id)?.full_name ?? "Сотрудник";
  const acks = [...item.acks].sort((a, b) => a.created_at.localeCompare(b.created_at));

  return (
    <div className="flex flex-col gap-4" data-testid="ether-panel">
      <PanelHeader>
        <p className="desk-label uppercase">Объявление</p>
        <p className="mt-0.5 text-[13px] leading-[18px] text-muted">
          {shortName(item.author?.full_name ?? "Директор")} · <When>{humanAqtobe(new Date(item.created_at), now)}</When>
        </p>
      </PanelHeader>

      <p className="whitespace-pre-wrap text-[15px] leading-[22px] [overflow-wrap:anywhere]" data-testid="ether-panel-text">
        {item.transcript}
      </p>

      {until ? (
        <div className="desk-list">
          <p className="flex min-h-[40px] items-center justify-between gap-3 text-[14px] leading-5" data-testid="ether-held">
            <span>
              Команда получит <When>{whenHeld(until, now)}</When>
            </span>
            {director ? <MiniButton label="Отправить сейчас" main onPress={onSend} testId="ether-panel-send" /> : null}
          </p>
        </div>
      ) : null}

      {item.audio_path ? <AudioOriginal path={item.audio_path} /> : null}

      {director ? null : heard ? (
        <p className="text-[14px] leading-5 text-muted">Вы ознакомились</p>
      ) : (
        <div>
          <Button size="sm" onClick={onAck} disabled={acking} data-testid="ether-panel-ack">
            Ознакомился
          </Button>
        </div>
      )}

      <section className="flex flex-col gap-1" data-testid="ether-read">
        <SectionLabel action={reach ? <span className="nums text-[12px] leading-4 text-muted">{reach.seen} из {reach.of}</span> : null}>Ознакомились</SectionLabel>
        {acks.length === 0 ? (
          <div className="desk-list">
            <p className="py-1.5 text-[14px] leading-5 text-muted">Пока никто</p>
          </div>
        ) : (
          <ul className="desk-list">
            {acks.map((ack) => (
              <li key={ack.user_id} className={LINE}>
                <span className="min-w-0 truncate">{shortName(nameOf(ack))}</span>
                <When className="shrink-0 text-[13px] text-muted">{humanAqtobe(new Date(ack.created_at), now)}</When>
              </li>
            ))}
          </ul>
        )}
      </section>

      {reach && reach.missing.length > 0 ? (
        <section className="flex flex-col gap-1" data-testid="ether-unread">
          <SectionLabel count={reach.missing.length}>Ещё нет</SectionLabel>
          <ul className="desk-list">
            {reach.missing.map((person) => (
              <li key={person.id} className={LINE}>
                <span className="min-w-0 truncate">{shortName(person.full_name)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {director ? (
        <div>
          <Button size="sm" variant="danger" onClick={onDelete} data-testid="ether-panel-delete">
            Удалить…
          </Button>
        </div>
      ) : null}
    </div>
  );
}
