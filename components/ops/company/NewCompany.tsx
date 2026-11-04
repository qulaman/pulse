"use client";

import Link from "next/link";
import { useState, type FormEvent, type ReactNode } from "react";

import { FormRow, INPUT } from "@/components/desk/team/fields";
import { EmptyState } from "@/components/desk/ui/EmptyState";
import { DeskPage, PageTitle } from "@/components/desk/ui/PageTitle";
import { SectionLabel } from "@/components/desk/ui/SectionLabel";
import { Switch } from "@/components/desk/ui/SettingRow";
import { CodeShow } from "@/components/ops/company/CodeShow";
import { Choice } from "@/components/ops/company/shared";
import { emailReady, PARSER_ITEMS, PARSER_NOTE, slugReady, suggestSlug, type ParserProvider } from "@/components/ops/company/words";
import { REASON_MAX, REASON_MIN, reasonReady } from "@/components/ops/ReasonField";
import { failureText } from "@/components/ops/shell/failure";
import { Button } from "@/components/ui/Button";
import { OpsError } from "@/lib/ops/client";
import { useAttemptId, useCreateCompany } from "@/lib/ops/company-queries";
import type { CreateCompanyAnswer, CreateCompanyBody } from "@/lib/ops/contract";

const OPEN_LINK = "btn-primary inline-flex h-9 items-center rounded-[11px] px-4 font-display text-[14px] font-semibold leading-4 text-bg transition-transform duration-[120ms] active:scale-[0.98]";

type Errors = Partial<Record<"name" | "slug" | "director" | "email" | "reason" | "form", string>>;

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <SectionLabel>{title}</SectionLabel>
      <div className="rounded-[12px] border border-border bg-surface/40">{children}</div>
    </section>
  );
}

/** After the press: the company stands, and the director's code is on screen this one time. */
function Created({ name, created }: { name: string; created: CreateCompanyAnswer }) {
  return (
    <DeskPage width="narrow">
      <PageTitle title={name} state={{ text: `Компания создана, адрес /c/${created.slug}`, tone: "ok" }} light="ok" />
      {created.login ? (
        <div className="rounded-[12px] border border-border bg-surface/40 px-5 py-4">
          <CodeShow login={created.login} />
        </div>
      ) : (
        <EmptyState title="Код уже показывали" hint="Этот запрос уже выполнен, а код выдаётся один раз. Новый код директору выдаётся в разделе «Люди»." />
      )}
      <div>
        <Link href={`/ops/c/${created.company_id}`} className={OPEN_LINK} data-testid="ops-open-company">
          Открыть компанию
        </Link>
      </div>
    </DeskPage>
  );
}

/**
 * «Новая компания»: everything on one screen, the reason included: there is nothing else to press,
 * so a dialog would only add a click. Fields the server refuses (an address or an email already
 * taken) answer under themselves. The address follows the name until it is edited by hand.
 */
