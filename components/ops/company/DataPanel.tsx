"use client";

import { useState, type ReactNode } from "react";

import { DataGrid, type Column } from "@/components/desk/ui/DataGrid";
import { EmptyState } from "@/components/desk/ui/EmptyState";
import { Num } from "@/components/desk/ui/Num";
import { SectionLabel } from "@/components/desk/ui/SectionLabel";
import { SettingGroup, SettingRow } from "@/components/desk/ui/SettingRow";
import { ActionDialog } from "@/components/ops/ActionDialog";
import { ExportRun } from "@/components/ops/company/ExportRun";
import { Outcome, OutcomeLine, PanelBones, useOnce } from "@/components/ops/company/shared";
import { BUCKET_TEXT, bytesText, exportFresh, filesTotal, filesWiped, footprintRows, type FootprintRow } from "@/components/ops/company/words";
import { failureText, OpsFailure } from "@/components/ops/shell/failure";
import { When } from "@/components/ops/shell/When";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { formatNum } from "@/lib/desk/format";
import { whenAqtobe } from "@/lib/lab/format";
import { newRequestId } from "@/lib/ops/client";
import { useDrain, useFootprint, usePurge, useWipe } from "@/lib/ops/company-queries";
import type { CompanyCard, Footprint, PurgeAnswer, WipeAnswer } from "@/lib/ops/contract";
import { canPickFolder, pickFolder, type ExportFolder } from "@/lib/ops/export";
import { pluralRu } from "@/lib/tasks/status-text";

const COLUMNS: Column<FootprintRow>[] = [
  { key: "label", title: "Что", sort: (a, b) => a.label.localeCompare(b.label, "ru"), render: (row) => <span className="block truncate text-[13px]">{row.label}</span> },
  { key: "count", title: "Строк", width: "88px", align: "right", sort: (a, b) => a.count - b.count, render: (row) => <Num value={row.count} /> },
  {
    key: "wipe",
    title: "При очистке",
    width: "112px",
    render: (row) => (row.count === 0 ? null : <span className={`text-[12px] leading-4 ${row.survivesWipe ? "text-muted" : "text-danger"}`}>{row.survivesWipe ? "останется" : "исчезнет"}</span>),
  },
];

/** A big action and what it does: the button named in full, its consequence under it. */
function ActionRow({ hint, below, children }: { hint: ReactNode; below?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-1.5 px-4 py-3">
      {children}
      <p className="text-[12px] leading-4 text-muted">{hint}</p>
      {below}
    </div>
  );
}

/** Files wait in a queue after a wipe or a purge: each press takes the next batch off the storage. */
export function DrainBar({ left, onLeft }: { left: number; onLeft: (left: number) => void }) {
  const drain = useDrain();
  const [error, setError] = useState<string | null>(null);

  const press = async () => {
    setError(null);
    try {
      const answer = await drain.mutateAsync();
      onLeft(answer.left);
      if (answer.removed === 0 && answer.left > 0) setError("Ни один файл не снялся, попробуй чуть позже");
    } catch (failure) {
      setError(failureText(failure));
    }
  };

  return (
    <SettingGroup testId="ops-drain">
      <SettingRow label={`Файлов ещё в хранилище: ${formatNum(left)}`} hint="Снимаются порциями, жми, пока не станет ноль" below={error ? <p role="alert" className="text-[12px] font-medium leading-4 text-danger">{error}</p> : undefined}>
        <Button size="sm" variant="secondary" loading={drain.isPending} onClick={() => void press()} data-testid="ops-drain-run">
          Снять файлы
        </Button>
      </SettingRow>
    </SettingGroup>
  );
}

