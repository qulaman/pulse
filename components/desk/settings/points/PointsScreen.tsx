"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { AwardDialog, type AwardFor } from "@/components/desk/settings/points/AwardDialog";
import { BalancesTable, PERIOD_LABEL } from "@/components/desk/settings/points/BalancesTable";
import { DisputesList } from "@/components/desk/settings/points/DisputesList";
import { LedgerTable } from "@/components/desk/settings/points/LedgerTable";
import { ShopDesk } from "@/components/desk/settings/points/ShopDesk";
import { PointsHero } from "@/components/desk/settings/points/PointsHero";
import { usePageSearch } from "@/components/desk/settings/SettingsFrame";
import { PageTitle } from "@/components/desk/ui/PageTitle";
import { useShortcuts } from "@/components/desk/ui/Shortcuts";
import { SearchField, SegmentTabs, Select, Toolbar } from "@/components/desk/ui/Toolbar";
import { Button } from "@/components/ui/Button";
import { isPlainKey, isTypingTarget } from "@/lib/desk/keys";
import { usePeople } from "@/lib/people/queries";
import { useOpenDisputes } from "@/lib/points/game";
import { usePointsEnabled, type RatingPeriod } from "@/lib/points/queries";
import { isOpenOrder } from "@/lib/shop/format";
import { useOrders, useShopSummary } from "@/lib/shop/queries";
import { useMe } from "@/lib/tasks/queries";

type View = "people" | "disputes" | "history" | "shop";

const VIEWS: readonly View[] = ["people", "disputes", "history", "shop"];

/** `?view=` of the address; a push about a dispute comes as `/rating#disputes` (D-133) and lands here with its hash. */
function viewOf(param: string | null, hash: string): View {
  if (VIEWS.includes(param as View)) return param as View;
  return hash === "#disputes" ? "disputes" : "people";
}

const PERIODS: RatingPeriod[] = ["week", "month", "all"];

/**
 * «Очки и магазин» (D-153 §5, D-154): the director's desk for the points game — one hero on top
 * (the points on hands, what waits for him: orders to hand out, disputes — the screen's light), then
 * the team's balances with «Начислить», the disputes, the company's ledger and the shop with its
 * queue to hand out. The rating's mode and the rules are a settings section (`PointsSection`,
 * the «Сотрудники» tab) — linked, not repeated. Balances are sums of the ledger (principle 4).
 */
