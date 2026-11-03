"use client";

import Link from "next/link";
import { useMemo } from "react";

import { PeopleField, type PickPerson } from "@/components/desk/confirm/PersonField";
import { SectionLabel } from "@/components/desk/ui/SectionLabel";
import { SettingGroup, SettingRow, Switch } from "@/components/desk/ui/SettingRow";
import { Select } from "@/components/desk/ui/Toolbar";
import { toast } from "@/components/ui/Toast";
import { useNotifyPrefs, useSaveNotifyPrefs } from "@/lib/desk/shell-queries";
import { shortName } from "@/lib/people/names";
import { useRoster } from "@/lib/people/roster";
import type { NotifyPrefs } from "@/lib/push/prefs";
import {
  CATEGORY_HINT,
  CATEGORY_LABEL,
  DAY_SUMMARY_TIMES,
  DIGEST_EVERY,
  DIGEST_LABEL,
  MODE_HINT,
  MODE_LABEL,
  NOTIFY_CATEGORIES,
  NOTIFY_MODES,
  UNSEEN_AFTER,
  type NotifyCategory,
  type NotifyMode,
} from "@/lib/push/prefs-plain";

/** A cell of the table: the browser's own radio (arrows move along the row), drawn small. */
function ModeCell({ category, mode, on, onPick }: { category: NotifyCategory; mode: NotifyMode; on: boolean; onPick: () => void }) {
  return (
    <td className="text-center">
      <label className="flex h-10 cursor-pointer items-center justify-center" title={`${CATEGORY_LABEL[category]} — ${MODE_LABEL[mode].toLowerCase()}`}>
        <input
          type="radio"
          name={`notify-${category}`}
          checked={on}
          onChange={onPick}
          aria-label={`${CATEGORY_LABEL[category]}: ${MODE_LABEL[mode]}`}
          className="desk-focus peer sr-only"
        />
        <span
          aria-hidden
          className="flex h-[18px] w-[18px] items-center justify-center rounded-full border transition-colors duration-[120ms] peer-focus-visible:ring-2 peer-focus-visible:ring-accent/60 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-bg"
          style={{ borderColor: on ? "var(--accent)" : "var(--border)" }}
        >
          {on ? <span className="h-2 w-2 rounded-full" style={{ background: mode === "off" ? "var(--text-muted)" : "var(--accent)" }} /> : null}
        </span>
      </label>
    </td>
  );
}