function WipeDialog({ card, footprint, onClose, onDone }: { card: CompanyCard; footprint: Footprint; onClose: () => void; onDone: (answer: WipeAnswer) => void }) {
  const requestId = useOnce(newRequestId);
  const wipe = useWipe(card.id);
  const rows = footprintRows(footprint).filter((row) => row.count > 0);
  const gone = rows.filter((row) => !row.survivesWipe);
  const stay = rows.filter((row) => row.survivesWipe && row.table !== "voice_kept");
  const files = filesWiped(footprint);

  return (
    <ActionDialog
      title="Очистить рабочие данные"
      description="Компания останется и начнёт с чистого листа. Отменить нельзя: если данные могут понадобиться, сначала выгрузи их."
      confirmLabel="Очистить"
      danger
      confirmName={card.name}
      disabled={gone.length === 0 && files === 0}
      onClose={onClose}
      onSubmit={async (reason) => {
        onDone(await wipe.mutateAsync({ confirm_name: card.name, reason, client_request_id: requestId }));
      }}
    >
      <div className="grid grid-cols-2 gap-3" data-testid="ops-wipe-preview">
        <Outcome title="Исчезнет" tone="danger">
          {gone.map((row) => (
            <OutcomeLine key={row.table} count={formatNum(row.count)}>
              {row.label}
            </OutcomeLine>
          ))}
          <OutcomeLine count={`до ${formatNum(files)}`}>Файлы: голос и фото</OutcomeLine>
        </Outcome>
        <Outcome title="Останется">
          {stay.map((row) => (
            <OutcomeLine key={row.table} count={formatNum(row.count)}>
              {row.label}
            </OutcomeLine>
          ))}
          <OutcomeLine>Настройки компании</OutcomeLine>
          <OutcomeLine count={formatNum(footprint.kept_files)}>Записи «в корпус»</OutcomeLine>
          <OutcomeLine>Фото товаров магазина</OutcomeLine>
          <OutcomeLine count={formatNum(footprint.files.brand.count)}>Логотип и оформление</OutcomeLine>
        </Outcome>
      </div>
      <p className="text-[13px] leading-[18px] text-muted">Стена вернётся в эфир, товар из открытых заказов вернётся на склад, серии людей обнулятся. Уведомлений никто не получит.</p>
    </ActionDialog>
  );
}

function PurgeDialog({ card, footprint, onClose, onDone }: { card: CompanyCard; footprint: Footprint; onClose: () => void; onDone: (answer: PurgeAnswer) => void }) {
  const requestId = useOnce(newRequestId);
  const purge = usePurge(card.id, onDone);
  const rows = footprintRows(footprint).filter((row) => row.count > 0);
  const files = filesTotal(footprint);

  return (
    <ActionDialog
      title="Удалить компанию"
      description="Компании больше не будет: люди не смогут войти, ссылка перестанет работать. Отменить это нельзя."
      confirmLabel="Удалить навсегда"
      danger
      confirmName={card.name}
      onClose={onClose}
      onSubmit={async (reason) => {
        await purge.mutateAsync({ confirm_name: card.name, reason, client_request_id: requestId });
      }}
    >
      <div className="grid grid-cols-2 gap-3" data-testid="ops-purge-preview">
        <Outcome title="Исчезнет всё" tone="danger">
          {rows.map((row) => (
            <OutcomeLine key={row.table} count={formatNum(row.count)}>
              {row.label}
            </OutcomeLine>
          ))}
          <OutcomeLine count={formatNum(files)}>Все файлы, и «в корпус» тоже</OutcomeLine>
          <OutcomeLine>Учётные записи всех людей</OutcomeLine>
        </Outcome>
        <Outcome title="Останется">
          <OutcomeLine>{footprint.last_export ? `Выгрузка от ${whenAqtobe(footprint.last_export.at)} в твоей папке` : "Выгрузка в твоей папке"}</OutcomeLine>
          <OutcomeLine>Записи журнала консоли</OutcomeLine>
        </Outcome>
      </div>
      <p className="text-[13px] leading-[18px] text-muted">Заметки и доски директора личные и в выгрузку не входят: после удаления их не вернуть.</p>
    </ActionDialog>
  );
}

/**
 * «Данные»: what the company holds, in words, and the three big actions. The previews are read
 * from the footprint, asked again the moment a dialog opens. The folder is picked on the press
 * itself: the browser's picker wants a live click, the code dialog would use it up.
 */
