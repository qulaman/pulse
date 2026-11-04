"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";

import { CopyButton } from "@/components/desk/team/fields";
import { Dialog } from "@/components/desk/ui/Dialog";
import { ActionDialog } from "@/components/ops/ActionDialog";
import { Outcome, OutcomeLine, useOnce } from "@/components/ops/company/shared";
import { bytesText } from "@/components/ops/company/words";
import { failureText } from "@/components/ops/shell/failure";
import { Button } from "@/components/ui/Button";
import { formatNum } from "@/lib/desk/format";
import { newRequestId } from "@/lib/ops/client";
import type { CompanyCard, ExportStartAnswer } from "@/lib/ops/contract";
import { ExportCancelled, ExportError, opsExportApi, runExport, type ExportFolder, type ExportProgress, type ExportResult } from "@/lib/ops/export";

type Phase = { kind: "ask" } | { kind: "run"; progress: ExportProgress | null } | { kind: "done"; result: ExportResult } | { kind: "cancelled" } | { kind: "failed"; text: string };

/** Disk trouble speaks in the browser's words: said plainly here, the rest as the console does. */
function exportFailure(failure: unknown): string {
  if (failure instanceof ExportError) return failure.message;
  const name = (failure as { name?: string }).name;
  if (name === "QuotaExceededError") return "На диске не хватило места";
  if (name === "NotAllowedError") return "Браузер не дал писать в эту папку";
  return failureText(failure);
}

function RunningBody({ progress, onCancel }: { progress: ExportProgress | null; onCancel: () => void }) {
  const stage = !progress
    ? "Начинаю…"
    : progress.stage === "tables"
      ? `Таблицы: ${progress.tablesDone} из ${progress.tablesTotal}`
      : progress.stage === "files"
        ? `Файлы: ${formatNum(progress.filesDone)}`
        : "Записываю манифест…";
  return (
    <div className="flex flex-col gap-4" data-testid="ops-export-run">
      <p className="flex items-center gap-2 text-[14px] leading-5">
        <span aria-hidden className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-accent" />
        {stage}
      </p>
      {progress ? (
        <p className="nums text-[13px] leading-[18px] text-muted">
          Строк {formatNum(progress.rows)}, файлов {formatNum(progress.filesDone)}, {bytesText(progress.bytes)}
        </p>
      ) : null}
      <p className="text-[13px] leading-[18px] text-muted">Не закрывай вкладку, пока выгрузка идёт. На всё есть 30 минут.</p>
      <div className="flex justify-end">
        <Button size="sm" variant="ghost" onClick={onCancel} data-testid="ops-export-cancel">
          Отменить
        </Button>
      </div>
    </div>
  );
}

function DoneBody({ folder, result, onClose }: { folder: string; result: ExportResult; onClose: () => void }) {
  return (
    <div className="flex flex-col gap-4" data-testid="ops-export-done">
      <Outcome title={`Записано в папку «${folder}»`}>
        <OutcomeLine count={formatNum(result.totals.rows)}>Строк</OutcomeLine>
        <OutcomeLine count={formatNum(result.totals.files)}>Файлов</OutcomeLine>
        <OutcomeLine count={bytesText(result.totals.bytes)}>Объём файлов</OutcomeLine>
      </Outcome>
      <div className="flex flex-col gap-1">
        <p className="text-[13px] font-medium leading-5 text-muted">Контрольная сумма манифеста</p>
        <div className="flex min-w-0 items-center gap-1">
          <span className="min-w-0 select-all break-all font-mono text-[12px] leading-4" data-testid="ops-export-sha">
            {result.sha256}
          </span>
          <CopyButton text={() => result.sha256} label="Скопировать сумму" done="Скопировал сумму" />
        </div>
      </div>
      <p className="text-[13px] leading-[18px] text-muted">С этого момента удаление компании открыто на 24 часа.</p>
      <div className="flex justify-end">
        <Button size="sm" onClick={onClose} data-autofocus>
          Готово
        </Button>
      </div>
    </div>
  );
}

function StoppedBody({ text, tone, onClose }: { text: string; tone?: "danger"; onClose: () => void }) {
  return (
    <div className="flex flex-col gap-4" data-testid="ops-export-stopped">
      <p role={tone ? "alert" : undefined} className={`text-[14px] leading-5 ${tone ? "font-medium text-danger" : ""}`}>
        {text}
      </p>
      <p className="text-[13px] leading-[18px] text-muted">Что успело записаться, осталось в папке. Такая выгрузка не считается: удаление компании по ней не откроется.</p>
      <div className="flex justify-end">
        <Button size="sm" onClick={onClose} data-autofocus>
          Закрыть
        </Button>
      </div>
    </div>
  );
}

/**
 * The export after the folder was picked: the reason and the code first, then the run with its
 * progress and «Отменить». While it runs nothing else takes the dialog away.
 */
export function ExportRun({ card, folder, onClose }: { card: CompanyCard; folder: ExportFolder; onClose: () => void }) {
  const requestId = useOnce(newRequestId);
  const queryClient = useQueryClient();
  const api = useMemo(() => opsExportApi(card.id), [card.id]);
  const [phase, setPhase] = useState<Phase>({ kind: "ask" });
  const controller = useRef<AbortController | null>(null);
  // the action dialog closes itself after its submit, and that must not end the run it started
  const started = useRef(false);

  const run = async (answer: ExportStartAnswer) => {
    const control = new AbortController();
    controller.current = control;
    setPhase({ kind: "run", progress: null });
    try {
      const result = await runExport({
        started: answer,
        company: { id: card.id, name: card.name, slug: card.slug },
        folder,
        api,
        signal: control.signal,
        onProgress: (progress) => setPhase({ kind: "run", progress }),
      });
      setPhase({ kind: "done", result });
      void queryClient.invalidateQueries();
    } catch (failure) {
      if (failure instanceof ExportCancelled) setPhase({ kind: "cancelled" });
      else setPhase({ kind: "failed", text: exportFailure(failure) });
    }
  };

  if (phase.kind === "ask") {
    return (
      <ActionDialog
        title="Выгрузить компанию"
        description={`Таблицы и файлы компании лягут в папку «${folder.name}» на этом компьютере. Лучше пустая папка: совпавшие файлы перезапишутся. Заметки и доски директора личные, они в выгрузку не входят.`}
        confirmLabel="Выгрузить"
        onClose={() => {
          if (!started.current) onClose();
        }}
        onSubmit={async (reason) => {
          const answer = await api.start({ reason, client_request_id: requestId });
          started.current = true;
          void run(answer);
        }}
      />
    );
  }

  const running = phase.kind === "run";
  return (
    <Dialog open title={phase.kind === "done" ? "Выгрузка готова" : running ? "Выгрузка" : "Выгрузка не закончена"} width="sm" onClose={() => (running ? undefined : onClose())}>
      {phase.kind === "run" ? <RunningBody progress={phase.progress} onCancel={() => controller.current?.abort()} /> : null}
      {phase.kind === "done" ? <DoneBody folder={folder.name} result={phase.result} onClose={onClose} /> : null}
      {phase.kind === "cancelled" ? <StoppedBody text="Выгрузка отменена." onClose={onClose} /> : null}
      {phase.kind === "failed" ? <StoppedBody text={phase.text} tone="danger" onClose={onClose} /> : null}
    </Dialog>
  );
}
