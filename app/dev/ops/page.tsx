"use client";

import { useState } from "react";

import { DeskPage, PageTitle } from "@/components/desk/ui/PageTitle";
import { SegmentTabs } from "@/components/desk/ui/Toolbar";
import { ActionDialog } from "@/components/ops/ActionDialog";
import { FreshDialog } from "@/components/ops/FreshPrompt";
import { AuditLogView } from "@/components/ops/log/AuditLog";
import { CodeStep, EnrollStep, LoginCard, PasswordStep } from "@/components/ops/login/OpsLogin";
import { OperatorsView } from "@/components/ops/operators/OperatorList";
import { RegistryView } from "@/components/ops/registry/CompanyRegistry";
import { OpsFrame } from "@/components/ops/shell/OpsFrame";
import { OpsProviders } from "@/components/ops/shell/OpsProviders";
import { Button } from "@/components/ui/Button";
import { OpsError } from "@/lib/ops/client";
import type { AuditRow, CompanyRow, EnrollAnswer, OperatorRow } from "@/lib/ops/contract";

const COMPANIES: CompanyRow[] = [
  { id: "c1", name: "Ромашка", slug: "romashka", created_at: "2026-09-01T06:00:00Z", people: 46, active_7d: 38, last_seen_at: "2026-11-04T05:12:00Z", last_parse_at: "2026-11-04T04:58:00Z", parse_errors_24h: 0, queue_depth: 0, queue_age_seconds: null, failed_7d: 0 },
  { id: "c2", name: "Степной транзит", slug: "step-tranzit", created_at: "2026-10-12T06:00:00Z", people: 212, active_7d: 140, last_seen_at: "2026-11-04T05:30:00Z", last_parse_at: "2026-11-04T05:29:00Z", parse_errors_24h: 3, queue_depth: 18, queue_age_seconds: 42, failed_7d: 0 },
  { id: "c3", name: "Компания с очень длинным названием, которое не помещается", slug: null, created_at: "2026-10-20T06:00:00Z", people: 9, active_7d: 2, last_seen_at: null, last_parse_at: null, parse_errors_24h: 0, queue_depth: 4, queue_age_seconds: 1860, failed_7d: 12 },
];

const AUDIT: AuditRow[] = [
  { id: 3, at: "2026-11-04T05:20:00Z", operator_id: "u1", operator_email: "dev@pulse.test", action: "wipe_activity", company_id: "c1", company_name: "Ромашка", target: { confirm_name: "Ромашка" }, reason: "Клиент просит чистый старт перед запуском", result: { rows: { tasks: 120, messages: 418 }, files_queued: 37 } },
  { id: 2, at: "2026-11-03T12:01:00Z", operator_id: "u1", operator_email: "dev@pulse.test", action: "issue_login_code", company_id: "c2", company_name: "Степной транзит", target: { user_id: "p7" }, reason: "Директор сменил телефон", result: null },
  { id: 1, at: "2026-11-02T09:00:00Z", operator_id: null, operator_email: null, action: "grant_operator", company_id: null, company_name: null, target: { user_id: "u1" }, reason: "Первый разработчик", result: {} },
];

const OPERATORS: OperatorRow[] = [
  { user_id: "u1", email: "dev@pulse.test", note: "Основной", created_at: "2026-11-02T09:00:00Z", revoked_at: null, last_seen_at: "2026-11-04T05:20:00Z" },
  { user_id: "u2", email: "gone@pulse.test", note: null, created_at: "2026-11-02T09:05:00Z", revoked_at: "2026-11-03T10:00:00Z", last_seen_at: null },
];

const ENROLL: EnrollAnswer = {
  factor_id: "stub",
  qr_svg: "",
  secret: "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP",
  uri: "otpauth://totp/Pulse:dev@pulse.test?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=Pulse",
};

const STUB_ERROR = new OpsError(500, "internal", "Что-то пошло не так, попробуй ещё раз");

type View = "registry" | "log" | "operators" | "login" | "dialogs";
type Fill = "data" | "empty" | "loading" | "error";
type Dialogs = "action" | "danger" | "fails" | "cancelled" | "fresh" | null;

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const noop = () => undefined;

function stateOf<T>(fill: Fill, full: T[]) {
  return {
    rows: fill === "data" ? full : fill === "empty" ? [] : undefined,
    loading: fill === "loading",
    error: fill === "error" ? STUB_ERROR : null,
  };
}

function LoginShelf() {
  const [step, setStep] = useState<"password" | "enroll" | "code">("password");
  const check = async (code: string) => {
    await pause(400);
    if (code !== "123456") throw new OpsError(422, "validation_error", "Код не подошёл, возьми следующий");
    setStep("password");
  };
  const pass = async () => {
    await pause(400);
    setStep("enroll");
  };
  return (
    <div className="grid place-items-center rounded-[12px] border border-border bg-bg p-10">
      <LoginCard wide={step === "enroll"}>
        {step === "password" ? <PasswordStep onSubmit={pass} /> : null}
        {step === "enroll" ? <EnrollStep enroll={ENROLL} onVerify={check} onBack={() => setStep("code")} /> : null}
        {step === "code" ? <CodeStep onVerify={check} onBack={() => setStep("password")} /> : null}
      </LoginCard>
    </div>
  );
}