export function NewCompany() {
  const [name, setName] = useState("");
  const [slugTyped, setSlugTyped] = useState<string | null>(null);
  const [directorName, setDirectorName] = useState("");
  const [position, setPosition] = useState("");
  const [email, setEmail] = useState("");
  const [provider, setProvider] = useState<ParserProvider>("anthropic");
  const [points, setPoints] = useState(false);
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [created, setCreated] = useState<{ name: string; answer: CreateCompanyAnswer } | null>(null);

  const create = useCreateCompany();
  const attemptId = useAttemptId();
  const slug = slugTyped ?? suggestSlug(name);

  const check = (): Errors => {
    const found: Errors = {};
    if (name.trim().length < 2) found.name = "Нужно название, хотя бы 2 буквы";
    if (!slugReady(slug)) found.slug = "От 2 до 40 символов: маленькие латинские буквы, цифры и дефис";
    if (directorName.trim().length < 2) found.director = "Нужно имя директора";
    if (email.trim() && !emailReady(email)) found.email = "Похоже, в почте опечатка";
    if (!reasonReady(reason)) found.reason = `Хотя бы ${REASON_MIN} символов: останется в журнале`;
    return found;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const found = check();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    const values: Omit<CreateCompanyBody, "reason" | "client_request_id"> = {
      name: name.trim(),
      slug,
      director: {
        full_name: directorName.trim(),
        position: position.trim() || undefined,
        email: email.trim().toLowerCase() || undefined,
      },
      parser: { provider },
      points_enabled: points,
    };
    const trimmed = reason.trim();
    try {
      const answer = await create.mutateAsync({ ...values, reason: trimmed, client_request_id: attemptId({ ...values, reason: trimmed }) });
      setCreated({ name: values.name, answer });
    } catch (failure) {
      if (failure instanceof OpsError && failure.code === "slug_taken") setErrors({ slug: failure.message });
      else if (failure instanceof OpsError && failure.code === "email_exists") setErrors({ email: failure.message });
      // the operator closed the code dialog: nothing went wrong, the form waits
      else if (!(failure instanceof OpsError && failure.code === "fresh_required")) setErrors({ form: failureText(failure) });
    }
  };

  if (created) return <Created name={created.name} created={created.answer} />;

  return (
    <DeskPage width="narrow">
      <PageTitle title="Новая компания" />
      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-5" noValidate data-testid="ops-new-company">
        <Group title="Компания">
          <FormRow label="Название" htmlFor="ops-name" error={errors.name}>
            <input id="ops-name" className={INPUT} value={name} autoFocus autoComplete="off" maxLength={120} onChange={(event) => setName(event.target.value)} data-testid="ops-new-name" />
          </FormRow>
          <FormRow label="Адрес" htmlFor="ops-slug" error={errors.slug} hint="Ссылка для входа людей этой компании. Подставляется из названия, можно поправить.">
            <div className="field flex h-9 items-center pl-3 pr-1">
              <span className="shrink-0 text-[14px] leading-5 text-muted">/c/</span>
              <input
                id="ops-slug"
                className="min-w-0 flex-1 bg-transparent pr-2 text-[14px] leading-5 outline-none"
                value={slug}
                maxLength={40}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                onChange={(event) => {
                  setSlugTyped(event.target.value.toLowerCase());
                  setErrors((found) => ({ ...found, slug: undefined }));
                }}
                data-testid="ops-new-slug"
              />
            </div>
          </FormRow>
        </Group>

        <Group title="Директор">
          <FormRow label="Имя и фамилия" htmlFor="ops-director" error={errors.director}>
            <input id="ops-director" className={INPUT} value={directorName} autoComplete="off" maxLength={120} onChange={(event) => setDirectorName(event.target.value)} data-testid="ops-new-director" />
          </FormRow>
          <FormRow label="Должность" htmlFor="ops-position" hint="Необязательно">
            <input id="ops-position" className={INPUT} value={position} autoComplete="off" maxLength={120} onChange={(event) => setPosition(event.target.value)} />
          </FormRow>
          <FormRow label="Почта" htmlFor="ops-email" error={errors.email} hint="Необязательно: директор всё равно войдёт по коду, почта нужна для входа по паролю.">
            <input
              id="ops-email"
              type="email"
              className={INPUT}
              value={email}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              onChange={(event) => {
                setEmail(event.target.value);
                setErrors((found) => ({ ...found, email: undefined }));
              }}
              data-testid="ops-new-email"
            />
          </FormRow>
        </Group>

        <Group title="Как работает">
          <FormRow label="Разбор голоса" hint={PARSER_NOTE}>
            <Choice name="ops-provider" label="Модель разбора" value={provider} onChange={setProvider} items={PARSER_ITEMS} />
          </FormRow>
          <FormRow label="Очки">
            <div className="flex h-9 items-center gap-3 text-[14px] leading-5">
              <Switch on={points} onChange={setPoints} label="Очки" />
              {points ? "Рейтинг и магазин включены" : "Выключены, директор включит сам"}
            </div>
          </FormRow>
        </Group>

        <Group title="Основание">
          <FormRow label="Причина" htmlFor="ops-reason" error={errors.reason} hint={errors.reason ? undefined : "Останется в журнале"}>
            <textarea
              id="ops-reason"
              rows={2}
              className="field w-full px-3 py-2 text-[14px] leading-5"
              value={reason}
              maxLength={REASON_MAX}
              placeholder="Зачем это нужно, по чьей просьбе"
              onChange={(event) => setReason(event.target.value)}
              data-testid="ops-new-reason"
            />
          </FormRow>
        </Group>

        {errors.form ? (
          <p role="alert" className="text-[13px] font-medium leading-5 text-danger" data-testid="ops-new-error">
            {errors.form}
          </p>
        ) : null}
        <div className="flex items-center gap-3">
          <Button size="sm" type="submit" loading={create.isPending} data-testid="ops-new-submit">
            Создать компанию
          </Button>
          <Link href="/ops" className="text-[13px] font-medium leading-4 text-muted transition-colors duration-[120ms] hover:text-text">
            Отмена
          </Link>
        </div>
      </form>
    </DeskPage>
  );
}
