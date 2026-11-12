"use client";

import { Check, Circle, KeyRound, Mail, Phone } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";

import { DeskPage, PageTitle } from "@/components/desk/ui/PageTitle";
import { useShortcuts } from "@/components/desk/ui/Shortcuts";
import { SegmentTabs } from "@/components/desk/ui/Toolbar";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import { assignableRoles } from "@/lib/people/access";
import { useSavePhoto } from "@/lib/people/card-queries";
import { cleanPhone } from "@/lib/people/phone";
import { ROLE_LABEL, useCreatePerson, usePeople, type Person } from "@/lib/people/queries";
import { useMe } from "@/lib/tasks/queries";
import { useHydrated } from "@/lib/useHydrated";

import { BulkPeople } from "./BulkPeople";
import { deskDraftOf } from "./draft";
import { splitAliases } from "./fields";
import { handOver } from "./handoff";
import { PersonEditor, type EditorView } from "./PersonEditor";
import { TileFace } from "./TeamGrid";

type Tab = "one" | "list";

const ONE_KEYS = [
  { keys: ["Ctrl Enter"], label: "Добавить" },
  { keys: ["Esc"], label: "Назад в «Команду» (спросит, если что-то вписано)" },
];
const LIST_KEYS = [{ keys: ["Ctrl Enter"], label: "Добавить список" }];

type CheckState = "ok" | "todo" | "warn";

function CheckLine({ state, children }: { state: CheckState; children: ReactNode }) {
  return (
    <li className="newp-check" data-state={state}>
      <span className="newp-check-mark" aria-hidden>
        {state === "ok" ? <Check size={12} strokeWidth={3} /> : <Circle size={8} strokeWidth={3} />}
      </span>
      <span className="min-w-0">{children}</span>
    </li>
  );
}

/**
 * The card being made, beside the form (D-174): the tile as it will stand in «Команда» — the
 * circle, the name, the position, how the person will come in — and what the form still wants,
 * said line by line as it is typed. Nothing here is a control: the form is.
 */
function CardPreview({ view, managers }: { view: EditorView; managers: Person[] }) {
  const { draft, photo, withEmail, problems } = view;
  const name = draft.full_name.trim();
  const tv = draft.role === "tv";
  const position = draft.position.trim();
  const sub = position && position.toLowerCase() !== ROLE_LABEL[draft.role].toLowerCase() ? position : ROLE_LABEL[draft.role];
  const avatar = photo.kind === "new" ? photo.preview : null;
  const aliases = splitAliases(draft.aliases);
  const phone = cleanPhone(draft.phone);
  const manager = draft.manager_id ? managers.find((person) => person.id === draft.manager_id) : null;
  const named = name.length >= 2 && !problems.full_name;
  return (
    <div className="newp-card" data-testid="new-person-preview">
      <p className="newp-card-label">{tv ? "Так экран встанет в «Команде»" : "Так человек появится в «Команде»"}</p>
      <div className="team-tile newp-tile" aria-hidden>
        <span className="team-tile-face">
          <TileFace person={{ id: "new", full_name: name || (tv ? "Экран" : "Новый сотрудник"), avatar_url: avatar }} size={64} state={tv ? undefined : "free"} />
        </span>
        <span className="team-tile-name" data-empty={name ? undefined : ""}>
          {name || (tv ? "Название экрана" : "Имя Фамилия")}
        </span>
        <span className="team-tile-role">{sub}</span>
        {tv ? null : (
          <span className="team-tile-facts">
            {phone ? (
              <span className="team-fact" data-tone="muted">
                <Phone size={12} strokeWidth={2.25} />
                <span className="nums">{phone}</span>
              </span>
            ) : null}
            <span className="team-fact" data-tone="muted">
              {withEmail ? <Mail size={12} strokeWidth={2.25} /> : <KeyRound size={12} strokeWidth={2.25} />}
              {withEmail ? "почта и пароль" : "вход по коду"}
            </span>
          </span>
        )}
      </div>
      <ul className="newp-checks" aria-label="Что уже есть">
        <CheckLine state={named ? "ok" : problems.full_name && name ? "warn" : "todo"}>{named ? "Имя есть" : tv ? "Назовите экран" : "Впишите имя и фамилию"}</CheckLine>
        {tv ? null : (
          <>
            <CheckLine state={problems.phone ? "warn" : phone ? "ok" : "todo"}>{problems.phone ? "В телефоне, похоже, опечатка" : phone ? "Телефон есть" : "Телефон — по желанию"}</CheckLine>
            <CheckLine state={aliases.length ? "ok" : "todo"}>
              {aliases.length ? `Голосом: ${aliases.slice(0, 3).join(", ")}${aliases.length > 3 ? "…" : ""}` : "Как вы зовёте человека голосом"}
            </CheckLine>
          </>
        )}
        <CheckLine state="ok">
          {ROLE_LABEL[draft.role]}
          {manager ? ` · подчиняется: ${manager.full_name}` : ""}
        </CheckLine>
        {tv ? null : (
          <CheckLine state={!withEmail ? "ok" : !(draft.email ?? "").trim() ? "todo" : problems.email || problems.password ? "warn" : "ok"}>
            {!withEmail
              ? "Код входа и QR — сразу после «Добавить»"
              : !(draft.email ?? "").trim()
                ? "Впишите почту для входа"
                : problems.email
                  ? "В почте, похоже, опечатка"
                  : problems.password
                    ? "Пароль — не короче 6 символов"
                    : "Вход по почте и паролю"}
          </CheckLine>
        )}
      </ul>
    </div>
  );
}

