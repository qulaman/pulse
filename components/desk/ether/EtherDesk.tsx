"use client";

import { AudioLines, CheckCheck, Clock3, Gift, Megaphone, MoonStar, Sparkles } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type MouseEvent } from "react";

import { useDeskScope } from "@/components/desk/DeskScope";
import { PersonFace } from "@/components/desk/errands/look";
import { KeyCap } from "@/components/desk/errands/Queue";
import { FailedScreen, LoadNote } from "@/components/desk/tasks/LoadState";
import { writeParams } from "@/components/desk/tasks/flow";
import { MiniButton, MoreButton } from "@/components/desk/tasks/RowMoves";
import { arrowOf, onControl, stepKey, useScreenKeys } from "@/components/desk/team/keys";
import { DeskScreenBone } from "@/components/desk/ui/DeskScreenBone";
import { InPanel } from "@/components/desk/ui/DeskPanel";
import { Dialog } from "@/components/desk/ui/Dialog";
import { EmptyState } from "@/components/desk/ui/EmptyState";
import { useContextMenu, type MenuItem } from "@/components/desk/ui/Menu";
import { DeskPage, PageTitle } from "@/components/desk/ui/PageTitle";
import { useShortcuts, type Shortcut } from "@/components/desk/ui/Shortcuts";
import { SegmentTabs, Toolbar } from "@/components/desk/ui/Toolbar";
import { When } from "@/components/desk/ui/When";
import { Button } from "@/components/ui/Button";
import { humanAqtobe } from "@/lib/ai/time";
import { reachOf, splitEther, type Reach } from "@/lib/desk/ether";
import { formatNum } from "@/lib/desk/format";
import { loadStateOf } from "@/lib/desk/tasks";
import { aqtobeDay } from "@/lib/errands/scene";
import {
  useAcknowledge,
  useDeleteAnnouncement,
  useDeleteEtherEvent,
  useEther,
  useEtherEvents,
  useHeldAnnouncements,
  useSendAnnouncementNow,
  type Announcement,
  type EtherEvent,
} from "@/lib/ether/queries";
import { shortName, useNamesKey } from "@/lib/people/names";
import { isTeamMember, usePeople, type Person } from "@/lib/people/queries";
import { useComposeStore } from "@/lib/store/compose";
import { whenHeld } from "@/lib/tasks/held";
import { pluralRu } from "@/lib/tasks/status-text";
import { useMe } from "@/lib/tasks/queries";
import { useHydrated } from "@/lib/useHydrated";

import { EtherPanel } from "./EtherPanel";
import { ReachLine } from "./Reach";

/** What `useEther` reads at most: the screen says so instead of looking like the whole history. */
const FEED_CAP = 50;
/** The director's line takes it from here: the parser reads «всем» as an announcement. */
const ORDER_START = "Всем: ";

type Row = { item: Announcement; until: string | null };
type View = "ether" | "news";

const newAnnouncement = () => useComposeStore.getState().request(ORDER_START);

