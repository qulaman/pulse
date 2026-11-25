import type { SectionKey } from "@/components/settings/draft";
import type { CompanySettings, SettingsPatch } from "@/lib/settings";
import { withSecretaryCodes } from "@/lib/settings-plain";

/**
 * The sections of the company settings as the desk saves them: what each is called in «Не
 * сохранено: …», what its «Сохранить» sends and what «Отменить» puts back. «Настройки» and
 * «Секретарь» (the secretary's own section, D-197) save through the same three.
 */

export const SECTION_NAME: Record<SectionKey, string> = {
  window: "Тихие часы",
  secretary: "Секретарь",
  mascot: "Маскот",
  points: "Очки",
  daily_report: "Ежедневный отчёт",
  morning_brief: "Утренняя сводка",
  stt: "Распознавание речи",
  parser: "Разбор поручений",
  conventions: "Слова о сроках",
  voice_retention: "Хранение записей",
};

/** What a section sends — the same shape the phone's own «Сохранить» of that section sends. */
export function patchOf(key: SectionKey, draft: CompanySettings, conventions: CompanySettings["conventions"]): SettingsPatch {
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
    case "morning_brief":
      return { morning_brief: { enabled: draft.morning_brief.enabled } };
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
export function resetOf(key: SectionKey, server: CompanySettings): Partial<CompanySettings> {
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
    case "morning_brief":
      return { morning_brief: server.morning_brief };
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