export function DataPanel({ card, onPurged }: { card: CompanyCard; onPurged: (answer: PurgeAnswer) => void }) {
  const footprint = useFootprint(card.id);
  const [dialog, setDialog] = useState<"wipe" | "purge" | null>(null);
  const [folder, setFolder] = useState<ExportFolder | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [left, setLeft] = useState<number | null>(null);

  if (footprint.isPending) return <PanelBones />;
  if (!footprint.data) return <OpsFailure error={footprint.error} onRetry={() => void footprint.refetch()} />;

  const data = footprint.data;
  const rows = footprintRows(data);
  const queued = left ?? data.files_queued;
  const fresh = exportFresh(data, footprint.dataUpdatedAt);
  const canExport = canPickFolder();

  const preview = (kind: "wipe" | "purge") => {
    void footprint.refetch();
    setDialog(kind);
  };
  const pick = async () => {
    setNote(null);
    try {
      setFolder(await pickFolder());
    } catch (failure) {
      setNote(failure instanceof Error ? failure.message : "Не получилось открыть папку");
    }
  };

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px]" data-testid="ops-data">
      <section className="flex min-w-0 flex-col gap-2">
        <SectionLabel>Строки в базе</SectionLabel>
        <DataGrid aria-label="Объём данных компании" columns={COLUMNS} rows={rows} rowKey={(row) => row.table} empty={<EmptyState title="Данных нет" />} />
      </section>

      <div className="flex min-w-0 flex-col gap-5">
        <section className="flex flex-col gap-2">
          <SectionLabel>Файлы</SectionLabel>
          <SettingGroup testId="ops-files">
            {(Object.keys(BUCKET_TEXT) as (keyof Footprint["files"])[]).map((bucket) => (
              <SettingRow key={bucket} label={BUCKET_TEXT[bucket]} hint={bytesText(data.files[bucket].bytes)}>
                <Num value={data.files[bucket].count} />
              </SettingRow>
            ))}
            <SettingRow label="«В корпус»" hint="Записи, отмеченные для обучения: очистка их не трогает">
              <Num value={data.kept_files} />
            </SettingRow>
          </SettingGroup>
        </section>

        {queued > 0 ? <DrainBar left={queued} onLeft={setLeft} /> : null}

        <section className="flex flex-col gap-2">
          <SectionLabel>Действия</SectionLabel>
          <SettingGroup>
            <ActionRow hint="Задачи, переписка, очки и файлы исчезнут, люди и настройки останутся">
              <Button size="sm" variant="danger" onClick={() => preview("wipe")} data-testid="ops-wipe">
                Очистить рабочие данные
              </Button>
            </ActionRow>
            <ActionRow
              hint={
                !canExport ? (
                  "Запись в папку умеют только Chrome и Edge, открой консоль в одном из них"
                ) : data.last_export ? (
                  <>
                    Последняя <When iso={data.last_export.at} />, сумма {data.last_export.sha256.slice(0, 8)}
                  </>
                ) : (
                  "Таблицы и файлы в папку на этом компьютере. Сначала браузер спросит папку"
                )
              }
              below={
                note ? (
                  <p role="alert" className="text-[12px] font-medium leading-4 text-danger">
                    {note}
                  </p>
                ) : undefined
              }
            >
              <Button size="sm" variant="secondary" disabled={!canExport} onClick={() => void pick()} data-testid="ops-export">
                Выгрузить
              </Button>
            </ActionRow>
            <ActionRow hint={fresh ? "Свежая выгрузка есть, удаление открыто" : "Сначала выгрузка: удаление открывается на 24 часа после неё, чтобы не потерять данные без копии"}>
              <Button size="sm" variant="danger" disabled={!fresh} onClick={() => preview("purge")} data-testid="ops-purge">
                Удалить компанию
              </Button>
            </ActionRow>
          </SettingGroup>
        </section>
      </div>

      {dialog === "wipe" ? (
        <WipeDialog
          card={card}
          footprint={data}
          onClose={() => setDialog(null)}
          onDone={(answer) => {
            const removed = Object.values(answer.rows).reduce((sum, count) => sum + count, 0);
            toast(`Очищено ${formatNum(removed)} ${pluralRu(removed, ["строка", "строки", "строк"])}, файлов осталось снять: ${formatNum(answer.files_left)}`);
            setLeft(answer.files_left);
          }}
        />
      ) : null}
      {dialog === "purge" ? <PurgeDialog card={card} footprint={data} onClose={() => setDialog(null)} onDone={onPurged} /> : null}
      {folder ? <ExportRun card={card} folder={folder} onClose={() => setFolder(null)} /> : null}
    </div>
  );
}
