"use client";

import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, ViewTransition, type ReactNode } from "react";

import { useDeskParams, writeDeskAddress } from "@/components/desk/DeskAddress";
import { useDeskScope } from "@/components/desk/DeskScope";
import { useBrandDraft } from "@/components/desk/settings/brand";
import { landOn, SaveBar } from "@/components/desk/settings/form";
import { DIRECTOR_TEAM_TAB, patchOf, resetOf, SECTION_NAME } from "@/components/desk/settings/sections";
import { AiPanel } from "@/components/desk/settings/panels/AiPanel";
import { AppPanel } from "@/components/desk/settings/panels/AppPanel";
import { CompanyPanel } from "@/components/desk/settings/panels/CompanyPanel";
import { TeamPanel } from "@/components/desk/settings/panels/TeamPanel";
import { useScreenKeys } from "@/components/desk/team/keys";
import { goDesk } from "@/components/desk/ui/DeskLinks";
import { useDeskPanel } from "@/components/desk/ui/DeskPanel";
import { PageTitle } from "@/components/desk/ui/PageTitle";
import { useShortcuts } from "@/components/desk/ui/Shortcuts";
import { useDraft, type SectionKey } from "@/components/settings/draft";
import { SETTINGS_TAB_META } from "@/components/settings/SettingsTiles";
import { toast } from "@/components/ui/Toast";
import { Bone } from "@/components/ui/Skeleton";
import { SWITCH_SWAP } from "@/lib/desk/motion";
import { useCompanySettings } from "@/lib/dictionary-queries";
import type { CompanySettings, SettingsPatch } from "@/lib/settings";
import { SETTINGS_TABS, type SettingsTab } from "@/lib/settings-tabs";

/**
 * The sections of the company settings each tab holds — what its one «Сохранить» sends. The
 * secretary's section lives in «Секретарь» on the desk (D-197), not under «Программа».
 */
const TAB_SECTIONS: Record<SettingsTab, SectionKey[]> = {
  company: ["window"],
  app: ["mascot"],
  team: ["points", "daily_report", "morning_brief"],
  ai: ["stt", "parser", "conventions", "voice_retention"],
};

/** A tab's line under its title on the desk, where it differs from the phone's tile (D-197). */
const DESK_ABOUT: Partial<Record<SettingsTab, string>> = {
  app: "маскот; кнопки и настройки секретаря — в разделе «Секретарь»",
};

