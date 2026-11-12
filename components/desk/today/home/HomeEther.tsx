"use client";

import { CheckCheck, Clock, Megaphone, Sparkles } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

import { useDeskScope } from "@/components/desk/DeskScope";
import { SectionLabel } from "@/components/desk/ui/SectionLabel";
import { When } from "@/components/desk/ui/When";
import { humanAqtobe } from "@/lib/ai/time";
import { reachOf } from "@/lib/desk/ether";
import { etherLinesOf, newsWords, shortWhen, type EtherLine } from "@/lib/desk/home";
import { loadStateOf, worstLoad } from "@/lib/desk/tasks";
import { useEther, useEtherEvents, useHeldAnnouncements, type Announcement, type EtherEvent } from "@/lib/ether/queries";
import { shortName } from "@/lib/people/names";
import { isTeamMember, usePeople, type Person } from "@/lib/people/queries";
import { useNow } from "@/lib/pulse/queries";

import { AllClear, Face, Mark, Meter, Pill, rise, Titled } from "./look";
import { Aside, BlockLink, BlockNote, HeadMove, RowsBone } from "./parts";

/** A line of «Эфир»: when in the margin, the words, the reach or the points at the end; icons centre it. */
const ETHER_ROW = "grid grid-cols-[84px_minmax(0,1fr)_auto] items-center gap-x-3 py-[7px] text-[13px] leading-5";

/** How many rows the block shows; the rest is a click away in «Объявления». */
const SHOWN = 4;

/**
 * «Эфир» on the desk's home (D-164): the phone's «Эфир» ball — the last announcements with their
 * reach, «Объявить» puts «всем: » into the order line. Contract frozen with TodayScreen.
 *
 * The same feed as the phone and «Объявления» (`useEther`, `useEtherEvents`): what waits for the
 * delivery window first with the time it goes (D-129), then announcements and good news by time,
 * as the phone mixes them (D-133). Reach is counted among the people working now, as on the
 * desk's «Объявления» — «3 из 9», never «10 из 9». A row opens the announcement in «Объявления».
 */
export function HomeEther({ onAnnounce }: { onAnnounce: () => void }) {
  const { role } = useDeskScope();
  const feed = useEther();
  const news = useEtherEvents();
  // only the director reads the outbox (RLS): what still waits for the window
  const held = useHeldAnnouncements(role === "director");
  const people = usePeople();
  const now = useNow(60_000);
  const team = useMemo(() => (people.data ?? []).filter(isTeamMember), [people.data]);
  const lines = useMemo(() => etherLinesOf(feed.data ?? [], news.data ?? [], held.data, now, SHOWN), [feed.data, news.data, held.data, now]);
  // the announcements decide the block; good news without them is still the feed
  const load = worstLoad([loadStateOf(feed), loadStateOf(news)]);
  const retry = () => {
    void feed.refetch();
    void news.refetch();
  };

  return (
    <Aside testId="home-ether">
      <SectionLabel
        action={
          <span className="flex items-center gap-4">
            {role === "director" ? (
              <HeadMove pen onPress={onAnnounce} title="Строка поручения начнётся со слова «всем»" testId="home-ether-announce">
                Объявить
              </HeadMove>
            ) : null}
            <BlockLink href="/desk/ether" testId="home-ether-all">
              Все объявления →
            </BlockLink>
          </span>
        }
      >
        <Titled icon={Megaphone} ink="pen">
          Эфир
        </Titled>
      </SectionLabel>
      <BlockNote state={load} failed="Эфир не загрузился" now={now} onRetry={retry} />
      {load.kind === "loading" ? (
        <RowsBone rows={3} />
      ) : load.kind === "failed" && lines.length === 0 ? null : lines.length === 0 ? (
        <div className="desk-list">
          <AllClear icon={Megaphone} ink="muted" hint="Начните поручение со слова «всем» — его получит вся команда" testId="home-ether-empty">
            Объявлений пока нет
          </AllClear>
        </div>
      ) : (
        <ul className="desk-list" data-testid="home-ether-list">
          {lines.map((line, index) => (
            <li key={`${line.kind}:${line.item.id}`} {...rise(index)}>
              <EtherRow line={line} team={people.data ? team : null} now={now} />
            </li>
          ))}
        </ul>
      )}
    </Aside>
  );
}

function EtherRow({ line, team, now }: { line: EtherLine<Announcement, EtherEvent>; team: readonly Person[] | null; now: Date }) {
  if (line.kind === "news") {
    const { what, points } = newsWords(line.item);
    const who = shortName(line.item.user?.full_name ?? "Сотрудник");
    return (
      <Link href="/desk/ether" prefetch={false} className={`desk-row ${ETHER_ROW}`} title={`${who} · ${what}`} data-testid="home-ether-news">
        <When className="text-muted">{shortWhen(new Date(line.at), now)}</When>
        <span className="flex min-w-0 items-center gap-2">
          <Face name={line.item.user?.full_name ?? "Сотрудник"} size={20} ink="gold" />
          <span className="min-w-0 truncate">
            {who}
            <span className="text-muted"> · {what}</span>
          </span>
        </span>
        {points ? (
          <Pill ink="gold" icon={Sparkles}>
            +{points}
          </Pill>
        ) : (
          <span />
        )}
      </Link>
    );
  }
  const item = line.item;
  // reach among the people working now; the team unknown yet — the count alone, never «3 из 0»
  const reach = team ? reachOf(item.acks, team) : null;
  return (
    <Link
      href={`/desk/ether?id=${encodeURIComponent(item.id)}`}
      prefetch={false}
      className={`desk-row ${ETHER_ROW}`}
      title={item.transcript}
      data-testid="home-ether-row"
      data-held={line.until ? "" : undefined}
    >
      <When className="text-muted">{shortWhen(new Date(line.at), now)}</When>
      <span className="flex min-w-0 items-center gap-2">
        <Mark icon={Megaphone} ink="pen" />
        <span className="line-clamp-2 min-w-0 [overflow-wrap:anywhere]">{item.transcript}</span>
      </span>
      {line.until ? (
        // waits for the delivery window (D-38): when it goes, in the pen — the director may send it now in «Объявления»
        <span title={`Ждёт окна доставки: уйдёт ${humanAqtobe(new Date(line.until), now)} — отправить сейчас можно в «Объявлениях»`}>
          <Pill ink="pen" icon={Clock}>
            уйдёт {humanAqtobe(new Date(line.until), now).split(" ").at(-1)}
          </Pill>
        </span>
      ) : reach ? (
        // reach as a bar that fills: green, all of it — a double tick
        <span
          className="flex items-center gap-2 whitespace-nowrap text-[13px]"
          title={reach.missing.length > 0 ? `Не ознакомились: ${reach.missing.map((person) => shortName(person.full_name)).join(", ")}` : "Ознакомились все"}
          data-testid="home-ether-reach"
        >
          {reach.of > 0 && reach.seen >= reach.of ? (
            <Mark icon={CheckCheck} ink="ok" />
          ) : (
            <Meter value={reach.seen} of={reach.of} ink="ok" className="w-10" />
          )}
          <span className="nums">
            {reach.seen}
            <span className="text-muted"> из {reach.of}</span>
          </span>
        </span>
      ) : (
        <span className="nums text-[13px] text-muted">{item.acks.length}</span>
      )}
    </Link>
  );
}
