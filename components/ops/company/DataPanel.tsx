"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { DataGrid, type Column } from "@/components/desk/ui/DataGrid";
import { EmptyState } from "@/components/desk/ui/EmptyState";
import { Num } from "@/components/desk/ui/Num";
import { SectionLabel } from "@/components/desk/ui/SectionLabel";
import { SettingGroup, SettingRow } from "@/components/desk/ui/SettingRow";
import { ActionDialog } from "@/components/ops/ActionDialog";
import { ExportRun } from "@/components/ops/company/ExportRun";
import { Outcome, OutcomeLine, PanelBones, useOnce } from "@/components/ops/company/shared";
import { BUCKET_TEXT, bytesText, DAY_MS, exportFresh, filesTotal, filesWiped, footprintRows, type FootprintRow } from "@/components/ops/company/words";
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
    width: "128px",
    render: (row) => (row.count === 0 ? null : <span className="ops-wipe" data-gone={row.survivesWipe ? undefined : ""}>{row.survivesWipe ? "останется" : "исчезнет"}</span>),
  },
];

/** A big action and what it does: the button named in full, its consequence under it. */
function ActionRow({ hint, below, danger = false, children }: { hint: ReactNode; below?: ReactNode; danger?: boolean; children: ReactNode }) {
  return (
    <div className="ops-action flex flex-col items-start gap-1.5 px-3 py-2.5" data-danger={danger ? "" : undefined}>
      {children}
      <p className="text-[12px] leading-4 text-muted">{hint}</p>
      {below}
    </div>
  );
}

/**
 * Files wait in a queue after a wipe or a purge: one press takes batch after batch until none is
 * left or none moved. `auto` starts right after the action that queued them. Leaving the screen
 * stops the run; the scheduled cleanup takes the rest.
 */
export function DrainBar({ left, onLeft, auto = false }: { left: number; onLeft: (left: number) => void; auto?: boolean }) {
  const { mutateAsync } = useDrain();
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const here = useRef(true);
  const report = useRef(onLeft);
  useEffect(() => {
    report.current = onLeft;
  });

  const run = useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      while (here.current) {
        const answer = await mutateAsync();
        report.current(answer.left);
        if (answer.left === 0) break;
        if (answer.removed === 0) {
          setError("Ни один файл не снялся, попробуй чуть позже");
          break;
        }
      }
    } catch (failure) {
      setError(failureText(failure));
    }
    setRunning(false);
  }, [mutateAsync]);

  const started = useRef(false);
  useEffect(() => {
    here.current = true;
    if (auto && !started.current) {
      started.current = true;
      void Promise.resolve().then(run);
    }
    return () => {
      here.current = false;
    };
  }, [auto, run]);

  return (
    <SettingGroup testId="ops-drain">
      <SettingRow
        label={`Файлов ещё в хранилище: ${formatNum(left)}`}
        hint={running ? "Снимаю порциями, можно не ждать: остаток снимет плановая уборка" : "Снимаются порциями до нуля. Что не снимется сейчас, снимет плановая уборка"}
        below={error ? <p role="alert" className="text-[12px] font-medium leading-4 text-danger">{error}</p> : undefined}
      >
        <Button size="sm" variant="secondary" loading={running} onClick={() => void run()} data-testid="ops-drain-run">
          Снять файлы
        </Button>
      </SettingRow>
    </SettingGroup>
  );
}

/** Whoever was here in the last day: a wipe of a living company deserves a second look at the name. */
function LiveNote({ card, at }: { card: CompanyCard; at: number }) {
  const seen = card.people.map((person) => person.last_seen_at).filter((iso): iso is string => iso !== null && at - Date.parse(iso) < DAY_MS);
  if (seen.length === 0) return null;
  const last = seen.reduce((latest, iso) => (iso > latest ? iso : latest));
  return (
    <p className="text-[13px] font-medium leading-[18px] text-warn" data-testid="ops-live-note">
      Компанией пользуются: людей за сутки {seen.length}, последний вход {whenAqtobe(last)}. Точно эта компания?
    </p>
  );
}

