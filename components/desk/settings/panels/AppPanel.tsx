"use client";

import { GroupLink, SettingRow, SettingsGroup } from "@/components/desk/settings/form";
import { Switch } from "@/components/desk/ui/Switch";
import { useDraft } from "@/components/settings/draft";

/**
 * «Программа» on the desk: the faces' two switches. The secretary's buttons, the repeat push and the
 * guard's phone live in «Секретарь» (D-197) — one line here leads there.
 */
export function AppPanel() {
  const { draft, server, update } = useDraft();

  return (
    <div className="flex flex-col gap-6">
      <SettingsGroup
        id="secretary"
        title="Секретарь"
        about="Кнопки просьб, кто секретарь, повтор пуша и телефон охраны — в разделе «Секретарь», рядом с заявками."
        action={
          <GroupLink href="/desk/errands?view=settings" testId="settings-secretary-link">
            Открыть
          </GroupLink>
        }
      />

      <SettingsGroup id="mascot" title="Маскот" about="Лица на телефонах и на стене. Новый год — колпак с 20 декабря по 7 января, Наурыз — тюльпан 20–23 марта.">
        <SettingRow
          id="mascot-seasons"
          label="Праздничные наряды"
          hint="Лица директора, сотрудников, секретаря и экрана в кабинете"
          htmlFor="ctl-mascot-seasons"
          changed={draft.mascot_seasons !== server.mascot_seasons}
        >
          <Switch id="ctl-mascot-seasons" label="Праздничные наряды" checked={draft.mascot_seasons} onChange={(mascot_seasons) => update({ mascot_seasons })} />
        </SettingRow>
        <SettingRow
          id="mascot-telegraph"
          label="Лицо сотрудника переживает за дела"
          hint="Зовёт, пока ждёт «Принял», волнуется у срока, ждёт ответа на слово директора. Выключите — лицо спокойно, сценки и сны остаются"
          htmlFor="ctl-mascot-telegraph"
          changed={draft.mascot_telegraph !== server.mascot_telegraph}
        >
          <Switch id="ctl-mascot-telegraph" label="Лицо сотрудника переживает за дела" checked={draft.mascot_telegraph} onChange={(mascot_telegraph) => update({ mascot_telegraph })} />
        </SettingRow>
      </SettingsGroup>
    </div>
  );
}
