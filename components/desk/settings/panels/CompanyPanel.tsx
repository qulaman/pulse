"use client";

import { useRef, useState, type DragEvent } from "react";

import { accentVerdict, normalAccent, useBrandDraft } from "@/components/desk/settings/brand";
import { SettingRow, SettingsGroup, TextInput, TimeInput } from "@/components/desk/settings/form";
import { useDraft } from "@/components/settings/draft";
import { Button } from "@/components/ui/Button";
import { StillLogo } from "@/components/ui/StillLogo";
import { toast } from "@/components/ui/Toast";
import { DEFAULT_ACCENT } from "@/lib/brand-color";
import { useCompanyLogo } from "@/lib/desk/settings-queries";

const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

/** The logo: what is there now, «Заменить…» and «Убрать»; a file dropped on the well lands as well. Saved at once — not a draft. */
function LogoWell({ url, letter }: { url: string | null; letter: string }) {
  const { upload, remove } = useCompanyLogo();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const send = (file: File | null | undefined) => {
    if (!file) return;
    if (!LOGO_TYPES.includes(file.type)) {
      toast("Нужен PNG, JPEG, WebP или SVG");
      return;
    }
    upload.mutate(file, {
      onSuccess: () => toast("Логотип обновлён"),
      onError: (error) => toast(error instanceof Error ? error.message : "Не удалось загрузить логотип"),
    });
  };
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setOver(false);
    send(event.dataTransfer.files[0]);
  };
  return (
    <div
      className="flex items-center gap-2"
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      data-testid="settings-logo"
    >
      {/* dashed — the one place on the page a file can be dropped into (D-154) */}
      <span
        className="flex h-9 w-[132px] items-center justify-center overflow-hidden rounded-[10px] border border-dashed bg-bg px-2 transition-colors duration-[120ms]"
        style={{ borderColor: over ? "var(--accent)" : "var(--border)" }}
      >
        {upload.isPending ? (
          <span className="text-[12px] text-muted">Загружаю…</span>
        ) : url ? (
          <StillLogo src={url} className="h-6 max-w-[116px] object-contain" />
        ) : (
          <span className="text-[12px] leading-4 text-muted">{over ? "Отпустите файл" : `нет · «${letter}»`}</span>
        )}
      </span>
      <input
        ref={input}
        type="file"
        accept={LOGO_TYPES.join(",")}
        className="hidden"
        aria-label="Файл логотипа"
        onChange={(event) => {
          send(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      <Button size="sm" variant="secondary" disabled={upload.isPending} onClick={() => input.current?.click()}>
        {url ? "Заменить…" : "Загрузить…"}
      </Button>
      {url ? (
        <Button
          size="sm"
          variant="ghost"
          disabled={remove.isPending}
          onClick={() =>
            remove.mutate(undefined, {
              onSuccess: () => toast("Логотип убран"),
              onError: () => toast("Не получилось убрать логотип"),
            })
          }
        >
          Убрать
        </Button>
      ) : null}
    </div>
  );
}

/**
 * «Компания» on the desk: the company's card — name, tagline, logo, accent (D-44), with the
 * header as it will look — then the quiet hours of delivery.
 */
export function CompanyPanel({ director }: { director: boolean }) {
  const brand = useBrandDraft();
  const { draft, server, update } = useDraft();
  const edit = brand.edit;
  const hours = draft.delivery_window;
  const setHours = (patch: Partial<typeof hours>) => update({ delivery_window: { ...hours, ...patch } });
  const verdict = edit ? accentVerdict(edit.accent) : null;
  const accent = edit ? normalAccent(edit.accent) : null;
  const shownAccent = accent && verdict?.tone === "ok" ? accent : null;

  return (
    <div className="flex flex-col gap-8">
      <SettingsGroup id="company" title="Компания" about="Название и логотип видят все: в навигации, на экране входа и на стене. Стиль Pulse остаётся — меняется только акцент.">
        {!edit ? (
          <SettingRow id="brand-loading" label={brand.failed ? "Не удалось загрузить данные компании" : "Загружаю данные компании…"} hint={brand.failed ? "Проверьте связь и откройте экран ещё раз" : undefined} />
        ) : (
          <>
            <SettingRow id="brand-preview" label="Как это выглядит" hint="Логотип и название в шапке, акцент — на кнопках и ссылках">
              <span className="flex h-11 w-[300px] items-center gap-2.5 rounded-[10px] border border-border bg-bg px-3" data-testid="brand-preview">
                {brand.card?.brand.logo_url ? (
                  <StillLogo src={brand.card.brand.logo_url} className="h-6 max-w-[96px] object-contain" />
                ) : (
                  <span className="flex h-6 w-6 items-center justify-center rounded-[7px] bg-surface-2 text-[12px] font-semibold text-muted">{edit.name.trim().slice(0, 1).toUpperCase() || "?"}</span>
                )}
                <span className="truncate font-display text-[15px] font-semibold" style={{ color: shownAccent ?? "var(--text)" }}>
                  {edit.name.trim() || "Название компании"}
                </span>
                <span aria-hidden className="ml-auto h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: shownAccent ?? "var(--accent)" }} />
              </span>
            </SettingRow>
            <SettingRow id="brand-name" label="Название" htmlFor="set-brand-name" changed={brand.changed.name} hint={!edit.name.trim() ? <span className="text-warn">Без названия сохранить нельзя</span> : undefined}>
              <TextInput id="set-brand-name" label="Название компании" value={edit.name} maxLength={120} placeholder="ТОО «Компания»" onChange={(name) => brand.set({ name })} />
            </SettingRow>
            <SettingRow id="brand-tagline" label="Подпись на экране входа" hint="Одна строка под названием" htmlFor="set-brand-tagline" changed={brand.changed.tagline}>
              <TextInput id="set-brand-tagline" label="Подпись на экране входа" value={edit.tagline} maxLength={80} placeholder="Голосовое управление компанией" onChange={(tagline) => brand.set({ tagline })} />
            </SettingRow>
            <SettingRow id="brand-logo" label="Логотип" hint="PNG, JPEG, WebP или SVG до 2 МБ, лучше горизонтальный на тёмном фоне. Файл можно перетащить. Сохраняется сразу">
              <LogoWell url={brand.card?.brand.logo_url ?? null} letter={edit.name.trim().slice(0, 1).toUpperCase() || "?"} />
            </SettingRow>
            <SettingRow
              id="brand-accent"
              label="Акцентный цвет"
              htmlFor="set-brand-accent"
              changed={brand.changed.accent}
              hint={verdict ? <span style={{ color: verdict.tone === "warn" ? "var(--warn)" : undefined }}>{verdict.text}</span> : undefined}
            >
              <input
                type="color"
                aria-label="Выбрать цвет"
                value={(accent ?? DEFAULT_ACCENT).toLowerCase()}
                onChange={(event) => brand.set({ accent: event.target.value.toUpperCase() })}
                className="h-9 w-9 cursor-pointer rounded-[10px] border border-border bg-surface-2 p-1"
              />
              <TextInput id="set-brand-accent" label="Цвет, hex" value={edit.accent} maxLength={7} placeholder={DEFAULT_ACCENT} width={112} className="nums" onChange={(value) => brand.set({ accent: value })} />
              <Button size="sm" variant="ghost" disabled={!edit.accent} onClick={() => brand.set({ accent: "" })}>
                Сброс
              </Button>
            </SettingRow>
          </>
        )}
      </SettingsGroup>

      <SettingsGroup id="window" title="Тихие часы" about="Вне окна задачи ждут утра, если не нажать «Отправить сейчас». Время — актюбинское; ↑/↓ в поле — по 15 минут.">
        <SettingRow
          id="window-hours"
          label="Доставлять уведомления"
          hint="Пуши задач, объявлений и напоминаний — только в эти часы"
          htmlFor="set-window-from"
          changed={hours.from !== server.delivery_window.from || hours.to !== server.delivery_window.to}
        >
          <span className="text-[13px] text-muted">с</span>
          <TimeInput id="set-window-from" label="Доставка с" value={hours.from} onChange={(from) => setHours({ from })} />
          <span className="text-[13px] text-muted">до</span>
          <TimeInput label="Доставка до" value={hours.to} onChange={(to) => setHours({ to })} />
        </SettingRow>
      </SettingsGroup>

    </div>
  );
}
