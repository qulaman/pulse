"use client";

import { useMemo, useState } from "react";

import { INPUT } from "@/components/desk/team/fields";
import { DataGrid, type Column } from "@/components/desk/ui/DataGrid";
import { EmptyState } from "@/components/desk/ui/EmptyState";
import { MenuButton, type MenuItem } from "@/components/desk/ui/Menu";
import { Num } from "@/components/desk/ui/Num";
import { Switch } from "@/components/desk/ui/SettingRow";
import { SearchField, Select, Toolbar } from "@/components/desk/ui/Toolbar";
import { ActionDialog } from "@/components/ops/ActionDialog";
import { CodeDialog } from "@/components/ops/company/CodeShow";
import { Field, useOnce } from "@/components/ops/company/shared";
import { emailReady, firstName, roleText } from "@/components/ops/company/words";
import { When } from "@/components/ops/shell/When";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { formatNum } from "@/lib/desk/format";
import { newRequestId } from "@/lib/ops/client";
import { useAddPerson, useAdjustPoints, useIssueCode, useRevokeSessions, useUpdatePerson } from "@/lib/ops/company-queries";
import { OPS_PERSON_ROLES, type CardPerson, type CompanyCard, type IssuedCode, type UpdatePersonBody } from "@/lib/ops/contract";

type OpsRole = (typeof OPS_PERSON_ROLES)[number];
type PersonAction = "code" | "sessions" | "edit" | "points";
type Open = { action: PersonAction; person: CardPerson } | { action: "add" } | null;

const MENU_BUTTON = "flex h-8 w-8 items-center justify-center rounded-[10px] text-[18px] leading-none text-muted transition-colors duration-[120ms] hover:bg-surface-2 hover:text-text";

/** The base refuses these: a director changes through «Директор» (their name only here), a screen stays a screen. */
const roleLocked = (person: CardPerson) => person.role === "director" || person.role === "tv";
const activeLocked = (person: CardPerson) => person.role === "director";

function byTime(a: string | null, b: string | null): number {
  return (a ?? "").localeCompare(b ?? "");
}

function IssueCodeDialog({ companyId, person, onClose, onIssued }: { companyId: string; person: CardPerson; onClose: () => void; onIssued: (login: IssuedCode | null) => void }) {
  const requestId = useOnce(newRequestId);
  const issue = useIssueCode();
  return (
    <ActionDialog
      title={`Выдать код · ${person.full_name}`}
      description="Восемь цифр на 15 минут, один вход. Прежний код, если он был, перестанет работать. Код будет показан один раз."
      confirmLabel="Выдать код"
      onClose={onClose}
      onSubmit={async (reason) => {
        const answer = await issue.mutateAsync({ personId: person.id, body: { reason, client_request_id: requestId, company_id: companyId } });
        onIssued(answer.login);
      }}
    />
  );
}

function RevokeDialog({ companyId, person, onClose }: { companyId: string; person: CardPerson; onClose: () => void }) {
  const requestId = useOnce(newRequestId);
  const revoke = useRevokeSessions();
  return (
    <ActionDialog
      title={`Сбросить сессии · ${person.full_name}`}
      description={`Вход закроется сразу на всех телефонах и компьютерах (сейчас входов ${person.sessions}, устройств с уведомлениями ${person.devices}), уведомления на них перестанут приходить. Задачи и история останутся. Войти снова можно по новому коду.`}
      confirmLabel="Сбросить сессии"
      danger
      onClose={onClose}
      onSubmit={async (reason) => {
        const answer = await revoke.mutateAsync({ personId: person.id, body: { reason, client_request_id: requestId, company_id: companyId } });
        toast(`Входов закрыто: ${answer.sessions}, устройств: ${answer.devices}`);
      }}
    />
  );
}

