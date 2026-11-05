"use client";

import { useState, type FormEvent } from "react";

import { INPUT } from "@/components/desk/team/fields";
import { SettingGroup, SettingRow, Switch } from "@/components/desk/ui/SettingRow";
import { ActionDialog } from "@/components/ops/ActionDialog";
import { Choice, Outcome, OutcomeLine, useOnce } from "@/components/ops/company/shared";
import { parserProvider, PARSER_CHOICES, PARSER_ITEMS, PARSER_NOTE, slugReady, type ParserProvider } from "@/components/ops/company/words";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { newRequestId, OpsError } from "@/lib/ops/client";
import { useUpdateCompany } from "@/lib/ops/company-queries";
import type { CompanyCard, UpdateCompanyBody } from "@/lib/ops/contract";
import { PARSER_MODEL_SHORT } from "@/lib/settings-plain";

type Patch = Omit<UpdateCompanyBody, "reason" | "client_request_id">;

function SaveDialog({
  companyId,
  patch,
  changes,
  onClose,
  onSlugTaken,
}: {
  companyId: string;
  patch: Patch;
  changes: string[];
  onClose: () => void;
  onSlugTaken: (message: string) => void;
}) {
  const requestId = useOnce(newRequestId);
  const update = useUpdateCompany(companyId);
  return (
    <ActionDialog
      title="Сохранить настройки"
      confirmLabel="Сохранить"
      onClose={onClose}
      onSubmit={async (reason) => {
        try {
          await update.mutateAsync({ ...patch, reason, client_request_id: requestId });
          toast("Настройки сохранены");
        } catch (failure) {
          // answered under its own field: the dialog goes, the form with the address stays
          if (failure instanceof OpsError && failure.code === "slug_taken") return onSlugTaken(failure.message);
          throw failure;
        }
      }}
    >
      <Outcome title="Что изменится">
        {changes.map((line) => (
          <OutcomeLine key={line}>{line}</OutcomeLine>
        ))}
      </Outcome>
    </ActionDialog>
  );
}