function useNowMinute(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** «Сегодня», «Вчера», «понедельник, 10 ноября» — the day an announcement went, on the Aqtobe clock. */
function dayTitle(day: string, now: Date): string {
  const today = aqtobeDay(now);
  const yesterday = aqtobeDay(new Date(now.getTime() - 24 * 60 * 60_000));
  if (day === today) return "Сегодня";
  if (day === yesterday) return "Вчера";
  const [y, m, d] = day.split("-").map(Number);
  const words = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  return words.charAt(0).toUpperCase() + words.slice(1);
}

type Section = { key: string; title: string; held: boolean; rows: Row[] };

/** The feed's sections: what waits for the window first, then the days, the newest first. */
function sectionsOf(rows: readonly Row[], now: Date): Section[] {
  const out: Section[] = [];
  const held = rows.filter((row) => row.until);
  if (held.length > 0) out.push({ key: "held", title: "Ждут окна доставки", held: true, rows: held });
  for (const row of rows) {
    if (row.until) continue;
    const day = aqtobeDay(new Date(row.item.created_at));
    const last = out.at(-1);
    if (last && !last.held && last.key === day) last.rows.push(row);
    else out.push({ key: day, title: dayTitle(day, now), held: false, rows: [row] });
  }
  return out;
}

/**
 * One announcement as a card of the feed (D-174): who said it and when, the words themselves, and
 * how far it got — the bar, the count, the faces of who read and who not. One held for the
 * delivery window says when the team gets it and offers «Отправить сейчас». The secretary answers
 * «Ознакомился» on the card, as on her phone.
 */
function EtherCard({
  row,
  index,
  chosen,
  director,
  reach,
  team,
  now,
  heard,
  acking,
  menu,
  onOpen,
  onAck,
  onSend,
}: {
  row: Row;
  index: number;
  chosen: boolean;
  director: boolean;
  reach: Reach<Person> | null;
  team: readonly Person[];
  now: Date;
  heard: boolean;
  acking: boolean;
  menu: () => MenuItem[];
  onOpen: () => void;
  onAck: () => void;
  onSend: () => void;
}) {
  const { item, until } = row;
  const author = item.author?.full_name ?? "Директор";
  return (
    <article
      role="row"
      aria-selected={chosen}
      data-row-key={item.id}
      data-testid="desk-row"
      data-held={until ? "" : undefined}
      className="ether-card"
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("button, a, input, audio")) return;
        onOpen();
      }}
    >
      <PersonFace id={item.author_id} name={author} size={34} />
      <div role="gridcell" className="flex min-w-0 flex-col gap-1.5">
        <p className="flex min-w-0 items-baseline gap-1.5 text-[13px] leading-[18px]">
          <span className="truncate font-semibold">{shortName(author)}</span>
          <span className="shrink-0 text-muted">
            · <When>{humanAqtobe(new Date(item.created_at), now)}</When>
          </span>
          {item.audio_path ? (
            <span className="ether-voice" title="Сказано голосом — запись в панели">
              <AudioLines size={13} strokeWidth={2.25} aria-hidden />
            </span>
          ) : null}
        </p>
        <p className="ether-text" title={item.transcript} data-testid="ether-text">
          {item.transcript}
        </p>
        {until ? (
          <p className="ether-held-line" data-testid="ether-held-line">
            <Clock3 size={14} strokeWidth={2.25} aria-hidden />
            <span>
              Команда получит <When>{whenHeld(until, now)}</When>
            </span>
          </p>
        ) : null}
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 pt-0.5">
          <ReachLine item={item} reach={reach} team={team} held={Boolean(until)} />
          {!director ? (
            heard ? (
              <span className="ether-heard">
                <CheckCheck size={14} strokeWidth={2.25} aria-hidden />
                Вы ознакомились
              </span>
            ) : (
              <MiniButton label="Ознакомился" main onPress={onAck} disabled={acking} testId="ether-ack" />
            )
          ) : null}
        </div>
      </div>
      {director ? (
        <span className="flex items-start justify-end gap-1">
          {until ? <MiniButton label="Отправить сейчас" main onPress={onSend} testId="ether-send-now" /> : null}
          <MoreButton items={menu} />
        </span>
      ) : null}
    </article>
  );
}

