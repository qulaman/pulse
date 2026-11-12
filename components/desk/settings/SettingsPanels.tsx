"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { useDeskScope } from "@/components/desk/DeskScope";
import { useBrandDraft } from "@/components/desk/settings/brand";
import { rowAnchor, SaveBar } from "@/components/desk/settings/form";
import { AiPanel } from "@/components/desk/settings/panels/AiPanel";
import { AppPanel } from "@/components/desk/settings/panels/AppPanel";
import { CompanyPanel } from "@/components/desk/settings/panels/CompanyPanel";
import { TeamPanel } from "@/components/desk/settings/panels/TeamPanel";
import { goDesk } from "@/components/desk/ui/DeskLinks";
import { useDeskPanel } from "@/components/desk/ui/DeskPanel";
import { PageTitle } from "@/components/desk/ui/PageTitle";
import { useShortcuts } from "@/components/desk/ui/Shortcuts";
import { useDraft, type SectionKey } from "@/components/settings/draft";
import { SETTINGS_TAB_META } from "@/components/settings/SettingsTiles";
import { toast } from "@/components/ui/Toast";
import { Bone } from "@/components/ui/Skeleton";
import { isPlainKey, isTypingTarget } from "@/lib/desk/keys";
import { useCompanySettings } from "@/lib/dictionary-queries";
import type { CompanySettings, SettingsPatch } from "@/lib/settings";
import { withSecretaryCodes } from "@/lib/settings-plain";
import { SETTINGS_TABS, type SettingsTab } from "@/lib/settings-tabs";

/** The sections of the company settings each tab holds — what its one «Сохранить» sends. */
const TAB_SECTIONS: Record<SettingsTab, SectionKey[]> = {
  company: ["window"],
  app: ["secretary", "mascot"],
  team: ["points", "daily_report"],
  ai: ["stt", "parser", "conventions", "voice_retention"],
};

const SECTION_NAME: Record<SectionKey, string> = {
  window: "Тихие часы",
  secretary: "Секретарь",
  mascot: "Маскот",
  points: "Очки",
  daily_report: "Ежедневный отчёт",
  stt: "Распознавание речи",
  parser: "Разбор поручений",
  conventions: "Слова о сроках",
  voice_retention: "Хранение записей",
};

/** What a section sends — the same shape the phone's own «Сохранить» of that section sends. */
function patchOf(key: SectionKey, draft: CompanySettings, conventions: CompanySettings["conventions"]): SettingsPatch {
  switch (key) {
    case "window":
      return { delivery_window: draft.delivery_window };
    case "secretary":
      return {
        secretary: {
          escalate_after_min: draft.secretary.escalate_after_min,
          security_phone: draft.secretary.security_phone.trim(),
          // an empty row is scratch space; a new row gets its code here, once and for good
          actions: withSecretaryCodes(draft.secretary.actions),
        },
      };
    case "mascot":
      return { mascot_seasons: draft.mascot_seasons, mascot_telegraph: draft.mascot_telegraph };
    case "points":
      return { points_enabled: draft.points_enabled, rating_mode: draft.rating_mode, points_rules: draft.points_rules, ether_events: draft.ether_events };
    case "daily_report": {
      const report = draft.daily_report;
      return {
        daily_report: {
          enabled: report.enabled,
          workdays: report.workdays,
          holidays: report.holidays,
          work_start: report.work_start,
          remind_at: report.remind_at,
          ask_from: report.ask_from,
        },
      };
    }
    case "stt":
      return { stt: draft.stt };
    case "parser":
      return { parser: draft.parser };
    case "conventions":
      return { conventions };
    case "voice_retention":
      return { voice_retention: draft.voice_retention };
  }
}

/** What «Отменить» puts back for a section: the server's values of the same keys. */
function resetOf(key: SectionKey, server: CompanySettings): Partial<CompanySettings> {
  switch (key) {
    case "window":
      return { delivery_window: server.delivery_window };
    case "secretary":
      return { secretary: server.secretary };
    case "mascot":
      return { mascot_seasons: server.mascot_seasons, mascot_telegraph: server.mascot_telegraph };
    case "points":
      return { points_enabled: server.points_enabled, rating_mode: server.rating_mode, points_rules: server.points_rules, ether_events: server.ether_events };
    case "daily_report":
      return { daily_report: server.daily_report };
    case "stt":
      return { stt: server.stt };
    case "parser":
      return { parser: server.parser };
    case "conventions":
      return { conventions: server.conventions };
    case "voice_retention":
      return { voice_retention: server.voice_retention };
  }
}

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
  const sections = TAB_SECTIONS[tab].filter((key) => dirty[key]);
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

/** The row a search result points at: in sight, lit for a moment, its first control under the caret. */
function landOn(id: string) {
  const row = document.getElementById(rowAnchor(id));
  if (!row || row.offsetParent === null) return false;
  row.scrollIntoView({ block: "center", behavior: "smooth" });
  row.animate(
    [{ backgroundColor: "color-mix(in srgb, var(--accent) 16%, transparent)" }, { backgroundColor: "transparent" }],
    { duration: 1600, easing: "ease-out" },
  );
  // the desk's select keeps the system's one inside, unseen: the caret goes to its button
  row.querySelector<HTMLElement>("input, select:not(.desk-select-native), button, a[href]")?.focus({ preventScroll: true });
  return true;
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
  const params = useSearchParams();
  const panel = useDeskPanel();
  const focus = params.get("focus");
  const [visited, setVisited] = useState<ReadonlySet<SettingsTab>>(() => new Set([tab]));
  if (!visited.has(tab)) setVisited(new Set(visited).add(tab));

  useShortcuts("Настройки · вкладки", [
    { keys: ["1", "2", "3", "4"], label: "Компания, Программа, Сотрудники, ИИ-модель" },
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
  const panelOpen = useRef(panel.isOpen);
  useLayoutEffect(() => {
    panelOpen.current = panel.isOpen;
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !isPlainKey(event) || event.shiftKey || isTypingTarget(event.target)) return;
      if (panelOpen.current || document.body.hasAttribute("data-dialog-open") || document.body.hasAttribute("data-sheet-open")) return;
      const index = ["Digit1", "Digit2", "Digit3", "Digit4"].indexOf(event.code);
      if (index < 0) return;
      event.preventDefault();
      goDesk(router, `/desk/settings?tab=${SETTINGS_TABS[index]}`);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  // a search result: land on its row once the tab and the settings are drawn, then drop it from the address
  useEffect(() => {
    if (!focus) return;
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (landOn(focus) || tries > 40) {
        clearInterval(timer);
        window.history.replaceState(null, "", `/desk/settings?tab=${tab}`);
      }
    }, 50);
    return () => clearInterval(timer);
  }, [focus, tab]);

  const meta = SETTINGS_TAB_META[tab];
  return (
    <div className="flex w-full max-w-[880px] flex-col gap-5">
      <PageTitle title={meta.title} state={{ text: meta.about }} />
      <Ready>
        <Panels tab={tab} visited={visited} director={director} />
      </Ready>
    </div>
  );
}
