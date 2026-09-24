"use client";

import { useParams } from "next/navigation";
import { use } from "react";

import { LoginCard } from "@/components/people/LoginCard";
import { PersonForm, draftOf, patchOf } from "@/components/people/PersonForm";
import { PageHead } from "@/components/ui/PageHead";
import { Bone, SectionBone, SkeletonGroup } from "@/components/ui/Skeleton";
import { assignableRoles, canChangeAccess, canEditPerson, canResetLogin } from "@/lib/people/access";
import { ROLE_LABEL, usePeople, usePerson, useUpdatePerson } from "@/lib/people/queries";
import { useMe } from "@/lib/tasks/queries";

/**
 * The person's editor (D-104): card, role, status and login on one screen, for the
 * director and the secretary alike. What each may touch comes from lib/people/access —
 * the same rules the database and the routes enforce.
 */
export default function EditPersonPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { id } = useParams<{ id: string }>();
  const { from } = use(searchParams);
  const me = useMe();
  const person = usePerson(id);
  const people = usePeople();
  const update = useUpdatePerson();

  const p = person.data;
  const back = from === "card" && p ? { href: `/people/${id}`, label: p.full_name } : { href: "/settings?tab=team", label: "Сотрудники" };
  const loading = person.isLoading || me.isLoading || people.isLoading;
  const editor = me.data ? { id: me.data.userId, role: me.data.role } : null;

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-40">
      {loading ? (
        <PageHead
          back={back}
          heading={
            <SkeletonGroup className="min-w-0 flex-1 py-[3px]">
              <Bone h={30} w="62%" />
            </SkeletonGroup>
          }
        />
      ) : !p || !editor ? (
        <PageHead back={back} title="Сотрудник не найден" />
      ) : (
        // the head of the screen (D-113): the name and what the person is
        <PageHead
          back={back}
          title={p.full_name}
          sub={[
            ROLE_LABEL[p.role],
            p.position?.toLowerCase() === ROLE_LABEL[p.role].toLowerCase() ? null : p.position,
            p.is_active ? null : "не работает",
          ]
            .filter(Boolean)
            .join(" · ")}
        />
      )}
      {loading ? (
        <SkeletonGroup className="mt-5 flex flex-col gap-4">
          <SectionBone fields={3} />
          <SectionBone fields={4} />
          <SectionBone fields={2} />
        </SkeletonGroup>
      ) : !p || !editor ? null : !canEditPerson(editor, p) ? (
        <p className="mt-4 card px-4 py-6 text-center text-[16px] leading-[22px] text-muted">Карточку директора меняет только директор</p>
      ) : (
        <>
          <div className="mt-5">
            <PersonForm
              key={p.id}
              mode="edit"
              initial={draftOf(p)}
              roles={assignableRoles(editor.role, p.role)}
              lockedRole={
                canChangeAccess(editor, p)
                  ? undefined
                  : editor.id === p.id
                    ? "Свою роль и доступ здесь не меняют — иначе можно закрыть себе вход в настройки"
                    : "Роль директора меняет только директор"
              }
              managers={(people.data ?? []).filter((m) => m.id !== id && m.is_active && (m.role === "manager" || m.role === "director"))}
              roster={(people.data ?? []).filter((m) => m.id !== id && m.is_active && m.role !== "tv")}
              pending={update.isPending}
              onSubmit={(draft) => update.mutateAsync({ id, patch: patchOf(draft, canChangeAccess(editor, p)) })}
              footer={canResetLogin(editor, p) ? <LoginCard person={p} /> : null}
            />
          </div>
        </>
      )}
    </main>
  );
}