export function PointsScreen() {
  const me = useMe().data;
  const enabled = usePointsEnabled();
  const summary = useShopSummary(true);
  const orders = useOrders();
  const disputes = useOpenDisputes(true);
  const people = usePeople();

  // the section lives in the address: a push («Оспаривает», an order to hand out) opens it, a reload keeps it
  const params = useSearchParams();
  const [hash, setHash] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setHash(window.location.hash), 0);
    return () => clearTimeout(timer);
  }, []);
  const view = viewOf(params.get("view"), hash);
  const setView = (next: View) => {
    // the push's hash has done its job: from here the address alone says the section
    setHash("");
    const query = new URLSearchParams(window.location.search);
    if (next === "people") query.delete("view");
    else query.set("view", next);
    const text = query.toString();
    window.history.replaceState(null, "", text ? `${window.location.pathname}?${text}` : window.location.pathname);
  };
  const [period, setPeriod] = useState<RatingPeriod>("week");
  const [who, setWho] = useState("");
  const [query, setQuery] = useState("");
  const [award, setAward] = useState<AwardFor | null>(null);
  // the person chosen in «Люди»: N gives to them, else the dialog asks whom
  const [chosen, setChosen] = useState<string | null>(null);
  const search = useRef<HTMLInputElement>(null);
  usePageSearch(search);

  const on = enabled.data === true;
  const waiting = (orders.data ?? []).filter((order) => isOpenOrder(order.status) && order.user_id !== me?.userId).length;
  const disputeCount = disputes.data?.length ?? 0;
  // the people the points are for: everyone working, but the director and the wall (the rating's team)
  const team = useMemo(
    () =>
      (people.data ?? [])
        .filter((person) => person.is_active && person.role !== "director" && person.role !== "tv")
        .map((person) => ({ id: person.id, name: person.full_name, sub: person.position }))
        .sort((a, b) => a.name.localeCompare(b.name, "ru")),
    [people.data],
  );

  // N — «Начислить» (to the chosen person on «Люди»), 1–4 — the sections; outside a field
  const keys = useRef({ on, view, chosen, setView });
  useEffect(() => {
    keys.current = { on, view, chosen, setView };
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !isPlainKey(event) || event.shiftKey || isTypingTarget(event.target)) return;
      if (document.body.hasAttribute("data-dialog-open") || document.body.hasAttribute("data-sheet-open")) return;
      const index = ["Digit1", "Digit2", "Digit3", "Digit4"].indexOf(event.code);
      if (index >= 0) {
        event.preventDefault();
        keys.current.setView(VIEWS[index]);
      } else if (event.code === "KeyN" && keys.current.on) {
        event.preventDefault();
        setAward(keys.current.view === "people" && keys.current.chosen ? { userId: keys.current.chosen } : {});
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useShortcuts("Очки и магазин", [
    { keys: ["1", "2", "3", "4"], label: "Люди, Споры, История, Магазин" },
    { keys: ["N"], label: "Начислить (выбранному в «Людях»)" },
    { keys: ["↑ ↓", "Enter"], label: "Выбрать строку · открыть" },
    { keys: ["Ctrl F"], label: "Поиск по истории" },
  ]);

  const tools =
    view === "people" ? (
      <SegmentTabs aria-label="Период" value={period} onChange={setPeriod} items={PERIODS.map((value) => ({ value, label: PERIOD_LABEL[value] }))} />
    ) : view === "history" ? (
      <>
        <Select value={who} onChange={(event) => setWho(event.target.value)} aria-label="Человек">
          <option value="">Все люди</option>
          {team.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </Select>
        <SearchField ref={search} value={query} onChange={setQuery} placeholder="Причина или имя…" />
      </>
    ) : null;

  return (
    <div className="flex w-full max-w-[1100px] flex-col gap-5">
      <PageTitle
        title="Очки и магазин"
        light={disputeCount > 0 || waiting > 0 ? "warn" : null}
        state={enabled.isPending || on ? null : { text: "Очки выключены — начислять нельзя, магазин работает", tone: "warn" }}
        actions={
          <>
            <Link href="/desk/settings?tab=team&focus=points-enabled" className="px-2 text-[13px] font-medium text-muted hover:text-text" data-testid="points-rules-link" title="Режим рейтинга и правила — во вкладке «Сотрудники»">
              Правила очков
            </Link>
            {/* the button always starts at «Кому»: a name typed after it must never land in the sum */}
            <Button size="sm" disabled={!on} onClick={() => setAward({})} data-testid="points-award" title="Начислить · N — выбранному в таблице">
              Начислить
            </Button>
          </>
        }
      />

      <PointsHero summary={summary.data} waiting={waiting} disputes={disputeCount} onShop={() => setView("shop")} onDisputes={() => setView("disputes")} />

      <Toolbar end={tools}>
        <SegmentTabs
          aria-label="Раздел"
          value={view}
          onChange={setView}
          items={[
            { value: "people", label: "Люди" },
            { value: "disputes", label: "Споры", count: disputeCount || undefined },
            { value: "history", label: "История" },
            { value: "shop", label: "Магазин", count: waiting || undefined },
          ]}
        />
      </Toolbar>

      {view === "people" ? (
        <BalancesTable
          period={period}
          canAward={on}
          selected={chosen}
          onSelect={setChosen}
          onAward={(userId) => setAward({ userId })}
          onHistory={(userId) => {
            setWho(userId);
            setView("history");
          }}
        />
      ) : view === "disputes" ? (
        <DisputesList />
      ) : view === "history" ? (
        <LedgerTable who={who} search={query} />
      ) : (
        <ShopDesk />
      )}

      <AwardDialog target={award} people={team} onClose={() => setAward(null)} />
    </div>
  );
}