/**
 * A new person on the desk (D-104, tasks/022 B.3; wave 3): the same creation as the phone's —
 * card and role, a code by default, an email and a ready password on request — as a desk form
 * (the label on the left, the field on the right; Ctrl+Enter adds, Esc goes back), in three
 * numbered steps that check themselves, the card being made drawn beside them (D-174). After
 * «Добавить» — the new person's card, the code already issued and its QR in large type (or the
 * email and the first password, to copy). `?tab=list` — «Списком»: many people from Excel or a
 * text, see `BulkPeople`. The tab is the address, so a form with words in it is left the way any
 * form is, with the toast that leads back to it.
 */
export function NewPersonDesk() {
  const router = useRouter();
  const params = useSearchParams();
  const me = useMe();
  const people = usePeople();
  const create = useCreatePerson();
  const savePhoto = useSavePhoto();
  // the ready password is random: drawn in the browser only, never twice (server and client)
  const hydrated = useHydrated();
  const tab: Tab = params.get("tab") === "list" ? "list" : "one";
  // a list on its way stays on its tab: its progress and its failures are said there
  const [busy, setBusy] = useState(false);
  useShortcuts("Новый сотрудник", tab === "list" ? LIST_KEYS : ONE_KEYS);

  return (
    <DeskPage>
      <div className="newp-page flex flex-col gap-5">
      <div className="flex flex-col">
        <nav aria-label="Путь" className="person-crumbs">
          <Link href="/desk/team">Команда</Link>
          <span aria-hidden>›</span>
        </nav>
        <PageTitle
          title={tab === "list" ? "Новые сотрудники" : "Новый сотрудник"}
          state={{ text: tab === "list" ? "Строки из Excel или текста — сразу таблицей, с проверкой" : "Три шага: кто это, роль, как войдёт" }}
          actions={
            <SegmentTabs<Tab>
              aria-label="Как добавить"
              value={tab}
              onChange={(next) => {
                if (!busy) router.replace(next === "list" ? "/desk/team/new?tab=list" : "/desk/team/new");
              }}
              items={[
                { value: "one", label: "Один" },
                { value: "list", label: "Списком" },
              ]}
            />
          }
        />
      </div>
      {!hydrated || people.isLoading || !me.data ? (
        <SkeletonGroup grow className="newp-bone">
          <Bone h={360} />
          <Bone h={300} />
        </SkeletonGroup>
      ) : tab === "list" ? (
        <BulkPeople editor={me.data.role} people={people.data ?? []} onBusy={setBusy} />
      ) : (
        <PersonEditor
          mode="create"
          draftKey="new"
          initial={deskDraftOf(null)}
          roles={assignableRoles(me.data.role, null)}
          managers={(people.data ?? []).filter((p) => p.is_active && (p.role === "manager" || p.role === "director"))}
          roster={(people.data ?? []).filter((p) => p.is_active && p.role !== "tv")}
          everyone={(people.data ?? []).filter((p) => p.role !== "tv")}
          pending={create.isPending || savePhoto.isPending}
          onCancel={() => router.push("/desk/team")}
          onSubmit={async (draft, photo) => {
            const email = (draft.email ?? "").trim().toLowerCase() || null;
            const password = email ? (draft.password ?? "") : null;
            const { id } = await create.mutateAsync({
              ...(email && password ? { email, password } : {}),
              full_name: draft.full_name.trim(),
              role: draft.role,
              position: draft.position.trim() || undefined,
              phone: cleanPhone(draft.phone) ?? undefined,
              aliases: splitAliases(draft.aliases),
              manager_id: draft.manager_id,
            });
            handOver(id, { email, password });
            // the person exists from here on: a photo that fails says so and is added on the card
            if (me.data) await savePhoto.mutateAsync({ id, companyId: me.data.companyId, photo }).catch(() => undefined);
            router.replace(`/desk/team/${id}`);
          }}
          preview={(view) => <CardPreview view={view} managers={(people.data ?? []).filter((p) => p.is_active)} />}
        />
      )}
      </div>
    </DeskPage>
  );
}