function WipeDialog({ card, footprint, at, onClose, onDone }: { card: CompanyCard; footprint: Footprint; at: number; onClose: () => void; onDone: (answer: WipeAnswer) => void }) {
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
      waiting={gone.length === 0 && files === 0 ? "Очищать нечего: рабочих данных нет" : null}
      onClose={onClose}
      onSubmit={async (reason) => {
        onDone(await wipe.mutateAsync({ confirm_name: card.name, reason, client_request_id: requestId }));
      }}
    >
      <LiveNote card={card} at={at} />
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

function PurgeDialog({ card, footprint, at, onClose, onDone }: { card: CompanyCard; footprint: Footprint; at: number; onClose: () => void; onDone: (answer: PurgeAnswer) => void }) {
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
      <LiveNote card={card} at={at} />
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
  // a wipe that left files goes on to take them off by itself
  const [wiped, setWiped] = useState(false);

  if (footprint.isPending) return <PanelBones />;
  if (!footprint.data) return <OpsFailure error={footprint.error} onRetry={() => void footprint.refetch()} />;

  const data = footprint.data;
  const all = footprintRows(data);
  const rows = all.filter((row) => row.count > 0);
  const queued = left ?? data.files_queued;
  const nothingToWipe = !rows.some((row) => !row.survivesWipe) && filesWiped(data) === 0;
  const until = data.last_export ? whenAqtobe(new Date(Date.parse(data.last_export.at) + DAY_MS).toISOString()) : null;
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
        {all.length > rows.length ? (
          <p className="text-[12px] leading-4 text-muted">
            Ещё {all.length - rows.length} {pluralRu(all.length - rows.length, ["таблица пуста", "таблицы пусты", "таблиц пусты"])}
          </p>
        ) : null}
      </section>

      <div className="flex min-w-0 flex-col gap-5">
        <section className="flex flex-col gap-2">
          <SectionLabel>Действия</SectionLabel>
          <SettingGroup>
            <ActionRow
              hint={
                !canExport ? (
                  "Запись в папку умеют только Chrome и Edge, открой консоль в одном из них"
                ) : data.last_export ? (
                  <>
                    Последняя выгрузка <When iso={data.last_export.at} />, контрольная сумма {data.last_export.sha256.slice(0, 8)}
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
            <ActionRow danger hint={nothingToWipe ? "Очищать нечего: рабочих данных нет" : "Задачи, переписка, очки и файлы исчезнут, люди и настройки останутся"}>
              <Button size="sm" variant="danger" disabled={nothingToWipe} onClick={() => preview("wipe")} data-testid="ops-wipe">
                Очистить рабочие данные
              </Button>
            </ActionRow>
            <ActionRow
              danger
              hint={
                fresh
                  ? `Удаление открыто до ${until}: есть свежая выгрузка`
                  : data.last_export
                    ? "Выгрузка старше суток: сделай новую, и удаление откроется на 24 часа"
                    : "Сначала выгрузка: удаление открывается на 24 часа после неё, чтобы не потерять данные без копии"
              }
            >
              <Button size="sm" variant="danger" disabled={!fresh} onClick={() => preview("purge")} data-testid="ops-purge">
                Удалить компанию
              </Button>
            </ActionRow>
          </SettingGroup>
        </section>

        {queued > 0 ? <DrainBar key={wiped ? "wiped" : "queued"} auto={wiped} left={queued} onLeft={setLeft} /> : null}

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
      </div>

      {dialog === "wipe" ? (
        <WipeDialog
          card={card}
          footprint={data}
          at={footprint.dataUpdatedAt}
          onClose={() => setDialog(null)}
          onDone={(answer) => {
            const removed = Object.values(answer.rows).reduce((sum, count) => sum + count, 0);
            toast(`Очищено ${formatNum(removed)} ${pluralRu(removed, ["строка", "строки", "строк"])}`);
            setWiped(answer.files_left > 0);
            setLeft(answer.files_left);
          }}
        />
      ) : null}
      {dialog === "purge" ? <PurgeDialog card={card} footprint={data} at={footprint.dataUpdatedAt} onClose={() => setDialog(null)} onDone={onPurged} /> : null}
      {folder ? <ExportRun card={card} folder={folder} onClose={() => setFolder(null)} /> : null}
    </div>
  );
}
