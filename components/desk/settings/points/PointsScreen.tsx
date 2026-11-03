"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { AwardDialog, type AwardFor } from "@/components/desk/settings/points/AwardDialog";
import { BalancesTable, PERIOD_LABEL } from "@/components/desk/settings/points/BalancesTable";
import { DisputesList } from "@/components/desk/settings/points/DisputesList";
import { LedgerTable } from "@/components/desk/settings/points/LedgerTable";
import { ShopDesk } from "@/components/desk/settings/points/ShopDesk";
import { PageTitle } from "@/components/desk/ui/PageTitle";
import { StatTile } from "@/components/desk/ui/StatTile";
import { SearchField, SegmentTabs, Select, Toolbar } from "@/components/desk/ui/Toolbar";
import { Button } from "@/components/ui/Button";
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
 * «Очки и магазин» (D-153 §5): the director's desk for the points game — the totals on top, then
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
  const [search, setSearch] = useState("");
  const [award, setAward] = useState<AwardFor | null>(null);

  const on = enabled.data === true;
  const waiting = (orders.data ?? []).filter((order) => isOpenOrder(order.status) && order.user_id !== me?.userId).length;
  const disputeCount = disputes.data?.length ?? 0;
  // the people the points are for: everyone working, but the director and the wall (the rating's team)
  const team = useMemo(
    () =>
      (people.data ?? [])
        .filter((person) => person.is_active && person.role !== "director" && person.role !== "tv")
        .map((person) => ({ id: person.id, name: person.full_name }))
        .sort((a, b) => a.name.localeCompare(b.name, "ru")),
    [people.data],
  );

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
        <SearchField value={search} onChange={setSearch} placeholder="Причина или имя…" />
      </>
    ) : null;

  return (
    <div className="flex w-full max-w-[1100px] flex-col gap-4">
      <PageTitle
        title="Очки и магазин"
        state={enabled.isPending || on ? null : { text: "Очки выключены — начислять нельзя, магазин работает", tone: "warn" }}
        actions={
          <Button size="sm" disabled={!on} onClick={() => setAward({})} data-testid="points-award">
            Начислить
          </Button>
        }
      />
      <p className="text-[14px] leading-5 text-muted">
        Режим рейтинга и правила очков — во вкладке{" "}
        <Link href="/desk/settings?tab=team" className="font-medium text-accent hover:underline" data-testid="points-rules-link">
          «Сотрудники»
        </Link>
      </p>

      <div className="flex flex-wrap gap-3">
        <StatTile label="На руках у людей" value={summary.data?.onHands ?? "—"} />
        <StatTile label="Роздано за 30 дней" value={summary.data?.earned30 ?? "—"} />
        <StatTile label="Унесено в магазин" value={summary.data?.spent ?? "—"} />
        <StatTile label="Ждут выдачи" value={waiting} tone="warn" onClick={() => setView("shop")} active={view === "shop"} />
        <StatTile label="Оспаривают" value={disputeCount} tone="warn" onClick={() => setView("disputes")} active={view === "disputes"} />
      </div>

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
        <BalancesTable period={period} canAward={on} onAward={(userId) => setAward({ userId })} />
      ) : view === "disputes" ? (
        <DisputesList />
      ) : view === "history" ? (
        <LedgerTable who={who} search={search} />
      ) : (
        <ShopDesk />
      )}

      <AwardDialog target={award} people={team} onClose={() => setAward(null)} />
    </div>
  );
}
