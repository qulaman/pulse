"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { EmptyState } from "@/components/desk/ui/EmptyState";
import { DeskPage, PageTitle } from "@/components/desk/ui/PageTitle";
import { StatTile } from "@/components/desk/ui/StatTile";
import { SegmentTabs } from "@/components/desk/ui/Toolbar";
import { DataPanel, DrainBar } from "@/components/ops/company/DataPanel";
import { DirectorPanel } from "@/components/ops/company/DirectorPanel";
import { PeoplePanel } from "@/components/ops/company/PeoplePanel";
import { SettingsPanel } from "@/components/ops/company/SettingsPanel";
import { PanelBones } from "@/components/ops/company/shared";
import { TaskPanel } from "@/components/ops/company/TaskPanel";
import { ageLabel } from "@/components/ops/registry/alarm";
import { OpsFailure } from "@/components/ops/shell/failure";
import { toast } from "@/components/ui/Toast";
import { whenAqtobe } from "@/lib/lab/format";
import { OpsError } from "@/lib/ops/client";
import { useCompanyCard } from "@/lib/ops/company-queries";
import type { CompanyCard, PurgeAnswer } from "@/lib/ops/contract";
import { pluralRu } from "@/lib/tasks/status-text";

const SECTIONS = [
  { value: "people", label: "Люди" },
  { value: "director", label: "Директор" },
  { value: "settings", label: "Настройки" },
  { value: "task", label: "Задача" },
  { value: "data", label: "Данные" },
] as const;
type Section = (typeof SECTIONS)[number]["value"];

const sectionOf = (value: string | null): Section => SECTIONS.find((section) => section.value === value)?.value ?? "people";

function spendText(card: CompanyCard): string {
  const total = card.spend_30d.reduce((sum, row) => sum + (row.usd ?? 0), 0);
  // a model without a price stays out of the sum: the plus says so instead of pretending
  return `$${total.toFixed(2)}${card.spend_30d.some((row) => row.usd === null) ? "+" : ""}`;
}

function Head({ card }: { card: CompanyCard }) {
  const { signals } = card;
  const working = card.people.filter((person) => person.is_active).length;
  const alarmed = signals.parse_errors_24h > 0 || signals.failed_7d > 0;
  const queue = signals.queue_depth > 0 && signals.queue_age_seconds !== null ? `${signals.queue_depth} · ${ageLabel(signals.queue_age_seconds)}` : signals.queue_depth;
  const quiet = signals.failed_no_subscription_7d;
  return (
    <>
      <PageTitle
        title={card.name}
        state={{ text: `${card.slug ? `/c/${card.slug}` : "Без адреса"}, создана ${whenAqtobe(card.created_at)}`, tone: alarmed ? "warn" : undefined }}
        light={alarmed ? "warn" : null}
      />
      <div className="flex flex-wrap gap-2" data-testid="ops-company-head">
        <StatTile label="Люди работают" value={`${working} из ${card.people.length}`} />
        <StatTile label="Расход за 30 дней" value={spendText(card)} />
        <StatTile label="Ошибки разбора за сутки" value={signals.parse_errors_24h} tone="danger" />
        <StatTile label="В очереди" value={queue} tone="warn" />
        <StatTile label="Не дошло за 7 дней" value={signals.failed_7d} tone="warn" />
        <StatTile label="Стена на связи" value={card.tv_seen_at ? whenAqtobe(card.tv_seen_at) : "нет"} />
      </div>
      {quiet > 0 ? (
        <p className="-mt-2 text-[12px] leading-4 text-muted">
          Из недошедших {quiet} {pluralRu(quiet, ["уведомление", "уведомления", "уведомлений"])} не сбой: у человека выключены пуши.
        </p>
      ) : null}
    </>
  );
}

/** The company has just been deleted and its files are still leaving the storage. */
function Purged({ left, onDrained }: { left: number; onDrained: () => void }) {
  const [files, setFiles] = useState(left);
  return (
    <DeskPage width="narrow">
      <PageTitle title="Компания удалена" state={files > 0 ? { text: "Осталось снять файлы из хранилища", tone: "warn" } : { text: "Файлов не осталось", tone: "ok" }} light={files > 0 ? "warn" : "ok"} />
      {files > 0 ? (
        <DrainBar
          left={files}
          onLeft={(next) => {
            setFiles(next);
            if (next === 0) onDrained();
          }}
        />
      ) : null}
      <p className="text-[13px] leading-[18px] text-muted">Можно уйти к списку компаний слева: что останется, снимет плановая уборка.</p>
    </DeskPage>
  );
}

/**
 * The card of one company (D-157): its head and five sections, the section in the address so a
 * reload stays where it was. «Задача» shows nothing until a search, and leaving the section
 * forgets what was found: a company's tasks are no reading matter here.
 */
export function CompanyScreen({ id }: { id: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [purged, setPurged] = useState<PurgeAnswer | null>(null);
  const card = useCompanyCard(id, purged === null);
  const section = sectionOf(params.get("s"));

  const toRegistry = () => router.replace("/ops");
  const onPurged = (answer: PurgeAnswer) => {
    toast("Компания удалена");
    setPurged(answer);
    if (answer.files_left === 0) toRegistry();
  };

  if (purged) return <Purged left={purged.files_left} onDrained={toRegistry} />;

  if (card.isPending) {
    return (
      <DeskPage>
        <PageTitle title="Компания" state={{ text: "Загружаю карточку" }} />
        <PanelBones />
      </DeskPage>
    );
  }
  if (!card.data) {
    const missing = card.error instanceof OpsError && (card.error.code === "not_found" || card.error.code === "validation_error");
    return (
      <DeskPage>
        <PageTitle title="Компания" />
        {missing ? <EmptyState title="Такой компании нет" hint="Возможно, её уже удалили. Список компаний слева." /> : <OpsFailure error={card.error} onRetry={() => void card.refetch()} />}
      </DeskPage>
    );
  }

  return (
    <DeskPage>
      <Head card={card.data} />
      <div>
        <SegmentTabs
          aria-label="Разделы компании"
          value={section}
          items={[...SECTIONS]}
          onChange={(next) => router.replace(next === "people" ? `/ops/c/${id}` : `/ops/c/${id}?s=${next}`, { scroll: false })}
        />
      </div>
      {section === "people" ? <PeoplePanel card={card.data} /> : null}
      {section === "director" ? <DirectorPanel card={card.data} /> : null}
      {section === "settings" ? <SettingsPanel card={card.data} /> : null}
      {section === "task" ? <TaskPanel card={card.data} /> : null}
      {section === "data" ? <DataPanel card={card.data} onPurged={onPurged} /> : null}
    </DeskPage>
  );
}
