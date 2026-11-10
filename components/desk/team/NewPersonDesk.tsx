"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { DeskPage, PageTitle } from "@/components/desk/ui/PageTitle";
import { useShortcuts } from "@/components/desk/ui/Shortcuts";
import { SegmentTabs } from "@/components/desk/ui/Toolbar";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import { assignableRoles } from "@/lib/people/access";
import { useSavePhoto } from "@/lib/people/card-queries";
import { cleanPhone } from "@/lib/people/phone";
import { useCreatePerson, usePeople } from "@/lib/people/queries";
import { useMe } from "@/lib/tasks/queries";
import { useHydrated } from "@/lib/useHydrated";

import { BulkPeople } from "./BulkPeople";
import { deskDraftOf } from "./draft";
import { splitAliases } from "./fields";
import { handOver } from "./handoff";
import { PersonEditor } from "./PersonEditor";

type Tab = "one" | "list";

const ONE_KEYS = [
  { keys: ["Ctrl Enter"], label: "Добавить" },
  { keys: ["Esc"], label: "Назад в «Команду» (спросит, если что-то вписано)" },
];
const LIST_KEYS = [{ keys: ["Ctrl Enter"], label: "Добавить список" }];

/**
 * A new person on the desk (D-104, tasks/022 B.3; wave 3): the same creation as the phone's —
 * card and role, a code by default, an email and a ready password on request — as a desk form
 * (the label on the left, the field on the right; Ctrl+Enter adds, Esc goes back). After
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
    <DeskPage width="narrow">
      <div className="flex flex-col">
        <nav aria-label="Путь" className="text-[13px] leading-5">
          <Link href="/desk/team" className="text-muted hover:text-text">
            Команда
          </Link>
          <span aria-hidden className="px-1.5 text-muted/60">
            ›
          </span>
        </nav>
        <PageTitle title={tab === "list" ? "Новые сотрудники" : "Новый сотрудник"} />
      </div>
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
      {!hydrated || people.isLoading || !me.data ? (
        <SkeletonGroup grow>
          <Bone h={240} />
          <Bone h={110} className="mt-6" />
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
        />
      )}
    </DeskPage>
  );
}
