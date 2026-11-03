"use client";

import { useRouter } from "next/navigation";

import { DeskPage, PageTitle } from "@/components/desk/ui/PageTitle";
import { draftOf } from "@/components/people/PersonForm";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import { assignableRoles } from "@/lib/people/access";
import { useCreatePerson, usePeople } from "@/lib/people/queries";
import { useMe } from "@/lib/tasks/queries";
import { useHydrated } from "@/lib/useHydrated";

import { handOver } from "./handoff";
import { PersonEditor } from "./PersonEditor";

/**
 * A new person on the desk (D-104, tasks/022 B.3): the same creation as the phone's — card and
 * role, a code by default, an email and a password on request — and after «Добавить» the new
 * person's card, with the code already issued and its QR in large type (or the email and the
 * first password, to copy).
 */
export function NewPersonDesk() {
  const router = useRouter();
  const me = useMe();
  const people = usePeople();
  const create = useCreatePerson();
  // the ready password is random: drawn in the browser only, never twice (server and client)
  const hydrated = useHydrated();

  return (
    <DeskPage width="narrow">
      <PageTitle title="Новый сотрудник" />
      {!hydrated || people.isLoading || !me.data ? (
        <SkeletonGroup grow>
          <Bone h={92} className="rounded-[16px]" />
          <Bone h={168} className="mt-5 rounded-[16px]" />
          <Bone h={320} className="mt-5 rounded-[16px]" />
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
              aliases: draft.aliases.split(/[,;\n]/).map((a) => a.trim()).filter(Boolean),
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
