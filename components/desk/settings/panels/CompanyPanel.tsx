"use client";

import { ImageUp, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type DragEvent } from "react";

import { accentVerdict, normalAccent, useBrandDraft } from "@/components/desk/settings/brand";
import { SettingRow, SettingsGroup, TextInput, TimeInput } from "@/components/desk/settings/form";
import { useDraft } from "@/components/settings/draft";
import { Button } from "@/components/ui/Button";
import { StillLogo } from "@/components/ui/StillLogo";
import { toast } from "@/components/ui/Toast";
import { DEFAULT_ACCENT } from "@/lib/brand-color";
import { useCompanyLogo } from "@/lib/desk/settings-queries";

const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

/**
 * The logo: what is there now, «Заменить…» and «Убрать»; a file dropped on the well lands as well.
 * Saved at once — not a draft — so «Убрать» asks once more and forgets the question after a moment.
 */
function LogoWell({ url, letter }: { url: string | null; letter: string }) {
  const { upload, remove } = useCompanyLogo();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [sure, setSure] = useState(false);
  useEffect(() => {
    if (!sure) return;
    const timer = setTimeout(() => setSure(false), 3500);
    return () => clearTimeout(timer);
  }, [sure]);
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
        className="set-logo-well flex h-9 w-[132px] items-center justify-center overflow-hidden border border-dashed px-2 transition-colors duration-[120ms]"
        data-over={over ? "" : undefined}
        style={{ background: "var(--spine)", borderColor: over ? "var(--accent)" : "var(--text-muted)" }}
      >
        {upload.isPending ? (
          <span className="text-[12px] text-white/70">Загружаю…</span>
        ) : url ? (
          <StillLogo src={url} className="h-6 max-w-[116px] object-contain" />
        ) : (
          <span className="text-[12px] leading-4 text-white/70">{over ? "Отпустите файл" : `нет · «${letter}»`}</span>
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
      <Button size="sm" variant="secondary" disabled={upload.isPending} onClick={() => input.current?.click()} icon={<ImageUp size={15} strokeWidth={2} />}>
        {url ? "Заменить…" : "Загрузить…"}
      </Button>
      {url ? (
        <Button
          size="sm"
          variant={sure ? "danger" : "ghost"}
          disabled={remove.isPending}
          onClick={() => {
            if (!sure) {
              setSure(true);
              return;
            }
            setSure(false);
            remove.mutate(undefined, {
              onSuccess: () => toast("Логотип убран"),
              onError: () => toast("Не получилось убрать логотип"),
            });
          }}
          title={sure ? "Логотип уйдёт сразу — везде вернётся буква компании" : undefined}
        >
          {sure ? "Точно убрать" : "Убрать"}
        </Button>
      ) : null}
    </div>
  );
}

/**
 * How the card looks where people see it: the window's head with the logo or the letter and the
 * name in the accent, a button in the accent, and the line under the name on the sign-in screen.
 */
function BrandPreview({ logo, name, tagline, accent }: { logo: string | null; name: string; tagline: string; accent: string | null }) {
  const color = accent ?? "#2ed3b7";
  return (
    <div className="set-brand-preview" data-testid="brand-preview" style={{ "--brand": color } as CSSProperties}>
      <div className="set-brand-bar">
        {logo ? (
          <StillLogo src={logo} className="h-6 max-w-[104px] object-contain" />
        ) : (
          <span className="set-brand-letter">{name.trim().slice(0, 1).toUpperCase() || "?"}</span>
        )}
        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold" style={{ color: accent ?? undefined }}>
          {name.trim() || "Название компании"}
        </span>
        <span aria-hidden className="set-brand-button">Принял</span>
      </div>
      <div className="set-brand-login">
        <span className="text-[11px] font-medium leading-4 text-white/45">Экран входа</span>
        <span className="truncate text-[17px] font-semibold text-white">{name.trim() || "Название компании"}</span>
        <span className="truncate text-[13px] text-white/60">{tagline.trim() || "Голосовое управление компанией"}</span>
      </div>
    </div>
  );
}

const minutesOf = (clock: string) => {
  const [h, m] = clock.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

/**
 * The quiet hours as a day: twenty-four hours on a line, the hours of delivery lit, the night quiet
 * — a window across midnight lights both ends. It draws itself from the left when it first shows.
 */
function DayLine({ from, to }: { from: string; to: string }) {
  const a = minutesOf(from) / 1440;
  const b = minutesOf(to) / 1440;
  const spans = a === b ? [[0, 1]] : a < b ? [[a, b]] : [[0, b], [a, 1]];
  return (
    <div className="set-dayline" aria-hidden>
      <div className="set-dayline-track">
        {spans.map(([start, end]) => (
          <span key={start} className="set-dayline-on" style={{ left: `${start * 100}%`, width: `${(end - start) * 100}%` }} />
        ))}
      </div>
      <div className="set-dayline-ticks nums">
        {[0, 6, 12, 18, 24].map((hour) => (
          <span key={hour} style={{ left: `${(hour / 24) * 100}%` }}>
            {String(hour).padStart(2, "0")}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * «Компания» on the desk: the company's card — name, tagline, logo, accent (D-44), with the
 * header and the sign-in screen as they will look — then the quiet hours of delivery as a day.
 */
export function CompanyPanel() {
  const brand = useBrandDraft();
  const { draft, server, update } = useDraft();
  const edit = brand.edit;
  const hours = draft.delivery_window;
  const setHours = (patch: Partial<typeof hours>) => update({ delivery_window: { ...hours, ...patch } });
  const verdict = edit ? accentVerdict(edit.accent) : null;
  const accent = edit ? normalAccent(edit.accent) : null;
  const shownAccent = accent && verdict?.tone === "ok" ? accent : null;

  return (
    <div className="flex flex-col gap-6">
      <SettingsGroup id="company" title="Компания" about="Название и логотип видят все: в навигации, на экране входа и на стене. Стиль Pulse остаётся — меняется только акцент.">
        {!edit ? (
          <SettingRow id="brand-loading" label={brand.failed ? "Не удалось загрузить данные компании" : "Загружаю данные компании…"} hint={brand.failed ? "Проверьте связь и откройте экран ещё раз" : undefined} />
        ) : (
          <>
            <SettingRow id="brand-preview" label="Как это выглядит" hint="Логотип и название в шапке, акцент — на кнопках и ссылках">
              <BrandPreview logo={brand.card?.brand.logo_url ?? null} name={edit.name} tagline={edit.tagline} accent={shownAccent} />
            </SettingRow>
            <SettingRow
              id="brand-name"
              label="Название"
              htmlFor="ctl-brand-name"
              changed={brand.changed.name}
              hint={!edit.name.trim() ? <span className="text-warn">Без названия сохранить нельзя</span> : "Как компанию зовут в приложении"}
            >
              <TextInput id="ctl-brand-name" label="Название компании" value={edit.name} maxLength={120} placeholder="ТОО «Компания»" invalid={!edit.name.trim()} onChange={(name) => brand.set({ name })} />
            </SettingRow>
            <SettingRow id="brand-tagline" label="Подпись на экране входа" hint="Одна строка под названием" htmlFor="ctl-brand-tagline" changed={brand.changed.tagline}>
              <TextInput id="ctl-brand-tagline" label="Подпись на экране входа" value={edit.tagline} maxLength={80} placeholder="Голосовое управление компанией" onChange={(tagline) => brand.set({ tagline })} />
            </SettingRow>
            <SettingRow id="brand-logo" label="Логотип" hint="PNG, JPEG, WebP или SVG до 2 МБ, лучше горизонтальный на тёмном фоне. Файл можно перетащить. Сохраняется сразу">
              <LogoWell url={brand.card?.brand.logo_url ?? null} letter={edit.name.trim().slice(0, 1).toUpperCase() || "?"} />
            </SettingRow>
            <SettingRow
              id="brand-accent"
              label="Акцентный цвет"
              htmlFor="ctl-brand-accent"
              changed={brand.changed.accent}
              hint={verdict ? <span style={{ color: verdict.tone === "warn" ? "var(--warn)" : undefined }}>{verdict.text}</span> : undefined}
            >
              <label className="set-swatch" title="Выбрать цвет" style={{ "--swatch": accent ?? DEFAULT_ACCENT } as CSSProperties}>
                <input
                  type="color"
                  aria-label="Выбрать цвет"
                  value={(accent ?? DEFAULT_ACCENT).toLowerCase()}
                  onChange={(event) => brand.set({ accent: event.target.value.toUpperCase() })}
                  className="h-8 w-8 cursor-pointer border border-border bg-transparent p-0.5"
                />
              </label>
              <TextInput
                id="ctl-brand-accent"
                label="Цвет, hex"
                value={edit.accent}
                maxLength={7}
                placeholder={DEFAULT_ACCENT}
                width={112}
                className="nums"
                invalid={accent === undefined}
                onChange={(value) => brand.set({ accent: value })}
              />
              <Button size="sm" variant="ghost" disabled={!edit.accent} onClick={() => brand.set({ accent: "" })} icon={<RotateCcw size={14} strokeWidth={2} />} title="Вернуть акцент Pulse">
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
          htmlFor="ctl-window-from"
          changed={hours.from !== server.delivery_window.from || hours.to !== server.delivery_window.to}
        >
          <span className="text-[13px] text-muted">с</span>
          <TimeInput id="ctl-window-from" label="Доставка с" value={hours.from} onChange={(from) => setHours({ from })} />
          <span className="text-[13px] text-muted">до</span>
          <TimeInput label="Доставка до" value={hours.to} onChange={(to) => setHours({ to })} />
        </SettingRow>
        <div className="set-row set-row-wide">
          <DayLine from={hours.from} to={hours.to} />
        </div>
      </SettingsGroup>
    </div>
  );
}