/** The shape of a tab while the settings load: its cards and their rows, nothing that will jump. */
function PanelBone() {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      {[3, 2].map((rows, group) => (
        <div key={group} className="set-card">
          <div className="set-card-head">
            <div className="flex flex-col gap-1.5">
              <Bone h={16} w={140} />
              <Bone h={12} w={320} />
            </div>
          </div>
          <div className="set-card-rows desk-list">
            {Array.from({ length: rows }, (_, index) => (
              <div key={index} className="set-row flex items-center justify-between gap-6">
                <div className="flex flex-col gap-1.5">
                  <Bone h={14} w={180} />
                  <Bone h={12} w={280} />
                </div>
                <Bone h={index % 2 ? 20 : 36} w={index % 2 ? 36 : 220} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** The tab's panels and its save bar, once the settings have come. */
function Panels({ tab, visited, director }: { tab: SettingsTab; visited: ReadonlySet<SettingsTab>; director: boolean }) {
  const { draft, server, update, conventions, dirty, save, saving } = useDraft();
  const brand = useBrandDraft();
  // the director's «Отчёты» holds no points: they are saved where they live, in «Рейтинг» and «Магазин» (D-215)
  const sections = TAB_SECTIONS[tab].filter((key) => dirty[key] && !(director && key === "points"));
  const brandHere = tab === "company" && brand.dirty;
  const changes = [...(brandHere ? ["Компания"] : []), ...sections.map((key) => SECTION_NAME[key])];
  const busy = sections.some((key) => saving(Object.keys(patchOf(key, draft, conventions))[0] as keyof SettingsPatch)) || (brandHere && brand.saving);

  const saveTab = () => {
    if (changes.length === 0) {
      toast("Здесь всё сохранено");
      return;
    }
    if (brandHere && brand.blocked) {
      toast(`Не сохранить: ${brand.blocked}`);
      return;
    }
    if (sections.length) save(Object.assign({}, ...sections.map((key) => patchOf(key, draft, conventions))) as SettingsPatch);
    if (brandHere) void brand.save().then((ok) => ok && sections.length === 0 && toast("Сохранил компанию"));
  };
  const resetTab = () => {
    // one update: two in a row would each start from the same draft and the last would win
    if (sections.length) update(Object.assign({}, ...sections.map((key) => resetOf(key, server))) as Partial<CompanySettings>);
    if (brandHere) brand.reset();
  };

  // Ctrl/Cmd+S — inside a field too: that is where the edit was made. The browser's «save page» never.
  const saveRef = useRef(saveTab);
  useLayoutEffect(() => {
    saveRef.current = saveTab;
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.code !== "KeyS") return;
      if (document.body.hasAttribute("data-dialog-open") || document.body.hasAttribute("data-sheet-open")) return;
      event.preventDefault();
      // a time typed and not yet left settles on blur: let it, then save
      (document.activeElement as HTMLElement | null)?.blur?.();
      setTimeout(() => saveRef.current(), 0);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      {SETTINGS_TABS.map((key) =>
        visited.has(key) ? (
          // `hidden` takes the panel out of the page and back: its cards rise into place on every visit (settings.css)
          <section key={key} id={`desk-settings-panel-${key}`} data-testid={`desk-settings-panel-${key}`} aria-label={SETTINGS_TAB_META[key].title} hidden={key !== tab} className="set-panel">
            {key === "company" ? <CompanyPanel /> : key === "app" ? <AppPanel /> : key === "team" ? <TeamPanel director={director} /> : <AiPanel />}
          </section>
        ) : null,
      )}
      <SaveBar changes={changes} saving={busy} onSave={saveTab} onReset={resetTab} blocked={brandHere ? brand.blocked : null} />
    </>
  );
}

/** The draft is there exactly when the settings are: the same cache entry feeds both. */
function Ready({ children }: { children: ReactNode }) {
  const settings = useCompanySettings();
  return settings.data ? <>{children}</> : <PanelBone />;
}

/**
 * The four tabs of «Настройки» (D-85) on the desk as desktop forms (D-154 wave 3): groups of rows —
 * the words on the left, the control on the right — and one bar «Не сохранено · Отменить ·
 * Сохранить (Ctrl S)» per tab. The tab comes from the address (1–4 switch it outside a field); a
 * tab is mounted on its first visit and then only hidden, so a half-typed name survives a trip to
 * another tab. `?focus=<row>` — a search result — scrolls to the row and lights it. The secretary
 * gets the same tabs without the director's own modules (D-104).
 */
export function SettingsPanels({ tab }: { tab: SettingsTab }) {
  const { role } = useDeskScope();
  const director = role === "director";
  const router = useRouter();
  const params = useDeskParams();
  const panel = useDeskPanel();
  const focus = params.get("focus");
  const [visited, setVisited] = useState<ReadonlySet<SettingsTab>>(() => new Set([tab]));
  if (!visited.has(tab)) setVisited(new Set(visited).add(tab));

  useShortcuts("Настройки · вкладки", [
    { keys: ["1", "2", "3", "4"], label: `Компания, Программа, ${director ? DIRECTOR_TEAM_TAB.title : "Очки и отчёты"}, ИИ-модель` },
    { keys: ["Ctrl S"], label: "Сохранить вкладку" },
    { keys: ["↑ ↓"], label: "Число или время в поле: шаг (Shift — крупнее)" },
    { keys: ["← →"], label: "Выбор из нескольких: соседний вариант" },
    { keys: ["Пробел"], label: "Переключатель: включить или выключить" },
  ]);

  // a new tab starts from its top, as a new screen would — unless a search result asked for a row
  const focusing = useRef(focus);
  useLayoutEffect(() => {
    focusing.current = focus;
  });
  useEffect(() => {
    if (!focusing.current) document.getElementById("desk-main")?.scrollTo({ top: 0 });
  }, [tab]);

  // 1–4 outside a field: the tabs, as the navigation numbers them
  useScreenKeys((event) => {
    const index = event.shiftKey || panel.isOpen ? -1 : ["Digit1", "Digit2", "Digit3", "Digit4"].indexOf(event.code);
    if (index < 0) return false;
    goDesk(router, `/desk/settings?tab=${SETTINGS_TABS[index]}`);
    return true;
  });

  // a search result: land on its row once the tab and the settings are drawn, then drop it from the address
  useEffect(() => {
    if (!focus) return;
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (landOn(focus) || tries > 40) {
        clearInterval(timer);
        writeDeskAddress(`/desk/settings?tab=${tab}`);
      }
    }, 50);
    return () => clearInterval(timer);
  }, [focus, tab]);

  const meta = SETTINGS_TAB_META[tab];
  return (
    // another tab changes the page in place (D-184): the title and the tab's settings cross-fade
    <ViewTransition update={SWITCH_SWAP} default="none">
      <div className="flex w-full max-w-[880px] flex-col gap-5">
        <PageTitle
          title={director && tab === "team" ? DIRECTOR_TEAM_TAB.title : meta.title}
          state={{ text: director && tab === "team" ? DIRECTOR_TEAM_TAB.about : (DESK_ABOUT[tab] ?? meta.about) }}
        />
        <Ready>
          <Panels tab={tab} visited={visited} director={director} />
        </Ready>
      </div>
    </ViewTransition>
  );
}