function SettingsForm({ card }: { card: CompanyCard }) {
  const savedProvider = parserProvider(card.settings);
  const [name, setName] = useState(card.name);
  const [slug, setSlug] = useState(card.slug ?? "");
  const [provider, setProvider] = useState<ParserProvider>(savedProvider);
  const [points, setPoints] = useState(card.settings.points_enabled);
  const [lab, setLab] = useState(card.settings.lab_for_all);
  const [devTools, setDevTools] = useState(card.settings.dev_tools);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const nameOk = name.trim().length >= 2;
  const slugOk = slugReady(slug) || (slug === "" && card.slug === null);

  const patch: Patch = {};
  const changes: string[] = [];
  if (name.trim() !== card.name) {
    patch.name = name.trim();
    changes.push(`Название: ${name.trim()}`);
  }
  if (slug !== (card.slug ?? "")) {
    patch.slug = slug;
    changes.push(`Адрес: /c/${slug}. Старая ссылка перестанет работать`);
  }
  const settings: NonNullable<Patch["settings"]> = {};
  if (provider !== savedProvider) {
    const { model, escalation_model, title } = PARSER_CHOICES[provider];
    settings.parser = { model, escalation_model };
    changes.push(`Модель разбора: ${title}`);
  }
  if (points !== card.settings.points_enabled) {
    settings.points_enabled = points;
    changes.push(points ? "Очки: включить" : "Очки: выключить");
  }
  if (lab !== card.settings.lab_for_all) {
    settings.lab_for_all = lab;
    changes.push(lab ? "Лаборатория для всех: включить" : "Лаборатория для всех: выключить");
  }
  if (Object.keys(settings).length > 0) patch.settings = settings;
  if (devTools !== card.settings.dev_tools) {
    patch.dev_tools = devTools;
    changes.push(devTools ? "Инструменты разработчиков: открыть компании" : "Инструменты разработчиков: закрыть от компании");
  }

  const model = card.settings.parser_model;
  const ready = changes.length > 0 && nameOk && slugOk;
  const save = (event: FormEvent) => {
    event.preventDefault();
    if (ready) setSaving(true);
  };
  const reset = () => {
    setName(card.name);
    setSlug(card.slug ?? "");
    setProvider(savedProvider);
    setPoints(card.settings.points_enabled);
    setLab(card.settings.lab_for_all);
    setDevTools(card.settings.dev_tools);
    setSlugError(null);
  };

  return (
    <form onSubmit={save} className="flex max-w-[808px] flex-col gap-4" data-testid="ops-settings">
      <SettingGroup>
        <SettingRow
          label="Название"
          hint="Его видят люди компании: на входе, в шапке и на стене"
          below={
            nameOk ? undefined : (
              <p role="alert" className="text-[12px] font-medium leading-4 text-danger">
                Хотя бы 2 буквы
              </p>
            )
          }
        >
          <div className="w-[300px]">
            <input className={INPUT} value={name} aria-label="Название" autoComplete="off" maxLength={120} onChange={(event) => setName(event.target.value)} />
          </div>
        </SettingRow>
        <SettingRow
          label="Адрес"
          hint="Ссылка для входа. Сменишь, и прежняя ссылка и старые QR перестанут работать"
          below={
            slugError || (slug !== "" && !slugReady(slug)) ? (
              <p role="alert" className="text-[12px] font-medium leading-4 text-danger" data-testid="ops-settings-slug-error">
                {slugError ?? "От 2 до 40 символов: маленькие латинские буквы, цифры и дефис"}
              </p>
            ) : undefined
          }
        >
          <div className="field flex h-9 w-[300px] items-center pl-3 pr-1">
            <span className="shrink-0 text-[14px] leading-5 text-muted">/c/</span>
            <input
              className="min-w-0 flex-1 bg-transparent pr-2 text-[14px] leading-5 outline-none"
              value={slug}
              aria-label="Адрес"
              maxLength={40}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              onChange={(event) => {
                setSlug(event.target.value.toLowerCase());
                setSlugError(null);
              }}
            />
          </div>
        </SettingRow>
        <SettingRow
          label="Модель разбора"
          hint={model ? `Сейчас: ${PARSER_MODEL_SHORT[model] ?? model}` : "Сейчас: как у новых компаний"}
          below={
            <div className="flex flex-col gap-2">
              <Choice name="ops-settings-provider" label="Модель разбора" value={provider} onChange={setProvider} items={PARSER_ITEMS} />
              <p className="text-[12px] leading-4 text-muted">{PARSER_NOTE}</p>
            </div>
          }
        />
        <SettingRow label="Очки" hint="Рейтинг, награды и магазин у этой компании">
          <Switch on={points} onChange={setPoints} label="Очки" />
        </SettingRow>
        <SettingRow label="Лаборатория для всех" hint="Вся команда видит вкладку «Лаб», пока компания тестирует">
          <Switch on={lab} onChange={setLab} label="Лаборатория для всех" />
        </SettingRow>
        <SettingRow label="Инструменты разработчиков" hint="«Лаборатория» и «Данные» у директора. Клиенту закрыто, сама компания это не включит">
          <Switch on={devTools} onChange={setDevTools} label="Инструменты разработчиков" />
        </SettingRow>
      </SettingGroup>
      <div className="flex items-center gap-3">
        <Button size="sm" type="submit" disabled={!ready} data-testid="ops-settings-save">
          Сохранить
        </Button>
        {changes.length > 0 ? (
          <>
            <Button size="sm" variant="ghost" onClick={reset} data-testid="ops-settings-reset">
              Вернуть как было
            </Button>
            <span className="text-[13px] leading-5 text-muted" data-testid="ops-settings-dirty">
              Не сохранено изменений: {changes.length}
            </span>
          </>
        ) : null}
      </div>
      {saving ? <SaveDialog companyId={card.id} patch={patch} changes={changes} onClose={() => setSaving(false)} onSlugTaken={setSlugError} /> : null}
    </form>
  );
}

/** «Настройки»: only what changed goes to the server. A saved card comes back with a new key, so the form starts from it. */
export function SettingsPanel({ card }: { card: CompanyCard }) {
  return <SettingsForm key={JSON.stringify([card.name, card.slug, card.settings])} card={card} />;
}
