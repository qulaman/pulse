"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type MouseEvent } from "react";

import { useDeskScope } from "@/components/desk/DeskScope";
import { FailedScreen, LoadNote } from "@/components/desk/tasks/LoadState";
import { writeParams } from "@/components/desk/tasks/flow";
import { MiniButton, MoreButton } from "@/components/desk/tasks/RowMoves";
import { DataGrid, type Column, type Group } from "@/components/desk/ui/DataGrid";
import { DeskScreenBone } from "@/components/desk/ui/DeskScreenBone";
import { InPanel } from "@/components/desk/ui/DeskPanel";
import { Dialog } from "@/components/desk/ui/Dialog";
import { EmptyState } from "@/components/desk/ui/EmptyState";
import { useContextMenu, type MenuItem } from "@/components/desk/ui/Menu";
import { Num } from "@/components/desk/ui/Num";
import { DeskPage, PageTitle } from "@/components/desk/ui/PageTitle";
import { PersonCell } from "@/components/desk/ui/PersonCell";
import { useShortcuts, type Shortcut } from "@/components/desk/ui/Shortcuts";
import { SegmentTabs, Toolbar } from "@/components/desk/ui/Toolbar";
import { When } from "@/components/desk/ui/When";
import { Button } from "@/components/ui/Button";
import { humanAqtobe } from "@/lib/ai/time";
import { reachOf, splitEther, type Reach } from "@/lib/desk/ether";
import { isPlainKey, isTypingTarget } from "@/lib/desk/keys";
import { loadStateOf } from "@/lib/desk/tasks";
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
import { useNamesKey } from "@/lib/people/names";
import { isTeamMember, usePeople, type Person } from "@/lib/people/queries";
import { useComposeStore } from "@/lib/store/compose";
import { pluralRu } from "@/lib/tasks/status-text";
import { useMe } from "@/lib/tasks/queries";
import { useHydrated } from "@/lib/useHydrated";

import { EtherPanel } from "./EtherPanel";

/** What `useEther` reads at most: the screen says so instead of looking like the whole history. */
const FEED_CAP = 50;
/** The director's line takes it from here: the parser reads «всем» as an announcement. */
const ORDER_START = "Всем: ";

type Row = { item: Announcement; until: string | null };
type View = "ether" | "news";

const newAnnouncement = () => useComposeStore.getState().request(ORDER_START);

/** A menu, a dialog or a sheet is up: the screen's letters are not theirs. */
function layerOpen(): boolean {
  const body = document.body;
  return body.hasAttribute("data-dialog-open") || body.hasAttribute("data-sheet-open") || document.querySelector(".desk-pop") !== null;
}