/** Good news (D-133): who, for what, the points — a card each, the director may take one off. */
function NewsCards({ news, now, director, onRemove }: { news: readonly EtherEvent[]; now: Date; director: boolean; onRemove: (id: string) => void }) {
  return (
    <div className="ether-news" role="list" aria-label="Хорошие новости">
      {news.map((item, index) => {
        const name = item.user?.full_name ?? "Сотрудник";
        const merch = item.kind === "merch";
        return (
          <article key={item.id} role="listitem" className="ether-news-card" style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}>
            <div className="flex items-center gap-3">
              <PersonFace id={item.user_id} name={name} size={36} ring="gold" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold leading-5">{shortName(name)}</p>
                <p className="text-[12px] leading-4 text-muted">
                  <When>{humanAqtobe(new Date(item.created_at), now)}</When>
                </p>
              </div>
              {item.kind === "praise" && item.amount ? (
                <span className="ether-points nums">
                  <Sparkles size={13} strokeWidth={2.25} aria-hidden />+{formatNum(item.amount)}
                </span>
              ) : merch ? (
                <span className="ether-points" data-merch>
                  <Gift size={13} strokeWidth={2.25} aria-hidden />
                  награда
                </span>
              ) : null}
            </div>
            <p className="mt-2.5 text-[14px] leading-5 [overflow-wrap:anywhere]" title={item.title} data-testid="ether-event">
              {merch ? `Награда из магазина: «${item.title}»` : item.title}
            </p>
            {director ? (
              <span className="ether-news-moves">
                <MiniButton label="Убрать" onPress={() => onRemove(item.id)} testId="ether-event-remove" />
              </span>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

/**
 * «Объявления» (D-153, the second wave; D-174): what the phone's «Эфир» is, for a big screen and a
 * mouse — a feed of cards to everyone, each with how far it got: a bar that fills, «5 из 7», the
 * faces of who has read it and, dimmer, of who has not. What waits for the delivery window stands
 * apart at the top with when the team gets it and «Отправить сейчас» (D-129); the rest by day. A
 * card opens in the panel — the whole text, the recording, who has read it and who has not. A new
 * one is a phrase in the order line, as everything the director says; the secretary reads and
 * answers «Ознакомился», as on her phone, and has no line to write in. Only the director deletes
 * (RLS). Good news keeps a tab of its own, since the phone's feed mixes the two. ↑/↓ walk the
 * cards, Enter opens, Del deletes, N — a new one.
 */
export function EtherDesk() {
  useNamesKey();
  const params = useSearchParams();
  const { role } = useDeskScope();
  const director = role === "director";
  const me = useMe();
  const feed = useEther();
  const people = usePeople();
  const held = useHeldAnnouncements(director);
  const events = useEtherEvents();
  const remove = useDeleteAnnouncement();
  const sendNow = useSendAnnouncementNow();
  const removeEvent = useDeleteEtherEvent();
  const ack = useAcknowledge(me.data?.userId);
  const hydrated = useHydrated();
  const context = useContextMenu();
  const now = useNowMinute();

  const openId = params.get("id");
  const [cursor, setCursor] = useState<string | null>(null);
  const [asked, setAsked] = useState<Announcement | null>(null);
  const [view, setView] = useState<View>("ether");

  const open = (id: string) => {
    setCursor(id);
    writeParams({ id });
  };
  const close = () => writeParams({ id: null });

  const team = useMemo(() => (people.data ?? []).filter(isTeamMember), [people.data]);
  const known = people.data !== undefined;
  const parts = useMemo(() => splitEther(feed.data ?? [], held.data, now), [feed.data, held.data, now]);
  const rows = useMemo<Row[]>(() => [...parts.held.map(({ item, until }) => ({ item, until })), ...parts.sent.map((item) => ({ item, until: null }))], [parts]);
  const sections = useMemo(() => sectionsOf(rows, now), [rows, now]);

  const news = events.data ?? [];
  const shown: View = view === "news" && news.length > 0 ? "news" : "ether";
  const openRow = openId ? rows.find((row) => row.item.id === openId) : undefined;
  const reachOfItem = (item: Announcement) => (known ? reachOf(item.acks, team) : null);

  const heardBy = (item: Announcement) => Boolean(me.data && item.acks.some((one) => one.user_id === me.data?.userId));
  const answer = (item: Announcement) => ack.mutate(item.id);
  const send = (item: Announcement) => sendNow.mutate(item.id);
  const confirmRemove = () => {
    if (!asked) return;
    remove.mutate(asked.id);
    if (openId === asked.id) close();
    setAsked(null);
  };

  const menuOf = ({ item, until }: Row): MenuItem[] => {
    const items: MenuItem[] = [{ key: "open", label: "Открыть", hint: "Enter", onSelect: () => open(item.id) }];
    if (until) items.push({ key: "send", label: "Отправить сейчас", onSelect: () => send(item) });
    if (director) items.push("separator", { key: "delete", label: "Удалить…", hint: "Del", danger: true, onSelect: () => setAsked(item) });
    return items;
  };

  // the screen's keys: N — a new one (the director); ↑/↓ — the cards, the panel following when it
  // is open; Enter — open; Del — delete (the director)
  const chosenId = openId ?? cursor;
  useScreenKeys((event) => {
    if (event.shiftKey || event.repeat) return false;
    if (director && event.code === "KeyN") {
      newAnnouncement();
      return true;
    }
    if (shown !== "ether") return false;
    const arrow = arrowOf(event);
    if (arrow) {
      const next = stepKey(
        rows.map((row) => row.item.id),
        chosenId,
        arrow === "down",
      );
      if (!next) return false;
      if (openId) open(next);
      else setCursor(next);
      return true;
    }
    const row = rows.find((one) => one.item.id === chosenId);
    if (!row || onControl(event.target)) return false;
    if (event.code === "Enter" || event.code === "NumpadEnter") {
      open(row.item.id);
      return true;
    }
    if (event.code === "Delete" && director) {
      setAsked(row.item);
      return true;
    }
    return false;
  });
  // the chosen card stays in sight when the keys move it
  useEffect(() => {
    if (!chosenId) return;
    document.querySelector(`[data-testid="ether-table"] [data-row-key="${CSS.escape(chosenId)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [chosenId]);

  const keys: Shortcut[] = [
    ...(director ? [{ keys: ["N"], label: "Новое объявление" }] : []),
    { keys: ["↑", "↓"], label: "По объявлениям" },
    { keys: ["Enter"], label: "Открыть в панели" },
    ...(director ? [{ keys: ["Del"], label: "Удалить объявление" }] : []),
    { keys: ["Esc"], label: "Закрыть панель" },
  ];
  useShortcuts("Объявления", keys);

  const load = loadStateOf(feed);
  if (!hydrated || !me.data || load.kind === "loading") return <DeskScreenBone title="Объявления" />;
  if (load.kind === "failed") return <FailedScreen title="Объявления" what="объявления" offline={load.offline} busy={feed.isFetching} onRetry={() => void feed.refetch()} />;

  const sentCount = parts.sent.length;
  const line = rows.length === 0 ? null : [parts.held.length > 0 ? `${parts.held.length} ${pluralRu(parts.held.length, ["ждёт", "ждут", "ждут"])} отправки` : null, sentCount > 0 ? `${sentCount} ${pluralRu(sentCount, ["отправлено", "отправлено", "отправлено"])}` : null].filter(Boolean).join(" · ");

  return (
    <DeskPage>
      <PageTitle
        title="Объявления"
        state={line ? { text: line } : null}
        actions={
          <>
            {load.kind === "stale" ? <LoadNote state={load} failed="" now={now} onRetry={() => void feed.refetch()} /> : null}
            {director ? (
              <Button size="sm" onClick={newAnnouncement} data-testid="ether-new" title="Строкой поручения: «Всем: …» · N">
                <Megaphone size={15} strokeWidth={2.25} aria-hidden className="mr-1.5" />
                Новое объявление
                <KeyCap>N</KeyCap>
              </Button>
            ) : null}
          </>
        }
      />

      {news.length > 0 ? (
        <Toolbar>
          <SegmentTabs<View>
            aria-label="Что показать"
            value={shown}
            onChange={setView}
            items={[
              { value: "ether", label: "Объявления", count: rows.length },
              { value: "news", label: "Хорошие новости", count: news.length },
            ]}
          />
        </Toolbar>
      ) : null}

      {shown === "news" ? (
        <NewsCards news={news} now={now} director={director} onRemove={(id) => removeEvent.mutate(id)} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Объявлений пока нет"
          hint={director ? "Начните строку поручения со слова «всем» — объявление получит вся команда" : "Здесь появятся объявления директора и «Ознакомился» под каждым"}
        />
      ) : (
        <div
          role="grid"
          aria-label="Объявления"
          className="flex flex-col gap-5"
          data-testid="ether-table"
          onContextMenu={(event: MouseEvent) => {
            const key = (event.target as HTMLElement).closest<HTMLElement>("[data-row-key]")?.dataset.rowKey;
            const row = rows.find((one) => one.item.id === key);
            if (!row) return;
            setCursor(row.item.id);
            context.open(event, menuOf(row));
          }}
        >
          {sections.map((section) => (
            <section key={section.key} role="rowgroup" className="flex flex-col gap-2" data-testid={section.held ? "ether-held-group" : undefined}>
              <h2 className="ether-day" data-held={section.held ? "" : undefined}>
                {section.held ? <MoonStar size={14} strokeWidth={2.25} aria-hidden /> : null}
                {section.title}
                <span className="nums">{section.rows.length}</span>
              </h2>
              <div className={section.held ? "ether-cards ether-cards-held" : "ether-cards"}>
                {section.rows.map((row, index) => (
                  <EtherCard
                    key={row.item.id}
                    row={row}
                    index={index}
                    chosen={chosenId === row.item.id}
                    director={director}
                    reach={reachOfItem(row.item)}
                    team={team}
                    now={now}
                    heard={heardBy(row.item)}
                    acking={ack.isPending && ack.variables === row.item.id}
                    menu={() => menuOf(row)}
                    onOpen={() => open(row.item.id)}
                    onAck={() => answer(row.item)}
                    onSend={() => send(row.item)}
                  />
                ))}
              </div>
            </section>
          ))}
          {rows.length >= FEED_CAP ? <p className="text-[13px] leading-[18px] text-muted">Показаны последние {FEED_CAP}</p> : null}
        </div>
      )}

      {context.node}

      {openRow ? (
        <InPanel panelKey={`ether:${openRow.item.id}`} onClose={close}>
          <EtherPanel
            item={openRow.item}
            until={openRow.until}
            reach={reachOfItem(openRow.item)}
            team={team}
            now={now}
            director={director}
            heard={heardBy(openRow.item)}
            acking={ack.isPending && ack.variables === openRow.item.id}
            onAck={() => answer(openRow.item)}
            onSend={() => send(openRow.item)}
            onDelete={() => setAsked(openRow.item)}
          />
        </InPanel>
      ) : null}

      <Dialog open={asked !== null} onClose={() => setAsked(null)} title="Удалить объявление?" width="sm">
        <div className="flex flex-col gap-3">
          <p className="text-[14px] leading-5 text-muted">Оно исчезнет у всех, вместе с отметками «Ознакомился». Вернуть нельзя.</p>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setAsked(null)} data-autofocus>
              Не сейчас
            </Button>
            <Button size="sm" variant="danger" onClick={confirmRemove} data-testid="ether-delete-confirm">
              Удалить
            </Button>
          </div>
        </div>
      </Dialog>
    </DeskPage>
  );
}
