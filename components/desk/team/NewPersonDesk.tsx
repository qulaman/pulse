"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { DeskPage, PageTitle } from "@/components/desk/ui/PageTitle";
import { useShortcuts } from "@/components/desk/ui/Shortcuts";
import { draftOf } from "@/components/people/PersonForm";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import { assignableRoles } from "@/lib/people/access";
import { useCreatePerson, usePeople } from "@/lib/people/queries";
import { useMe } from "@/lib/tasks/queries";
import { useHydrated } from "@/lib/useHydrated";

import { splitAliases } from "./fields";
import { handOver } from "./handoff";
import { PersonEditor } from "./PersonEditor";

/**
 * A new person on the desk (D-104, tasks/022 B.3; wave 3): the same creation as the phone's —
 * card and role, a code by default, an email and a ready password on request — as a desk form
 * (the label on the left, the field on the right; Ctrl+Enter adds, Esc goes back). After
 * «Добавить» — the new person's card, the code already issued and its QR in large type (or the
 * email and the first password, to copy).
 */
export function NewPersonDesk() {
  const router = useRouter();
  const me = useMe();
  const people = usePeople();
  const create = useCreatePerson();
  // the ready password is random: drawn in the browser only, never twice (server and client)
  const hydrated = useHydrated();
  useShortcuts("Новый сотрудник", [
    { keys: ["Ctrl Enter"], label: "Добавить" },
    { keys: ["Esc"], label: "Назад в «Команду» (дважды, если что-то вписано)" },
  ]);

  return (
    <DeskPage width="narrow">
      <div className="flex flex-col gap-1">
        <nav aria-label="Путь" className="text-[13px] leading-5">
          <Link href="/desk/team" className="text-muted transition-colors hover:text-text">
            Команда
          </Link>
          <span aria-hidden className="px-1.5 text-muted/60">
            ›
          </span>
        </nav>
        <PageTitle title="Новый сотрудник" />
      </div>
      {!hydrated || people.isLoading || !me.data ? (
        <SkeletonGroup grow>
          <Bone h={240} className="rounded-[12px]" />
          <Bone h={110} className="mt-6 rounded-[12px]" />
        </SkeletonGroup>
      ) : (
        <PersonEditor
          mode="create"
          initial={draftOf(null)}
          roles={assignableRoles(me.data.role, null)}
          managers={(people.data ?? []).filter((p) => p.is_active && (p.role === "manager" || p.role === "director"))}
          roster={(people.data ?? []).filter((p) => p.is_active && p.role !== "tv")}
          pending={create.isPending}
          onCancel={() => router.push("/desk/team")}
          onSubmit={async (draft) => {
            const email = (draft.email ?? "").trim().toLowerCase() || null;
            const password = email ? (draft.password ?? "") : null;
            const { id } = await create.mutateAsync({
              ...(email && password ? { email, password } : {}),
              full_name: draft.full_name.trim(),
              role: draft.role,
              position: draft.position.trim() || undefined,
              aliases: splitAliases(draft.aliases),
              manager_id: draft.manager_id,
            });
            handOver(id, { email, password });
            router.replace(`/desk/team/${id}`);
          }}
        />
      )}
    </DeskPage>
  );
}