function useNowMinute(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** «3 из 9» among the people working now; the team unknown yet — the count alone, never «3 из 0». */
function ReachCell({ item, reach }: { item: Announcement; reach: Reach<Person> | null }) {
  if (!reach) return <Num value={item.acks.length} />;
  return (
    <span className="nums whitespace-nowrap" data-testid="ether-reach">
      <Num value={reach.seen} />
      <span className="text-muted"> из {reach.of}</span>
    </span>
  );
}

/**
 * «Объявления» (D-153, the second wave): what the phone's «Эфир» is, for a table and a mouse. What
 * waits for the delivery window apart with «Отправить сейчас» (D-129), what has gone below it,
 * how many of the team have read each one; a row opens in the panel — the whole text, the
 * recording, who has read it and who has not. A new one is a phrase in the order line, as
 * everything the director says; the secretary reads and answers «Ознакомился», as on her phone,
 * and has no line to write in. Only the director deletes (RLS). Good news keeps a tab of its
 * own, since the phone's feed mixes the two: here a row is a record with its reach.
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
  const groups = useMemo<Group<Row>[]>(() => {
    const sent = rows.filter((row) => !row.until);
    if (parts.held.length === 0) return [{ key: "sent", title: null, rows: sent }];
    return [
      { key: "held", title: "Отложены", rows: rows.filter((row) => row.until) },
      { key: "sent", title: "Отправлены", rows: sent },
    ];
  }, [rows, parts.held.length]);

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

  useEffect(() => {
    if (!director) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !isPlainKey(event) || event.shiftKey || event.repeat) return;
      if (event.code !== "KeyN" || isTypingTarget(event.target) || layerOpen()) return;
      event.preventDefault();
      newAnnouncement();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [director]);

  const keys: Shortcut[] = [
    ...(director ? [{ keys: ["N"], label: "Новое объявление" }] : []),
    { keys: ["↑", "↓"], label: "По строкам таблицы" },
    { keys: ["Enter"], label: "Открыть в панели" },
    ...(director ? [{ keys: ["Del"], label: "Удалить объявление" }] : []),
    { keys: ["Esc"], label: "Закрыть панель" },
  ];
  useShortcuts("Объявления", keys);

  // the panel takes the room: the words keep the row, who wrote it and the row's move are in the panel
  const narrow = Boolean(openRow);
  const columns: Column<Row>[] = [
    {
      key: "when",
      title: "Когда",
      width: narrow ? "132px" : "152px",
      sort: (a, b) => a.item.created_at.localeCompare(b.item.created_at),
      render: ({ item, until }) => <When>{humanAqtobe(new Date(until ?? item.created_at), now)}</When>,
    },
    {
      key: "text",
      title: "Объявление",
      render: ({ item }) => (
        <span className="block truncate" title={item.transcript} data-testid="ether-text">
          {item.transcript}
        </span>
      ),
    },
    ...(narrow
      ? []
      : [
          {
            key: "author",
            title: "Автор",
            width: "148px",
            render: ({ item }: Row) => <PersonCell name={item.author?.full_name ?? "Директор"} />,
          },
        ]),
    {
      key: "reach",
      title: "Ознакомились",
      width: "120px",
      sort: (a, b) => a.item.acks.length - b.item.acks.length,
      render: ({ item }) => <ReachCell item={item} reach={reachOfItem(item)} />,
    },
    {
      key: "moves",
      title: "",
      width: director ? (parts.held.length > 0 && !narrow ? "176px" : "40px") : narrow ? "16px" : "136px",
      align: "right",
      render: (row) =>
        director ? (
          <span className="flex items-center justify-end gap-1">
            {row.until && !narrow ? <MiniButton label="Отправить сейчас" main onPress={() => send(row.item)} testId="ether-send-now" /> : null}
            <MoreButton items={() => menuOf(row)} />
          </span>
        ) : narrow ? null : heardBy(row.item) ? (
          <span className="text-[13px] leading-5 text-muted">Вы ознакомились</span>
        ) : (
          <MiniButton label="Ознакомился" main onPress={() => answer(row.item)} disabled={ack.isPending && ack.variables === row.item.id} testId="ether-ack" />
        ),
    },
  ];

  const newsColumns: Column<EtherEvent>[] = [
    { key: "when", title: "Когда", width: "152px", render: (item) => <When>{humanAqtobe(new Date(item.created_at), now)}</When> },
    { key: "who", title: "Кто", width: "148px", render: (item) => <PersonCell name={item.user?.full_name ?? "Сотрудник"} /> },
    {
      key: "what",
      title: "За что",
      render: (item) => (
        <span className="block truncate" title={item.title} data-testid="ether-event">
          {item.kind === "merch" ? `Награда из магазина: «${item.title}»` : item.title}
        </span>
      ),
    },
    { key: "amount", title: "Очки", width: "72px", align: "right", render: (item) => (item.kind === "praise" && item.amount ? <Num value={item.amount} signed /> : null) },
    ...(director
      ? [
          {
            key: "moves",
            title: "",
            width: "84px",
            align: "right" as const,
            render: (item: EtherEvent) => <MiniButton label="Убрать" onPress={() => removeEvent.mutate(item.id)} testId="ether-event-remove" />,
          },
        ]
      : []),
  ];

  const load = loadStateOf(feed);
  if (!hydrated || !me.data || load.kind === "loading") return <DeskScreenBone title="Объявления" />;
  if (load.kind === "failed") return <FailedScreen title="Объявления" what="объявления" offline={load.offline} busy={feed.isFetching} onRetry={() => void feed.refetch()} />;

  const sentCount = parts.sent.length;
  const line = rows.length === 0 ? null : [parts.held.length > 0 ? `${parts.held.length} ${pluralRu(parts.held.length, ["отложено", "отложены", "отложены"])}` : null, sentCount > 0 ? `${sentCount} ${pluralRu(sentCount, ["отправлено", "отправлено", "отправлено"])}` : null].filter(Boolean).join(" · ");

  return (
    <DeskPage>
      <PageTitle
        title="Объявления"
        state={line ? { text: line } : null}
        actions={
          <>
            {load.kind === "stale" ? <LoadNote state={load} failed="" now={now} onRetry={() => void feed.refetch()} /> : null}
            {director ? (
              <Button size="sm" onClick={newAnnouncement} data-testid="ether-new">
                Новое объявление
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
        <DataGrid aria-label="Хорошие новости" columns={newsColumns} rows={news} rowKey={(item) => item.id} empty={null} />
      ) : (
        <div
          data-testid="ether-table"
          onContextMenu={(event: MouseEvent) => {
            const key = (event.target as HTMLElement).closest<HTMLElement>("[data-row-key]")?.dataset.rowKey;
            const row = rows.find((one) => one.item.id === key);
            if (!row) return;
            setCursor(row.item.id);
            context.open(event, menuOf(row));
          }}
        >
          <DataGrid
            aria-label="Объявления"
            columns={columns}
            groups={groups}
            rowKey={(row) => row.item.id}
            selectedKey={openId ?? cursor}
            onSelect={(row) => {
              setCursor(row.item.id);
              if (openId) open(row.item.id);
            }}
            onRowClick={(row) => open(row.item.id)}
            onActivate={(row) => open(row.item.id)}
            onKey={(event, row) => {
              if (event.code !== "Delete" || !row || !director) return false;
              event.preventDefault();
              setAsked(row.item);
              return true;
            }}
            empty={
              <EmptyState
                title="Объявлений пока нет"
                hint={director ? "Начните строку поручения со слова «всем» — объявление получит вся команда" : "Здесь появятся объявления директора и «Ознакомился» под каждым"}
              />
            }
          />
          {rows.length >= FEED_CAP ? <p className="mt-2 text-[13px] leading-[18px] text-muted">Показаны последние {FEED_CAP}</p> : null}
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
