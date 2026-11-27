"use client";

import { Plus } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { AwardDialog, type AwardFor } from "@/components/desk/points/AwardDialog";
import { BalancesTable, PERIOD_LABEL } from "@/components/desk/points/BalancesTable";
import { DisputesList } from "@/components/desk/points/DisputesList";
import { RatingHero } from "@/components/desk/points/Heroes";
import { LedgerTable } from "@/components/desk/points/LedgerTable";
import { PointsDraftKeeper, RatingRules, RulesBlock } from "@/components/desk/points/Rules";
import { useScreenKeys } from "@/components/desk/team/keys";
import { DeskPage, PageTitle } from "@/components/desk/ui/PageTitle";
import { useShortcuts } from "@/components/desk/ui/Shortcuts";
import { SearchField, SegmentTabs, Select, Toolbar } from "@/components/desk/ui/Toolbar";
import { SettingsDraftProvider } from "@/components/settings/draft";
import { Button } from "@/components/ui/Button";
import { isTeamMember, usePeople } from "@/lib/people/queries";
import { useOpenDisputes } from "@/lib/points/game";
import { usePointsEnabled, type RatingPeriod } from "@/lib/points/queries";
import { useShopSummary } from "@/lib/shop/queries";

type View = "people" | "disputes" | "history" | "rules";

const VIEWS: readonly View[] = ["people", "disputes", "history", "rules"];

/** `?view=` of the address; a push about a dispute comes as `/rating#disputes` (D-133) and lands here with its hash. */
function viewOf(param: string | null, hash: string): View {
  if (VIEWS.includes(param as View)) return param as View;
  return hash === "#disputes" ? "disputes" : "people";
}

const PERIODS: RatingPeriod[] = ["week", "month", "all"];

/**
 * «Рейтинг» (D-215) — a section of the director's desk: who leads. On top the period's podium beside
 * what the company gave by day; under it the whole team by place with «Начислить», the minuses people
 * dispute, the company's ledger, and «Правила» — the settings of the game, which live here and not
 * in «Настройки»: on or off, who sees the rating, what a task, a report and a reaction pay. The
 * period chosen in the head is the podium's and the table's alike. The rewards and their queue are
 * «Магазин». Balances are sums of the ledger (principle 4).
 */
export function RatingScreen() {
  return (
    // the rules are edited as a draft of the company settings, kept for the whole section
    <SettingsDraftProvider>
      <RatingBody />
    </SettingsDraftProvider>
  );
}

function RatingBody() {
  const enabled = usePointsEnabled();
  const summary = useShopSummary(true);
  const disputes = useOpenDisputes(true);
  const people = usePeople();

  // the section lives in the address: a push («Оспаривает») opens it, a reload keeps it
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
  // the person chosen in the table: N gives to them, else the dialog asks whom
  const [chosen, setChosen] = useState<string | null>(null);
  const search = useRef<HTMLInputElement>(null);

  const on = enabled.data === true;
  const disputeCount = disputes.data?.length ?? 0;
  // the people the points are for: everyone working, but the director and the wall (the rating's team)
  const team = useMemo(
    () =>
      (people.data ?? [])
        .filter(isTeamMember)
        .map((person) => ({ id: person.id, name: person.full_name, sub: person.position, avatar: person.avatar_url }))
        .sort((a, b) => a.name.localeCompare(b.name, "ru")),
    [people.data],
  );

  // N — «Начислить» (to the chosen person of the table), 1–4 — the sections, F — the ledger's search; outside a field
  useScreenKeys((event) => {
    if (event.shiftKey) return false;
    const index = ["Digit1", "Digit2", "Digit3", "Digit4"].indexOf(event.code);
    if (index >= 0) {
      setView(VIEWS[index]);
      return true;
    }
    if (event.code === "KeyN" && on) {
      setAward(view === "people" && chosen ? { userId: chosen } : {});
      return true;
    }
    if (event.code === "KeyF" && view === "history") {
      search.current?.focus();
      return true;
    }
    return false;
  });
  useShortcuts("Рейтинг", [
    { keys: ["1", "2", "3", "4"], label: "Места, Споры, История, Правила" },
    { keys: ["N"], label: "Начислить (выбранному в таблице)" },
    { keys: ["↑ ↓", "Enter"], label: "Выбрать строку · открыть" },
    { keys: ["F"], label: "Поиск по истории" },
    { keys: ["Ctrl S"], label: "Сохранить правила" },
  ]);

  const tools =
    view === "history" ? (
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
    ) : view === "rules" ? null : (
      // the period is the podium's and the table's alike: it stays while the disputes are read
      <SegmentTabs aria-label="Период" value={period} onChange={setPeriod} items={PERIODS.map((value) => ({ value, label: PERIOD_LABEL[value] }))} />
    );

  return (
    <DeskPage>
      <div className="pts-screen flex w-full min-w-0 flex-col gap-4">
        <PageTitle
          title="Рейтинг"
          state={enabled.isPending || on ? null : { text: "Очки выключены — включить можно во вкладке «Правила»" }}
          actions={
            // the button always starts at «Кому»: a name typed after it must never land in the sum
            <Button size="sm" disabled={!on} onClick={() => setAward({})} data-testid="points-award" title="Начислить · N — выбранному в таблице" icon={<Plus size={16} />}>
              Начислить
            </Button>
          }
        />
        <PointsDraftKeeper name="Правила очков" open={view === "rules"} />

        <RatingHero period={period} summary={summary.data} disputes={disputeCount} onDisputes={() => setView("disputes")} />

        <Toolbar end={tools}>
          <SegmentTabs
            aria-label="Раздел"
            value={view}
            onChange={setView}
            items={[
              { value: "people", label: "Места" },
              { value: "disputes", label: "Споры", count: disputeCount || undefined },
              { value: "history", label: "История" },
              { value: "rules", label: "Правила" },
            ]}
          />
        </Toolbar>

        <div key={view} className="pts-view">
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
            <RulesBlock name="Правила очков" cards={3} testId="rating-rules">
              <RatingRules />
            </RulesBlock>
          )}
        </div>

        <AwardDialog target={award} people={team} onClose={() => setAward(null)} />
      </div>
    </DeskPage>
  );
}