/** A time field of the rules, every quarter of an hour. */
function TimeInput({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
  return (
    <input
      type="time"
      step={900}
      value={value}
      onChange={(event) => {
        if (event.target.value) onChange(event.target.value);
      }}
      aria-label={label}
      className="desk-input nums h-9 px-2 text-[14px] text-text [color-scheme:dark]"
    />
  );
}

/**
 * The director's push rules on the desk (D-114, D-154 wave 3): what comes at once, quietly, in a
 * digest or not at all — one table, a row per kind of news and a column per way, so the whole
 * policy reads at a glance and changes in one click (arrows move along a row); then when, who
 * and how. Saved at once, through the phone's own route and cache key.
 */
export function NotifyRules({ meId }: { meId: string }) {
  const prefsQuery = useNotifyPrefs();
  const save = useSaveNotifyPrefs(() => toast("Не сохранилось — проверьте связь и попробуйте ещё раз"));
  const roster = useRoster();
  const people = useMemo<PickPerson[]>(
    () => (roster.data ?? []).filter((person) => person.id !== meId).map((person) => ({ id: person.id, full_name: person.full_name, position: person.position })),
    [roster.data, meId],
  );

  const prefs = prefsQuery.data;
  if (prefsQuery.isError) {
    return <p className="text-[14px] leading-5 text-muted">Не получилось загрузить правила уведомлений. Обновите страницу.</p>;
  }
  if (!prefs) {
    return (
      <div className="flex flex-col gap-3" aria-busy>
        <SectionLabel>Что присылать</SectionLabel>
        <div className="skeleton h-[420px] rounded-[12px] bg-surface-2/50" />
      </div>
    );
  }

  const update = (change: (current: NotifyPrefs) => NotifyPrefs) => save.mutate(change(prefs));
  const setMode = (category: NotifyCategory, mode: NotifyMode) => update((p) => ({ ...p, modes: { ...p.modes, [category]: mode } }));
  const vipNames = prefs.vip
    .map((id) => {
      const full = roster.data?.find((person) => person.id === id)?.full_name;
      return full ? shortName(full) : null;
    })
    .filter(Boolean);

  return (
    <div className="flex flex-col gap-3" data-testid="desk-notify-rules">
      <SectionLabel>Что присылать</SectionLabel>
      <div className="overflow-hidden rounded-[12px] border border-border bg-surface/40">
        <table className="w-full table-fixed border-collapse text-[14px] leading-5">
          <colgroup>
            <col />
            {NOTIFY_MODES.map((mode) => (
              <col key={mode} className="w-[104px]" />
            ))}
          </colgroup>
          <thead>
            <tr className="border-b border-border/70">
              <th className="px-4 py-2.5 text-left text-[12px] font-semibold uppercase leading-4 tracking-[0.06em] text-muted">Событие</th>
              {NOTIFY_MODES.map((mode) => (
                <th key={mode} scope="col" className="px-1 py-2.5 text-center text-[12px] font-semibold uppercase leading-4 tracking-[0.06em] text-muted" title={MODE_HINT[mode]}>
                  {MODE_LABEL[mode]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="[&>tr+tr]:border-t [&>tr+tr]:border-border/50">
            {NOTIFY_CATEGORIES.map((category) => (
              <tr key={category} className="desk-row">
                <th scope="row" className="px-4 py-1.5 text-left font-normal">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-medium">{CATEGORY_LABEL[category]}</span>
                    {category === "unseen" && prefs.modes.unseen !== "off" ? (
                      <Select
                        value={String(prefs.unseen_after_min)}
                        onChange={(event) => update((p) => ({ ...p, unseen_after_min: Number(event.target.value) as NotifyPrefs["unseen_after_min"] }))}
                        aria-label="Сообщить, если не открыли за"
                        className="!h-7 pr-7 text-[13px]"
                      >
                        {[...new Set<number>([...UNSEEN_AFTER, prefs.unseen_after_min])].sort((a, b) => a - b).map((min) => (
                          <option key={min} value={min}>
                            через {min} мин
                          </option>
                        ))}
                      </Select>
                    ) : null}
                  </span>
                  <span className="block truncate text-[12px] leading-4 text-muted" title={CATEGORY_HINT[category]}>
                    {CATEGORY_HINT[category]}
                  </span>
                </th>
                {NOTIFY_MODES.map((mode) => (
                  <ModeCell key={mode} category={category} mode={mode} on={prefs.modes[category] === mode} onPick={() => setMode(category, mode)} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="border-t border-border/70 px-4 py-2 text-[12px] leading-4 text-muted">Ваши напоминания и тревога «Охрана» приходят всегда.</p>
      </div>

      <SectionLabel className="mt-4">Когда и как</SectionLabel>
      <SettingGroup>
        <SettingRow label="Сводка" hint="Всё, что стоит на «Сводкой», приходит одним пушем. Пустая не приходит">
          <Select value={prefs.digest_every} onChange={(event) => update((p) => ({ ...p, digest_every: event.target.value as NotifyPrefs["digest_every"] }))} aria-label="Сводка" className="pr-8">
            {DIGEST_EVERY.map((every) => (
              <option key={every} value={every}>
                {DIGEST_LABEL[every]}
              </option>
            ))}
          </Select>
        </SettingRow>
        <SettingRow label="Итог дня" hint="Один пуш в конце дня: принято, на приёмке, в работе, просрочено">
          <Select
            value={prefs.day_summary_at ?? ""}
            onChange={(event) => update((p) => ({ ...p, day_summary_at: event.target.value || null }))}
            aria-label="Итог дня"
            className="pr-8"
          >
            <option value="">выключен</option>
            {[...new Set([...DAY_SUMMARY_TIMES, ...(prefs.day_summary_at ? [prefs.day_summary_at] : [])])].sort().map((time) => (
              <option key={time} value={time}>
                в {time}
              </option>
            ))}
          </Select>
        </SettingRow>
        <SettingRow
          label="Не беспокоить"
          hint="В эти часы пуши копятся, в конце приходит сводка «Пока вы отдыхали»"
          below={
            prefs.quiet.on ? (
              <div className="flex flex-col gap-3 pl-0.5">
                <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
                  с
                  <TimeInput value={prefs.quiet.from} label="Тишина с" onChange={(from) => update((p) => ({ ...p, quiet: { ...p.quiet, from } }))} />
                  до
                  <TimeInput value={prefs.quiet.to} label="Тишина до" onChange={(to) => update((p) => ({ ...p, quiet: { ...p.quiet, to } }))} />
                  <label className="ml-3 flex items-center gap-2 text-text">
                    <Switch on={prefs.quiet.weekends} onChange={(weekends) => update((p) => ({ ...p, quiet: { ...p.quiet, weekends } }))} label="И выходные целиком" />
                    и выходные целиком
                  </label>
                </div>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
                  <span className="text-muted">Пробивают тишину:</span>
                  {(
                    [
                      ["reminders", "Мои напоминания"],
                      ["visitors", "Посетитель"],
                      ["vip", "Важные люди"],
                    ] as const
                  ).map(([key, text]) => (
                    <label key={key} className="flex items-center gap-2">
                      <Switch on={prefs.pass[key]} onChange={(on) => update((p) => ({ ...p, pass: { ...p.pass, [key]: on } }))} label={text} />
                      {text}
                    </label>
                  ))}
                </div>
              </div>
            ) : null
          }
        >
          <Switch on={prefs.quiet.on} onChange={(on) => update((p) => ({ ...p, quiet: { ...p.quiet, on } }))} label="Тишина по расписанию" />
        </SettingRow>
        <SettingRow label="Во время встреч" hint="Пока идёт встреча из календаря — только важное, остальное сводкой после">
          <Switch on={prefs.meetings} onChange={(meetings) => update((p) => ({ ...p, meetings }))} label="Во время встреч только важное" />
        </SettingRow>
        <SettingRow label="Экран блокировки" hint="Что видно на телефоне, лежащем на столе">
          <Select value={prefs.lock_text} onChange={(event) => update((p) => ({ ...p, lock_text: event.target.value as NotifyPrefs["lock_text"] }))} aria-label="Экран блокировки" className="pr-8">
            <option value="full">Весь текст</option>
            <option value="short">Только что случилось</option>
          </Select>
        </SettingRow>
        <SettingRow label="Важные люди" hint="Их задачи и сообщения приходят сразу — даже на «Тихо» и «Сводкой»">
          <div className="w-[240px]">
            <PeopleField
              everyone={false}
              ids={prefs.vip}
              people={people}
              allowEveryone={false}
              summary={vipNames.length === 0 ? "никого" : vipNames.length <= 2 ? vipNames.join(", ") : `${vipNames[0]} +${vipNames.length - 1}`}
              label="Важные люди"
              onChange={({ ids }) => update((p) => ({ ...p, vip: ids }))}
            />
          </div>
        </SettingRow>
        <SettingRow label="Устройства" hint="Телефоны и компьютеры, куда приходят ваши уведомления">
          <Link href="/profile/notifications" className="desk-focus rounded-[8px] px-2 py-1 text-[13px] font-semibold text-accent hover:underline">
            Открыть список
          </Link>
        </SettingRow>
      </SettingGroup>
      <p className="text-[12px] leading-4 text-muted">
        Сотрудники, секретарь и завхоз настроек не имеют: задачи и ответы приходят им в рабочие часы компании (Настройки → Компания → Тихие часы), заявки и напоминания — сразу.
      </p>
    </div>
  );
}