function DialogShelf() {
  const [open, setOpen] = useState<Dialogs>(null);
  const close = () => setOpen(null);
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="secondary" onClick={() => setOpen("action")}>
        Обычное действие
      </Button>
      <Button size="sm" variant="secondary" onClick={() => setOpen("danger")}>
        Опасное, с названием
      </Button>
      <Button size="sm" variant="secondary" onClick={() => setOpen("fails")}>
        Ответ с ошибкой
      </Button>
      <Button size="sm" variant="secondary" onClick={() => setOpen("cancelled")}>
        Отмена кода
      </Button>
      <Button size="sm" variant="secondary" onClick={() => setOpen("fresh")}>
        Свежий код
      </Button>
      {open === "action" ? (
        <ActionDialog title="Сбросить сессии" description="Человек выйдет на всех устройствах." confirmLabel="Сбросить" onClose={close} onSubmit={() => pause(600).then(noop)} />
      ) : null}
      {open === "danger" ? (
        <ActionDialog
          title="Удалить компанию"
          description="Люди, задачи и файлы удалятся без возврата."
          confirmLabel="Удалить навсегда"
          danger
          confirmName="Ромашка"
          onClose={close}
          onSubmit={() => pause(600).then(noop)}
        />
      ) : null}
      {open === "fails" ? (
        <ActionDialog
          title="Очистить активность"
          confirmLabel="Очистить"
          onClose={close}
          onSubmit={async () => {
            await pause(400);
            throw new OpsError(409, "export_required", "Сначала сделай выгрузку");
          }}
        />
      ) : null}
      {open === "cancelled" ? (
        <ActionDialog
          title="Поправить очки"
          description="Отмена кода оставляет диалог открытым и без красной строки."
          confirmLabel="Поправить"
          onClose={close}
          onSubmit={async () => {
            await pause(300);
            throw new OpsError(428, "fresh_required", "Нужен код из приложения");
          }}
        />
      ) : null}
      <FreshDialog
        open={open === "fresh"}
        onCancel={close}
        onVerify={async (code) => {
          await pause(400);
          if (code !== "123456") throw new OpsError(422, "validation_error", "Код не подошёл, возьми следующий");
          close();
        }}
      />
    </div>
  );
}

/** /dev/ops: the console's frame and shared screens on made-up data, every state of each (D-157). Code that passes: 123456. */
export default function OpsSandboxPage() {
  const [view, setView] = useState<View>("registry");
  const [fill, setFill] = useState<Fill>("data");
  const [company, setCompany] = useState<string | null>(null);
  const shelf = view === "login" || view === "dialogs";

  const audit = stateOf(fill, company ? AUDIT.filter((row) => row.company_id === company) : AUDIT);

  return (
    <OpsProviders>
      <OpsFrame email="dev@pulse.test">
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-6 py-3">
          <SegmentTabs
            aria-label="Экран"
            value={view}
            onChange={setView}
            items={[
              { value: "registry", label: "Компании" },
              { value: "log", label: "Журнал" },
              { value: "operators", label: "Разработчики" },
              { value: "login", label: "Вход" },
              { value: "dialogs", label: "Диалоги" },
            ]}
          />
          {shelf ? null : (
            <SegmentTabs
              aria-label="Состояние"
              value={fill}
              onChange={setFill}
              items={[
                { value: "data", label: "Данные" },
                { value: "empty", label: "Пусто" },
                { value: "loading", label: "Загрузка" },
                { value: "error", label: "Ошибка" },
              ]}
            />
          )}
        </div>
        {view === "registry" ? <RegistryView {...stateOf(fill, COMPANIES)} onRetry={noop} onOpen={noop} /> : null}
        {view === "log" ? (
          <AuditLogView
            {...audit}
            onRetry={noop}
            hasMore={fill === "data"}
            loadingMore={false}
            moreError={null}
            onMore={noop}
            companies={COMPANIES}
            company={company}
            onCompany={setCompany}
          />
        ) : null}
        {view === "operators" ? <OperatorsView {...stateOf(fill, OPERATORS)} onRetry={noop} /> : null}
        {view === "login" ? (
          <DeskPage>
            <PageTitle title="Вход" state={{ text: "«Дальше» ведёт к QR, «Назад» с QR ведёт к коду" }} />
            <LoginShelf />
          </DeskPage>
        ) : null}
        {view === "dialogs" ? (
          <DeskPage>
            <PageTitle title="Диалоги" state={{ text: "Код, который проходит: 123456" }} />
            <DialogShelf />
          </DeskPage>
        ) : null}
      </OpsFrame>
    </OpsProviders>
  );
}
