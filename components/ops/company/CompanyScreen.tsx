"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { CopyButton } from "@/components/desk/team/fields";
import { EmptyState } from "@/components/desk/ui/EmptyState";
import { DeskPage, PageTitle } from "@/components/desk/ui/PageTitle";
import { useShortcuts } from "@/components/desk/ui/Shortcuts";
import { SegmentTabs } from "@/components/desk/ui/Toolbar";
import { DataPanel, DrainBar } from "@/components/ops/company/DataPanel";
import { DirectorPanel } from "@/components/ops/company/DirectorPanel";
import { CompanyHealth } from "@/components/ops/company/Health";
import { PeoplePanel } from "@/components/ops/company/PeoplePanel";
import { SettingsPanel } from "@/components/ops/company/SettingsPanel";
import { PanelBones } from "@/components/ops/company/shared";
import { TaskPanel } from "@/components/ops/company/TaskPanel";
import { ageLabel, isAlarmed } from "@/components/ops/registry/alarm";
import { StatBones, TabBones } from "@/components/ops/shell/Bones";
import { OpsFailure } from "@/components/ops/shell/failure";
import { typingIn } from "@/components/ops/shell/Jump";
import { OpsStat } from "@/components/ops/shell/Stat";
import { toast } from "@/components/ui/Toast";
import { whenAqtobe } from "@/lib/lab/format";
import { OpsError } from "@/lib/ops/client";
import { useCompanyCard } from "@/lib/ops/company-queries";
import type { CompanyCard, PurgeAnswer } from "@/lib/ops/contract";
import { useCompanies } from "@/lib/ops/queries";
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

const LINK = "btn-secondary inline-flex min-h-[36px] items-center rounded-[12px] px-3 text-[13px] font-semibold leading-4 text-text";

function spendText(card: CompanyCard): string {
  const total = card.spend_30d.reduce((sum, row) => sum + (row.usd ?? 0), 0);
  // a model without a price stays out of the sum: the plus says so instead of pretending
  return `$${total.toFixed(2)}${card.spend_30d.some((row) => row.usd === null) ? "+" : ""}`;
}

function Head({ card }: { card: CompanyCard }) {
  const { signals } = card;
  const working = card.people.filter((person) => person.is_active).length;
  const alarmed = isAlarmed(signals);
  const queue = signals.queue_depth > 0 && signals.queue_age_seconds !== null ? `${signals.queue_depth} · ${ageLabel(signals.queue_age_seconds)}` : signals.queue_depth;
  const quiet = signals.failed_no_subscription_7d;
  return (
    <>
      <PageTitle
        title={card.name}
        state={{ text: `${card.slug ? `/c/${card.slug}` : "Без адреса"}, создана ${whenAqtobe(card.created_at)}`, tone: alarmed ? "warn" : undefined }}
        light={alarmed ? "warn" : null}
        actions={
          <>
            <CopyButton text={() => card.id} label="Скопировать номер компании" done="Скопировал номер компании" />
            <Link href={`/ops/log?company=${card.id}`} className={LINK} data-testid="ops-company-log">
              Журнал компании
            </Link>
          </>
        }
      />
      <div className="ops-stats" data-testid="ops-company-head">
        <OpsStat label="Люди работают" value={`${working} из ${card.people.length}`} />
        <OpsStat label="Расход за 30 дней" value={spendText(card)} />
        <OpsStat label="Ошибки разбора за сутки" value={signals.parse_errors_24h} tone="danger" />
        <OpsStat label="В очереди" value={queue} tone="warn" />
        <OpsStat label="Не дошло за 7 дней" value={signals.failed_7d} tone="warn" />
        <OpsStat label="Стена на связи" value={card.tv_seen_at ? whenAqtobe(card.tv_seen_at) : "нет"} />
      </div>
      {quiet > 0 ? (
        <p className="-mt-2 text-[12px] leading-4 text-muted">
          Из недошедших {quiet} {pluralRu(quiet, ["уведомление", "уведомления", "уведомлений"])} не сбой: у человека выключены пуши.
        </p>
      ) : null}
      <CompanyHealth card={card} />
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
          auto
          left={files}
          onLeft={(next) => {
            setFiles(next);
            if (next === 0) onDrained();
          }}
        />
      ) : null}
      <p className="text-[13px] leading-[18px] text-muted">Уйти можно сразу: что останется, снимет плановая уборка.</p>
      <div>
        <Link href="/ops" className={LINK} data-testid="ops-purged-home">
          К списку компаний
        </Link>
      </div>
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
  const card = useCompanyCard(id, purged === null, true);
  const companies = useCompanies();
  const section = sectionOf(params.get("s"));
  const name = card.data?.name ?? companies.data?.find((company) => company.id === id)?.name ?? null;

  useShortcuts("Карточка компании", [{ keys: ["1–5"], label: "Люди, Директор, Настройки, Задача, Данные" }]);

  const open = (next: Section) => router.replace(next === "people" ? `/ops/c/${id}` : `/ops/c/${id}?s=${next}`, { scroll: false });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const digit = /^Digit([1-5])$/.exec(event.code)?.[1];
      if (!digit || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      if (typingIn(event.target) || document.body.hasAttribute("data-dialog-open")) return;
      router.replace(digit === "1" ? `/ops/c/${id}` : `/ops/c/${id}?s=${SECTIONS[Number(digit) - 1].value}`, { scroll: false });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [id, router]);

  // two tabs of the console are told apart by the company's name
  useEffect(() => {
    if (!name) return;
    const before = document.title;
    document.title = `${name} · Консоль Pulse`;
    return () => {
      document.title = before;
    };
  }, [name]);

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
        <PageTitle title={name ?? "Компания"} state={{ text: "Загружаю карточку" }} />
        <StatBones />
        <TabBones />
        <PanelBones />
      </DeskPage>
    );
  }
  if (!card.data) {
    const missing = card.error instanceof OpsError && (card.error.code === "not_found" || card.error.code === "validation_error");
    return (
      <DeskPage>
        <PageTitle title="Компания" />
        {missing ? (
          <EmptyState
            title="Такой компании нет"
            hint="Возможно, её уже удалили: кто и когда, видно в журнале."
            action={
              <div className="flex flex-wrap gap-2">
                <Link href="/ops" className={LINK}>
                  К списку компаний
                </Link>
                <Link href={`/ops/log?company=${id}`} className={LINK}>
                  Журнал этой компании
                </Link>
              </div>
            }
          />
        ) : (
          <OpsFailure error={card.error} onRetry={() => void card.refetch()} />
        )}
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
          onChange={open}
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