function EditDialog({ companyId, person, onClose }: { companyId: string; person: CardPerson; onClose: () => void }) {
  const requestId = useOnce(newRequestId);
  const update = useUpdatePerson();
  const [name, setName] = useState(person.full_name);
  const [position, setPosition] = useState(person.position ?? "");
  const [role, setRole] = useState(person.role);
  const [active, setActive] = useState(person.is_active);

  const locked = roleLocked(person);
  const patch: Pick<UpdatePersonBody, "full_name" | "position" | "role" | "is_active"> = {};
  if (name.trim() !== person.full_name) patch.full_name = name.trim();
  if (position.trim() !== (person.position ?? "")) patch.position = position.trim() || null;
  if (!locked && role !== person.role) patch.role = role as OpsRole;
  if (!activeLocked(person) && active !== person.is_active) patch.is_active = active;

  return (
    <ActionDialog
      title={`Изменить · ${person.full_name}`}
      confirmLabel="Сохранить"
      disabled={Object.keys(patch).length === 0 || name.trim().length < 2}
      onClose={onClose}
      onSubmit={async (reason) => {
        await update.mutateAsync({ personId: person.id, body: { ...patch, reason, client_request_id: requestId, company_id: companyId } });
        toast("Сохранил");
      }}
    >
      <Field label="Имя и фамилия">
        <input className={INPUT} value={name} data-autofocus autoComplete="off" maxLength={120} onChange={(event) => setName(event.target.value)} />
      </Field>
      <Field label="Должность">
        <input className={INPUT} value={position} autoComplete="off" maxLength={120} onChange={(event) => setPosition(event.target.value)} />
      </Field>
      <Field label="Роль" hint={person.role === "director" ? "Директор меняется в разделе «Директор»: туда же переходят его дела." : person.role === "tv" ? "Роль экрана не меняется." : undefined}>
        {locked ? (
          <input className={INPUT} value={roleText(person.role)} readOnly tabIndex={-1} />
        ) : (
          <Select className="w-full" value={role} onChange={(event) => setRole(event.target.value)}>
            {OPS_PERSON_ROLES.map((value) => (
              <option key={value} value={value}>
                {roleText(value)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {activeLocked(person) ? null : (
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[14px] font-medium leading-5">Работает</p>
            <p className="text-[12px] leading-4 text-muted">{active ? "Может входить и получать задачи" : "Вход закроется, задачи и история останутся"}</p>
          </div>
          <Switch on={active} onChange={setActive} label="Работает" />
        </div>
      )}
    </ActionDialog>
  );
}

function parseAmount(text: string): number | null {
  const clean = text.replace(/\s/g, "").replace("−", "-");
  if (!/^[+-]?\d{1,6}$/.test(clean)) return null;
  const value = Number(clean);
  return value !== 0 && Math.abs(value) <= 100_000 ? value : null;
}

function PointsDialog({ companyId, person, onClose }: { companyId: string; person: CardPerson; onClose: () => void }) {
  const requestId = useOnce(newRequestId);
  const adjust = useAdjustPoints();
  const [text, setText] = useState("");
  const amount = parseAmount(text);

  return (
    <ActionDialog
      title={`Очки · ${person.full_name}`}
      description="Новая строка в истории очков, прежние не меняются. Человеку уведомление не придёт."
      confirmLabel="Начислить"
      disabled={amount === null}
      onClose={onClose}
      onSubmit={async (reason) => {
        if (amount === null) return;
        const answer = await adjust.mutateAsync({ personId: person.id, body: { amount, reason, client_request_id: requestId, company_id: companyId } });
        toast(`${firstName(person.full_name)}: теперь ${formatNum(answer.balance)}`);
      }}
    >
      <Field
        label="Сколько"
        hint="Со знаком: +50 или -20. От −100 000 до 100 000, баланс может уйти в минус."
        error={text.trim() && amount === null ? "Нужно целое число, не ноль" : null}
      >
        <input className={INPUT} value={text} data-autofocus inputMode="numeric" autoComplete="off" onChange={(event) => setText(event.target.value)} data-testid="ops-points-amount" />
      </Field>
      <p className="text-[14px] leading-5" data-testid="ops-points-balance">
        <span className="text-muted">Баланс: </span>
        <Num value={person.points} />
        <span className="text-muted"> → </span>
        {amount === null ? <span className="text-muted">?</span> : <Num value={person.points + amount} tone="gold" />}
      </p>
    </ActionDialog>
  );
}

function AddDialog({ companyId, onClose, onAdded }: { companyId: string; onClose: () => void; onAdded: (id: string, name: string) => void }) {
  const requestId = useOnce(newRequestId);
  const add = useAddPerson(companyId);
  const [name, setName] = useState("");
  const [role, setRole] = useState<OpsRole>("employee");
  const [position, setPosition] = useState("");
  const [email, setEmail] = useState("");
  const badEmail = email.trim() !== "" && !emailReady(email);

  return (
    <ActionDialog
      title="Добавить человека"
      confirmLabel="Добавить"
      disabled={name.trim().length < 2 || badEmail}
      onClose={onClose}
      onSubmit={async (reason) => {
        const fullName = name.trim();
        const answer = await add.mutateAsync({
          full_name: fullName,
          role,
          position: position.trim() || undefined,
          email: email.trim().toLowerCase() || undefined,
          reason,
          client_request_id: requestId,
        });
        onAdded(answer.user_id, fullName);
      }}
    >
      <Field label="Имя и фамилия">
        <input className={INPUT} value={name} data-autofocus autoComplete="off" maxLength={120} onChange={(event) => setName(event.target.value)} data-testid="ops-add-name" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Роль">
          <Select className="w-full" value={role} onChange={(event) => setRole(event.target.value as OpsRole)}>
            {OPS_PERSON_ROLES.map((value) => (
              <option key={value} value={value}>
                {roleText(value)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Должность" hint="Необязательно">
          <input className={INPUT} value={position} autoComplete="off" maxLength={120} onChange={(event) => setPosition(event.target.value)} />
        </Field>
      </div>
      <Field label="Почта" hint="Необязательно: без неё человек входит по коду." error={badEmail ? "Похоже, в почте опечатка" : null}>
        <input type="email" className={INPUT} value={email} autoComplete="off" autoCapitalize="none" spellCheck={false} onChange={(event) => setEmail(event.target.value)} />
      </Field>
    </ActionDialog>
  );
}

/** «Люди»: everyone of the company, the kiosk included, each action behind the row's «⋯». */
export function PeoplePanel({ card }: { card: CompanyCard }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [open, setOpen] = useState<Open>(null);
  const [code, setCode] = useState<{ login: IssuedCode; tv: boolean } | null>(null);

  const close = () => setOpen(null);
  const words = query.trim().toLowerCase();
  const rows = useMemo(
    () =>
      card.people.filter((person) => !words || [person.full_name, person.position, person.email].some((text) => text?.toLowerCase().includes(words))),
    [card.people, words],
  );

  const columns = useMemo<Column<CardPerson>[]>(() => {
    const menu = (person: CardPerson): MenuItem[] => [
      { key: "code", label: "Выдать код", onSelect: () => setOpen({ action: "code", person }) },
      { key: "sessions", label: "Сбросить сессии", onSelect: () => setOpen({ action: "sessions", person }) },
      { key: "edit", label: "Изменить", onSelect: () => setOpen({ action: "edit", person }) },
      ...(person.role === "tv" ? [] : [{ key: "points", label: "Очки", onSelect: () => setOpen({ action: "points", person }) }]),
    ];
    return [
      {
        key: "name",
        title: "Человек",
        sort: (a, b) => a.full_name.localeCompare(b.full_name, "ru"),
        render: (person) => (
          <div className="min-w-0">
            <p className={`truncate font-medium ${person.is_active ? "" : "text-muted"}`} title={person.full_name}>
              {person.full_name}
            </p>
            <p className="truncate text-[12px] leading-4 text-muted">{person.is_active ? person.position || " " : "не работает"}</p>
          </div>
        ),
      },
      { key: "role", title: "Роль", width: "128px", sort: (a, b) => a.role.localeCompare(b.role), render: (person) => <span className="block truncate text-[13px]">{roleText(person.role)}</span> },
      {
        key: "email",
        title: "Почта",
        render: (person) =>
          person.email ? (
            <span className="block truncate text-[13px]" title={person.email}>
              {person.email}
            </span>
          ) : (
            <span className="text-muted/60">—</span>
          ),
      },
      { key: "seen", title: "Вход", width: "112px", sort: (a, b) => byTime(a.last_seen_at, b.last_seen_at), render: (person) => <When iso={person.last_seen_at} /> },
      { key: "sessions", title: "Сессии", width: "76px", align: "right", sort: (a, b) => a.sessions - b.sessions, render: (person) => <Num value={person.sessions} /> },
      { key: "points", title: "Очки", width: "76px", align: "right", sort: (a, b) => a.points - b.points, render: (person) => <Num value={person.points} /> },
      {
        key: "menu",
        title: "",
        width: "48px",
        align: "center",
        render: (person) => (
          <MenuButton items={menu(person)} label={`Действия: ${person.full_name}`} className={MENU_BUTTON}>
            ⋯
          </MenuButton>
        ),
      },
    ];
  }, []);

  return (
    <div className="flex flex-col gap-3" data-testid="ops-people">
      <Toolbar
        end={
          <Button size="sm" onClick={() => setOpen({ action: "add" })} data-testid="ops-add-person">
            Добавить человека
          </Button>
        }
      >
        <SearchField value={query} onChange={setQuery} placeholder="Имя, должность, почта" aria-label="Поиск по людям" />
      </Toolbar>

      <DataGrid
        aria-label="Люди компании"
        columns={columns}
        rows={rows}
        rowKey={(person) => person.id}
        selectedKey={selected}
        onSelect={(person) => setSelected(person.id)}
        onActivate={(person) => setOpen({ action: "edit", person })}
        rowTone={(person) => (person.is_active ? null : "muted")}
        empty={words ? <EmptyState title="Никого не нашлось" hint="Проверь написание или очисти поиск." /> : <EmptyState title="В компании пока никого" hint="Добавь первого человека кнопкой справа сверху." />}
      />

      {open?.action === "code" ? (
        <IssueCodeDialog
          companyId={card.id}
          person={open.person}
          onClose={close}
          onIssued={(login) => {
            if (login) setCode({ login, tv: open.person.role === "tv" });
            else toast("Этот код уже выдан и показан, для нового открой меню ещё раз");
          }}
        />
      ) : null}
      {open?.action === "sessions" ? <RevokeDialog companyId={card.id} person={open.person} onClose={close} /> : null}
      {open?.action === "edit" ? <EditDialog companyId={card.id} person={open.person} onClose={close} /> : null}
      {open?.action === "points" ? <PointsDialog companyId={card.id} person={open.person} onClose={close} /> : null}
      {open?.action === "add" ? (
        <AddDialog
          companyId={card.id}
          onClose={close}
          onAdded={(id, name) => {
            setSelected(id);
            toast(`${firstName(name)} в компании. Код входа выдаётся в меню строки`);
          }}
        />
      ) : null}
      {code ? <CodeDialog login={code.login} tv={code.tv} onClose={() => setCode(null)} /> : null}
    </div>
  );
}
